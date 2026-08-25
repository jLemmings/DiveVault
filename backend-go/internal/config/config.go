package config

import (
	"bufio"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Host                           string
	Port                           int
	DatabaseURL                    string
	CORSOrigin                     string
	FrontendDir                    string
	AuthJWTSecret                  string
	AuthJWTIssuer                  string
	AuthJWTAudience                string
	AuthTokenTTLSeconds            int
	DemoMode                       bool
	CLIAuthRequestTTL              int
	CLIAuthTokenTTL                int
	NominatimBaseURL               string
	NominatimUserAgent             string
	NominatimEmail                 string
	DBStartupRetries               int
	DBStartupRetryDelaySeconds     float64
	DBConnectTimeoutSeconds        int
	DBPoolSize                     int
	StartupMigrations              string
	MaxJSONBodyBytes               int64
	MaxBackupImportBytes           int64
	MaxCSVImportBytes              int64
	MaxSubsurfaceImportBytes       int64
	MaxListLimit                   int
	RateLimitWindowSeconds         int
	RateLimitCLIRequestPerWindow   int
	RateLimitCLIApprovePerWindow   int
	RateLimitBackupImportPerWindow int
	RateLimitDiveUploadPerWindow   int
	Metrics                        string
	LogLevel                       slog.Level
}

func Load(args []string) (Config, error) {
	_ = loadDotEnv(filepath.Join(repoRoot(), ".env"))

	cfg := Config{}
	fs := flag.NewFlagSet("divevault", flag.ContinueOnError)
	fs.StringVar(&cfg.DatabaseURL, "database-url", envString("DATABASE_URL", ""), "PostgreSQL connection string")
	fs.StringVar(&cfg.Host, "host", envString("HOST", "127.0.0.1"), "Host interface to bind")
	fs.IntVar(&cfg.Port, "port", envInt("PORT", 8000), "TCP port to bind")
	fs.StringVar(&cfg.CORSOrigin, "cors-origin", envString("CORS_ORIGIN", "http://localhost:5173"), "Allowed CORS origin")
	fs.StringVar(&cfg.FrontendDir, "frontend-dir", envString("FRONTEND_DIR", "frontend/dist"), "Static frontend asset directory")
	fs.StringVar(&cfg.AuthJWTSecret, "auth-jwt-secret", envString("AUTH_JWT_SECRET", "dev-only-change-me"), "JWT secret")
	fs.StringVar(&cfg.AuthJWTIssuer, "auth-jwt-issuer", envString("AUTH_JWT_ISSUER", "divevault.local"), "JWT issuer")
	fs.StringVar(&cfg.AuthJWTAudience, "auth-jwt-audience", envString("AUTH_JWT_AUDIENCE", "divevault.app"), "JWT audience")
	fs.IntVar(&cfg.AuthTokenTTLSeconds, "auth-token-ttl-seconds", envInt("AUTH_TOKEN_TTL_SECONDS", 43200), "Session token TTL seconds")
	demoMode := fs.String("demo-mode", envString("DEMO_MODE", "false"), "Demo mode")
	fs.IntVar(&cfg.CLIAuthRequestTTL, "cli-auth-request-ttl", envInt("CLI_AUTH_REQUEST_TTL", 600), "CLI auth request TTL seconds")
	fs.IntVar(&cfg.CLIAuthTokenTTL, "cli-auth-token-ttl", envInt("CLI_AUTH_TOKEN_TTL", 1800), "CLI auth token TTL seconds")
	fs.StringVar(&cfg.NominatimBaseURL, "nominatim-base-url", envString("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"), "Nominatim base URL")
	fs.StringVar(&cfg.NominatimUserAgent, "nominatim-user-agent", envString("NOMINATIM_USER_AGENT", "DiveVault/1.0"), "Nominatim user-agent")
	fs.StringVar(&cfg.NominatimEmail, "nominatim-email", envString("NOMINATIM_EMAIL", ""), "Nominatim email")
	fs.IntVar(&cfg.DBStartupRetries, "db-startup-retries", envInt("DB_STARTUP_RETRIES", 5), "Database startup retries")
	fs.Float64Var(&cfg.DBStartupRetryDelaySeconds, "db-startup-retry-delay-seconds", envFloat("DB_STARTUP_RETRY_DELAY_SECONDS", 2), "Database startup retry delay seconds")
	fs.IntVar(&cfg.DBConnectTimeoutSeconds, "db-connect-timeout-seconds", envInt("DB_CONNECT_TIMEOUT_SECONDS", 5), "Database connect timeout seconds")
	fs.IntVar(&cfg.DBPoolSize, "db-pool-size", envInt("DB_POOL_SIZE", 5), "Database pool size")
	fs.StringVar(&cfg.StartupMigrations, "startup-migrations", envString("STARTUP_MIGRATIONS", "enabled"), "Startup migration mode")
	fs.Int64Var(&cfg.MaxJSONBodyBytes, "max-json-body-bytes", envInt64("MAX_JSON_BODY_BYTES", 1024*1024), "Maximum JSON body bytes")
	fs.Int64Var(&cfg.MaxBackupImportBytes, "max-backup-import-bytes", envInt64("MAX_BACKUP_IMPORT_BYTES", 25*1024*1024), "Maximum backup import bytes")
	fs.Int64Var(&cfg.MaxCSVImportBytes, "max-csv-import-bytes", envInt64("MAX_CSV_IMPORT_BYTES", 5*1024*1024), "Maximum CSV import bytes")
	fs.Int64Var(&cfg.MaxSubsurfaceImportBytes, "max-subsurface-import-bytes", envInt64("MAX_SUBSURFACE_IMPORT_BYTES", 15*1024*1024), "Maximum Subsurface import bytes")
	fs.IntVar(&cfg.MaxListLimit, "max-list-limit", envInt("MAX_LIST_LIMIT", 200), "Maximum list endpoint page size")
	fs.IntVar(&cfg.RateLimitWindowSeconds, "rate-limit-window-seconds", envInt("RATE_LIMIT_WINDOW_SECONDS", 60), "Rate limit window seconds")
	fs.IntVar(&cfg.RateLimitCLIRequestPerWindow, "rate-limit-cli-request-per-window", envInt("RATE_LIMIT_CLI_REQUEST_PER_WINDOW", 30), "CLI request rate limit")
	fs.IntVar(&cfg.RateLimitCLIApprovePerWindow, "rate-limit-cli-approve-per-window", envInt("RATE_LIMIT_CLI_APPROVE_PER_WINDOW", 15), "CLI approve rate limit")
	fs.IntVar(&cfg.RateLimitBackupImportPerWindow, "rate-limit-backup-import-per-window", envInt("RATE_LIMIT_BACKUP_IMPORT_PER_WINDOW", 10), "Backup import rate limit")
	fs.IntVar(&cfg.RateLimitDiveUploadPerWindow, "rate-limit-dive-upload-per-window", envInt("RATE_LIMIT_DIVE_UPLOAD_PER_WINDOW", 120), "Dive upload rate limit")
	fs.StringVar(&cfg.Metrics, "metrics", envString("METRICS_ENABLED", "disabled"), "Metrics mode")
	logLevel := fs.String("log-level", envString("LOG_LEVEL", "INFO"), "Log level")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	cfg.DemoMode = parseBool(*demoMode)
	cfg.LogLevel = parseLogLevel(*logLevel)
	if cfg.AuthTokenTTLSeconds < 300 {
		cfg.AuthTokenTTLSeconds = 300
	}
	cfg.FrontendDir = resolveRepoPath(cfg.FrontendDir)
	return cfg, nil
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

func envString(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(envString(key, ""))
	if err != nil {
		return fallback
	}
	return value
}

func envInt64(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(envString(key, ""), 10, 64)
	if err != nil {
		return fallback
	}
	return value
}

func envFloat(key string, fallback float64) float64 {
	value, err := strconv.ParseFloat(envString(key, ""), 64)
	if err != nil {
		return fallback
	}
	return value
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on", "enabled":
		return true
	default:
		return false
	}
}

func parseLogLevel(value string) slog.Level {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "DEBUG":
		return slog.LevelDebug
	case "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func resolveRepoPath(path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Clean(filepath.Join(repoRoot(), path))
}

func repoRoot() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}
	for dir := cwd; ; dir = filepath.Dir(dir) {
		if fileExists(filepath.Join(dir, "frontend", "package.json")) && fileExists(filepath.Join(dir, "backend", "Dockerfile")) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return cwd
		}
	}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

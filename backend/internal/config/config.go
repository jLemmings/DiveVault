package config

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
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
	RequestTimeoutSeconds          int
	TrustForwardedHeaders          bool
	TrustedProxyHops               int
	RateLimitWindowSeconds         int
	RateLimitCLIRequestPerWindow   int
	RateLimitCLIApprovePerWindow   int
	RateLimitBackupImportPerWindow int
	RateLimitDiveUploadPerWindow   int
	RateLimitLoginPerWindow        int
	RateLimitRegisterPerWindow     int
	RateLimitGeocodePerWindow      int
	RateLimitPublicPerWindow       int
	NominatimMinIntervalMillis     int
	CLIAuthRequirePollToken        bool
	Metrics                        string
	LogLevel                       slog.Level
	LogFormat                      string
}

// DefaultJWTSecret is the placeholder secret shipped in examples. It is only
// accepted when the server binds to a loopback interface.
const DefaultJWTSecret = "dev-only-change-me"

// MinJWTSecretLength is the minimum accepted length of AUTH_JWT_SECRET for
// servers reachable from other hosts.
const MinJWTSecretLength = 32

func Load(args []string) (Config, error) {
	_ = loadDotEnv(filepath.Join(repoRoot(), ".env"))

	cfg := Config{}
	fs := flag.NewFlagSet("divevault", flag.ContinueOnError)
	fs.StringVar(&cfg.DatabaseURL, "database-url", envString("DATABASE_URL", ""), "PostgreSQL connection string")
	fs.StringVar(&cfg.Host, "host", envString("HOST", "127.0.0.1"), "Host interface to bind")
	fs.IntVar(&cfg.Port, "port", envInt("PORT", 8000), "TCP port to bind")
	fs.StringVar(&cfg.CORSOrigin, "cors-origin", envString("CORS_ORIGIN", "http://localhost:5173"), "Allowed CORS origin")
	fs.StringVar(&cfg.FrontendDir, "frontend-dir", envString("FRONTEND_DIR", "frontend/dist"), "Static frontend asset directory")
	fs.StringVar(&cfg.AuthJWTSecret, "auth-jwt-secret", envString("AUTH_JWT_SECRET", DefaultJWTSecret), "JWT secret")
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
	fs.IntVar(&cfg.RequestTimeoutSeconds, "request-timeout-seconds", envInt("REQUEST_TIMEOUT_SECONDS", 30), "Request context timeout seconds")
	trustForwardedHeaders := fs.String("trust-forwarded-headers", envString("TRUST_FORWARDED_HEADERS", "false"), "Trust X-Forwarded-* headers from a reverse proxy")
	fs.IntVar(&cfg.TrustedProxyHops, "trusted-proxy-hops", envInt("TRUSTED_PROXY_HOPS", 1), "Number of trusted reverse proxies that append to X-Forwarded-For")
	fs.IntVar(&cfg.RateLimitWindowSeconds, "rate-limit-window-seconds", envInt("RATE_LIMIT_WINDOW_SECONDS", 60), "Rate limit window seconds")
	fs.IntVar(&cfg.RateLimitCLIRequestPerWindow, "rate-limit-cli-request-per-window", envInt("RATE_LIMIT_CLI_REQUEST_PER_WINDOW", 30), "CLI request rate limit")
	fs.IntVar(&cfg.RateLimitCLIApprovePerWindow, "rate-limit-cli-approve-per-window", envInt("RATE_LIMIT_CLI_APPROVE_PER_WINDOW", 15), "CLI approve rate limit")
	fs.IntVar(&cfg.RateLimitBackupImportPerWindow, "rate-limit-backup-import-per-window", envInt("RATE_LIMIT_BACKUP_IMPORT_PER_WINDOW", 10), "Backup import rate limit")
	fs.IntVar(&cfg.RateLimitDiveUploadPerWindow, "rate-limit-dive-upload-per-window", envInt("RATE_LIMIT_DIVE_UPLOAD_PER_WINDOW", 120), "Dive upload rate limit")
	fs.IntVar(&cfg.RateLimitLoginPerWindow, "rate-limit-login-per-window", envInt("RATE_LIMIT_LOGIN_PER_WINDOW", 10), "Login rate limit")
	fs.IntVar(&cfg.RateLimitRegisterPerWindow, "rate-limit-register-per-window", envInt("RATE_LIMIT_REGISTER_PER_WINDOW", 5), "Registration rate limit")
	fs.IntVar(&cfg.RateLimitGeocodePerWindow, "rate-limit-geocode-per-window", envInt("RATE_LIMIT_GEOCODE_PER_WINDOW", 30), "Geocode search rate limit per user")
	fs.IntVar(&cfg.RateLimitPublicPerWindow, "rate-limit-public-per-window", envInt("RATE_LIMIT_PUBLIC_PER_WINDOW", 60), "Public profile rate limit")
	fs.IntVar(&cfg.NominatimMinIntervalMillis, "nominatim-min-interval-ms", envInt("NOMINATIM_MIN_INTERVAL_MS", 1000), "Minimum delay between upstream Nominatim requests")
	cliRequirePollToken := fs.String("cli-auth-require-poll-token", envString("CLI_AUTH_REQUIRE_POLL_TOKEN", "true"), "Require the CLI poll token to retrieve an approved desktop sync token")
	fs.StringVar(&cfg.Metrics, "metrics", envString("METRICS_ENABLED", "disabled"), "Metrics mode")
	logLevel := fs.String("log-level", envString("LOG_LEVEL", "INFO"), "Log level")
	fs.StringVar(&cfg.LogFormat, "log-format", envString("LOG_FORMAT", "text"), "Log format: text or json")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	cfg.DemoMode = parseBool(*demoMode)
	cfg.TrustForwardedHeaders = parseBool(*trustForwardedHeaders)
	cfg.CLIAuthRequirePollToken = parseBool(*cliRequirePollToken)
	if cfg.TrustedProxyHops < 1 {
		cfg.TrustedProxyHops = 1
	}
	cfg.LogFormat = strings.ToLower(strings.TrimSpace(cfg.LogFormat))
	cfg.LogLevel = parseLogLevel(*logLevel)
	if cfg.AuthTokenTTLSeconds < 300 {
		cfg.AuthTokenTTLSeconds = 300
	}
	cfg.FrontendDir = resolveRepoPath(cfg.FrontendDir)
	return cfg, nil
}

func (c Config) Addr() string {
	return net.JoinHostPort(c.Host, fmt.Sprint(c.Port))
}

// IsLoopbackHost reports whether the server only binds to a loopback interface.
func (c Config) IsLoopbackHost() bool {
	host := strings.TrimSpace(c.Host)
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

// ValidateForServe rejects configurations that are unsafe for a server that
// accepts connections from other hosts.
func (c Config) ValidateForServe() error {
	if c.IsLoopbackHost() {
		return nil
	}
	secret := strings.TrimSpace(c.AuthJWTSecret)
	if secret == "" || secret == DefaultJWTSecret {
		return errors.New("AUTH_JWT_SECRET must be set to a unique random value when HOST is not a loopback address (generate one with: openssl rand -base64 48)")
	}
	if len(secret) < MinJWTSecretLength {
		return fmt.Errorf("AUTH_JWT_SECRET must be at least %d characters when HOST is not a loopback address", MinJWTSecretLength)
	}
	return nil
}

// UsesInsecureSecret reports whether the placeholder or a short secret is in use.
func (c Config) UsesInsecureSecret() bool {
	secret := strings.TrimSpace(c.AuthJWTSecret)
	return secret == "" || secret == DefaultJWTSecret || len(secret) < MinJWTSecretLength
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
		key = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(key), "export "))
		value = unquoteDotEnvValue(strings.TrimSpace(value))
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
	return scanner.Err()
}

func unquoteDotEnvValue(value string) string {
	if len(value) >= 2 {
		first, last := value[0], value[len(value)-1]
		if (first == '"' || first == '\'') && first == last {
			return value[1 : len(value)-1]
		}
	}
	if index := strings.Index(value, " #"); index >= 0 {
		value = strings.TrimSpace(value[:index])
	}
	return value
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
		if fileExists(filepath.Join(dir, "frontend", "package.json")) && fileExists(filepath.Join(dir, "go.work")) {
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

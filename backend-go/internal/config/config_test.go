package config

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAppliesFlagsAndMinimumTokenTTL(t *testing.T) {
	cfg, err := Load([]string{
		"--host", "0.0.0.0",
		"--port", "9000",
		"--auth-token-ttl-seconds", "10",
		"--demo-mode", "enabled",
		"--trust-forwarded-headers", "true",
		"--request-timeout-seconds", "45",
		"--log-level", "debug",
		"--frontend-dir", ".",
	})
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Addr() != "0.0.0.0:9000" {
		t.Fatalf("Addr = %q", cfg.Addr())
	}
	if cfg.AuthTokenTTLSeconds != 300 {
		t.Fatalf("AuthTokenTTLSeconds = %d, expected minimum 300", cfg.AuthTokenTTLSeconds)
	}
	if !cfg.DemoMode || !cfg.TrustForwardedHeaders {
		t.Fatalf("expected demo mode and trusted forwarded headers to be enabled")
	}
	if cfg.RequestTimeoutSeconds != 45 {
		t.Fatalf("RequestTimeoutSeconds = %d", cfg.RequestTimeoutSeconds)
	}
	if cfg.LogLevel != slog.LevelDebug {
		t.Fatalf("LogLevel = %v", cfg.LogLevel)
	}
	if !filepath.IsAbs(cfg.FrontendDir) {
		t.Fatalf("FrontendDir should resolve to an absolute path, got %q", cfg.FrontendDir)
	}
}

func TestLoadReadsEnvironmentDefaults(t *testing.T) {
	t.Setenv("HOST", "127.0.0.2")
	t.Setenv("PORT", "8123")
	t.Setenv("REQUEST_TIMEOUT_SECONDS", "12")
	t.Setenv("TRUST_FORWARDED_HEADERS", "yes")
	t.Setenv("METRICS_ENABLED", "enabled")

	cfg, err := Load([]string{"--frontend-dir", "."})
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Host != "127.0.0.2" || cfg.Port != 8123 {
		t.Fatalf("host/port = %s/%d", cfg.Host, cfg.Port)
	}
	if cfg.RequestTimeoutSeconds != 12 || !cfg.TrustForwardedHeaders {
		t.Fatalf("timeout/trust forwarded = %d/%v", cfg.RequestTimeoutSeconds, cfg.TrustForwardedHeaders)
	}
	if cfg.Metrics != "enabled" {
		t.Fatalf("Metrics = %q", cfg.Metrics)
	}
}

func TestLoadDotEnvDoesNotOverrideExistingEnvironment(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")
	if err := os.WriteFile(envPath, []byte("EXISTING=from-file\nNEW_VALUE='from file'\n"), 0o600); err != nil {
		t.Fatalf("write .env: %v", err)
	}
	t.Setenv("EXISTING", "from-env")
	t.Setenv("NEW_VALUE", "")

	if err := loadDotEnv(envPath); err != nil {
		t.Fatalf("loadDotEnv returned error: %v", err)
	}
	if os.Getenv("EXISTING") != "from-env" {
		t.Fatalf("existing env was overwritten")
	}
	if os.Getenv("NEW_VALUE") != "from file" {
		t.Fatalf("NEW_VALUE = %q", os.Getenv("NEW_VALUE"))
	}
}

func TestParseHelpersFallbackOnInvalidInput(t *testing.T) {
	t.Setenv("BAD_INT", "nope")
	t.Setenv("BAD_FLOAT", "nope")
	if envInt("BAD_INT", 7) != 7 {
		t.Fatalf("envInt did not return fallback")
	}
	if envFloat("BAD_FLOAT", 2.5) != 2.5 {
		t.Fatalf("envFloat did not return fallback")
	}
	if parseBool("disabled") {
		t.Fatalf("disabled should parse false")
	}
	if parseLogLevel("warning") != slog.LevelWarn {
		t.Fatalf("warning should parse warn")
	}
}

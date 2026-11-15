package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jlemmings/divevault/backend/internal/config"
	"github.com/jlemmings/divevault/backend/internal/httpapi"
	"github.com/jlemmings/divevault/backend/internal/migrations"
	"github.com/jlemmings/divevault/backend/internal/store"
)

func main() {
	args := os.Args[1:]
	if len(args) > 0 && args[0] == "reset-password" {
		os.Exit(runResetPassword(args[1:], os.Stdin, os.Stdout, os.Stderr))
	}
	command := "serve"
	if len(args) > 0 && (args[0] == "migrate" || args[0] == "healthcheck") {
		command = args[0]
		args = args[1:]
	}

	cfg, err := config.Load(args)
	if err != nil {
		slog.Error("configuration failed", "error", err)
		os.Exit(2)
	}

	if command == "healthcheck" {
		os.Exit(runHealthcheck(cfg))
	}

	handlerOptions := &slog.HandlerOptions{Level: cfg.LogLevel}
	var logHandler slog.Handler = slog.NewTextHandler(os.Stdout, handlerOptions)
	if cfg.LogFormat == "json" {
		logHandler = slog.NewJSONHandler(os.Stdout, handlerOptions)
	}
	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	if command == "serve" {
		if err := cfg.ValidateForServe(); err != nil {
			logger.Error("unsafe configuration", "error", err)
			os.Exit(2)
		}
		if cfg.UsesInsecureSecret() {
			logger.Warn("AUTH_JWT_SECRET is a placeholder or too short; this is only acceptable for local development on a loopback address")
		}
	}

	var db *store.DB
	schemaVersion := 0
	if cfg.DatabaseURL != "" {
		if err := store.WaitForDatabase(context.Background(), cfg.DatabaseURL, store.WaitOptions{
			Retries:               cfg.DBStartupRetries,
			RetryDelaySeconds:     cfg.DBStartupRetryDelaySeconds,
			ConnectTimeoutSeconds: cfg.DBConnectTimeoutSeconds,
		}, logger); err != nil {
			logger.Error("database is unreachable", "error", err)
			os.Exit(1)
		}
		pool, err := store.OpenPool(context.Background(), cfg.DatabaseURL, cfg.DBPoolSize)
		if err != nil {
			logger.Error("database pool failed", "error", err)
			os.Exit(1)
		}
		db = pool
		defer db.Close()
		if command == "serve" && cfg.StartupMigrations == "enabled" {
			version, err := migrations.Migrate(context.Background(), db)
			if err != nil {
				logger.Error("database migrations failed", "error", err)
				os.Exit(1)
			}
			schemaVersion = version
			logger.Info("database migrations completed", "schema_version", version)
		} else if command == "serve" {
			version, err := migrations.SchemaVersion(context.Background(), db)
			if err != nil {
				logger.Error("database schema version check failed", "error", err)
				os.Exit(1)
			}
			if version != migrations.CurrentSchemaVersion {
				logger.Error("database schema version mismatch", "expected", migrations.CurrentSchemaVersion, "actual", version)
				os.Exit(1)
			}
			schemaVersion = version
		}
		if command == "serve" && cfg.DemoMode {
			if err := db.EnsureDemoAdmin(context.Background()); err != nil {
				logger.Error("demo admin bootstrap failed", "error", err)
				os.Exit(1)
			}
		}
	} else {
		logger.Warn("DATABASE_URL is not configured; database-backed endpoints will return 503")
	}

	if command == "migrate" {
		if db == nil {
			logger.Error("DATABASE_URL is required for migrations")
			os.Exit(2)
		}
		version, err := migrations.Migrate(context.Background(), db)
		if err != nil {
			logger.Error("database migrations failed", "error", err)
			os.Exit(1)
		}
		logger.Info("database migrations completed", "schema_version", version)
		return
	}

	backgroundCtx, stopBackground := context.WithCancel(context.Background())
	defer stopBackground()
	if db != nil {
		go runAuthCleanup(backgroundCtx, db, logger)
	}

	app := httpapi.NewServer(cfg, logger, db)
	app.SetSchemaVersion(schemaVersion)
	writeTimeout := 35 * time.Second
	if cfg.RequestTimeoutSeconds > 0 {
		writeTimeout = time.Duration(cfg.RequestTimeoutSeconds+5) * time.Second
	}
	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           app,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       120 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		logger.Info("starting backend", "addr", cfg.Addr(), "frontend_dir", cfg.FrontendDir)
		errs <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-signals:
		logger.Info("received shutdown signal", "signal", sig.String())
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
		return
	}

	stopBackground()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("backend stopped")
}

// runAuthCleanup periodically deletes expired invites and desktop sync
// requests, keeping that work off the request path.
func runAuthCleanup(ctx context.Context, db *store.DB, logger *slog.Logger) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		if err := db.CleanupExpiredAuth(cleanupCtx, time.Now().Unix()); err != nil && ctx.Err() == nil {
			logger.Warn("auth cleanup failed", "error", err)
		}
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// runHealthcheck probes the local /health endpoint. It lets container
// runtimes health-check the shell-less distroless image.
func runHealthcheck(cfg config.Config) int {
	host := cfg.Host
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://" + net.JoinHostPort(host, strconv.Itoa(cfg.Port)) + "/health")
	if err != nil {
		return 1
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/config"
	"github.com/jlemmings/divevault/backend-go/internal/httpapi"
	"github.com/jlemmings/divevault/backend-go/internal/migrations"
	"github.com/jlemmings/divevault/backend-go/internal/store"
)

func main() {
	args := os.Args[1:]
	command := "serve"
	if len(args) > 0 && args[0] == "migrate" {
		command = "migrate"
		args = args[1:]
	}

	cfg, err := config.Load(args)
	if err != nil {
		slog.Error("configuration failed", "error", err)
		os.Exit(2)
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(logger)

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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("backend stopped")
}

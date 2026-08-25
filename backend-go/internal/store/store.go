package store

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	pool *pgxpool.Pool
}

type WaitOptions struct {
	Retries               int
	RetryDelaySeconds     float64
	ConnectTimeoutSeconds int
}

func OpenPool(ctx context.Context, databaseURL string, poolSize int) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	if poolSize > 0 {
		cfg.MaxConns = int32(poolSize)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &DB{pool: pool}, nil
}

func (db *DB) Pool() *pgxpool.Pool {
	if db == nil {
		return nil
	}
	return db.pool
}

func (db *DB) Close() {
	if db != nil && db.pool != nil {
		db.pool.Close()
	}
}

func WaitForDatabase(ctx context.Context, databaseURL string, opts WaitOptions, logger *slog.Logger) error {
	retries := opts.Retries
	if retries < 1 {
		retries = 1
	}
	delay := time.Duration(opts.RetryDelaySeconds * float64(time.Second))
	if delay < 0 {
		delay = 0
	}
	timeout := time.Duration(opts.ConnectTimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	var lastErr error
	for attempt := 1; attempt <= retries; attempt++ {
		checkCtx, cancel := context.WithTimeout(ctx, timeout)
		pool, err := OpenPool(checkCtx, databaseURL, 1)
		if err == nil {
			err = pool.Pool().Ping(checkCtx)
			pool.Close()
		}
		cancel()
		if err == nil {
			logger.Info("database is reachable", "database_url", RedactDatabaseURL(databaseURL))
			return nil
		}
		lastErr = err
		if attempt < retries {
			logger.Warn("database is unavailable at startup", "attempt", attempt, "retries", retries, "error", err)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
	}
	if lastErr == nil {
		lastErr = errors.New("database unavailable")
	}
	return fmt.Errorf("database is unreachable after %d attempt(s): %w", retries, lastErr)
}

func RedactDatabaseURL(databaseURL string) string {
	at := strings.LastIndex(databaseURL, "@")
	scheme := strings.Index(databaseURL, "://")
	colon := strings.LastIndex(databaseURL[:max(at, 0)], ":")
	if at <= 0 || scheme < 0 || colon <= scheme+2 {
		return databaseURL
	}
	return databaseURL[:colon+1] + "***" + databaseURL[at:]
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

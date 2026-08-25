package migrations

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jlemmings/divevault/backend-go/internal/store"
)

func TestMigrateAgainstPostgreSQL(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open admin connection: %v", err)
	}
	defer admin.Close()

	schema := fmt.Sprintf("divevault_go_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	defer admin.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`)

	testURL := databaseURL
	separator := "?"
	if strings.Contains(testURL, "?") {
		separator = "&"
	}
	testURL += separator + "search_path=" + schema
	db, err := store.OpenPool(ctx, testURL, 1)
	if err != nil {
		t.Fatalf("open test pool: %v", err)
	}
	defer db.Close()

	version, err := Migrate(ctx, db)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if version != CurrentSchemaVersion {
		t.Fatalf("version = %d, expected %d", version, CurrentSchemaVersion)
	}
	version, err = SchemaVersion(ctx, db)
	if err != nil {
		t.Fatalf("schema version: %v", err)
	}
	if version != CurrentSchemaVersion {
		t.Fatalf("schema version = %d, expected %d", version, CurrentSchemaVersion)
	}
}

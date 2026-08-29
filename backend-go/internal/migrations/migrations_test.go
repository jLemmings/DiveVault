package migrations

import (
	"strconv"
	"strings"
	"testing"
)

func TestCurrentSchemaVersion(t *testing.T) {
	if CurrentSchemaVersion != 14 {
		t.Fatalf("CurrentSchemaVersion = %d, expected 14", CurrentSchemaVersion)
	}
}

func TestMigrationListEndsAtCurrentSchemaVersion(t *testing.T) {
	steps := migrations()
	if len(steps) == 0 {
		t.Fatalf("expected migrations")
	}
	if got := steps[len(steps)-1].version; got != CurrentSchemaVersion {
		t.Fatalf("last migration version = %d, expected %d", got, CurrentSchemaVersion)
	}
}

func TestMigrationVersionsAreContiguous(t *testing.T) {
	steps := migrations()
	if len(steps) != CurrentSchemaVersion {
		t.Fatalf("migration count = %d, expected %d", len(steps), CurrentSchemaVersion)
	}
	for index, step := range steps {
		expected := index + 1
		if step.version != expected {
			t.Fatalf("migration %d has version %d", index, step.version)
		}
		if strings.TrimSpace(step.sql) == "" && step.fn == nil {
			t.Fatalf("migration %d has no SQL or function", step.version)
		}
	}
}

func TestCurrentSchemaDefinesRequiredTables(t *testing.T) {
	for _, table := range []string{
		"device_state",
		"dives",
		"user_profile",
		"user_profile_license_documents",
		"user_profile_licenses",
		"user_profile_dive_sites",
		"user_profile_buddies",
		"user_profile_guides",
		"cli_sync_auth_requests",
		"auth_users",
		"auth_instance_settings",
		"auth_user_invites",
		"user_equipment",
	} {
		needle := "CREATE TABLE IF NOT EXISTS " + table
		if !strings.Contains(schemaSQL, needle) {
			t.Fatalf("schemaSQL missing %s", strconv.Quote(table))
		}
	}
}

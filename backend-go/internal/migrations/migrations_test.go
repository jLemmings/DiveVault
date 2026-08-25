package migrations

import "testing"

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

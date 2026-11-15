package migrations

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jlemmings/divevault/backend/internal/store"
)

// migratedTestDB creates an isolated schema, migrates it and returns a store.
// It is skipped unless TEST_DATABASE_URL points at a PostgreSQL server.
func migratedTestDB(t *testing.T) (*store.DB, context.Context) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	t.Cleanup(cancel)

	admin, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open admin connection: %v", err)
	}
	t.Cleanup(admin.Close)
	schema := fmt.Sprintf("divevault_auth_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(context.Background(), `DROP SCHEMA `+schema+` CASCADE`) })

	separator := "?"
	if strings.Contains(databaseURL, "?") {
		separator = "&"
	}
	db, err := store.OpenPool(ctx, databaseURL+separator+"search_path="+schema, 4)
	if err != nil {
		t.Fatalf("open test pool: %v", err)
	}
	t.Cleanup(db.Close)
	if _, err := Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db, ctx
}

func createTestUser(t *testing.T, ctx context.Context, db *store.DB, id string, email string) *store.AuthUser {
	t.Helper()
	user, err := db.CreateAuthUser(ctx, id, email, "scrypt$00$00", "", "", "user")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	return user
}

func TestMigrationV15KeepsLegacyOrphansAndIsRerunnable(t *testing.T) {
	db, ctx := migratedTestDB(t)
	pool := db.Pool()
	if _, err := pool.Exec(ctx, `ALTER TABLE dives DROP CONSTRAINT fk_dives_auth_user`); err != nil {
		t.Fatalf("drop constraint: %v", err)
	}
	if _, err := pool.Exec(ctx, `
        INSERT INTO dives(user_id, vendor, product, dive_uid, raw_sha256, raw_data, imported_at)
        VALUES ('legacy', 'v', 'p', 'uid-1', 'sha', '\x00', 'now')
    `); err != nil {
		t.Fatalf("insert legacy dive: %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE app_schema_version SET version=14`); err != nil {
		t.Fatalf("reset version: %v", err)
	}
	version, err := Migrate(ctx, db)
	if err != nil || version != CurrentSchemaVersion {
		t.Fatalf("re-migrate: version=%d err=%v", version, err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM dives WHERE user_id='legacy'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("legacy dive count=%d err=%v", count, err)
	}
	if _, err := pool.Exec(ctx, `
        INSERT INTO dives(user_id, vendor, product, dive_uid, raw_sha256, raw_data, imported_at)
        VALUES ('nobody', 'v', 'p', 'uid-2', 'sha', '\x00', 'now')
    `); err == nil {
		t.Fatalf("expected new orphaned dive to violate the foreign key")
	}
}

func TestDeletingUserCascadesToOwnedData(t *testing.T) {
	db, ctx := migratedTestDB(t)
	user := createTestUser(t, ctx, db, "user_cascade", "cascade@example.test")
	inserted, err := db.InsertDiveRecord(ctx, user.ID, map[string]any{"vendor": "v", "product": "p", "dive_uid": "d1", "raw_sha256": "s", "raw_data_b64": "AA=="})
	if err != nil || !inserted {
		t.Fatalf("insert dive: inserted=%v err=%v", inserted, err)
	}
	if err := db.SaveDeviceState(ctx, user.ID, "v", "p", nil); err != nil {
		t.Fatalf("save device state: %v", err)
	}
	deleted, err := db.DeleteAuthUser(ctx, user.ID)
	if err != nil || !deleted {
		t.Fatalf("delete user: deleted=%v err=%v", deleted, err)
	}
	var dives, states int
	_ = db.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM dives WHERE user_id=$1`, user.ID).Scan(&dives)
	_ = db.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM device_state WHERE user_id=$1`, user.ID).Scan(&states)
	if dives != 0 || states != 0 {
		t.Fatalf("orphaned data remains: dives=%d device_states=%d", dives, states)
	}
}

func TestCLIAuthTokenIsReleasedOnceToPollTokenHolder(t *testing.T) {
	db, ctx := migratedTestDB(t)
	user := createTestUser(t, ctx, db, "user_cli", "cli@example.test")
	now := time.Now().Unix()
	if _, err := db.CreateCLIAuthRequest(ctx, "code-1", "dvpoll_secret", 600, now); err != nil {
		t.Fatalf("create request: %v", err)
	}
	claims := map[string]any{"sub": user.ID, "email": user.Email, "sid": "session_1"}
	approved, err := db.ApproveCLIAuthRequest(ctx, "code-1", claims, "dvsync_token", 1800, now)
	if err != nil || approved == nil || approved.Status != "approved" {
		t.Fatalf("approve: entry=%+v err=%v", approved, err)
	}

	// Someone who only knows the code (e.g. from the approval URL).
	anonymous, err := db.GetCLIAuthRequestStatus(ctx, "code-1", "", true, now)
	if err != nil || anonymous == nil || anonymous.Token != nil || anonymous.Email != nil {
		t.Fatalf("anonymous poll leaked data: %+v err=%v", anonymous, err)
	}
	wrong, err := db.GetCLIAuthRequestStatus(ctx, "code-1", "dvpoll_wrong", false, now)
	if err != nil || wrong.Token != nil {
		t.Fatalf("wrong poll token received token: %+v err=%v", wrong, err)
	}
	first, err := db.GetCLIAuthRequestStatus(ctx, "code-1", "dvpoll_secret", true, now)
	if err != nil || first.Token == nil || *first.Token != "dvsync_token" {
		t.Fatalf("legitimate poll: %+v err=%v", first, err)
	}
	second, err := db.GetCLIAuthRequestStatus(ctx, "code-1", "dvpoll_secret", true, now)
	if err != nil || second.Token != nil {
		t.Fatalf("token released twice: %+v err=%v", second, err)
	}

	var storedPlaintext int
	_ = db.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM cli_sync_auth_requests WHERE token IS NOT NULL OR token_hash = 'dvsync_token'`).Scan(&storedPlaintext)
	if storedPlaintext != 0 {
		t.Fatalf("sync token stored in plaintext after claim")
	}
	verified, err := db.VerifyCLIAuthToken(ctx, "dvsync_token", now)
	if err != nil || verified == nil || verified["sub"] != user.ID {
		t.Fatalf("verify token: %+v err=%v", verified, err)
	}
}

func TestInviteTokensAreHashedAtRest(t *testing.T) {
	db, ctx := migratedTestDB(t)
	owner := createTestUser(t, ctx, db, "user_owner", "owner@example.test")
	now := time.Now().Unix()
	invite, err := db.CreateAuthInvite(ctx, store.Invite{Token: "invite-plain", Email: "new@example.test", Role: "user", InvitedByUserID: owner.ID, CreatedAt: now, ExpiresAt: now + 3600})
	if err != nil || invite.Token != "invite-plain" {
		t.Fatalf("create invite: %+v err=%v", invite, err)
	}
	var plaintextRows int
	_ = db.Pool().QueryRow(ctx, `SELECT COUNT(*) FROM auth_user_invites WHERE token='invite-plain'`).Scan(&plaintextRows)
	if plaintextRows != 0 {
		t.Fatalf("invite token stored in plaintext")
	}
	found, err := db.GetAuthInviteByToken(ctx, "invite-plain", now)
	if err != nil || found == nil || found.Email != "new@example.test" {
		t.Fatalf("lookup invite: %+v err=%v", found, err)
	}
	user, err := db.CreateAuthUserFromInvite(ctx, "invite-plain", "user_invited", "scrypt$00$00")
	if err != nil || user == nil || user.Email != "new@example.test" {
		t.Fatalf("accept invite: %+v err=%v", user, err)
	}
	if _, err := db.CreateAuthUserFromInvite(ctx, "invite-plain", "user_again", "scrypt$00$00"); err == nil || !store.IsValidationError(err) {
		t.Fatalf("expected reused invite to fail with validation error, got %v", err)
	}
}

func TestUpdateAuthUserBumpsTokenVersionOnSecurityChanges(t *testing.T) {
	db, ctx := migratedTestDB(t)
	user := createTestUser(t, ctx, db, "user_tv", "tv@example.test")
	createTestUser(t, ctx, db, "user_other", "other@example.test")

	name := "Renamed"
	updated, err := db.UpdateAuthUser(ctx, user.ID, store.AuthUserPatch{FirstName: &name})
	if err != nil || updated.TokenVersion != user.TokenVersion {
		t.Fatalf("name change bumped token version: %+v err=%v", updated, err)
	}
	hash := "scrypt$11$11"
	updated, err = db.UpdateAuthUser(ctx, user.ID, store.AuthUserPatch{PasswordHash: &hash})
	if err != nil || updated.TokenVersion != user.TokenVersion+1 {
		t.Fatalf("password change did not bump token version: %+v err=%v", updated, err)
	}
	inactive := false
	updated, err = db.UpdateAuthUser(ctx, user.ID, store.AuthUserPatch{IsActive: &inactive})
	if err != nil || updated.TokenVersion != user.TokenVersion+2 || updated.IsActive {
		t.Fatalf("deactivation did not bump token version: %+v err=%v", updated, err)
	}
	taken := "other@example.test"
	if _, err := db.UpdateAuthUser(ctx, user.ID, store.AuthUserPatch{Email: &taken}); !errors.Is(err, store.ErrEmailTaken) {
		t.Fatalf("expected ErrEmailTaken, got %v", err)
	}
}

func TestBootstrapRegistrationCreatesExactlyOneOwner(t *testing.T) {
	db, ctx := migratedTestDB(t)
	var wg sync.WaitGroup
	results := make(chan error, 5)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := db.CreateBootstrapAuthUser(ctx, fmt.Sprintf("user_boot_%d", i), fmt.Sprintf("boot%d@example.test", i), "scrypt$00$00", "", "")
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("bootstrap successes = %d, expected exactly 1", successes)
	}
	settings, err := db.GetAuthInstanceSettings(ctx)
	if err != nil || !settings.Initialized || settings.OwnerUserID == "" || settings.UserCount != 1 {
		t.Fatalf("unexpected settings after bootstrap: %+v err=%v", settings, err)
	}
}

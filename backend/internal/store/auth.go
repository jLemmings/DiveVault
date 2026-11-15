package store

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type AuthUser struct {
	ID           string  `json:"id"`
	Email        string  `json:"email"`
	PasswordHash string  `json:"-"`
	FirstName    string  `json:"first_name"`
	LastName     string  `json:"last_name"`
	Role         string  `json:"role"`
	IsActive     bool    `json:"is_active"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	LastLoginAt  *string `json:"last_login_at"`
	TokenVersion int     `json:"-"`
}

// AuthUserPatch describes the fields an administrator may change on a user.
// Nil fields are left unchanged.
type AuthUserPatch struct {
	Email        *string
	FirstName    *string
	LastName     *string
	Role         *string
	IsActive     *bool
	PasswordHash *string
}

// ErrEmailTaken is returned when an email address is already registered.
var ErrEmailTaken error = ValidationError{Message: "Email already registered"}

type AuthSettings struct {
	Initialized               bool   `json:"initialized"`
	PublicRegistrationEnabled bool   `json:"public_registration_enabled"`
	OwnerUserID               string `json:"owner_user_id"`
	UpdatedAt                 string `json:"updated_at"`
	UserCount                 int    `json:"user_count"`
	BootstrapRegistrationOpen bool   `json:"bootstrap_registration_open"`
	PublicRegistrationOpen    bool   `json:"public_registration_open"`
}

type Invite struct {
	Token           string `json:"token"`
	Email           string `json:"email"`
	FirstName       string `json:"first_name"`
	LastName        string `json:"last_name"`
	Role            string `json:"role"`
	InvitedByUserID string `json:"invited_by_user_id"`
	CreatedAt       int64  `json:"created_at"`
	ExpiresAt       int64  `json:"expires_at"`
}

type CLIAuthRequest struct {
	Code           string  `json:"code"`
	PollToken      string  `json:"poll_token,omitempty"`
	Status         string  `json:"status"`
	CreatedAt      int64   `json:"created_at"`
	ExpiresAt      int64   `json:"expires_at"`
	ApprovedAt     *int64  `json:"approved_at"`
	Token          *string `json:"token"`
	TokenExpiresAt *int64  `json:"token_expires_at"`
	UserID         *string `json:"user_id"`
	Email          *string `json:"email"`
}

func (db *DB) GetAuthInstanceSettings(ctx context.Context) (AuthSettings, error) {
	if err := db.ensureAuthInstanceSettings(ctx); err != nil {
		return AuthSettings{}, err
	}
	var settings AuthSettings
	err := db.pool.QueryRow(ctx, `
        SELECT initialized, public_registration_enabled, COALESCE(owner_user_id, ''), updated_at
        FROM auth_instance_settings WHERE singleton=TRUE
    `).Scan(&settings.Initialized, &settings.PublicRegistrationEnabled, &settings.OwnerUserID, &settings.UpdatedAt)
	if err != nil {
		return AuthSettings{}, err
	}
	err = db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&settings.UserCount)
	if err != nil {
		return AuthSettings{}, err
	}
	settings.BootstrapRegistrationOpen = !settings.Initialized && settings.UserCount == 0
	settings.PublicRegistrationOpen = settings.BootstrapRegistrationOpen || settings.PublicRegistrationEnabled
	return settings, nil
}

func (db *DB) UpdateAuthInstanceSettings(ctx context.Context, publicRegistrationEnabled bool) (AuthSettings, error) {
	if err := db.ensureAuthInstanceSettings(ctx); err != nil {
		return AuthSettings{}, err
	}
	_, err := db.pool.Exec(ctx, `
        UPDATE auth_instance_settings SET public_registration_enabled=$1, updated_at=$2 WHERE singleton=TRUE
    `, publicRegistrationEnabled, nowISO())
	if err != nil {
		return AuthSettings{}, err
	}
	return db.GetAuthInstanceSettings(ctx)
}

func (db *DB) ensureAuthInstanceSettings(ctx context.Context) error {
	if db.settingsReady.Load() {
		return nil
	}
	_, err := db.pool.Exec(ctx, `
        INSERT INTO auth_instance_settings(singleton, initialized, public_registration_enabled, owner_user_id, updated_at)
        VALUES (TRUE, FALSE, FALSE, NULL, $1)
        ON CONFLICT (singleton) DO NOTHING
    `, nowISO())
	if err == nil {
		db.settingsReady.Store(true)
	}
	return err
}

func (db *DB) CountAuthUsers(ctx context.Context) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&count)
	return count, err
}

func (db *DB) GetAuthUserByEmail(ctx context.Context, email string) (*AuthUser, error) {
	return db.queryAuthUser(ctx, "SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at, token_version FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email))
}

func (db *DB) GetAuthUserByID(ctx context.Context, userID string) (*AuthUser, error) {
	return db.queryAuthUser(ctx, "SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at, token_version FROM auth_users WHERE id=$1", cleanText(userID))
}

func (db *DB) queryAuthUser(ctx context.Context, sql string, args ...any) (*AuthUser, error) {
	var user AuthUser
	err := db.pool.QueryRow(ctx, sql, args...).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt, &user.TokenVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (db *DB) CreateAuthUser(ctx context.Context, userID string, email string, passwordHash string, firstName string, lastName string, role string) (*AuthUser, error) {
	now := nowISO()
	_, err := db.pool.Exec(ctx, `
        INSERT INTO auth_users(id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7, NULL)
    `, cleanText(userID), normalizeEmail(email), cleanText(passwordHash), cleanText(firstName), cleanText(lastName), normalizeRole(role), now)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return db.GetAuthUserByID(ctx, userID)
}

func (db *DB) CreateBootstrapAuthUser(ctx context.Context, userID string, email string, passwordHash string, firstName string, lastName string) (*AuthUser, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `
        INSERT INTO auth_instance_settings(singleton, initialized, public_registration_enabled, owner_user_id, updated_at)
        VALUES (TRUE, FALSE, FALSE, NULL, $1)
        ON CONFLICT (singleton) DO NOTHING
    `, nowISO()); err != nil {
		return nil, err
	}
	var initialized bool
	if err := tx.QueryRow(ctx, "SELECT initialized FROM auth_instance_settings WHERE singleton=TRUE FOR UPDATE").Scan(&initialized); err != nil {
		return nil, err
	}
	var count int
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&count); err != nil {
		return nil, err
	}
	if initialized || count > 0 {
		return nil, ValidationError{Message: "Public registration is closed"}
	}
	var exists int
	err = tx.QueryRow(ctx, "SELECT 1 FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email)).Scan(&exists)
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	now := nowISO()
	if _, err := tx.Exec(ctx, `
        INSERT INTO auth_users(id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at)
        VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, $6, $6, NULL)
    `, cleanText(userID), normalizeEmail(email), cleanText(passwordHash), cleanText(firstName), cleanText(lastName), now); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "UPDATE auth_instance_settings SET initialized=TRUE, owner_user_id=$1, updated_at=$2 WHERE singleton=TRUE", cleanText(userID), nowISO()); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return db.GetAuthUserByID(ctx, userID)
}

func (db *DB) ListAuthUsers(ctx context.Context) ([]AuthUser, error) {
	rows, err := db.pool.Query(ctx, `
        SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at, token_version
        FROM auth_users ORDER BY created_at ASC, email ASC
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []AuthUser{}
	for rows.Next() {
		var user AuthUser
		if err := rows.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt, &user.TokenVersion); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

// UpdateAuthUser applies patch to a user. Changes to credentials, role,
// email or activation state bump token_version, revoking issued sessions.
func (db *DB) UpdateAuthUser(ctx context.Context, userID string, patch AuthUserPatch) (*AuthUser, error) {
	existing, err := db.GetAuthUserByID(ctx, userID)
	if err != nil || existing == nil {
		return existing, err
	}
	updated := *existing
	if patch.Email != nil {
		updated.Email = normalizeEmail(*patch.Email)
	}
	if patch.FirstName != nil {
		updated.FirstName = cleanText(*patch.FirstName)
	}
	if patch.LastName != nil {
		updated.LastName = cleanText(*patch.LastName)
	}
	if patch.Role != nil {
		updated.Role = normalizeRole(*patch.Role)
	}
	if patch.IsActive != nil {
		updated.IsActive = *patch.IsActive
	}
	if patch.PasswordHash != nil {
		updated.PasswordHash = cleanText(*patch.PasswordHash)
	}
	tokenVersion := existing.TokenVersion
	if updated.Email != existing.Email || updated.Role != existing.Role || updated.IsActive != existing.IsActive || updated.PasswordHash != existing.PasswordHash {
		tokenVersion++
	}
	_, err = db.pool.Exec(ctx, `
        UPDATE auth_users SET email=$1, first_name=$2, last_name=$3, role=$4, is_active=$5, password_hash=$6, token_version=$7, updated_at=$8 WHERE id=$9
    `, updated.Email, updated.FirstName, updated.LastName, updated.Role, updated.IsActive, updated.PasswordHash, tokenVersion, nowISO(), cleanText(userID))
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	if tokenVersion != existing.TokenVersion {
		// Desktop sync tokens are derived from a browser session; revoke them too.
		if _, err := db.pool.Exec(ctx, "DELETE FROM cli_sync_auth_requests WHERE user_id=$1", cleanText(userID)); err != nil {
			return nil, err
		}
	}
	return db.GetAuthUserByID(ctx, userID)
}

func (db *DB) UpdateAuthUserLastLogin(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx, "UPDATE auth_users SET last_login_at=$1, updated_at=$1 WHERE id=$2", nowISO(), cleanText(userID))
	return err
}

func (db *DB) DeleteAuthUser(ctx context.Context, userID string) (bool, error) {
	tag, err := db.pool.Exec(ctx, "DELETE FROM auth_users WHERE id=$1", cleanText(userID))
	return tag.RowsAffected() > 0, err
}

func (db *DB) EnsureDemoAdmin(ctx context.Context) error {
	const demoAdminUserID = "user_demoadmin"
	const demoAdminUsername = "admin"
	const demoAdminPasswordHash = "scrypt$000102030405060708090a0b0c0d0e0f$39e0e8ec42ae38fa261d39c6fbf3caaacc6647921c33a54c99770f5ba0283d90685177b5ff7cbb13a56671fd3f74ebaf442667cdaab09a4a60385cec2980c231"
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	now := nowISO()
	if _, err := tx.Exec(ctx, "DELETE FROM auth_users WHERE email=$1 AND id<>$2", demoAdminUsername, demoAdminUserID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        INSERT INTO auth_users(id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at)
        VALUES ($1, $2, $3, 'Demo', 'Diver', 'admin', TRUE, $4, $4, NULL)
        ON CONFLICT (id) DO UPDATE SET
            email=excluded.email,
            password_hash=excluded.password_hash,
            first_name=excluded.first_name,
            last_name=excluded.last_name,
            role=excluded.role,
            is_active=TRUE,
            updated_at=excluded.updated_at
    `, demoAdminUserID, demoAdminUsername, demoAdminPasswordHash, now); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
        INSERT INTO auth_instance_settings(singleton, initialized, public_registration_enabled, owner_user_id, updated_at)
        VALUES (TRUE, TRUE, FALSE, $1, $2)
        ON CONFLICT (singleton) DO UPDATE SET
            initialized=TRUE,
            public_registration_enabled=FALSE,
            owner_user_id=excluded.owner_user_id,
            updated_at=excluded.updated_at
    `, demoAdminUserID, now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (db *DB) CreateAuthInvite(ctx context.Context, invite Invite) (Invite, error) {
	plainToken := cleanText(invite.Token)
	_, err := db.pool.Exec(ctx, "DELETE FROM auth_user_invites WHERE LOWER(email)=LOWER($1)", normalizeEmail(invite.Email))
	if err != nil {
		return Invite{}, err
	}
	err = db.pool.QueryRow(ctx, `
        INSERT INTO auth_user_invites(token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at, accepted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
        RETURNING token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at
    `, hashSecret(plainToken), normalizeEmail(invite.Email), cleanText(invite.FirstName), cleanText(invite.LastName), normalizeRole(invite.Role), cleanText(invite.InvitedByUserID), invite.CreatedAt, invite.ExpiresAt).
		Scan(&invite.Token, &invite.Email, &invite.FirstName, &invite.LastName, &invite.Role, &invite.InvitedByUserID, &invite.CreatedAt, &invite.ExpiresAt)
	invite.Token = plainToken
	return invite, err
}

func (db *DB) GetAuthInviteByToken(ctx context.Context, token string, now int64) (*Invite, error) {
	var invite Invite
	err := db.pool.QueryRow(ctx, `
        SELECT token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at
        FROM auth_user_invites WHERE token=$1 AND accepted_at IS NULL AND expires_at > $2
    `, hashSecret(token), now).Scan(&invite.Token, &invite.Email, &invite.FirstName, &invite.LastName, &invite.Role, &invite.InvitedByUserID, &invite.CreatedAt, &invite.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	invite.Token = cleanText(token)
	return &invite, nil
}

func (db *DB) CreateAuthUserFromInvite(ctx context.Context, inviteToken string, userID string, passwordHash string) (*AuthUser, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	nowTimestamp := time.Now().Unix()
	tokenHash := hashSecret(inviteToken)
	var email, firstName, lastName, role string
	err = tx.QueryRow(ctx, `
        SELECT email, first_name, last_name, role FROM auth_user_invites
        WHERE token=$1 AND accepted_at IS NULL AND expires_at > $2 FOR UPDATE
    `, tokenHash, nowTimestamp).Scan(&email, &firstName, &lastName, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ValidationError{Message: "Invitation is invalid or expired"}
	}
	if err != nil {
		return nil, err
	}
	var exists int
	err = tx.QueryRow(ctx, "SELECT 1 FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email)).Scan(&exists)
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	now := nowISO()
	if _, err := tx.Exec(ctx, `
        INSERT INTO auth_users(id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $7, NULL)
    `, cleanText(userID), normalizeEmail(email), cleanText(passwordHash), cleanText(firstName), cleanText(lastName), normalizeRole(role), now); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "UPDATE auth_user_invites SET accepted_at=$1 WHERE token=$2", nowTimestamp, tokenHash); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return db.GetAuthUserByID(ctx, userID)
}

// CreateCLIAuthRequest stores a desktop sync request. The code is shown to
// the user (and appears in the approval URL); the poll token is a secret
// only the desktop client knows and is required to collect the sync token.
func (db *DB) CreateCLIAuthRequest(ctx context.Context, code string, pollToken string, requestTTLSeconds int, now int64) (CLIAuthRequest, error) {
	entry := CLIAuthRequest{Code: code, PollToken: pollToken, Status: "pending", CreatedAt: now, ExpiresAt: now + int64(max(requestTTLSeconds, 1))}
	_, err := db.pool.Exec(ctx, `
        INSERT INTO cli_sync_auth_requests(code, status, created_at, expires_at, poll_token_hash)
        VALUES ($1, $2, $3, $4, $5)
    `, entry.Code, entry.Status, entry.CreatedAt, entry.ExpiresAt, hashSecret(pollToken))
	return entry, err
}

// GetCLIAuthRequestStatus returns the state of a desktop sync request. The
// approved sync token is released exactly once, and only to a caller that
// presents the poll token (unless requirePollToken is false for legacy
// clients). Approver identity is only disclosed to the same caller.
func (db *DB) GetCLIAuthRequestStatus(ctx context.Context, code string, pollToken string, requirePollToken bool, now int64) (*CLIAuthRequest, error) {
	var entry CLIAuthRequest
	var pollTokenHash *string
	var pendingToken *string
	err := db.pool.QueryRow(ctx, `
        SELECT code, status, created_at, expires_at, approved_at, token, token_expires_at, user_id, email, poll_token_hash
        FROM cli_sync_auth_requests
        WHERE code=$1 AND ((status='pending' AND expires_at > $2) OR (status='approved' AND COALESCE(token_expires_at, 0) > $2))
    `, cleanText(code), now).Scan(&entry.Code, &entry.Status, &entry.CreatedAt, &entry.ExpiresAt, &entry.ApprovedAt, &pendingToken, &entry.TokenExpiresAt, &entry.UserID, &entry.Email, &pollTokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	authorized := false
	if strings.TrimSpace(pollToken) != "" {
		authorized = pollTokenHash != nil && subtle.ConstantTimeCompare([]byte(hashSecret(pollToken)), []byte(*pollTokenHash)) == 1
	} else {
		authorized = !requirePollToken
	}
	if !authorized {
		entry.UserID = nil
		entry.Email = nil
		return &entry, nil
	}
	if entry.Status == "approved" && pendingToken != nil {
		var claimed *string
		err := db.pool.QueryRow(ctx, `
            UPDATE cli_sync_auth_requests AS target SET token=NULL, token_claimed_at=$2
            FROM (
                SELECT code, token FROM cli_sync_auth_requests
                WHERE code=$1 AND token IS NOT NULL
                FOR UPDATE
            ) AS previous
            WHERE target.code = previous.code
            RETURNING previous.token
        `, entry.Code, now).Scan(&claimed)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		entry.Token = claimed
	}
	return &entry, nil
}

func (db *DB) ApproveCLIAuthRequest(ctx context.Context, code string, claims map[string]any, token string, tokenTTLSeconds int, now int64) (*CLIAuthRequest, error) {
	tokenExpiresAt := now + int64(max(tokenTTLSeconds, 1))
	var entry CLIAuthRequest
	err := db.pool.QueryRow(ctx, `
        UPDATE cli_sync_auth_requests
        SET status='approved', approved_at=$1, token=$2, token_hash=$3, token_expires_at=$4, user_id=$5, email=$6, session_id=$7
        WHERE code=$8 AND status='pending' AND expires_at > $1
        RETURNING code, status, created_at, expires_at, approved_at, token_expires_at, user_id, email
    `, now, token, hashSecret(token), tokenExpiresAt, claimString(claims, "sub"), claimString(claims, "email"), claimString(claims, "sid"), cleanText(code)).
		Scan(&entry.Code, &entry.Status, &entry.CreatedAt, &entry.ExpiresAt, &entry.ApprovedAt, &entry.TokenExpiresAt, &entry.UserID, &entry.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (db *DB) VerifyCLIAuthToken(ctx context.Context, token string, now int64) (map[string]any, error) {
	var userID, email, sessionID string
	var approvedAt, tokenExpiresAt int64
	err := db.pool.QueryRow(ctx, `
        SELECT COALESCE(user_id, ''), COALESCE(email, ''), COALESCE(session_id, ''), COALESCE(approved_at, 0), COALESCE(token_expires_at, 0)
        FROM cli_sync_auth_requests WHERE token_hash=$1 AND status='approved' AND token_expires_at > $2
    `, hashSecret(token), now).Scan(&userID, &email, &sessionID, &approvedAt, &tokenExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"token_type": "cli_sync", "sub": userID, "email": email, "sid": sessionID, "issued_at": approvedAt, "expires_at": tokenExpiresAt}, nil
}

// CleanupExpiredAuth removes expired invites and desktop sync requests. It
// is run periodically in the background instead of on every request.
func (db *DB) CleanupExpiredAuth(ctx context.Context, now int64) error {
	if _, err := db.pool.Exec(ctx, "DELETE FROM auth_user_invites WHERE accepted_at IS NOT NULL OR expires_at <= $1", now); err != nil {
		return err
	}
	_, err := db.pool.Exec(ctx, `
        DELETE FROM cli_sync_auth_requests
        WHERE (status = 'pending' AND expires_at <= $1)
           OR (status = 'approved' AND COALESCE(token_expires_at, 0) <= $1)
    `, now)
	return err
}

func hashSecret(value string) string {
	digest := sha256.Sum256([]byte(cleanText(value)))
	return hex.EncodeToString(digest[:])
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func cleanText(value string) string {
	return strings.TrimSpace(value)
}

func normalizeRole(value string) string {
	role := strings.ToLower(strings.TrimSpace(value))
	if role != "admin" {
		return "user"
	}
	return role
}

func claimString(claims map[string]any, key string) string {
	value, _ := claims[key].(string)
	return cleanText(value)
}

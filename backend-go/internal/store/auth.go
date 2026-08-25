package store

import (
	"context"
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
}

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
	_, err := db.pool.Exec(ctx, `
        INSERT INTO auth_instance_settings(singleton, initialized, public_registration_enabled, owner_user_id, updated_at)
        VALUES (TRUE, FALSE, FALSE, NULL, $1)
        ON CONFLICT (singleton) DO NOTHING
    `, nowISO())
	return err
}

func (db *DB) CountAuthUsers(ctx context.Context) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_users").Scan(&count)
	return count, err
}

func (db *DB) GetAuthUserByEmail(ctx context.Context, email string) (*AuthUser, error) {
	return db.queryAuthUser(ctx, "SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email))
}

func (db *DB) GetAuthUserByID(ctx context.Context, userID string) (*AuthUser, error) {
	return db.queryAuthUser(ctx, "SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at FROM auth_users WHERE id=$1", cleanText(userID))
}

func (db *DB) queryAuthUser(ctx context.Context, sql string, args ...any) (*AuthUser, error) {
	var user AuthUser
	err := db.pool.QueryRow(ctx, sql, args...).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt)
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
		return nil, errors.New("Public registration is closed")
	}
	var exists int
	err = tx.QueryRow(ctx, "SELECT 1 FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email)).Scan(&exists)
	if err == nil {
		return nil, errors.New("Email already registered")
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
        SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at, last_login_at
        FROM auth_users ORDER BY created_at ASC, email ASC
    `)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []AuthUser{}
	for rows.Next() {
		var user AuthUser
		if err := rows.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FirstName, &user.LastName, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (db *DB) UpdateAuthUser(ctx context.Context, userID string, payload map[string]any) (*AuthUser, error) {
	existing, err := db.GetAuthUserByID(ctx, userID)
	if err != nil || existing == nil {
		return existing, err
	}
	email := existing.Email
	firstName := existing.FirstName
	lastName := existing.LastName
	role := existing.Role
	isActive := existing.IsActive
	passwordHash := existing.PasswordHash
	if value, ok := payload["email"].(string); ok {
		email = normalizeEmail(value)
	}
	if value, ok := payload["first_name"].(string); ok {
		firstName = cleanText(value)
	}
	if value, ok := payload["last_name"].(string); ok {
		lastName = cleanText(value)
	}
	if value, ok := payload["role"].(string); ok {
		role = normalizeRole(value)
	}
	if value, ok := payload["is_active"].(bool); ok {
		isActive = value
	}
	if value, ok := payload["password_hash"].(string); ok {
		passwordHash = cleanText(value)
	}
	_, err = db.pool.Exec(ctx, `
        UPDATE auth_users SET email=$1, first_name=$2, last_name=$3, role=$4, is_active=$5, password_hash=$6, updated_at=$7 WHERE id=$8
    `, email, firstName, lastName, role, isActive, passwordHash, nowISO(), cleanText(userID))
	if err != nil {
		return nil, err
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

func (db *DB) CreateAuthInvite(ctx context.Context, invite Invite) (Invite, error) {
	if err := db.cleanupAuthInvites(ctx, invite.CreatedAt); err != nil {
		return Invite{}, err
	}
	_, err := db.pool.Exec(ctx, "DELETE FROM auth_user_invites WHERE LOWER(email)=LOWER($1)", normalizeEmail(invite.Email))
	if err != nil {
		return Invite{}, err
	}
	err = db.pool.QueryRow(ctx, `
        INSERT INTO auth_user_invites(token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at, accepted_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
        RETURNING token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at
    `, cleanText(invite.Token), normalizeEmail(invite.Email), cleanText(invite.FirstName), cleanText(invite.LastName), normalizeRole(invite.Role), cleanText(invite.InvitedByUserID), invite.CreatedAt, invite.ExpiresAt).
		Scan(&invite.Token, &invite.Email, &invite.FirstName, &invite.LastName, &invite.Role, &invite.InvitedByUserID, &invite.CreatedAt, &invite.ExpiresAt)
	return invite, err
}

func (db *DB) GetAuthInviteByToken(ctx context.Context, token string, now int64) (*Invite, error) {
	if err := db.cleanupAuthInvites(ctx, now); err != nil {
		return nil, err
	}
	var invite Invite
	err := db.pool.QueryRow(ctx, `
        SELECT token, email, first_name, last_name, role, invited_by_user_id, created_at, expires_at
        FROM auth_user_invites WHERE token=$1 AND accepted_at IS NULL AND expires_at > $2
    `, cleanText(token), now).Scan(&invite.Token, &invite.Email, &invite.FirstName, &invite.LastName, &invite.Role, &invite.InvitedByUserID, &invite.CreatedAt, &invite.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &invite, err
}

func (db *DB) CreateAuthUserFromInvite(ctx context.Context, inviteToken string, userID string, passwordHash string) (*AuthUser, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	nowTimestamp := time.Now().Unix()
	if _, err := tx.Exec(ctx, "DELETE FROM auth_user_invites WHERE accepted_at IS NOT NULL OR expires_at <= $1", nowTimestamp); err != nil {
		return nil, err
	}
	var email, firstName, lastName, role string
	err = tx.QueryRow(ctx, `
        SELECT email, first_name, last_name, role FROM auth_user_invites
        WHERE token=$1 AND accepted_at IS NULL AND expires_at > $2 FOR UPDATE
    `, cleanText(inviteToken), nowTimestamp).Scan(&email, &firstName, &lastName, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("Invitation is invalid or expired")
	}
	if err != nil {
		return nil, err
	}
	var exists int
	err = tx.QueryRow(ctx, "SELECT 1 FROM auth_users WHERE LOWER(email)=LOWER($1)", normalizeEmail(email)).Scan(&exists)
	if err == nil {
		return nil, errors.New("Email already registered")
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
	if _, err := tx.Exec(ctx, "UPDATE auth_user_invites SET accepted_at=$1 WHERE token=$2", nowTimestamp, cleanText(inviteToken)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return db.GetAuthUserByID(ctx, userID)
}

func (db *DB) CreateCLIAuthRequest(ctx context.Context, code string, requestTTLSeconds int, now int64) (CLIAuthRequest, error) {
	if err := db.cleanupCLIAuth(ctx, now); err != nil {
		return CLIAuthRequest{}, err
	}
	entry := CLIAuthRequest{Code: code, Status: "pending", CreatedAt: now, ExpiresAt: now + int64(max(requestTTLSeconds, 1))}
	_, err := db.pool.Exec(ctx, `
        INSERT INTO cli_sync_auth_requests(code, status, created_at, expires_at, approved_at, token, token_expires_at, user_id, email, session_id)
        VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, NULL, NULL)
    `, entry.Code, entry.Status, entry.CreatedAt, entry.ExpiresAt)
	return entry, err
}

func (db *DB) GetCLIAuthRequestStatus(ctx context.Context, code string, now int64) (*CLIAuthRequest, error) {
	if err := db.cleanupCLIAuth(ctx, now); err != nil {
		return nil, err
	}
	return db.queryCLIAuthRequest(ctx, "SELECT code, status, created_at, expires_at, approved_at, token, token_expires_at, user_id, email FROM cli_sync_auth_requests WHERE code=$1", cleanText(code))
}

func (db *DB) ApproveCLIAuthRequest(ctx context.Context, code string, claims map[string]any, token string, tokenTTLSeconds int, now int64) (*CLIAuthRequest, error) {
	if err := db.cleanupCLIAuth(ctx, now); err != nil {
		return nil, err
	}
	tokenExpiresAt := now + int64(max(tokenTTLSeconds, 1))
	return db.queryCLIAuthRequest(ctx, `
        UPDATE cli_sync_auth_requests
        SET status='approved', approved_at=$1, token=$2, token_expires_at=$3, user_id=$4, email=$5, session_id=$6
        WHERE code=$7 AND status='pending' AND expires_at > $1
        RETURNING code, status, created_at, expires_at, approved_at, token, token_expires_at, user_id, email
    `, now, token, tokenExpiresAt, claimString(claims, "sub"), claimString(claims, "email"), claimString(claims, "sid"), cleanText(code))
}

func (db *DB) VerifyCLIAuthToken(ctx context.Context, token string, now int64) (map[string]any, error) {
	if err := db.cleanupCLIAuth(ctx, now); err != nil {
		return nil, err
	}
	var userID, email, sessionID string
	var approvedAt, tokenExpiresAt int64
	err := db.pool.QueryRow(ctx, `
        SELECT COALESCE(user_id, ''), COALESCE(email, ''), COALESCE(session_id, ''), COALESCE(approved_at, 0), COALESCE(token_expires_at, 0)
        FROM cli_sync_auth_requests WHERE token=$1 AND status='approved' AND token_expires_at > $2
    `, token, now).Scan(&userID, &email, &sessionID, &approvedAt, &tokenExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"token_type": "cli_sync", "sub": userID, "email": email, "sid": sessionID, "issued_at": approvedAt, "expires_at": tokenExpiresAt}, nil
}

func (db *DB) queryCLIAuthRequest(ctx context.Context, sql string, args ...any) (*CLIAuthRequest, error) {
	var entry CLIAuthRequest
	err := db.pool.QueryRow(ctx, sql, args...).Scan(&entry.Code, &entry.Status, &entry.CreatedAt, &entry.ExpiresAt, &entry.ApprovedAt, &entry.Token, &entry.TokenExpiresAt, &entry.UserID, &entry.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &entry, err
}

func (db *DB) cleanupAuthInvites(ctx context.Context, now int64) error {
	_, err := db.pool.Exec(ctx, "DELETE FROM auth_user_invites WHERE accepted_at IS NOT NULL OR expires_at <= $1", now)
	return err
}

func (db *DB) cleanupCLIAuth(ctx context.Context, now int64) error {
	_, err := db.pool.Exec(ctx, `
        DELETE FROM cli_sync_auth_requests
        WHERE (status = 'pending' AND expires_at <= $1)
           OR (status = 'approved' AND COALESCE(token_expires_at, 0) <= $1)
    `, now)
	return err
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

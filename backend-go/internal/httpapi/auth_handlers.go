package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/auth"
	"github.com/jlemmings/divevault/backend-go/internal/store"
)

func handleAuthStatus(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	settings, err := db.GetAuthInstanceSettings(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	var invite *store.Invite
	if token := strings.TrimSpace(ctx.Request.URL.Query().Get("invite_token")); token != "" {
		invite, err = db.GetAuthInviteByToken(ctx.Request.Context(), token, time.Now().Unix())
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{
		"initialized":                 settings.Initialized,
		"user_count":                  settings.UserCount,
		"bootstrap_registration_open": settings.BootstrapRegistrationOpen,
		"public_registration_enabled": settings.PublicRegistrationEnabled,
		"public_registration_open":    settings.PublicRegistrationOpen,
		"invite":                      invite,
	})
}

func handleAuthMe(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	user, err := db.GetAuthUserByID(ctx.Request.Context(), auth.PrincipalID(ctx.Claims))
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	settings, err := db.GetAuthInstanceSettings(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	email, _ := ctx.Claims["email"].(string)
	role, _ := ctx.Claims["role"].(string)
	payload := map[string]any{
		"token_type": ctx.Claims["token_type"],
		"session_id": ctx.Claims["sid"],
		"user_id":    auth.PrincipalID(ctx.Claims),
		"email":      email,
		"first_name": "",
		"last_name":  "",
		"role":       role,
		"is_active":  true,
		"is_owner":   auth.PrincipalID(ctx.Claims) == settings.OwnerUserID,
	}
	if user != nil {
		payload["email"] = user.Email
		payload["first_name"] = user.FirstName
		payload["last_name"] = user.LastName
		payload["role"] = user.Role
		payload["is_active"] = user.IsActive
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, payload)
}

func handleAuthSettingsGet(ctx *Context) {
	settings, err := ctx.Server.authSettings(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, settings)
}

func handleAuthSettingsPut(ctx *Context) {
	var payload struct {
		PublicRegistrationEnabled *bool `json:"public_registration_enabled"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if payload.PublicRegistrationEnabled == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "public_registration_enabled is required"})
		return
	}
	settings, err := ctx.Server.db.UpdateAuthInstanceSettings(ctx.Request.Context(), *payload.PublicRegistrationEnabled)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, settings)
}

func handleAuthRegister(ctx *Context) {
	var payload struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		FirstName   string `json:"first_name"`
		LastName    string `json:"last_name"`
		InviteToken string `json:"invite_token"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.InviteToken = strings.TrimSpace(payload.InviteToken)
	if payload.InviteToken == "" && (payload.Email == "" || !strings.Contains(payload.Email, "@")) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Valid email is required"})
		return
	}
	if len(payload.Password) < 8 {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Password must be at least 8 characters"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	passwordHash, err := auth.HashPassword(payload.Password)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Password hashing failed"})
		return
	}
	var user *store.AuthUser
	if payload.InviteToken != "" {
		invite, err := db.GetAuthInviteByToken(ctx.Request.Context(), payload.InviteToken, time.Now().Unix())
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
		if invite == nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invitation is invalid or expired"})
			return
		}
		if payload.Email != "" && payload.Email != invite.Email {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invitation email does not match the submitted email"})
			return
		}
		user, err = db.CreateAuthUserFromInvite(ctx.Request.Context(), payload.InviteToken, userID(), passwordHash)
		if err != nil {
			status := http.StatusBadRequest
			if err.Error() == "Email already registered" {
				status = http.StatusConflict
			}
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, status, map[string]string{"error": err.Error()})
			return
		}
	} else {
		existing, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
		if existing != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusConflict, map[string]string{"error": "Email already registered"})
			return
		}
		settings, err := db.GetAuthInstanceSettings(ctx.Request.Context())
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
		if settings.BootstrapRegistrationOpen {
			user, err = db.CreateBootstrapAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName)
		} else if settings.PublicRegistrationEnabled {
			user, err = db.CreateAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName, "user")
		} else {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "Public registration is closed"})
			return
		}
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusCreated, map[string]any{"user_id": user.ID, "email": user.Email, "role": user.Role, "is_owner": payload.InviteToken == "" && user.Role == "admin"})
}

func handleAuthLogin(ctx *Context) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	user, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if user == nil || !auth.VerifyPassword(payload.Password, user.PasswordHash) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusUnauthorized, map[string]string{"error": "Invalid email or password"})
		return
	}
	if !user.IsActive {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "User account is inactive"})
		return
	}
	_ = db.UpdateAuthUserLastLogin(ctx.Request.Context(), user.ID)
	token, err := auth.IssueSessionToken(user.ID, user.Email, user.Role, ctx.Server.cfg.AuthJWTSecret, ctx.Server.cfg.AuthJWTIssuer, ctx.Server.cfg.AuthJWTAudience, ctx.Server.cfg.AuthTokenTTLSeconds)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Session token creation failed"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]string{"token": token})
}

func handleAuthPasswordPut(ctx *Context) {
	var payload struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if len(payload.NewPassword) < 8 {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "New password must be at least 8 characters"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	user, err := db.GetAuthUserByID(ctx.Request.Context(), auth.PrincipalID(ctx.Claims))
	if err != nil || user == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusUnauthorized, map[string]string{"error": "Current password is incorrect"})
		return
	}
	if !auth.VerifyPassword(payload.CurrentPassword, user.PasswordHash) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusUnauthorized, map[string]string{"error": "Current password is incorrect"})
		return
	}
	passwordHash, err := auth.HashPassword(payload.NewPassword)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Password hashing failed"})
		return
	}
	_, err = db.UpdateAuthUser(ctx.Request.Context(), user.ID, map[string]any{"password_hash": passwordHash})
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]bool{"updated": true})
}

func handleAuthInvitationsPost(ctx *Context) {
	var payload struct {
		Email         string `json:"email"`
		FirstName     string `json:"first_name"`
		LastName      string `json:"last_name"`
		Role          string `json:"role"`
		ExpiresInDays int    `json:"expires_in_days"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	role := normalizeUserRole(payload.Role)
	if payload.Email == "" || !strings.Contains(payload.Email, "@") {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Valid email is required"})
		return
	}
	if role == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Role must be either 'user' or 'admin'"})
		return
	}
	if payload.ExpiresInDays <= 0 {
		payload.ExpiresInDays = 7
	}
	if payload.ExpiresInDays > 30 {
		payload.ExpiresInDays = 30
	}
	db := ctx.Server.db
	existing, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if existing != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusConflict, map[string]string{"error": "Email already registered"})
		return
	}
	now := time.Now().Unix()
	token := randomURLToken(24)
	invite, err := db.CreateAuthInvite(ctx.Request.Context(), store.Invite{
		Token:           token,
		Email:           payload.Email,
		FirstName:       payload.FirstName,
		LastName:        payload.LastName,
		Role:            role,
		InvitedByUserID: ctx.PrincipalID,
		CreatedAt:       now,
		ExpiresAt:       now + int64(payload.ExpiresInDays)*24*60*60,
	})
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusCreated, map[string]any{"invite": invite, "invite_url": inviteURL(token)})
}

func handleUsersGet(ctx *Context) {
	users, err := ctx.Server.db.ListAuthUsers(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"users": users})
}

func handleUsersPost(ctx *Context) {
	var payload struct {
		Email     string `json:"email"`
		Password  string `json:"password"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Role      string `json:"role"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	role := normalizeUserRole(payload.Role)
	if payload.Email == "" || payload.Password == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		return
	}
	if role == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Role must be either 'user' or 'admin'"})
		return
	}
	db := ctx.Server.db
	existing, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if existing != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusConflict, map[string]string{"error": "Email already registered"})
		return
	}
	passwordHash, err := auth.HashPassword(payload.Password)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Password hashing failed"})
		return
	}
	user, err := db.CreateAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName, role)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusCreated, map[string]any{"user": user})
}

func handleUserPut(ctx *Context) {
	userID := strings.TrimPrefix(ctx.Request.URL.Path, "/api/users/")
	var payload map[string]any
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if rawRole, ok := payload["role"]; ok {
		role, _ := rawRole.(string)
		normalized := normalizeUserRole(role)
		if normalized == "" {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Role must be either 'user' or 'admin'"})
			return
		}
		payload["role"] = normalized
	}
	settings, err := ctx.Server.db.GetAuthInstanceSettings(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if userID == settings.OwnerUserID {
		if value, ok := payload["is_active"].(bool); ok && !value {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "The instance owner cannot be deactivated"})
			return
		}
		if payload["role"] == "user" {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "The instance owner must retain the admin role"})
			return
		}
	}
	updated, err := ctx.Server.db.UpdateAuthUser(ctx.Request.Context(), userID, payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if updated == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "User not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"user": updated})
}

func handleUserDelete(ctx *Context) {
	userID := strings.TrimPrefix(ctx.Request.URL.Path, "/api/users/")
	settings, err := ctx.Server.db.GetAuthInstanceSettings(ctx.Request.Context())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if userID == settings.OwnerUserID {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "The instance owner cannot be deleted"})
		return
	}
	deleted, err := ctx.Server.db.DeleteAuthUser(ctx.Request.Context(), userID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if !deleted {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "User not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"deleted": true, "user_id": userID})
}

func handleCLIAuthRequestPost(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	entry, err := db.CreateCLIAuthRequest(ctx.Request.Context(), randomURLToken(24), ctx.Server.cfg.CLIAuthRequestTTL, time.Now().Unix())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusCreated, entry)
}

func handleCLIAuthRequestGet(ctx *Context) {
	code := ctx.Request.URL.Query().Get("code")
	if code == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Missing code query parameter"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	entry, err := db.GetCLIAuthRequestStatus(ctx.Request.Context(), code, time.Now().Unix())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if entry == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "CLI auth request not found or expired"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, entry)
}

func handleCLIAuthApprovePost(ctx *Context) {
	var payload struct {
		Code string `json:"code"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	payload.Code = strings.TrimSpace(payload.Code)
	if payload.Code == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Missing CLI auth code"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	entry, err := db.ApproveCLIAuthRequest(ctx.Request.Context(), payload.Code, map[string]any(ctx.Claims), "dvsync_"+randomURLToken(32), ctx.Server.cfg.CLIAuthTokenTTL, time.Now().Unix())
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if entry == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "CLI auth request not found or expired"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"status": entry.Status, "email": entry.Email, "token_expires_at": entry.TokenExpiresAt})
}

func normalizeUserRole(value string) string {
	role := strings.ToLower(strings.TrimSpace(value))
	if role == "" {
		role = "user"
	}
	if role != "user" && role != "admin" {
		return ""
	}
	return role
}

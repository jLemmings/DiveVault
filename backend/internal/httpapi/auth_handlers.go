package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend/internal/auth"
	"github.com/jlemmings/divevault/backend/internal/store"
)

func handleAuthStatus(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	settings, err := db.GetAuthInstanceSettings(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	var invite *store.Invite
	if token := strings.TrimSpace(ctx.Request.URL.Query().Get("invite_token")); token != "" {
		invite, err = db.GetAuthInviteByToken(ctx.Request.Context(), token, time.Now().Unix())
		if err != nil {
			ctx.Unavailable(err)
			return
		}
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"initialized":                 settings.Initialized,
		"user_count":                  settings.UserCount,
		"bootstrap_registration_open": settings.BootstrapRegistrationOpen,
		"public_registration_enabled": settings.PublicRegistrationEnabled,
		"public_registration_open":    settings.PublicRegistrationOpen,
		"invite":                      invite,
	})
}

func handleAuthMe(ctx *Context) {
	ownerID, err := ctx.Server.instanceOwnerID(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	user := ctx.User
	ctx.JSON(http.StatusOK, map[string]any{
		"token_type": ctx.Claims["token_type"],
		"session_id": ctx.Claims["sid"],
		"user_id":    user.ID,
		"email":      user.Email,
		"first_name": user.FirstName,
		"last_name":  user.LastName,
		"role":       user.Role,
		"is_active":  user.IsActive,
		"is_owner":   user.ID == ownerID,
	})
}

func handleAuthSettingsGet(ctx *Context) {
	settings, err := ctx.Server.authSettings(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	ctx.JSON(http.StatusOK, settings)
}

func handleAuthSettingsPut(ctx *Context) {
	var payload struct {
		PublicRegistrationEnabled *bool `json:"public_registration_enabled"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	if payload.PublicRegistrationEnabled == nil {
		ctx.Error(http.StatusBadRequest, "public_registration_enabled is required")
		return
	}
	settings, err := ctx.Server.db.UpdateAuthInstanceSettings(ctx.Request.Context(), *payload.PublicRegistrationEnabled)
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	ctx.JSON(http.StatusOK, settings)
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
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	payload.Email = normalizeEmail(payload.Email)
	payload.InviteToken = strings.TrimSpace(payload.InviteToken)
	if payload.InviteToken == "" && !validEmail(payload.Email) {
		ctx.Error(http.StatusBadRequest, "Valid email is required")
		return
	}
	if message := passwordProblem(payload.Password); message != "" {
		ctx.Error(http.StatusBadRequest, message)
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	passwordHash, err := auth.HashPassword(payload.Password)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "Password hashing failed")
		return
	}
	var user *store.AuthUser
	if payload.InviteToken != "" {
		invite, err := db.GetAuthInviteByToken(ctx.Request.Context(), payload.InviteToken, time.Now().Unix())
		if err != nil {
			ctx.Unavailable(err)
			return
		}
		if invite == nil {
			ctx.Error(http.StatusBadRequest, "Invitation is invalid or expired")
			return
		}
		if payload.Email != "" && payload.Email != invite.Email {
			ctx.Error(http.StatusBadRequest, "Invitation email does not match the submitted email")
			return
		}
		user, err = db.CreateAuthUserFromInvite(ctx.Request.Context(), payload.InviteToken, userID(), passwordHash)
		if err != nil {
			ctx.Fail(err)
			return
		}
	} else {
		existing, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
		if err != nil {
			ctx.Unavailable(err)
			return
		}
		if existing != nil {
			ctx.Error(http.StatusConflict, "Email already registered")
			return
		}
		settings, err := db.GetAuthInstanceSettings(ctx.Request.Context())
		if err != nil {
			ctx.Unavailable(err)
			return
		}
		if settings.BootstrapRegistrationOpen {
			user, err = db.CreateBootstrapAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName)
		} else if settings.PublicRegistrationEnabled {
			user, err = db.CreateAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName, "user")
		} else {
			ctx.Error(http.StatusForbidden, "Public registration is closed")
			return
		}
		if err != nil {
			ctx.Fail(err)
			return
		}
	}
	ctx.JSON(http.StatusCreated, map[string]any{"user_id": user.ID, "email": user.Email, "role": user.Role, "is_owner": payload.InviteToken == "" && user.Role == "admin"})
}

func handleAuthLogin(ctx *Context) {
	var payload struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if len(payload.Password) > maxPasswordLength {
		ctx.Error(http.StatusUnauthorized, "Invalid email or password")
		return
	}
	user, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if user == nil {
		// Spend the same hashing effort so timing does not reveal accounts.
		auth.BurnPasswordCheck(payload.Password)
		ctx.Error(http.StatusUnauthorized, "Invalid email or password")
		return
	}
	if !auth.VerifyPassword(payload.Password, user.PasswordHash) {
		ctx.Error(http.StatusUnauthorized, "Invalid email or password")
		return
	}
	if !user.IsActive {
		ctx.Error(http.StatusForbidden, "User account is inactive")
		return
	}
	if err := db.UpdateAuthUserLastLogin(ctx.Request.Context(), user.ID); err != nil {
		ctx.Server.logger.Warn("could not record last login", "error", err)
	}
	token, err := ctx.Server.issueSessionToken(user)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "Session token creation failed")
		return
	}
	ctx.JSON(http.StatusOK, map[string]string{"token": token})
}

func (s *Server) issueSessionToken(user *store.AuthUser) (string, error) {
	return auth.IssueSessionToken(user.ID, user.Email, user.Role, user.TokenVersion, s.cfg.AuthJWTSecret, s.cfg.AuthJWTIssuer, s.cfg.AuthJWTAudience, s.cfg.AuthTokenTTLSeconds)
}

func handleAuthPasswordPut(ctx *Context) {
	var payload struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	if message := passwordProblem(payload.NewPassword); message != "" {
		ctx.Error(http.StatusBadRequest, "New p"+message[1:])
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	user := ctx.User
	if !auth.VerifyPassword(payload.CurrentPassword, user.PasswordHash) {
		ctx.Error(http.StatusUnauthorized, "Current password is incorrect")
		return
	}
	passwordHash, err := auth.HashPassword(payload.NewPassword)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "Password hashing failed")
		return
	}
	// Changing the password bumps the token version, which signs out every
	// other session and desktop sync client. The caller gets a fresh token.
	updated, err := db.UpdateAuthUser(ctx.Request.Context(), user.ID, store.AuthUserPatch{PasswordHash: &passwordHash})
	if err != nil {
		ctx.Fail(err)
		return
	}
	if updated == nil {
		ctx.Error(http.StatusUnauthorized, "Session is no longer valid. Please sign in again.")
		return
	}
	token, err := ctx.Server.issueSessionToken(updated)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "Session token creation failed")
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"updated": true, "token": token})
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
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	payload.Email = normalizeEmail(payload.Email)
	role := normalizeUserRole(payload.Role)
	if !validEmail(payload.Email) {
		ctx.Error(http.StatusBadRequest, "Valid email is required")
		return
	}
	if role == "" {
		ctx.Error(http.StatusBadRequest, "Role must be either 'user' or 'admin'")
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
		ctx.Unavailable(err)
		return
	}
	if existing != nil {
		ctx.Error(http.StatusConflict, "Email already registered")
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
		ctx.Unavailable(err)
		return
	}
	ctx.JSON(http.StatusCreated, map[string]any{"invite": invite, "invite_url": inviteURL(token)})
}

func handleUsersGet(ctx *Context) {
	users, err := ctx.Server.db.ListAuthUsers(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"users": users})
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
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	role := normalizeUserRole(payload.Role)
	payload.Email = normalizeEmail(payload.Email)
	if !validEmail(payload.Email) {
		ctx.Error(http.StatusBadRequest, "Valid email is required")
		return
	}
	if message := passwordProblem(payload.Password); message != "" {
		ctx.Error(http.StatusBadRequest, message)
		return
	}
	if role == "" {
		ctx.Error(http.StatusBadRequest, "Role must be either 'user' or 'admin'")
		return
	}
	db := ctx.Server.db
	existing, err := db.GetAuthUserByEmail(ctx.Request.Context(), payload.Email)
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if existing != nil {
		ctx.Error(http.StatusConflict, "Email already registered")
		return
	}
	passwordHash, err := auth.HashPassword(payload.Password)
	if err != nil {
		ctx.Error(http.StatusInternalServerError, "Password hashing failed")
		return
	}
	user, err := db.CreateAuthUser(ctx.Request.Context(), userID(), payload.Email, passwordHash, payload.FirstName, payload.LastName, role)
	if err != nil {
		ctx.Fail(err)
		return
	}
	ctx.JSON(http.StatusCreated, map[string]any{"user": user})
}

func handleUserPut(ctx *Context) {
	userID := ctx.Params["id"]
	var payload struct {
		Email     *string `json:"email"`
		FirstName *string `json:"first_name"`
		LastName  *string `json:"last_name"`
		Role      *string `json:"role"`
		IsActive  *bool   `json:"is_active"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	patch := store.AuthUserPatch{Email: payload.Email, FirstName: payload.FirstName, LastName: payload.LastName, IsActive: payload.IsActive}
	if payload.Role != nil {
		normalized := normalizeUserRole(*payload.Role)
		if normalized == "" {
			ctx.Error(http.StatusBadRequest, "Role must be either 'user' or 'admin'")
			return
		}
		patch.Role = &normalized
	}
	if payload.Email != nil {
		email := normalizeEmail(*payload.Email)
		if !validEmail(email) {
			ctx.Error(http.StatusBadRequest, "Valid email is required")
			return
		}
		patch.Email = &email
	}
	ownerID, err := ctx.Server.instanceOwnerID(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if userID == ownerID {
		if patch.IsActive != nil && !*patch.IsActive {
			ctx.Error(http.StatusBadRequest, "The instance owner cannot be deactivated")
			return
		}
		if patch.Role != nil && *patch.Role == "user" {
			ctx.Error(http.StatusBadRequest, "The instance owner must retain the admin role")
			return
		}
	}
	updated, err := ctx.Server.db.UpdateAuthUser(ctx.Request.Context(), userID, patch)
	if err != nil {
		ctx.Fail(err)
		return
	}
	if updated == nil {
		ctx.Error(http.StatusNotFound, "User not found")
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"user": updated})
}

func handleUserDelete(ctx *Context) {
	userID := ctx.Params["id"]
	ownerID, err := ctx.Server.instanceOwnerID(ctx.Request.Context())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if userID == ownerID {
		ctx.Error(http.StatusBadRequest, "The instance owner cannot be deleted")
		return
	}
	deleted, err := ctx.Server.db.DeleteAuthUser(ctx.Request.Context(), userID)
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if !deleted {
		ctx.Error(http.StatusNotFound, "User not found")
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"deleted": true, "user_id": userID})
}

func handleCLIAuthRequestPost(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	entry, err := db.CreateCLIAuthRequest(ctx.Request.Context(), randomURLToken(24), "dvpoll_"+randomURLToken(32), ctx.Server.cfg.CLIAuthRequestTTL, time.Now().Unix())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	ctx.JSON(http.StatusCreated, entry)
}

func handleCLIAuthRequestGet(ctx *Context) {
	code := ctx.Request.URL.Query().Get("code")
	if code == "" {
		ctx.Error(http.StatusBadRequest, "Missing code query parameter")
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	pollToken := strings.TrimSpace(ctx.Request.Header.Get("X-Poll-Token"))
	if pollToken == "" {
		pollToken = strings.TrimSpace(ctx.Request.URL.Query().Get("poll_token"))
	}
	entry, err := db.GetCLIAuthRequestStatus(ctx.Request.Context(), code, pollToken, ctx.Server.cfg.CLIAuthRequirePollToken, time.Now().Unix())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if entry == nil {
		ctx.Error(http.StatusNotFound, "CLI auth request not found or expired")
		return
	}
	ctx.JSON(http.StatusOK, entry)
}

func handleCLIAuthApprovePost(ctx *Context) {
	var payload struct {
		Code string `json:"code"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		ctx.Error(http.StatusBadRequest, "Invalid JSON")
		return
	}
	payload.Code = strings.TrimSpace(payload.Code)
	if payload.Code == "" {
		ctx.Error(http.StatusBadRequest, "Missing CLI auth code")
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	entry, err := db.ApproveCLIAuthRequest(ctx.Request.Context(), payload.Code, map[string]any(ctx.Claims), "dvsync_"+randomURLToken(32), ctx.Server.cfg.CLIAuthTokenTTL, time.Now().Unix())
	if err != nil {
		ctx.Unavailable(err)
		return
	}
	if entry == nil {
		ctx.Error(http.StatusNotFound, "CLI auth request not found or expired")
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{"status": entry.Status, "email": entry.Email, "token_expires_at": entry.TokenExpiresAt})
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

// maxPasswordLength bounds the input passed to scrypt.
const maxPasswordLength = 1024

func passwordProblem(password string) string {
	if len(password) < 8 {
		return "Password must be at least 8 characters"
	}
	if len(password) > maxPasswordLength {
		return "Password must be at most 1024 characters"
	}
	return ""
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validEmail(email string) bool {
	if len(email) < 3 || len(email) > 254 || strings.ContainsAny(email, " \t\r\n") {
		return false
	}
	at := strings.LastIndex(email, "@")
	return at > 0 && at < len(email)-1
}

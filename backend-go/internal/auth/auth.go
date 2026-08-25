package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/scrypt"
)

type Claims map[string]any

type Error struct {
	Status  int
	Message string
}

func (e Error) Error() string {
	return e.Message
}

type SyncTokenVerifier interface {
	VerifyToken(context.Context, string) (Claims, error)
}

type Verifier struct {
	Secret            string
	Issuer            string
	Audience          string
	SyncTokenVerifier SyncTokenVerifier
}

func NormalizeBearerToken(value string) string {
	normalized := strings.TrimSpace(value)
	if len(normalized) >= 2 {
		first := normalized[0]
		last := normalized[len(normalized)-1]
		if first == last && (first == '"' || first == '\'') {
			normalized = strings.TrimSpace(normalized[1 : len(normalized)-1])
		}
	}
	if strings.HasPrefix(strings.ToLower(normalized), "bearer ") {
		normalized = strings.TrimSpace(normalized[7:])
	}
	return normalized
}

func (v Verifier) VerifyRequest(ctx context.Context, r *http.Request) (Claims, error) {
	token := NormalizeBearerToken(extractToken(r))
	if token == "" {
		return nil, Error{Status: http.StatusUnauthorized, Message: "Missing authentication bearer token"}
	}
	if strings.HasPrefix(token, "dvsync_") {
		if v.SyncTokenVerifier == nil {
			return nil, Error{Status: http.StatusServiceUnavailable, Message: "Desktop sync login is not configured on the backend"}
		}
		claims, err := v.SyncTokenVerifier.VerifyToken(ctx, token)
		if err != nil || claims == nil {
			return nil, Error{Status: http.StatusUnauthorized, Message: "Desktop sync token is invalid or expired"}
		}
		return claims, nil
	}
	return v.verifySessionToken(token)
}

func (v Verifier) verifySessionToken(tokenString string) (Claims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method %s", token.Header["alg"])
		}
		return []byte(v.Secret), nil
	}, jwt.WithIssuer(v.Issuer), jwt.WithAudience(v.Audience), jwt.WithLeeway(5*time.Second))
	if err != nil || !token.Valid {
		if err == nil {
			err = errors.New("invalid token")
		}
		return nil, Error{Status: http.StatusUnauthorized, Message: "Invalid session token: " + err.Error()}
	}
	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, Error{Status: http.StatusUnauthorized, Message: "Invalid session token: invalid claims"}
	}
	claims := Claims{}
	for key, value := range mapClaims {
		claims[key] = value
	}
	if _, ok := claims["token_type"]; !ok {
		claims["token_type"] = "session_token"
	}
	return claims, nil
}

func extractToken(r *http.Request) string {
	authorization := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		return strings.TrimSpace(authorization[7:])
	}
	cookie, err := r.Cookie("__session")
	if err != nil {
		return ""
	}
	return cookie.Value
}

func PrincipalID(claims Claims) string {
	for _, key := range []string{"sub", "user_id", "subject"} {
		if value, ok := claims[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func IsAdmin(claims Claims) bool {
	role, _ := claims["role"].(string)
	return strings.EqualFold(role, "admin")
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return hashPasswordWithSalt(password, salt)
}

func VerifyPassword(password string, passwordHash string) bool {
	if !strings.HasPrefix(passwordHash, "scrypt$") {
		return false
	}
	parts := strings.Split(passwordHash, "$")
	if len(parts) != 3 {
		return false
	}
	salt, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	actual, err := hashPasswordWithSalt(password, salt)
	if err != nil {
		return false
	}
	return hmac.Equal([]byte(actual), []byte(passwordHash))
}

func hashPasswordWithSalt(password string, salt []byte) (string, error) {
	digest, err := scrypt.Key([]byte(password), salt, 1<<14, 8, 1, 64)
	if err != nil {
		return "", err
	}
	return "scrypt$" + hex.EncodeToString(salt) + "$" + hex.EncodeToString(digest), nil
}

func IssueSessionToken(userID string, email string, role string, secret string, issuer string, audience string, ttlSeconds int) (string, error) {
	if ttlSeconds < 300 {
		ttlSeconds = 300
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":        userID,
		"sid":        "session_" + randomHex(16),
		"email":      email,
		"role":       role,
		"token_type": "session_token",
		"iat":        now.Unix(),
		"nbf":        now.Unix(),
		"exp":        now.Add(time.Duration(ttlSeconds) * time.Second).Unix(),
		"iss":        issuer,
		"aud":        audience,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func randomHex(bytes int) string {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(value)
}

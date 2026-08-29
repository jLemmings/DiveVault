package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeBearerToken(t *testing.T) {
	cases := map[string]string{
		"":                    "",
		" token ":             "token",
		"Bearer token":        "token",
		"bearer token":        "token",
		`"Bearer token"`:      "token",
		"'Bearer token'":      "token",
		"Bearer    spaced":    "spaced",
		"Bearer quoted token": "quoted token",
	}
	for input, expected := range cases {
		if actual := NormalizeBearerToken(input); actual != expected {
			t.Fatalf("NormalizeBearerToken(%q) = %q, expected %q", input, actual, expected)
		}
	}
}

func TestVerifyPasswordAcceptsScryptHash(t *testing.T) {
	salt := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}
	hash, err := hashPasswordWithSalt("password123", salt)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if !VerifyPassword("password123", hash) {
		t.Fatalf("expected scrypt hash to verify")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatalf("expected wrong password to fail")
	}
}

func TestVerifyPasswordRejectsMalformedHashes(t *testing.T) {
	for _, hash := range []string{"", "bcrypt$hash", "scrypt$badhex$digest", "scrypt$00", "scrypt$00$badhex"} {
		if VerifyPassword("password123", hash) {
			t.Fatalf("expected malformed hash %q to fail", hash)
		}
	}
}

func TestIssueAndVerifySessionToken(t *testing.T) {
	token, err := IssueSessionToken("user_1", "diver@example.test", "admin", "secret", "issuer", "audience", 60)
	if err != nil {
		t.Fatalf("IssueSessionToken returned error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.Header.Set("Authorization", "Bearer "+token)

	claims, err := (Verifier{Secret: "secret", Issuer: "issuer", Audience: "audience"}).VerifyRequest(context.Background(), request)
	if err != nil {
		t.Fatalf("VerifyRequest returned error: %v", err)
	}
	if PrincipalID(claims) != "user_1" {
		t.Fatalf("PrincipalID = %q", PrincipalID(claims))
	}
	if claims["email"] != "diver@example.test" || claims["role"] != "admin" || claims["token_type"] != "session_token" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if !IsAdmin(claims) {
		t.Fatalf("expected admin claim")
	}
}

func TestVerifyRequestRejectsWrongAudience(t *testing.T) {
	token, err := IssueSessionToken("user_1", "diver@example.test", "user", "secret", "issuer", "audience", 300)
	if err != nil {
		t.Fatalf("IssueSessionToken returned error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.Header.Set("Authorization", "Bearer "+token)

	_, err = (Verifier{Secret: "secret", Issuer: "issuer", Audience: "other"}).VerifyRequest(context.Background(), request)
	if err == nil || !strings.Contains(err.Error(), "Invalid session token") {
		t.Fatalf("expected invalid session token error, got %v", err)
	}
}

func TestVerifyRequestUsesSessionCookie(t *testing.T) {
	token, err := IssueSessionToken("user_cookie", "cookie@example.test", "user", "secret", "issuer", "audience", 300)
	if err != nil {
		t.Fatalf("IssueSessionToken returned error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.AddCookie(&http.Cookie{Name: "__session", Value: token})

	claims, err := (Verifier{Secret: "secret", Issuer: "issuer", Audience: "audience"}).VerifyRequest(context.Background(), request)
	if err != nil {
		t.Fatalf("VerifyRequest returned error: %v", err)
	}
	if PrincipalID(claims) != "user_cookie" {
		t.Fatalf("PrincipalID = %q", PrincipalID(claims))
	}
}

func TestVerifyRequestUsesSyncVerifier(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/dives", nil)
	request.Header.Set("Authorization", "Bearer dvsync_token")
	verifier := Verifier{SyncTokenVerifier: syncTokenVerifierFunc(func(_ context.Context, token string) (Claims, error) {
		if token != "dvsync_token" {
			t.Fatalf("token = %q", token)
		}
		return Claims{"user_id": "sync-user", "token_type": "cli_sync"}, nil
	})}

	claims, err := verifier.VerifyRequest(context.Background(), request)
	if err != nil {
		t.Fatalf("VerifyRequest returned error: %v", err)
	}
	if PrincipalID(claims) != "sync-user" {
		t.Fatalf("PrincipalID = %q", PrincipalID(claims))
	}
}

func TestPrincipalIDFallbacks(t *testing.T) {
	for _, claims := range []Claims{{"sub": "sub-id"}, {"user_id": "user-id"}, {"subject": "subject-id"}} {
		if PrincipalID(claims) == "" {
			t.Fatalf("expected principal for %+v", claims)
		}
	}
}

type syncTokenVerifierFunc func(context.Context, string) (Claims, error)

func (f syncTokenVerifierFunc) VerifyToken(ctx context.Context, token string) (Claims, error) {
	return f(ctx, token)
}

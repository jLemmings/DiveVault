package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jlemmings/divevault/backend/internal/auth"
	"github.com/jlemmings/divevault/backend/internal/store"
)

const testSecret = "test-secret-test-secret-test-secret"

func securityTestServer(users map[string]*store.AuthUser) *Server {
	cfg := testConfig()
	cfg.AuthJWTSecret = testSecret
	cfg.AuthJWTIssuer = "issuer"
	cfg.AuthJWTAudience = "audience"
	cfg.AuthTokenTTLSeconds = 300
	server := NewServer(cfg, slog.Default(), nil)
	server.lookupUser = func(_ context.Context, id string) (*store.AuthUser, error) {
		return users[id], nil
	}
	return server
}

func policyRequest(t *testing.T, server *Server, route Route, token string) (*Context, *httptest.ResponseRecorder, bool) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, route.Path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	ctx := &Context{ResponseWriter: recorder, Request: request, Server: server, Route: route}
	ok := server.applyRoutePolicy(ctx)
	return ctx, recorder, ok
}

func sessionToken(t *testing.T, user *store.AuthUser) string {
	t.Helper()
	token, err := auth.IssueSessionToken(user.ID, user.Email, user.Role, user.TokenVersion, testSecret, "issuer", "audience", 300)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return token
}

func TestRoutePolicyAcceptsCurrentSessionAndUsesDatabaseRole(t *testing.T) {
	user := &store.AuthUser{ID: "user_a", Email: "a@example.test", Role: "user", IsActive: true, TokenVersion: 2}
	server := securityTestServer(map[string]*store.AuthUser{user.ID: user})
	token := sessionToken(t, user)
	user.Role = "admin"

	ctx, recorder, ok := policyRequest(t, server, route("GET", "/api/dives", AuthPrincipal, nil), token)
	if !ok {
		t.Fatalf("expected policy to pass, got %d %s", recorder.Code, recorder.Body.String())
	}
	if ctx.PrincipalID != "user_a" || ctx.Claims["role"] != "admin" {
		t.Fatalf("unexpected principal/claims: %s %+v", ctx.PrincipalID, ctx.Claims)
	}
}

func TestRoutePolicyRejectsRevokedSession(t *testing.T) {
	user := &store.AuthUser{ID: "user_a", Email: "a@example.test", Role: "user", IsActive: true, TokenVersion: 1}
	server := securityTestServer(map[string]*store.AuthUser{user.ID: user})
	token := sessionToken(t, user)
	user.TokenVersion = 2 // e.g. password changed

	_, recorder, ok := policyRequest(t, server, route("GET", "/api/dives", AuthPrincipal, nil), token)
	if ok || recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected revoked token to be rejected, got ok=%v status=%d", ok, recorder.Code)
	}
}

func TestRoutePolicyRejectsInactiveOrDeletedUsers(t *testing.T) {
	user := &store.AuthUser{ID: "user_a", Email: "a@example.test", Role: "user", IsActive: true}
	users := map[string]*store.AuthUser{user.ID: user}
	server := securityTestServer(users)
	token := sessionToken(t, user)

	user.IsActive = false
	if _, recorder, ok := policyRequest(t, server, route("GET", "/api/dives", AuthPrincipal, nil), token); ok || recorder.Code != http.StatusUnauthorized {
		t.Fatalf("inactive user: ok=%v status=%d", ok, recorder.Code)
	}
	delete(users, user.ID)
	if _, recorder, ok := policyRequest(t, server, route("GET", "/api/dives", AuthPrincipal, nil), token); ok || recorder.Code != http.StatusUnauthorized {
		t.Fatalf("deleted user: ok=%v status=%d", ok, recorder.Code)
	}
}

func TestRoutePolicyRejectsForgedToken(t *testing.T) {
	user := &store.AuthUser{ID: "user_a", Email: "a@example.test", Role: "admin", IsActive: true}
	server := securityTestServer(map[string]*store.AuthUser{user.ID: user})
	forged, err := auth.IssueSessionToken(user.ID, user.Email, user.Role, 0, "dev-only-change-me", "issuer", "audience", 300)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	_, recorder, ok := policyRequest(t, server, route("GET", "/api/dives", AuthPrincipal, nil), forged)
	if ok || recorder.Code != http.StatusUnauthorized {
		t.Fatalf("forged token: ok=%v status=%d", ok, recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "signature") {
		t.Fatalf("auth error leaks verification details: %s", recorder.Body.String())
	}
}

func TestRoutePolicyOwnerCheckUsesCachedOwner(t *testing.T) {
	owner := &store.AuthUser{ID: "user_owner", Email: "o@example.test", Role: "admin", IsActive: true}
	admin := &store.AuthUser{ID: "user_admin", Email: "x@example.test", Role: "admin", IsActive: true}
	server := securityTestServer(map[string]*store.AuthUser{owner.ID: owner, admin.ID: admin})
	server.ownerID = owner.ID
	ownerRoute := route("GET", "/api/users", AuthOwner, nil)

	if _, recorder, ok := policyRequest(t, server, ownerRoute, sessionToken(t, owner)); !ok {
		t.Fatalf("owner rejected: %d", recorder.Code)
	}
	if _, recorder, ok := policyRequest(t, server, ownerRoute, sessionToken(t, admin)); ok || recorder.Code != http.StatusForbidden {
		t.Fatalf("non-owner admin: ok=%v status=%d", ok, recorder.Code)
	}
}

func TestAuthRoutesWithoutDatabaseDoNotLeakErrors(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"a@b.c","password":"x"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", response.Code)
	}
	if strings.Contains(response.Body.String(), "database is not configured") {
		t.Fatalf("internal error leaked: %s", response.Body.String())
	}
}

func TestLoginAndRegisterAreRateLimited(t *testing.T) {
	cfg := testConfig()
	cfg.RateLimitLoginPerWindow = 2
	cfg.RateLimitRegisterPerWindow = 1
	cfg.RateLimitWindowSeconds = 60
	server := NewServer(cfg, slog.Default(), nil)
	for path, limit := range map[string]int{"/api/auth/login": 2, "/api/auth/register": 1} {
		var last int
		for i := 0; i <= limit; i++ {
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			request.RemoteAddr = "192.0.2.10:5555"
			response := httptest.NewRecorder()
			server.ServeHTTP(response, request)
			last = response.Code
		}
		if last != http.StatusTooManyRequests {
			t.Fatalf("%s: final status = %d, expected 429", path, last)
		}
	}
}

func TestUserPutRejectsPasswordHashField(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPut, "/api/users/user_abc", strings.NewReader(`{"password_hash":"scrypt$00$00"}`))
	recorder := httptest.NewRecorder()
	handleUserPut(&Context{ResponseWriter: recorder, Request: request, Server: server, Params: map[string]string{"id": "user_abc"}})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, expected 400", recorder.Code)
	}
}

func TestMetricsLabelsAreBounded(t *testing.T) {
	cfg := testConfig()
	cfg.Metrics = "enabled"
	server := NewServer(cfg, slog.Default(), nil)
	for _, path := range []string{"/api/random-1", "/api/random-2", "/api/random-3"} {
		request := httptest.NewRequest("BREW", path, nil)
		server.ServeHTTP(httptest.NewRecorder(), request)
	}
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := response.Body.String()
	if strings.Contains(body, "random-") || strings.Contains(body, "BREW") {
		t.Fatalf("metrics contain unbounded labels:\n%s", body)
	}
}

func TestSecurityHeaders(t *testing.T) {
	cfg := testConfig()
	cfg.TrustForwardedHeaders = true
	server := NewServer(cfg, slog.Default(), nil)
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if got := response.Header().Get("Content-Security-Policy"); got != apiContentSecurityPolicy {
		t.Fatalf("CSP = %q", got)
	}
	if !strings.Contains(response.Header().Get("Strict-Transport-Security"), "max-age=") {
		t.Fatalf("expected HSTS behind trusted https proxy")
	}

	plain := httptest.NewRecorder()
	server.ServeHTTP(plain, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if plain.Header().Get("Strict-Transport-Security") != "" {
		t.Fatalf("HSTS must not be sent over plain http")
	}
}

func TestInlineScriptHashesSkipsExternalAndDataScripts(t *testing.T) {
	html := `<script type="importmap">{"imports":{"#entry":"/_nuxt/a.js"}}</script><script src="/_nuxt/app.js"></script><script type="application/json" id="data">{"a":1}</script><script>window.__NUXT__={}</script><script type="module">import "/x.js"</script>`
	hashes := inlineScriptHashes(html)
	if len(hashes) != 3 {
		t.Fatalf("hashes = %v", hashes)
	}
	policy := buildFrontendCSP(hashes)
	if strings.Contains(policy, "unsafe-inline' ;") || !strings.Contains(policy, "script-src 'self' 'sha256-") {
		t.Fatalf("unexpected policy %q", policy)
	}
}

func TestContentDispositionEscapesFilename(t *testing.T) {
	value := contentDisposition("inline", `evil".pdf`)
	if value != `inline; filename="evil\".pdf"` {
		t.Fatalf("unsafe Content-Disposition %q", value)
	}
}

func TestFixedWindowLimiterSweepsExpiredWindows(t *testing.T) {
	limiter := newFixedWindowLimiter()
	for i := 0; i < 50; i++ {
		limiter.Allow("key-"+string(rune('a'+i%26))+string(rune('a'+i/26)), 5, 1)
	}
	limiter.mu.Lock()
	for key, entry := range limiter.windows {
		entry.ResetAt = entry.ResetAt.Add(-2e9)
		limiter.windows[key] = entry
	}
	limiter.lastSweep = limiter.lastSweep.Add(-2e9)
	limiter.mu.Unlock()
	limiter.Allow("fresh", 5, 1)
	if size := limiter.size(); size != 1 {
		t.Fatalf("limiter size after sweep = %d, expected 1", size)
	}
}

func TestValidEmail(t *testing.T) {
	for _, email := range []string{"a@b.c", "diver@example.test"} {
		if !validEmail(email) {
			t.Fatalf("expected %q to be valid", email)
		}
	}
	for _, email := range []string{"", "nope", "@x", "x@", "a b@c.d"} {
		if validEmail(email) {
			t.Fatalf("expected %q to be invalid", email)
		}
	}
}

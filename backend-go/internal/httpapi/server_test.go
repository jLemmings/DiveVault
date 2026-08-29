package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jlemmings/divevault/backend-go/internal/config"
)

func TestHealthEndpoints(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	for _, path := range []string{"/health", "/api/health"} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response := httptest.NewRecorder()

		server.ServeHTTP(response, request)

		if response.Code != http.StatusOK {
			t.Fatalf("%s returned status %d", path, response.Code)
		}
		if strings.TrimSpace(response.Body.String()) != `{"status":"ok"}` {
			t.Fatalf("%s returned body %q", path, response.Body.String())
		}
	}
}

func TestConfigJS(t *testing.T) {
	cfg := testConfig()
	cfg.DemoMode = true
	server := NewServer(cfg, slog.Default(), nil)
	request := httptest.NewRequest(http.MethodGet, "/config.js", nil)
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("config.js returned status %d", response.Code)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected no-store cache header")
	}
	if !strings.Contains(response.Body.String(), `"authEnabled": true`) || !strings.Contains(response.Body.String(), `"demoMode": true`) {
		t.Fatalf("unexpected config.js body %q", response.Body.String())
	}
}

func TestUnknownAPIRouteReturnsNotFound(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	request := httptest.NewRequest(http.MethodGet, "/api/unknown", nil)
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown API route returned status %d", response.Code)
	}
}

func TestMethodNotAllowedSetsAllowHeader(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPost, "/health", nil)
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d", response.Code)
	}
	if response.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("Allow = %q", response.Header().Get("Allow"))
	}
}

func TestUnsupportedMediaTypeReturnsRouteSpecificMessage(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPost, "/api/imports/subsurface", strings.NewReader("{}"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), "application/xml") {
		t.Fatalf("body = %q", response.Body.String())
	}
}

func TestMaxBodyRejectsLargeRequestsBeforeHandler(t *testing.T) {
	cfg := testConfig()
	cfg.MaxCSVImportBytes = 4
	server := NewServer(cfg, slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPost, "/api/imports/csv", strings.NewReader("too large"))
	request.Header.Set("Content-Type", "text/csv")
	request.ContentLength = 9
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestRouteMatchExtractsPathParams(t *testing.T) {
	server := NewServer(testConfig(), slog.Default(), nil)
	route, _, params := server.matchRoute(http.MethodGet, "/api/dives/42")
	if route == nil {
		t.Fatalf("route was not matched")
	}
	if route.Path != "/api/dives/{id}" {
		t.Fatalf("route path = %q", route.Path)
	}
	if params["id"] != "42" {
		t.Fatalf("id param = %q", params["id"])
	}
}

func TestReadJSONRejectsUnknownFields(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/device-state", strings.NewReader(`{"vendor":"v","product":"p","extra":true}`))
	var payload deviceStatePutRequest
	err := readValidatedJSON(request, &payload)
	if err == nil {
		t.Fatalf("expected strict JSON decode error")
	}
}

func TestReadJSONRejectsTrailingValues(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/device-state", strings.NewReader(`{"vendor":"v","product":"p"} {}`))
	var payload deviceStatePutRequest
	err := readValidatedJSON(request, &payload)
	if err == nil {
		t.Fatalf("expected trailing JSON value error")
	}
}

func TestClientIPTrustsForwardedHeadersOnlyWhenConfigured(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/cli-auth/request", nil)
	request.RemoteAddr = "10.0.0.5:12345"
	request.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")

	server := NewServer(testConfig(), slog.Default(), nil)
	if got := server.clientIP(request); got != "10.0.0.5" {
		t.Fatalf("clientIP without trusted proxy = %q", got)
	}

	cfg := testConfig()
	cfg.TrustForwardedHeaders = true
	server = NewServer(cfg, slog.Default(), nil)
	if got := server.clientIP(request); got != "203.0.113.9" {
		t.Fatalf("clientIP with trusted proxy = %q", got)
	}
}

func TestBadRequestMessageReturnsValidationText(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/device-state", strings.NewReader(`{"vendor":"","product":""}`))
	var payload deviceStatePutRequest
	err := readValidatedJSON(request, &payload)
	body, _ := json.Marshal(map[string]string{"error": badRequestMessage(err)})
	if !strings.Contains(string(body), "vendor and product are required") {
		t.Fatalf("validation message not preserved: %s", body)
	}
}

func testConfig() config.Config {
	return config.Config{
		Host:                     "127.0.0.1",
		Port:                     8000,
		CORSOrigin:               "http://localhost:5173",
		FrontendDir:              "frontend/dist",
		MaxJSONBodyBytes:         1024 * 1024,
		MaxBackupImportBytes:     25 * 1024 * 1024,
		MaxCSVImportBytes:        5 * 1024 * 1024,
		MaxSubsurfaceImportBytes: 15 * 1024 * 1024,
		RequestTimeoutSeconds:    30,
	}
}

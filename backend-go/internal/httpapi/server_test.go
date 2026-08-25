package httpapi

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jlemmings/divevault/backend-go/internal/config"
)

func TestHealthEndpoints(t *testing.T) {
	server := NewServer(testConfig(), slog.Default())
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
	server := NewServer(cfg, slog.Default())
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
	server := NewServer(testConfig(), slog.Default())
	request := httptest.NewRequest(http.MethodGet, "/api/unknown", nil)
	response := httptest.NewRecorder()

	server.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown API route returned status %d", response.Code)
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
	}
}

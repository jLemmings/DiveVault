package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/auth"
	"github.com/jlemmings/divevault/backend-go/internal/config"
	"github.com/jlemmings/divevault/backend-go/internal/static"
	"github.com/jlemmings/divevault/backend-go/internal/store"
)

type Server struct {
	cfg    config.Config
	logger *slog.Logger
	db     *store.DB
	routes []Route
	auth   auth.Verifier
}

type Context struct {
	ResponseWriter http.ResponseWriter
	Request        *http.Request
	Server         *Server
	Route          Route
	Claims         auth.Claims
	PrincipalID    string
}

func NewServer(cfg config.Config, logger *slog.Logger, db *store.DB) *Server {
	authVerifier := auth.Verifier{
		Secret:            cfg.AuthJWTSecret,
		Issuer:            cfg.AuthJWTIssuer,
		Audience:          cfg.AuthJWTAudience,
		SyncTokenVerifier: syncVerifier{db: db},
	}
	return &Server{
		cfg:    cfg,
		logger: logger,
		db:     db,
		routes: APIRoutes(),
		auth:   authVerifier,
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
	routeLabel := r.URL.Path
	defer func() {
		s.logger.Info("request_complete",
			"method", r.Method,
			"path", r.URL.Path,
			"route", routeLabel,
			"status", recorder.status,
			"duration_ms", time.Since(started).Milliseconds(),
		)
	}()

	if r.Method == http.MethodOptions {
		s.writePreflight(recorder)
		return
	}

	if r.URL.Path == "/health" && r.Method == http.MethodGet {
		routeLabel = "/health"
		handleHealth(&Context{ResponseWriter: recorder, Request: r, Server: s})
		return
	}
	if r.URL.Path == "/health" {
		recorder.Header().Set("Allow", http.MethodGet)
		writeJSON(recorder, s.cfg.CORSOrigin, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	if r.URL.Path == "/config.js" && r.Method == http.MethodGet {
		routeLabel = "/config.js"
		handleConfig(&Context{ResponseWriter: recorder, Request: r, Server: s})
		return
	}
	if r.URL.Path == "/config.js" {
		recorder.Header().Set("Allow", http.MethodGet)
		writeJSON(recorder, s.cfg.CORSOrigin, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}

	route, allowed := s.matchRoute(r.Method, r.URL.Path)
	if route != nil {
		routeLabel = route.Path
		claims, principalID, ok := s.applyRoutePolicy(recorder, r, *route)
		if !ok {
			return
		}
		route.handler(&Context{ResponseWriter: recorder, Request: r, Server: s, Route: *route, Claims: claims, PrincipalID: principalID})
		return
	}
	if len(allowed) > 0 {
		recorder.Header().Set("Allow", strings.Join(allowed, ", "))
		writeJSON(recorder, s.cfg.CORSOrigin, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	if r.Method == http.MethodGet && !strings.HasPrefix(r.URL.Path, "/api/") {
		routeLabel = "frontend"
		s.serveFrontend(recorder, r)
		return
	}
	writeJSON(recorder, s.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Not found"})
}

func (s *Server) matchRoute(method string, path string) (*Route, []string) {
	allowed := []string{}
	for i := range s.routes {
		route := &s.routes[i]
		if !route.matches(path) {
			continue
		}
		if route.Method == method {
			return route, nil
		}
		allowed = append(allowed, route.Method)
	}
	return nil, allowed
}

func (s *Server) applyRoutePolicy(w http.ResponseWriter, r *http.Request, route Route) (auth.Claims, string, bool) {
	maxBody := s.maxBodyBytes(route.MaxBodyAttr)
	if maxBody > 0 {
		if r.ContentLength > maxBody {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusRequestEntityTooLarge, map[string]string{"error": "Request body exceeds " + route.MaxBodyAttr + " byte limit"})
			return nil, "", false
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	}
	if len(route.ContentTypes) > 0 && r.ContentLength != 0 {
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || !contains(route.ContentTypes, contentType) {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusUnsupportedMediaType, map[string]string{"error": contentTypeError(route.ContentTypes)})
			return nil, "", false
		}
	}
	if route.Auth == AuthNone {
		return nil, "", true
	}
	claims, err := s.auth.VerifyRequest(r.Context(), r)
	if err != nil {
		var authErr auth.Error
		if errors.As(err, &authErr) {
			writeJSON(w, s.cfg.CORSOrigin, authErr.Status, map[string]string{"error": authErr.Message})
			return nil, "", false
		}
		writeJSON(w, s.cfg.CORSOrigin, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return nil, "", false
	}
	principalID := auth.PrincipalID(claims)
	switch route.Auth {
	case AuthPrincipal:
		if principalID == "" {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "Authenticated identity is missing a stable user identifier"})
			return nil, "", false
		}
	case AuthOwner:
		if principalID == "" {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "Authenticated identity is missing a stable user identifier"})
			return nil, "", false
		}
		settings, err := s.authSettings(r.Context())
		if err != nil {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return nil, "", false
		}
		if principalID != settings.OwnerUserID {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "Instance owner required"})
			return nil, "", false
		}
	case AuthBrowserSession:
		tokenType, _ := claims["token_type"].(string)
		if tokenType != "session_token" {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusForbidden, map[string]string{"error": "Desktop sync approval requires an authenticated browser session"})
			return nil, "", false
		}
	}
	return claims, principalID, true
}

func (s *Server) maxBodyBytes(attr string) int64 {
	switch attr {
	case "MaxJSONBodyBytes":
		return s.cfg.MaxJSONBodyBytes
	case "MaxBackupImportBytes":
		return s.cfg.MaxBackupImportBytes
	case "MaxCSVImportBytes":
		return s.cfg.MaxCSVImportBytes
	case "MaxSubsurfaceImportBytes":
		return s.cfg.MaxSubsurfaceImportBytes
	default:
		return 0
	}
}

func (s *Server) writePreflight(w http.ResponseWriter) {
	applyCORS(w.Header(), s.cfg.CORSOrigin)
	applySecurityHeaders(w.Header())
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) serveFrontend(w http.ResponseWriter, r *http.Request) {
	assetPath, ok := static.AssetPath(s.cfg.FrontendDir, r.URL.Path)
	if !ok {
		writeJSON(w, s.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Frontend asset not found"})
		return
	}
	applySecurityHeaders(w.Header())
	http.ServeFile(w, r, assetPath)
}

func handleHealth(ctx *Context) {
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]string{"status": "ok"})
}

func handleConfig(ctx *Context) {
	body := "window.__APP_CONFIG__ = " + configJSON(ctx.Server.cfg.DemoMode) + ";\n"
	header := ctx.ResponseWriter.Header()
	applySecurityHeaders(header)
	header.Set("Content-Type", "application/javascript; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	ctx.ResponseWriter.WriteHeader(http.StatusOK)
	_, _ = ctx.ResponseWriter.Write([]byte(body))
}

func handleNotImplemented(ctx *Context) {
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotImplemented, map[string]string{"error": "Not implemented in Go backend yet"})
}

func (s *Server) requireDB() (*store.DB, error) {
	if s.db == nil {
		return nil, errors.New("database is not configured")
	}
	return s.db, nil
}

func (s *Server) authSettings(ctx context.Context) (store.AuthSettings, error) {
	db, err := s.requireDB()
	if err != nil {
		return store.AuthSettings{}, err
	}
	return db.GetAuthInstanceSettings(ctx)
}

func writeJSON(w http.ResponseWriter, corsOrigin string, status int, payload any) {
	header := w.Header()
	applyCORS(header, corsOrigin)
	applySecurityHeaders(header)
	header.Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func applyCORS(header http.Header, corsOrigin string) {
	header.Set("Access-Control-Allow-Origin", corsOrigin)
	header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
}

func applySecurityHeaders(header http.Header) {
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
	header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
}

func mustJSON(payload any) string {
	body, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return string(body)
}

func configJSON(demoMode bool) string {
	if demoMode {
		return `{"authEnabled": true, "demoMode": true}`
	}
	return `{"authEnabled": true, "demoMode": false}`
}

func contentTypeError(contentTypes []string) string {
	if len(contentTypes) == 1 && contentTypes[0] == "application/json" {
		return "Content-Type must be application/json"
	}
	if contains(contentTypes, "text/csv") {
		return "Content-Type must be text/csv or application/json"
	}
	if contains(contentTypes, "application/gzip") {
		return "Content-Type must be application/xml, text/xml, application/gzip, or application/zip"
	}
	if contains(contentTypes, "application/zip") {
		return "Content-Type must be application/json or application/zip"
	}
	return "Content-Type is not supported"
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

type syncVerifier struct {
	db *store.DB
}

func (v syncVerifier) VerifyToken(ctx context.Context, token string) (auth.Claims, error) {
	if v.db == nil {
		return nil, errors.New("database is not configured")
	}
	claims, err := v.db.VerifyCLIAuthToken(ctx, token, time.Now().Unix())
	if err != nil || claims == nil {
		return nil, err
	}
	return auth.Claims(claims), nil
}

func readJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	return decoder.Decode(dst)
}

func userID() string {
	return "user_" + randomURLToken(16)
}

func randomURLToken(bytes int) string {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return base64.RawURLEncoding.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}
	return base64.RawURLEncoding.EncodeToString(value)
}

func inviteURL(token string) string {
	return "/?" + url.Values{"invite_token": []string{token}}.Encode()
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

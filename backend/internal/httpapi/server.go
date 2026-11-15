package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jlemmings/divevault/backend/internal/auth"
	"github.com/jlemmings/divevault/backend/internal/config"
	"github.com/jlemmings/divevault/backend/internal/geocode"
	"github.com/jlemmings/divevault/backend/internal/metrics"
	"github.com/jlemmings/divevault/backend/internal/static"
	"github.com/jlemmings/divevault/backend/internal/store"
)

// apiContentSecurityPolicy applies to every non-HTML response. API responses
// never need to load sub-resources, so everything is denied.
const apiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

const serviceUnavailableMessage = "Service temporarily unavailable"

type userLookupFunc func(context.Context, string) (*store.AuthUser, error)

type Server struct {
	cfg           config.Config
	logger        *slog.Logger
	db            *store.DB
	routes        []Route
	auth          auth.Verifier
	metrics       *metrics.Recorder
	limiter       *fixedWindowLimiter
	schemaVersion int
	lookupUser    userLookupFunc
	geocoder      geocode.Client
	csp           *frontendCSP

	ownerMu sync.RWMutex
	ownerID string
}

type Context struct {
	ResponseWriter http.ResponseWriter
	Request        *http.Request
	Server         *Server
	Route          Route
	Params         map[string]string
	Claims         auth.Claims
	PrincipalID    string
	User           *store.AuthUser
}

// JSON writes payload as a JSON response.
func (ctx *Context) JSON(status int, payload any) {
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, status, payload)
}

// Error writes a JSON error body with a client-safe message.
func (ctx *Context) Error(status int, message string) {
	ctx.JSON(status, map[string]string{"error": message})
}

// Unavailable logs err server-side and responds with a generic 503 so
// internal error details never reach the client.
func (ctx *Context) Unavailable(err error) {
	ctx.Server.logger.Error("request failed", "method", ctx.Request.Method, "route", ctx.Route.Path, "error", err)
	ctx.Error(http.StatusServiceUnavailable, serviceUnavailableMessage)
}

// Fail maps store errors to responses: validation errors become 400 (409 for
// duplicate emails) with their message, everything else is Unavailable.
func (ctx *Context) Fail(err error) {
	switch {
	case errors.Is(err, store.ErrEmailTaken):
		ctx.Error(http.StatusConflict, err.Error())
	case store.IsValidationError(err):
		ctx.Error(http.StatusBadRequest, err.Error())
	case store.IsInvalidDataError(err):
		ctx.Server.logger.Warn("request rejected by database constraint", "route", ctx.Route.Path, "error", err)
		ctx.Error(http.StatusBadRequest, "Request contains invalid data")
	default:
		ctx.Unavailable(err)
	}
}

func NewServer(cfg config.Config, logger *slog.Logger, db *store.DB) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	authVerifier := auth.Verifier{
		Secret:            cfg.AuthJWTSecret,
		Issuer:            cfg.AuthJWTIssuer,
		Audience:          cfg.AuthJWTAudience,
		SyncTokenVerifier: syncVerifier{db: db},
	}
	server := &Server{
		cfg:     cfg,
		logger:  logger,
		db:      db,
		routes:  APIRoutes(),
		auth:    authVerifier,
		metrics: metrics.NewRecorder(),
		limiter: newFixedWindowLimiter(),
		geocoder: geocode.Client{
			BaseURL:   cfg.NominatimBaseURL,
			UserAgent: cfg.NominatimUserAgent,
			Email:     cfg.NominatimEmail,
			Throttle:  geocode.NewThrottle(time.Duration(cfg.NominatimMinIntervalMillis) * time.Millisecond),
		},
		csp: newFrontendCSP(),
	}
	if db != nil {
		server.lookupUser = db.GetAuthUserByID
	}
	return server
}

func (s *Server) SetSchemaVersion(version int) {
	s.schemaVersion = version
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	if s.cfg.RequestTimeoutSeconds > 0 {
		requestCtx, cancel := context.WithTimeout(r.Context(), time.Duration(s.cfg.RequestTimeoutSeconds)*time.Second)
		defer cancel()
		r = r.WithContext(requestCtx)
	}
	recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
	applySecurityHeaders(recorder.Header())
	if s.isHTTPS(r) {
		recorder.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
	// Labels are bounded: unmatched paths and unknown methods are grouped so
	// arbitrary requests cannot grow the metrics map without limit.
	routeLabel := "unmatched"
	defer func() {
		if s.metrics != nil {
			s.metrics.Observe(metricMethod(r.Method), routeLabel, recorder.status)
		}
		level := slog.LevelInfo
		if routeLabel == "frontend" || routeLabel == "/health" || routeLabel == "/metrics" {
			level = slog.LevelDebug
		}
		s.logger.Log(r.Context(), level, "request_complete",
			"method", r.Method,
			"path", r.URL.Path,
			"route", routeLabel,
			"status", recorder.status,
			"duration_ms", time.Since(started).Milliseconds(),
		)
	}()

	if r.Method == http.MethodOptions {
		routeLabel = "preflight"
		s.writePreflight(recorder)
		return
	}
	switch r.URL.Path {
	case "/metrics":
		routeLabel = "/metrics"
		if !s.allowGET(recorder, r) {
			return
		}
		s.handleMetrics(recorder)
		return
	case "/health":
		routeLabel = "/health"
		if !s.allowGET(recorder, r) {
			return
		}
		handleHealth(&Context{ResponseWriter: recorder, Request: r, Server: s})
		return
	case "/config.js":
		routeLabel = "/config.js"
		if !s.allowGET(recorder, r) {
			return
		}
		handleConfig(&Context{ResponseWriter: recorder, Request: r, Server: s})
		return
	}

	route, allowed, params := s.matchRoute(r.Method, r.URL.Path)
	if route != nil {
		routeLabel = route.Path
		ctx := &Context{ResponseWriter: recorder, Request: r, Server: s, Route: *route, Params: params}
		if !s.applyRoutePolicy(ctx) {
			return
		}
		route.handler(ctx)
		return
	}
	if len(allowed) > 0 {
		recorder.Header().Set("Allow", strings.Join(allowed, ", "))
		writeJSON(recorder, s.cfg.CORSOrigin, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
		return
	}
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && !strings.HasPrefix(r.URL.Path, "/api/") {
		routeLabel = "frontend"
		s.serveFrontend(recorder, r)
		return
	}
	writeJSON(recorder, s.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Not found"})
}

func (s *Server) allowGET(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet {
		return true
	}
	w.Header().Set("Allow", http.MethodGet)
	writeJSON(w, s.cfg.CORSOrigin, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed"})
	return false
}

func metricMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions, http.MethodPatch:
		return method
	default:
		return "OTHER"
	}
}

func (s *Server) matchRoute(method string, path string) (*Route, []string, map[string]string) {
	allowed := []string{}
	for i := range s.routes {
		route := &s.routes[i]
		params, matches := route.match(path)
		if !matches {
			continue
		}
		if route.Method == method {
			return route, nil, params
		}
		allowed = append(allowed, route.Method)
	}
	return nil, allowed, nil
}

// applyRoutePolicy enforces body limits, content types, rate limits and the
// route's auth policy. It fills ctx.Claims, ctx.PrincipalID and ctx.User.
func (s *Server) applyRoutePolicy(ctx *Context) bool {
	w, r, route := ctx.ResponseWriter, ctx.Request, ctx.Route
	maxBody := s.maxBodyBytes(route.BodyLimit)
	if maxBody > 0 {
		if r.ContentLength > maxBody {
			ctx.Error(http.StatusRequestEntityTooLarge, "Request body exceeds the "+strconv.FormatInt(maxBody, 10)+" byte limit")
			return false
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	}
	if len(route.ContentTypes) > 0 && r.ContentLength != 0 {
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || !contains(route.ContentTypes, contentType) {
			ctx.Error(http.StatusUnsupportedMediaType, contentTypeError(route.ContentTypes))
			return false
		}
	}
	if route.RateLimitScope != "" && !route.RateLimitPerUser {
		if !s.checkRateLimit(ctx, s.clientIP(r)) {
			return false
		}
	}
	if route.Auth == AuthNone {
		return true
	}
	claims, err := s.auth.VerifyRequest(r.Context(), r)
	if err != nil {
		var authErr auth.Error
		if errors.As(err, &authErr) {
			ctx.Error(authErr.Status, authErr.Message)
			return false
		}
		ctx.Error(http.StatusUnauthorized, "Authentication failed")
		return false
	}
	principalID := auth.PrincipalID(claims)
	if principalID == "" {
		ctx.Error(http.StatusForbidden, "Authenticated identity is missing a stable user identifier")
		return false
	}
	user, ok := s.authorizeUser(ctx, claims, principalID)
	if !ok {
		return false
	}
	// The database is the source of truth for identity attributes; claims
	// may be stale until the token expires.
	claims["email"] = user.Email
	claims["role"] = user.Role
	ctx.Claims, ctx.PrincipalID, ctx.User = claims, principalID, user

	switch route.Auth {
	case AuthOwner:
		ownerID, err := s.instanceOwnerID(r.Context())
		if err != nil {
			ctx.Unavailable(err)
			return false
		}
		if principalID != ownerID {
			ctx.Error(http.StatusForbidden, "Instance owner required")
			return false
		}
	case AuthBrowserSession:
		tokenType, _ := claims["token_type"].(string)
		if tokenType != "session_token" {
			ctx.Error(http.StatusForbidden, "Desktop sync approval requires an authenticated browser session")
			return false
		}
	}
	if route.RateLimitScope != "" && route.RateLimitPerUser {
		if !s.checkRateLimit(ctx, "user:"+principalID) {
			return false
		}
	}
	return true
}

// authorizeUser verifies that the token's user still exists, is active and,
// for browser sessions, that the token has not been revoked.
func (s *Server) authorizeUser(ctx *Context, claims auth.Claims, principalID string) (*store.AuthUser, bool) {
	if s.lookupUser == nil {
		ctx.Error(http.StatusServiceUnavailable, serviceUnavailableMessage)
		return nil, false
	}
	user, err := s.lookupUser(ctx.Request.Context(), principalID)
	if err != nil {
		ctx.Unavailable(err)
		return nil, false
	}
	if user == nil || !user.IsActive {
		ctx.Error(http.StatusUnauthorized, "Session is no longer valid. Please sign in again.")
		return nil, false
	}
	if tokenType, _ := claims["token_type"].(string); tokenType == "session_token" && auth.TokenVersion(claims) != user.TokenVersion {
		ctx.Error(http.StatusUnauthorized, "Session is no longer valid. Please sign in again.")
		return nil, false
	}
	return user, true
}

func (s *Server) checkRateLimit(ctx *Context, key string) bool {
	allowed, retryAfter := s.limiter.Allow(ctx.Route.RateLimitScope+":"+key, s.rateLimit(ctx.Route.RateLimitScope), s.cfg.RateLimitWindowSeconds)
	if allowed {
		return true
	}
	ctx.ResponseWriter.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	ctx.Error(http.StatusTooManyRequests, "Rate limit exceeded. Please retry later.")
	return false
}

// instanceOwnerID returns the owner's user id. Once an owner exists it never
// changes, so the value is cached after the first successful lookup.
func (s *Server) instanceOwnerID(ctx context.Context) (string, error) {
	s.ownerMu.RLock()
	ownerID := s.ownerID
	s.ownerMu.RUnlock()
	if ownerID != "" {
		return ownerID, nil
	}
	settings, err := s.authSettings(ctx)
	if err != nil {
		return "", err
	}
	if settings.OwnerUserID != "" {
		s.ownerMu.Lock()
		s.ownerID = settings.OwnerUserID
		s.ownerMu.Unlock()
	}
	return settings.OwnerUserID, nil
}

func (s *Server) maxBodyBytes(limit bodyLimit) int64 {
	switch limit {
	case jsonBodyLimit:
		return s.cfg.MaxJSONBodyBytes
	case backupBodyLimit:
		return s.cfg.MaxBackupImportBytes
	case csvBodyLimit:
		return s.cfg.MaxCSVImportBytes
	case subsurfaceBodyLimit:
		return s.cfg.MaxSubsurfaceImportBytes
	default:
		return 0
	}
}

func (s *Server) writePreflight(w http.ResponseWriter) {
	applyCORS(w.Header(), s.cfg.CORSOrigin)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) serveFrontend(w http.ResponseWriter, r *http.Request) {
	assetPath, ok := static.AssetPath(s.cfg.FrontendDir, r.URL.Path)
	if !ok {
		writeJSON(w, s.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Frontend asset not found"})
		return
	}
	if strings.HasSuffix(strings.ToLower(assetPath), ".html") {
		w.Header().Set("Content-Security-Policy", s.csp.policyFor(assetPath))
		w.Header().Set("Cache-Control", "no-cache")
	} else {
		// Workers (pdf.js) are governed by their own response policy.
		w.Header().Set("Content-Security-Policy", buildFrontendCSP(nil))
		if strings.Contains(filepathToSlash(assetPath), "/_nuxt/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
	}
	http.ServeFile(w, r, assetPath)
}

func filepathToSlash(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}

func handleHealth(ctx *Context) {
	ctx.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func handleConfig(ctx *Context) {
	body := "window.__APP_CONFIG__ = " + configJSON(ctx.Server.cfg.DemoMode) + ";\n"
	header := ctx.ResponseWriter.Header()
	header.Set("Content-Type", "application/javascript; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	ctx.ResponseWriter.WriteHeader(http.StatusOK)
	_, _ = ctx.ResponseWriter.Write([]byte(body))
}

func (s *Server) handleMetrics(w http.ResponseWriter) {
	if s.cfg.Metrics != "enabled" {
		writeJSON(w, s.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Not found"})
		return
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(s.metrics.Render(s.db != nil, s.schemaVersion)))
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

// isHTTPS reports whether the client connection uses TLS, either directly or
// via a trusted reverse proxy.
func (s *Server) isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return s.cfg.TrustForwardedHeaders && strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
}

func writeJSON(w http.ResponseWriter, corsOrigin string, status int, payload any) {
	header := w.Header()
	applyCORS(header, corsOrigin)
	header.Set("Content-Type", "application/json; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func applyCORS(header http.Header, corsOrigin string) {
	header.Set("Access-Control-Allow-Origin", corsOrigin)
	header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Poll-Token")
	header.Add("Vary", "Origin")
}

func applySecurityHeaders(header http.Header) {
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
	header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
	header.Set("Cross-Origin-Opener-Policy", "same-origin")
	header.Set("Content-Security-Policy", apiContentSecurityPolicy)
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
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain a single JSON value")
	}
	return nil
}

func badRequestMessage(err error) string {
	if err == nil {
		return "Invalid request"
	}
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "Invalid request"
	}
	return message
}

func userID() string {
	return "user_" + randomURLToken(16)
}

// randomURLToken returns a URL-safe random token. crypto/rand failures are
// unrecoverable for a security token, so they panic rather than degrade.
func randomURLToken(bytes int) string {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return base64.RawURLEncoding.EncodeToString(value)
}

func inviteURL(token string) string {
	return "/?" + url.Values{"invite_token": []string{token}}.Encode()
}

func (s *Server) rateLimit(scope string) int {
	switch scope {
	case "cli_auth_request_create", "cli_auth_request_status":
		return s.cfg.RateLimitCLIRequestPerWindow
	case "cli_auth_approve":
		return s.cfg.RateLimitCLIApprovePerWindow
	case "backup_import":
		return s.cfg.RateLimitBackupImportPerWindow
	case "dive_upload":
		return s.cfg.RateLimitDiveUploadPerWindow
	case "auth_login":
		return s.cfg.RateLimitLoginPerWindow
	case "auth_register":
		return s.cfg.RateLimitRegisterPerWindow
	case "geocode":
		return s.cfg.RateLimitGeocodePerWindow
	case "public_profile":
		return s.cfg.RateLimitPublicPerWindow
	default:
		return 0
	}
}

// clientIP returns the address used for rate limiting. When forwarded
// headers are trusted, the X-Forwarded-For entry appended by the outermost
// trusted proxy is used: entries left of it are client-controlled.
func (s *Server) clientIP(r *http.Request) string {
	host := r.RemoteAddr
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		host = parsedHost
	}
	if s.cfg.TrustForwardedHeaders {
		if forwarded := forwardedFor(r.Header.Values("X-Forwarded-For")); len(forwarded) > 0 {
			hops := s.cfg.TrustedProxyHops
			if hops < 1 {
				hops = 1
			}
			index := len(forwarded) - hops
			if index < 0 {
				index = 0
			}
			host = forwarded[index]
		} else if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
			host = realIP
		}
	}
	if parsed := net.ParseIP(strings.Trim(host, "[]")); parsed != nil {
		return parsed.String()
	}
	if host == "" {
		return "unknown"
	}
	return host
}

func forwardedFor(values []string) []string {
	entries := []string{}
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			if part = strings.TrimSpace(part); part != "" {
				entries = append(entries, part)
			}
		}
	}
	return entries
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if !r.wroteHeader {
		r.status = status
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(body []byte) (int, error) {
	r.wroteHeader = true
	return r.ResponseWriter.Write(body)
}

func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

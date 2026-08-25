package httpapi

import (
	"encoding/json"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/config"
	"github.com/jlemmings/divevault/backend-go/internal/static"
)

type Server struct {
	cfg    config.Config
	logger *slog.Logger
	routes []Route
}

type Context struct {
	ResponseWriter http.ResponseWriter
	Request        *http.Request
	Server         *Server
	Route          Route
}

func NewServer(cfg config.Config, logger *slog.Logger) *Server {
	return &Server{
		cfg:    cfg,
		logger: logger,
		routes: APIRoutes(),
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
		if !s.applyRoutePolicy(recorder, r, *route) {
			return
		}
		route.handler(&Context{ResponseWriter: recorder, Request: r, Server: s, Route: *route})
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

func (s *Server) applyRoutePolicy(w http.ResponseWriter, r *http.Request, route Route) bool {
	maxBody := s.maxBodyBytes(route.MaxBodyAttr)
	if maxBody > 0 {
		if r.ContentLength > maxBody {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusRequestEntityTooLarge, map[string]string{"error": "Request body exceeds " + route.MaxBodyAttr + " byte limit"})
			return false
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
	}
	if len(route.ContentTypes) > 0 && r.ContentLength != 0 {
		contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || !contains(route.ContentTypes, contentType) {
			writeJSON(w, s.cfg.CORSOrigin, http.StatusUnsupportedMediaType, map[string]string{"error": contentTypeError(route.ContentTypes)})
			return false
		}
	}
	return true
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

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

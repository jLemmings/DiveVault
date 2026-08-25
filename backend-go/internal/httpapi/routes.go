package httpapi

import (
	"regexp"
)

type AuthPolicy string

const (
	AuthNone           AuthPolicy = "none"
	AuthAny            AuthPolicy = "auth"
	AuthPrincipal      AuthPolicy = "principal"
	AuthOwner          AuthPolicy = "owner"
	AuthBrowserSession AuthPolicy = "browser_session"
)

type Route struct {
	Method         string
	Path           string
	SamplePath     string
	Auth           AuthPolicy
	ContentTypes   []string
	RateLimitScope string
	MaxBodyAttr    string
	pattern        *regexp.Regexp
	handler        Handler
}

type Handler func(*Context)

func APIRoutes() []Route {
	return []Route{
		route("GET", "/api/health", AuthNone, handleHealth),
		route("GET", "/api/public/divers/{slug}", AuthNone, handleNotImplemented).withPattern(`/api/public/divers/([a-z0-9-]+)`).withSample("/api/public/divers/elias-thorne"),
		route("GET", "/api/profile", AuthPrincipal, handleNotImplemented),
		route("PUT", "/api/profile", AuthPrincipal, handleNotImplemented).withJSONBody(),
		route("GET", "/api/profile/licenses/{id}/pdf", AuthPrincipal, handleNotImplemented).withPattern(`/api/profile/licenses/([A-Za-z0-9_-]+)/pdf`).withSample("/api/profile/licenses/license-1/pdf"),
		route("PUT", "/api/profile/licenses/{id}/pdf", AuthPrincipal, handleNotImplemented).withPattern(`/api/profile/licenses/([A-Za-z0-9_-]+)/pdf`).withSample("/api/profile/licenses/license-1/pdf").withJSONBody(),
		route("GET", "/api/backup/export", AuthPrincipal, handleNotImplemented),
		route("POST", "/api/backup/import", AuthPrincipal, handleNotImplemented).withContentTypes("application/json", "application/zip").withMaxBody("MaxBackupImportBytes").withRateLimit("backup_import"),
		route("GET", "/api/geocode/search", AuthPrincipal, handleNotImplemented),
		route("POST", "/api/imports/csv", AuthPrincipal, handleNotImplemented).withContentTypes("application/json", "text/csv").withMaxBody("MaxCSVImportBytes").withRateLimit("dive_upload"),
		route("POST", "/api/imports/subsurface", AuthPrincipal, handleNotImplemented).withContentTypes("application/gzip", "application/zip", "application/xml", "text/xml").withMaxBody("MaxSubsurfaceImportBytes").withRateLimit("dive_upload"),
		route("GET", "/api/auth/status", AuthNone, handleAuthStatus),
		route("GET", "/api/auth/me", AuthAny, handleAuthMe),
		route("GET", "/api/auth/settings", AuthOwner, handleAuthSettingsGet),
		route("PUT", "/api/auth/settings", AuthOwner, handleAuthSettingsPut).withJSONBody(),
		route("PUT", "/api/auth/password", AuthAny, handleAuthPasswordPut).withJSONBody(),
		route("POST", "/api/auth/register", AuthNone, handleAuthRegister).withJSONBody(),
		route("POST", "/api/auth/login", AuthNone, handleAuthLogin).withJSONBody(),
		route("POST", "/api/auth/invitations", AuthOwner, handleAuthInvitationsPost).withJSONBody(),
		route("GET", "/api/users", AuthOwner, handleUsersGet),
		route("POST", "/api/users", AuthOwner, handleUsersPost).withJSONBody(),
		route("PUT", "/api/users/{id}", AuthOwner, handleUserPut).withPattern(`/api/users/(user_[A-Za-z0-9]+)`).withSample("/api/users/user_abc123").withJSONBody(),
		route("DELETE", "/api/users/{id}", AuthOwner, handleUserDelete).withPattern(`/api/users/(user_[A-Za-z0-9]+)`).withSample("/api/users/user_abc123"),
		route("GET", "/api/cli-auth/request", AuthNone, handleCLIAuthRequestGet).withRateLimit("cli_auth_request_status"),
		route("POST", "/api/cli-auth/request", AuthNone, handleCLIAuthRequestPost).withRateLimit("cli_auth_request_create"),
		route("POST", "/api/cli-auth/approve", AuthBrowserSession, handleCLIAuthApprovePost).withJSONBody().withRateLimit("cli_auth_approve"),
		route("GET", "/api/device-state", AuthPrincipal, handleNotImplemented),
		route("PUT", "/api/device-state", AuthPrincipal, handleNotImplemented).withJSONBody(),
		route("GET", "/api/equipment", AuthPrincipal, handleNotImplemented),
		route("PUT", "/api/equipment", AuthPrincipal, handleNotImplemented).withJSONBody(),
		route("POST", "/api/equipment/{id}/service", AuthPrincipal, handleNotImplemented).withPattern(`/api/equipment/([A-Za-z0-9_-]+)/service`).withSample("/api/equipment/equipment-1/service"),
		route("GET", "/api/exports/dives.csv", AuthPrincipal, handleNotImplemented),
		route("GET", "/api/exports/dives.pdf", AuthPrincipal, handleNotImplemented),
		route("GET", "/api/dives", AuthPrincipal, handleNotImplemented),
		route("POST", "/api/dives", AuthPrincipal, handleNotImplemented).withJSONBody().withRateLimit("dive_upload"),
		route("GET", "/api/dives/{id}", AuthPrincipal, handleNotImplemented).withPattern(`/api/dives/(\d+)`).withSample("/api/dives/1"),
		route("PUT", "/api/dives/{id}/logbook", AuthPrincipal, handleNotImplemented).withPattern(`/api/dives/(\d+)/logbook`).withSample("/api/dives/1/logbook").withJSONBody(),
		route("DELETE", "/api/dives/{id}", AuthPrincipal, handleNotImplemented).withPattern(`/api/dives/(\d+)`).withSample("/api/dives/1"),
	}
}

func route(method string, path string, auth AuthPolicy, handler Handler) Route {
	return Route{
		Method:     method,
		Path:       path,
		SamplePath: path,
		Auth:       auth,
		handler:    handler,
	}
}

func (r Route) withPattern(pattern string) Route {
	r.pattern = regexp.MustCompile("^" + pattern + "$")
	return r
}

func (r Route) withSample(samplePath string) Route {
	r.SamplePath = samplePath
	return r
}

func (r Route) withJSONBody() Route {
	r.ContentTypes = []string{"application/json"}
	r.MaxBodyAttr = "MaxJSONBodyBytes"
	return r
}

func (r Route) withContentTypes(contentTypes ...string) Route {
	r.ContentTypes = contentTypes
	return r
}

func (r Route) withMaxBody(attr string) Route {
	r.MaxBodyAttr = attr
	return r
}

func (r Route) withRateLimit(scope string) Route {
	r.RateLimitScope = scope
	return r
}

func (r Route) matches(path string) bool {
	if r.pattern != nil {
		return r.pattern.MatchString(path)
	}
	return r.Path == path
}

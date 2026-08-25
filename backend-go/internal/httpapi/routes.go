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
		route("GET", "/api/public/divers/{slug}", AuthNone, handlePublicProfileGet).withPattern(`/api/public/divers/([a-z0-9-]+)`).withSample("/api/public/divers/elias-thorne"),
		route("GET", "/api/profile", AuthPrincipal, handleProfileGet),
		route("PUT", "/api/profile", AuthPrincipal, handleProfilePut).withJSONBody(),
		route("GET", "/api/profile/licenses/{id}/pdf", AuthPrincipal, handleProfileLicenseGet).withPattern(`/api/profile/licenses/([A-Za-z0-9_-]+)/pdf`).withSample("/api/profile/licenses/license-1/pdf"),
		route("PUT", "/api/profile/licenses/{id}/pdf", AuthPrincipal, handleProfileLicensePut).withPattern(`/api/profile/licenses/([A-Za-z0-9_-]+)/pdf`).withSample("/api/profile/licenses/license-1/pdf").withJSONBody(),
		route("GET", "/api/backup/export", AuthPrincipal, handleBackupExport),
		route("POST", "/api/backup/import", AuthPrincipal, handleBackupImport).withContentTypes("application/json", "application/zip").withMaxBody("MaxBackupImportBytes").withRateLimit("backup_import"),
		route("GET", "/api/geocode/search", AuthPrincipal, handleNotImplemented),
		route("POST", "/api/imports/csv", AuthPrincipal, handleCSVImportPost).withContentTypes("application/json", "text/csv").withMaxBody("MaxCSVImportBytes").withRateLimit("dive_upload"),
		route("POST", "/api/imports/subsurface", AuthPrincipal, handleSubsurfaceImportPost).withContentTypes("application/gzip", "application/zip", "application/xml", "text/xml").withMaxBody("MaxSubsurfaceImportBytes").withRateLimit("dive_upload"),
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
		route("GET", "/api/device-state", AuthPrincipal, handleDeviceStateGet),
		route("PUT", "/api/device-state", AuthPrincipal, handleDeviceStatePut).withJSONBody(),
		route("GET", "/api/equipment", AuthPrincipal, handleEquipmentGet),
		route("PUT", "/api/equipment", AuthPrincipal, handleEquipmentPut).withJSONBody(),
		route("POST", "/api/equipment/{id}/service", AuthPrincipal, handleEquipmentServicePost).withPattern(`/api/equipment/([A-Za-z0-9_-]+)/service`).withSample("/api/equipment/equipment-1/service"),
		route("GET", "/api/exports/dives.csv", AuthPrincipal, handleDivesCSVExport),
		route("GET", "/api/exports/dives.pdf", AuthPrincipal, handleDivesPDFExport),
		route("GET", "/api/dives", AuthPrincipal, handleDivesGet),
		route("POST", "/api/dives", AuthPrincipal, handleDivePost).withJSONBody().withRateLimit("dive_upload"),
		route("GET", "/api/dives/{id}", AuthPrincipal, handleDiveGet).withPattern(`/api/dives/(\d+)`).withSample("/api/dives/1"),
		route("PUT", "/api/dives/{id}/logbook", AuthPrincipal, handleDiveLogbookPut).withPattern(`/api/dives/(\d+)/logbook`).withSample("/api/dives/1/logbook").withJSONBody(),
		route("DELETE", "/api/dives/{id}", AuthPrincipal, handleDiveDelete).withPattern(`/api/dives/(\d+)`).withSample("/api/dives/1"),
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

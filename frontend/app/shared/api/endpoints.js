const API = "/api";

export const API_ENDPOINTS = {
  authInvitations: `${API}/auth/invitations`,
  authLogin: `${API}/auth/login`,
  authMe: `${API}/auth/me`,
  authPassword: `${API}/auth/password`,
  authRegister: `${API}/auth/register`,
  authSettings: `${API}/auth/settings`,
  authStatus: `${API}/auth/status`,
  backupExport: `${API}/backup/export`,
  backupImport: `${API}/backup/import`,
  cliAuthApprove: `${API}/cli-auth/approve`,
  cliAuthRequest: `${API}/cli-auth/request`,
  deviceState: `${API}/device-state`,
  dives: `${API}/dives`,
  equipment: `${API}/equipment`,
  exportsCsv: `${API}/exports/dives.csv`,
  exportsPdf: `${API}/exports/dives.pdf`,
  geocodeSearch: `${API}/geocode/search`,
  health: `${API}/health`,
  importsCsv: `${API}/imports/csv`,
  importsSubsurface: `${API}/imports/subsurface`,
  profile: `${API}/profile`,
  users: `${API}/users`
};

export function authStatusUrl(query = "") {
  return `${API_ENDPOINTS.authStatus}${query}`;
}

export function cliAuthApproveUrl() {
  return API_ENDPOINTS.cliAuthApprove;
}

export function diveLogbookUrl(diveId) {
  return `${API_ENDPOINTS.dives}/${encodeURIComponent(diveId)}/logbook`;
}

export function diveUrl(diveId) {
  return `${API_ENDPOINTS.dives}/${encodeURIComponent(diveId)}`;
}

export function equipmentServiceUrl(equipmentId) {
  return `${API_ENDPOINTS.equipment}/${encodeURIComponent(equipmentId)}/service`;
}

export function geocodeSearchUrl(query) {
  return `${API_ENDPOINTS.geocodeSearch}?q=${encodeURIComponent(query)}`;
}

export function importCsvUrl({ dryRun = false } = {}) {
  return `${API_ENDPOINTS.importsCsv}${dryRun ? "?dry_run=1" : ""}`;
}

export function importSubsurfaceUrl({ dryRun = false } = {}) {
  return `${API_ENDPOINTS.importsSubsurface}${dryRun ? "?dry_run=1" : ""}`;
}

export function licensePdfUrl(licenseId) {
  return `${API_ENDPOINTS.profile}/licenses/${encodeURIComponent(licenseId)}/pdf`;
}

export function publicDiverUrl(slug) {
  return `${API}/public/divers/${encodeURIComponent(slug)}`;
}

export function userUrl(userId) {
  return `${API}/users/${encodeURIComponent(userId)}`;
}

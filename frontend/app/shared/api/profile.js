import { API_ENDPOINTS, geocodeSearchUrl, licensePdfUrl } from "./endpoints.js";

export function fetchHealth(api) {
  return api.request(API_ENDPOINTS.health, {}, { requireAuth: false });
}

export function fetchProfile(api) {
  return api.request(API_ENDPOINTS.profile);
}

export function searchGeocode(api, query) {
  return api.request(geocodeSearchUrl(query));
}

export function updateLicensePdf(api, licenseId, formData) {
  return api.request(licensePdfUrl(licenseId), {
    method: "PUT",
    body: formData
  });
}

export function updateProfile(api, payload) {
  return api.request(API_ENDPOINTS.profile, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

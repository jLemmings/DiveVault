import { API_ENDPOINTS, diveLogbookUrl, diveUrl } from "./endpoints.js";

export function createDive(api, payload) {
  return api.request(API_ENDPOINTS.dives, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function deleteDive(api, diveId) {
  return api.request(diveUrl(diveId), { method: "DELETE" });
}

export function fetchDives(api, query = "limit=250&include_samples=1") {
  return api.request(`${API_ENDPOINTS.dives}?${query}`);
}

export function updateDiveLogbook(api, diveId, payload) {
  return api.request(diveLogbookUrl(diveId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

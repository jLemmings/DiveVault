import { API_ENDPOINTS, equipmentServiceUrl } from "./endpoints.js";

export function fetchEquipment(api) {
  return api.request(API_ENDPOINTS.equipment);
}

export function markEquipmentServiced(api, equipmentId) {
  return api.request(equipmentServiceUrl(equipmentId), { method: "POST" });
}

export function saveEquipment(api, equipment) {
  return api.request(API_ENDPOINTS.equipment, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ equipment })
  });
}

export function numericCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function validCoordinates(lat, lon) {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lon === "number" &&
    Number.isFinite(lon) &&
    lon >= -180 &&
    lon <= 180
  );
}

function extractCoordinates(source) {
  if (!source || typeof source !== "object") return null;
  const lat = numericCoordinate(source.lat ?? source.latitude);
  const lon = numericCoordinate(source.lon ?? source.lng ?? source.long ?? source.longitude);
  return validCoordinates(lat, lon) ? { lat, lon } : null;
}

export function diveCoordinates(dive) {
  const candidates = [
    dive?.fields?.location,
    dive?.fields?.gps,
    dive?.fields?.position,
    dive?.fields?.coordinates,
    dive?.location,
    dive?.gps
  ];
  return candidates.map(extractCoordinates).find(Boolean) || null;
}

export function normalizeSiteName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function savedSiteCoordinates(matchingSite) {
  if (!matchingSite) return null;
  return extractCoordinates({
    lat: matchingSite.latitude ?? matchingSite.lat,
    lon: matchingSite.longitude ?? matchingSite.lon
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

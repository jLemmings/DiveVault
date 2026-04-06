import { importDraftSeed } from "./core.js";

const DEFAULT_MAP_PREVIEW_ZOOM = 9;
const MAP_TILE_URL = "https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

function numericCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validCoordinates(lat, lon) {
  return typeof lat === "number"
    && Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && typeof lon === "number"
    && Number.isFinite(lon)
    && lon >= -180
    && lon <= 180;
}

function extractCoordinates(source) {
  if (!source || typeof source !== "object") return null;
  const lat = numericCoordinate(source.lat ?? source.latitude);
  const lon = numericCoordinate(source.lon ?? source.lng ?? source.long ?? source.longitude);
  return validCoordinates(lat, lon) ? { lat, lon } : null;
}

function diveCoordinates(dive) {
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

function normalizeSiteName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function diveSiteName(dive) {
  const siteName = importDraftSeed(dive)?.site;
  return typeof siteName === "string" ? siteName.trim() : "";
}

function matchingSavedSite(dive, diveSites) {
  const siteName = normalizeSiteName(diveSiteName(dive));
  if (!siteName || !Array.isArray(diveSites)) return null;
  return diveSites.find((site) => normalizeSiteName(site?.name) === siteName) || null;
}

function savedSiteCoordinates(site) {
  if (!site) return null;
  return extractCoordinates({
    lat: site.latitude ?? site.lat,
    lon: site.longitude ?? site.lon
  });
}

function tileProjection(lat, lon, zoom) {
  const scale = 2 ** zoom;
  const projectedX = ((lon + 180) / 360) * scale;
  const latitudeRadians = (lat * Math.PI) / 180;
  const projectedY = ((1 - Math.log(Math.tan(latitudeRadians) + (1 / Math.cos(latitudeRadians))) / Math.PI) / 2) * scale;
  const tileX = Math.floor(projectedX);
  const tileY = Math.floor(projectedY);
  return {
    tileX,
    tileY,
    markerLeft: `${(projectedX - tileX) * 100}%`,
    markerTop: `${(projectedY - tileY) * 100}%`
  };
}

export function diveMapPreview(dive, diveSites, zoom = DEFAULT_MAP_PREVIEW_ZOOM) {
  const coordinates = savedSiteCoordinates(matchingSavedSite(dive, diveSites)) || diveCoordinates(dive);
  if (!coordinates) return null;

  const projection = tileProjection(coordinates.lat, coordinates.lon, zoom);
  return {
    tileUrl: MAP_TILE_URL
      .replace("{z}", String(zoom))
      .replace("{x}", String(projection.tileX))
      .replace("{y}", String(projection.tileY)),
    markerLeft: projection.markerLeft,
    markerTop: projection.markerTop,
    latitude: coordinates.lat,
    longitude: coordinates.lon
  };
}

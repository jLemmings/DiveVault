import { importDraftSeed } from "./core.js";

const DEFAULT_MAP_PREVIEW_ZOOM = 9;
const MAP_SERVICE_URL = "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer";
const MAP_TILE_URL = `${MAP_SERVICE_URL}/tile/{z}/{y}/{x}`;

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
  const firstTileX = tileX - 1;
  const firstTileY = tileY - 1;
  return {
    tileX,
    tileY,
    firstTileX,
    firstTileY,
    scale,
    markerLeft: `${((projectedX - firstTileX) / 3) * 100}%`,
    markerTop: `${((projectedY - firstTileY) / 3) * 100}%`
  };
}

function tileUrl(zoom, tileX, tileY, scale) {
  const wrappedX = ((tileX % scale) + scale) % scale;
  const clampedY = Math.max(0, Math.min(scale - 1, tileY));
  return MAP_TILE_URL
    .replace("{z}", String(zoom))
    .replace("{x}", String(wrappedX))
    .replace("{y}", String(clampedY));
}

function surroundingTiles(projection, zoom) {
  const tiles = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      tiles.push({
        key: `${row}-${column}`,
        url: tileUrl(zoom, projection.firstTileX + column, projection.firstTileY + row, projection.scale),
        left: `${(column / 3) * 100}%`,
        top: `${(row / 3) * 100}%`,
        width: "33.3334%",
        height: "33.3334%"
      });
    }
  }
  return tiles;
}

function exportedMapUrl(lat, lon) {
  const latitudeSpan = 0.08;
  const longitudeSpan = latitudeSpan * 2.6;
  const bbox = [
    lon - longitudeSpan / 2,
    lat - latitudeSpan / 2,
    lon + longitudeSpan / 2,
    lat + latitudeSpan / 2
  ].join(",");
  const params = new URLSearchParams({
    bbox,
    bboxSR: "4326",
    imageSR: "4326",
    size: "1200,460",
    dpi: "96",
    format: "jpg",
    transparent: "false",
    f: "image"
  });
  return `${MAP_SERVICE_URL}/export?${params.toString()}`;
}

function singleTileMarkerProjection(lat, lon, zoom) {
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
  const singleTileProjection = singleTileMarkerProjection(coordinates.lat, coordinates.lon, zoom);
  return {
    tileUrl: tileUrl(zoom, singleTileProjection.tileX, singleTileProjection.tileY, projection.scale),
    tiles: surroundingTiles(projection, zoom),
    imageUrl: exportedMapUrl(coordinates.lat, coordinates.lon),
    imageMarkerLeft: "50%",
    imageMarkerTop: "50%",
    markerLeft: projection.markerLeft,
    markerTop: projection.markerTop,
    latitude: coordinates.lat,
    longitude: coordinates.lon
  };
}

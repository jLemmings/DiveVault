// Repaints the light grey base map as a chart. Land takes the land colour, and water is banded by its
// distance from the coast in the same blues as the depth bands. It is a drawing of the coast, not a
// bathymetric survey, so nothing on screen reads depths from it.
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile";
const TILE = 256;
const MARGIN = 80;
const EDGE = { shoal: 17, mid: 42, shelf: 75 };
const STEP = { straight: 10, diagonal: 14 };
const MAX_CACHED = 600;
const images = new Map();

function loadImage(url) {
  if (images.has(url)) return images.get(url);
  const pending = new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "origin";
    image.onload = () => resolve(image);
    image.onerror = () => {
      images.delete(url);
      resolve(null);
    };
    image.src = url;
  });
  images.set(url, pending);
  if (images.size > MAX_CACHED) images.delete(images.keys().next().value);
  return pending;
}

function colour(styles, name) {
  const hex = styles.getPropertyValue(name).trim().replace("#", "");
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
}

// Two-pass chamfer distance: every water pixel learns how far it is from land.
function distanceFromLand(land, size) {
  const distance = new Uint16Array(size * size);
  for (let index = 0; index < distance.length; index += 1) distance[index] = land[index] ? 0 : 30000;
  const settle = (index, x, y, sideways, vertical) => {
    let best = distance[index];
    const hasX = x + sideways >= 0 && x + sideways < size;
    const hasY = y + vertical >= 0 && y + vertical < size;
    if (hasX) best = Math.min(best, distance[index + sideways] + STEP.straight);
    if (hasY) {
      const row = index + vertical * size;
      best = Math.min(best, distance[row] + STEP.straight);
      if (x > 0) best = Math.min(best, distance[row - 1] + STEP.diagonal);
      if (x < size - 1) best = Math.min(best, distance[row + 1] + STEP.diagonal);
    }
    distance[index] = best;
  };
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) settle(y * size + x, x, y, -1, -1);
  for (let y = size - 1; y >= 0; y -= 1) for (let x = size - 1; x >= 0; x -= 1) settle(y * size + x, x, y, 1, 1);
  return distance;
}

export async function paintChartTile(canvas, { x, y, z }) {
  const count = 2 ** z;
  const requests = [];
  for (let down = -1; down <= 1; down += 1) {
    for (let across = -1; across <= 1; across += 1) {
      const row = y + down;
      if (row < 0 || row >= count) continue;
      const column = (((x + across) % count) + count) % count;
      requests.push(loadImage(`${TILE_URL}/${z}/${row}/${column}`).then((image) => ({ image, across, down })));
    }
  }
  const tiles = await Promise.all(requests);
  if (!tiles.some((tile) => tile.image && !tile.across && !tile.down)) return false;

  const size = TILE + MARGIN * 2;
  const work = document.createElement("canvas");
  work.width = size;
  work.height = size;
  const source = work.getContext("2d", { willReadFrequently: true });
  source.fillStyle = "#d0cfd3";
  source.fillRect(0, 0, size, size);
  for (const { image, across, down } of tiles) {
    if (image) source.drawImage(image, MARGIN + across * TILE, MARGIN + down * TILE, TILE, TILE);
  }
  const pixels = source.getImageData(0, 0, size, size).data;
  const land = new Uint8Array(size * size);
  for (let index = 0; index < land.length; index += 1) {
    const at = index * 4;
    // Water in this base map is a grey that leans blue; land, roads and borders are neutral.
    const water = pixels[at] < 226 && pixels[at + 2] - pixels[at] >= 2;
    land[index] = water ? 0 : 1;
  }
  const distance = distanceFromLand(land, size);

  const styles = getComputedStyle(document.documentElement);
  const palette = ["--land", "--shoal", "--mid", "--shelf", "--deep", "--soft"].map((name) => colour(styles, name));
  const context = canvas.getContext("2d");
  const output = context.createImageData(TILE, TILE);
  for (let row = 0; row < TILE; row += 1) {
    for (let column = 0; column < TILE; column += 1) {
      const index = (row + MARGIN) * size + column + MARGIN;
      const away = distance[index] / STEP.straight;
      let band;
      if (!away) {
        const shore = !land[index - 1] || !land[index + 1] || !land[index - size] || !land[index + size];
        band = shore ? 5 : 0;
      } else if (away <= EDGE.shoal) band = 1;
      else if (away <= EDGE.mid) band = 2;
      else if (away <= EDGE.shelf) band = 3;
      else band = 4;
      const at = (row * TILE + column) * 4;
      output.data.set(palette[band], at);
      output.data[at + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return true;
}

export function createChartLayer(L) {
  const ChartLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement("canvas");
      canvas.width = TILE;
      canvas.height = TILE;
      paintChartTile(canvas, coords)
        .then((painted) => done(painted ? null : new Error("Chart tile unavailable"), canvas))
        .catch((error) => done(error, canvas));
      return canvas;
    }
  });
  return new ChartLayer({ maxNativeZoom: 16, maxZoom: 16, updateWhenZooming: false, keepBuffer: 1 });
}

export const PLACE_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

let leafletPromise = null;

export async function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = Promise.all([import("leaflet/dist/leaflet.css"), import("leaflet")]).then(
      ([, leafletModule]) => leafletModule.default || leafletModule
    );
  }
  return leafletPromise;
}

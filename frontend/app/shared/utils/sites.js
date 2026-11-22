import { diveCoordinates, normalizeSiteName, savedSiteCoordinates } from "~/shared/utils/dive-map.js";
import { parseDate } from "~/shared/utils/core.js";
import { maxDepthOf, siteOf } from "~/shared/utils/logbook.js";

// Saved sites and the sites named in the logbook, as one list. Saved coordinates win over the computer's GPS.
export function buildSites(savedSites, dives) {
  const byKey = new Map();
  const entry = (key, name, saved = null) => {
    if (!byKey.has(key)) {
      byKey.set(key, { key, name, saved, count: 0, deepest: null, last: null, lastId: null, coordinates: savedSiteCoordinates(saved) });
    }
    return byKey.get(key);
  };
  savedSites.forEach((site) => {
    const key = normalizeSiteName(site?.name);
    if (key) entry(key, site.name.trim(), site);
  });
  dives.forEach((dive) => {
    const name = siteOf(dive);
    const gps = diveCoordinates(dive);
    if (!name && !gps) return;
    const site = entry(name ? normalizeSiteName(name) : `gps:${gps.lat.toFixed(4)}:${gps.lon.toFixed(4)}`, name);
    const depth = maxDepthOf(dive);
    const started = parseDate(dive.started_at);
    site.count += 1;
    if (depth !== null && (site.deepest === null || depth > site.deepest)) site.deepest = depth;
    if (started && (!site.last || started > parseDate(site.last))) {
      site.last = dive.started_at;
      site.lastId = dive.id;
    }
    if (!site.coordinates && gps) site.coordinates = gps;
  });
  return [...byKey.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

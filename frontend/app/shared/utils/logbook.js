import {
  averageDepthValue,
  depthSeries,
  importDraftSeed,
  importTemperature,
  isCommittedDive,
  isManualDive,
  numberOrZero,
  pressureRange,
  primaryGasMix,
  primaryTank,
  parseDate,
  sacRate
} from "~/shared/utils/core.js";

// Read-only figures derived from dive records. /api/dives only reports a count in `stats`,
// so the logbook totals are summed here from completed dives.

export function newestFirst(dives) {
  return [...dives].sort(
    (left, right) =>
      (parseDate(right.started_at)?.getTime() || 0) - (parseDate(left.started_at)?.getTime() || 0) ||
      numberOrZero(right.id) - numberOrZero(left.id)
  );
}

export function committed(dives) {
  return dives.filter(isCommittedDive);
}

export function waiting(dives) {
  return newestFirst(dives.filter((dive) => !isCommittedDive(dive)));
}

export function siteOf(dive) {
  return importDraftSeed(dive).site.trim();
}

export function maxDepthOf(dive) {
  if (typeof dive?.max_depth_m === "number") return dive.max_depth_m;
  const depths = depthSeries(dive).map((point) => point.value);
  return depths.length ? Math.max(...depths) : null;
}

export function barUsed(dive) {
  const { begin, end } = pressureRange(dive);
  return typeof begin === "number" && typeof end === "number" && begin >= end ? Math.round(begin - end) : null;
}

export function recorderOf(dive) {
  if (isManualDive(dive)) return "";
  const product = String(dive?.product || "").trim();
  if (product === "Import" || product === "Export") return String(dive?.vendor || "").trim();
  return product || String(dive?.vendor || "").trim();
}

export function logbookTotals(dives) {
  return dives.reduce(
    (totals, dive) => {
      const depth = maxDepthOf(dive);
      totals.count += 1;
      totals.seconds += numberOrZero(dive.duration_seconds);
      totals.bar += barUsed(dive) || 0;
      if (depth !== null && (totals.deepest === null || depth > totals.deepest)) {
        totals.deepest = depth;
        totals.deepestSite = siteOf(dive);
      }
      return totals;
    },
    { count: 0, seconds: 0, bar: 0, deepest: null, deepestSite: "" }
  );
}

function percent(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value <= 1 ? value * 100 : value);
}

// Computers report a gas mix; CSV imports keep the mix on the tank.
export function gasOf(dive) {
  const mix = primaryGasMix(dive);
  const tank = primaryTank(dive);
  const oxygen = percent(mix?.oxygen_fraction ?? tank?.o2_percent);
  const helium = percent(mix?.helium_fraction ?? tank?.he_percent);
  if (helium) return { name: "Trimix", mix: ` ${oxygen}/${helium}` };
  if (!oxygen) return null;
  if (oxygen <= 21) return { name: "Air", mix: "" };
  return { name: oxygen === 100 ? "Oxygen" : "Nitrox", mix: oxygen === 100 ? "" : ` ${oxygen}` };
}

export function airUseOf(dive) {
  const rate = sacRate(dive);
  const depth = averageDepthValue(dive);
  if (rate === null || rate <= 0 || depth === null) return null;
  // Litres breathed each minute, brought back to surface pressure.
  return rate / (depth / 10 + 1);
}

export function waterTemperature(dive) {
  return importTemperature(dive);
}

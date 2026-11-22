// Geometry for the drawings in which dives hang from the waterline.
// Darker water is shallower, as on a nautical chart.
export const DEPTH_BOUNDARIES = [5, 18, 30];

export function chartFloor(depths, minimum = 36) {
  const deepest = depths.reduce((max, depth) => (Number.isFinite(depth) ? Math.max(max, depth) : max), 0);
  return Math.max(minimum, deepest * 1.15);
}

export function depthBands(size, floor) {
  const edges = [0, ...DEPTH_BOUNDARIES.map((depth) => Math.min(size, (depth / floor) * size)), size];
  return edges.slice(0, -1).map((start, index) => ({
    className: `b${index + 1}`,
    start,
    size: Math.max(0, edges[index + 1] - start)
  }));
}

// Keeps the deepest sample of each bucket, so thinning a recording never makes a dive look shallower.
export function thinSeries(series, limit) {
  if (series.length <= limit) return series;
  const inner = series.slice(1, -1);
  const size = inner.length / (limit - 2);
  const kept = [series[0]];
  for (let index = 0; index < limit - 2; index += 1) {
    const bucket = inner.slice(Math.floor(index * size), Math.max(Math.floor(index * size) + 1, Math.floor((index + 1) * size)));
    kept.push(bucket.reduce((deepest, point) => (point.value > deepest.value ? point : deepest)));
  }
  kept.push(series[series.length - 1]);
  return kept;
}

// `vertical` is the phone orientation: time runs down the page and depth runs left to right.
export function profilePath(series, { start, length, depthScale, duration = 0, vertical = false, limit = 64 }) {
  if (series.length < 2) return "";
  const end = Math.max(duration || 0, series[series.length - 1].time, 1);
  const place = (along, depth) => (vertical ? `${depth.toFixed(1)} ${along.toFixed(1)}` : `${along.toFixed(1)} ${depth.toFixed(1)}`);
  const points = thinSeries(series, limit).map((point) => place(start + (point.time / end) * length, point.value * depthScale));
  return `M${place(start, 0)}L${points.join(" ")} ${place(start + length, 0)}Z`;
}

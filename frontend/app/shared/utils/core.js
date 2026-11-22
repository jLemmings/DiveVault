function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isManualDive(dive) {
  return Boolean(dive?.fields?.manual_entry || dive?.fields?.source === "manual");
}

function surfaceTemperature(dive) {
  const fieldTemp = dive?.fields?.temperature_surface_c;
  if (typeof fieldTemp === "number") return fieldTemp;
  const samples = dive?.samples || [];
  const sampleWithTemp = samples.find((sample) => typeof sample.temperature_c === "number");
  return sampleWithTemp ? sampleWithTemp.temperature_c : null;
}

const defaultRequiredLogbookFields = ["site"];
const logbookRequirementFieldOptions = [
  { key: "site", label: "Dive site", missingLabel: "Missing dive site", icon: "location_off" },
  { key: "buddy", label: "Buddy", missingLabel: "Missing buddy", icon: "person_off" },
  { key: "guide", label: "Guide", missingLabel: "Missing guide", icon: "badge" },
  { key: "weather_description", label: "Weather", missingLabel: "Missing weather", icon: "thunderstorm" },
  { key: "visibility", label: "Visibility", missingLabel: "Missing visibility", icon: "visibility_off" },
  { key: "wetsuit_description", label: "Suit", missingLabel: "Missing suit", icon: "checkroom" },
  { key: "weight_description", label: "Weights", missingLabel: "Missing weights", icon: "fitness_center" },
  { key: "notes", label: "Notes", missingLabel: "Missing notes", icon: "notes" }
];

function buildDiveSequenceMap(dives) {
  const sequenceMap = new Map();
  if (!Array.isArray(dives)) return sequenceMap;

  dives
    .filter((dive) => dive && isCommittedDive(dive))
    .slice()
    .sort((left, right) => {
      const leftTime = parseDate(left?.started_at)?.getTime() || 0;
      const rightTime = parseDate(right?.started_at)?.getTime() || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return numberOrZero(left?.id) - numberOrZero(right?.id);
    })
    .forEach((dive, index) => {
      sequenceMap.set(String(dive.id), index + 1);
    });

  return sequenceMap;
}

function resolvedDiveSequenceMap(sequenceSource) {
  return sequenceSource instanceof Map ? sequenceSource : buildDiveSequenceMap(sequenceSource);
}

function diveSequenceNumber(dive, sequenceSource) {
  if (!dive) return null;
  return resolvedDiveSequenceMap(sequenceSource).get(String(dive.id)) ?? null;
}

function logbookFields(dive) {
  const logbook = dive?.fields?.logbook;
  return logbook && typeof logbook === "object" && !Array.isArray(logbook) ? logbook : {};
}

function logbookStatus(source) {
  const logbook = source?.fields?.logbook ? logbookFields(source) : source;
  return logbook?.status === "complete" ? "complete" : "imported";
}

function importDraftSeed(dive) {
  const logbook = logbookFields(dive);
  const tank = primaryTank(dive);
  const tankVolume = typeof tank?.volume === "number" && Number.isFinite(tank.volume) ? String(Math.round(tank.volume)) : "";
  const beginPressure =
    typeof tank?.beginpressure_bar === "number" && Number.isFinite(tank.beginpressure_bar)
      ? String(Math.round(tank.beginpressure_bar))
      : "";
  const endPressure =
    typeof tank?.endpressure_bar === "number" && Number.isFinite(tank.endpressure_bar) ? String(Math.round(tank.endpressure_bar)) : "";
  return {
    site: typeof logbook.site === "string" ? logbook.site : "",
    buddy: typeof logbook.buddy === "string" ? logbook.buddy : "",
    guide: typeof logbook.guide === "string" ? logbook.guide : "",
    weather_description: typeof logbook.weather_description === "string" ? logbook.weather_description : "",
    visibility: typeof logbook.visibility === "string" ? logbook.visibility : "",
    wetsuit_description: typeof logbook.wetsuit_description === "string" ? logbook.wetsuit_description : "",
    weight_description: typeof logbook.weight_description === "string" ? logbook.weight_description : "",
    notes: typeof logbook.notes === "string" ? logbook.notes : "",
    tank_volume_l: tankVolume,
    begin_pressure_bar: beginPressure,
    end_pressure_bar: endPressure,
    equipment_ids: Array.isArray(logbook.equipment_ids) ? logbook.equipment_ids.map(String) : [],
    equipment_snapshot: Array.isArray(logbook.equipment_snapshot) ? logbook.equipment_snapshot : [],
    status: logbookStatus(logbook),
    completed_at: typeof logbook.completed_at === "string" ? logbook.completed_at : ""
  };
}

function normalizedImportValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRequiredLogbookFields(fields) {
  if (!Array.isArray(fields)) return [...defaultRequiredLogbookFields];
  const supported = new Set(logbookRequirementFieldOptions.map((field) => field.key));
  const normalized = [];
  for (const field of fields) {
    const key = typeof field === "string" ? field.trim() : "";
    if (!supported.has(key) || normalized.includes(key)) continue;
    normalized.push(key);
  }
  return normalized.length ? normalized : [...defaultRequiredLogbookFields];
}

function requirementFields(requiredFields) {
  const required = new Set(normalizeRequiredLogbookFields(requiredFields));
  return logbookRequirementFieldOptions.filter((field) => required.has(field.key));
}

function missingImportFields(logbook, requiredFields) {
  return requirementFields(requiredFields).filter((field) => !normalizedImportValue(logbook?.[field.key]));
}

function isImportComplete(logbook) {
  return logbookStatus(logbook) === "complete";
}

function isCommittedDive(dive) {
  return isImportComplete(logbookFields(dive));
}

function importTemperature(dive) {
  const minimum = minimumTemperature(dive);
  return typeof minimum === "number" ? minimum : surfaceTemperature(dive);
}

function isNightDive(dive) {
  const date = parseDate(dive?.started_at);
  if (!date) return false;
  const hour = date.getHours();
  return hour >= 19 || hour < 6;
}

function diveSamples(dive) {
  return Array.isArray(dive?.samples) ? dive.samples : [];
}

function normalizeSampleTimeUnit(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["s", "sec", "secs", "second", "seconds"].includes(normalized)) return "seconds";
  if (["ms", "msec", "msecs", "millisecond", "milliseconds"].includes(normalized)) return "milliseconds";
  return null;
}

function sampleTimeUnit(dive) {
  const diveLevelUnit = normalizeSampleTimeUnit(dive?.fields?.sample_time_unit);
  if (diveLevelUnit) return diveLevelUnit;

  const sampleLevelUnit = diveSamples(dive)
    .map((sample) => normalizeSampleTimeUnit(sample?.time_unit))
    .find(Boolean);
  if (sampleLevelUnit) return sampleLevelUnit;

  const times = diveSamples(dive)
    .map((sample) => sample.time_seconds)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!times.length) return "seconds";
  const maxTime = Math.max(...times);
  const duration = numberOrZero(dive?.duration_seconds);
  if (duration > 0 && maxTime > duration * 5) return "milliseconds";
  return "seconds";
}

function sampleTimeScale(dive) {
  return sampleTimeUnit(dive) === "milliseconds" ? 1 / 1000 : 1;
}

function sampleTimeSeconds(dive, sample, fallbackIndex = 0) {
  if (typeof sample?.time_seconds === "number" && Number.isFinite(sample.time_seconds)) {
    return sample.time_seconds * sampleTimeScale(dive);
  }
  return fallbackIndex;
}

function isValidDiveSampleTime(dive, time) {
  const duration = numberOrZero(dive?.duration_seconds);
  if (!duration) return true;
  return time >= 0 && time <= duration + 60;
}

function primaryGasMix(dive) {
  const gasmixes = Array.isArray(dive?.fields?.gasmixes) ? dive.fields.gasmixes : [];
  return gasmixes.find(Boolean) || null;
}

function primaryTank(dive) {
  const tanks = Array.isArray(dive?.fields?.tanks) ? dive.fields.tanks : [];
  return tanks.find(Boolean) || null;
}

function firstPressureValue(sample) {
  if (!sample?.tank_pressure_bar) return null;
  const values = Object.values(sample.tank_pressure_bar).filter((value) => typeof value === "number");
  return values.length ? values[0] : null;
}

function normalizedPressureValue(dive, sample) {
  const pressure = firstPressureValue(sample);
  if (typeof pressure !== "number" || !Number.isFinite(pressure) || pressure <= 0) return null;
  const time = sampleTimeSeconds(dive, sample);
  if (!isValidDiveSampleTime(dive, time)) return null;
  return pressure;
}

function normalizedDepthValue(sample) {
  if (typeof sample?.depth_m !== "number" || !Number.isFinite(sample.depth_m)) return null;
  return Math.max(0, sample.depth_m);
}

function depthMetricValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function averageDepthValue(dive) {
  const storedAverage =
    depthMetricValue(dive?.avg_depth_m) ?? depthMetricValue(dive?.fields?.avg_depth_m) ?? depthMetricValue(dive?.fields?.average_depth_m);
  if (storedAverage !== null) return Math.max(0, storedAverage);

  const series = depthSeries(dive);
  if (!series.length) return null;
  if (series.length === 1) return series[0].value;

  let weightedDepth = 0;
  let weightedSeconds = 0;

  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const intervalSeconds = Math.max(0, current.time - previous.time);
    if (!intervalSeconds) continue;
    weightedDepth += ((previous.value + current.value) / 2) * intervalSeconds;
    weightedSeconds += intervalSeconds;
  }

  if (weightedSeconds > 0) return weightedDepth / weightedSeconds;
  return series.reduce((sum, point) => sum + point.value, 0) / series.length;
}

function pressureRange(dive) {
  const tank = primaryTank(dive);
  if (tank && typeof tank.beginpressure_bar === "number" && typeof tank.endpressure_bar === "number") {
    return { begin: tank.beginpressure_bar, end: tank.endpressure_bar };
  }
  const pressures = diveSamples(dive)
    .map((sample) => normalizedPressureValue(dive, sample))
    .filter((value) => typeof value === "number");
  if (!pressures.length) return { begin: null, end: null };
  return { begin: Math.max(...pressures), end: Math.min(...pressures) };
}

function pressureSeries(dive) {
  return diveSamples(dive)
    .map((sample, index) => ({
      time: sampleTimeSeconds(dive, sample, index),
      value: normalizedPressureValue(dive, sample)
    }))
    .filter((point) => typeof point.value === "number" && isValidDiveSampleTime(dive, point.time));
}

function depthSeries(dive) {
  return diveSamples(dive)
    .map((sample, index) => ({
      time: sampleTimeSeconds(dive, sample, index),
      value: normalizedDepthValue(sample)
    }))
    .filter((point) => typeof point.value === "number" && isValidDiveSampleTime(dive, point.time));
}

function minimumTemperature(dive) {
  const fieldValue = dive?.fields?.temperature_minimum_c;
  if (typeof fieldValue === "number") return fieldValue;
  const samples = diveSamples(dive)
    .map((sample) => sample.temperature_c)
    .filter((value) => typeof value === "number");
  return samples.length ? Math.min(...samples) : null;
}

function sacRate(dive) {
  const tank = primaryTank(dive);
  const range = pressureRange(dive);
  const durationMinutes = numberOrZero(dive?.duration_seconds) / 60;
  if (!tank || typeof tank.volume !== "number" || !durationMinutes || typeof range.begin !== "number" || typeof range.end !== "number") {
    return null;
  }
  return ((range.begin - range.end) * tank.volume) / durationMinutes;
}

export {
  parseDate,
  numberOrZero,
  isManualDive,
  buildDiveSequenceMap,
  diveSequenceNumber,
  importDraftSeed,
  missingImportFields,
  normalizeRequiredLogbookFields,
  logbookRequirementFieldOptions,
  isCommittedDive,
  importTemperature,
  isNightDive,
  pressureRange,
  depthSeries,
  pressureSeries,
  primaryGasMix,
  primaryTank,
  sacRate,
  averageDepthValue
};

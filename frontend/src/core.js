const filledIconStyle = "font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;";

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function durationShort(seconds) {
  if (!seconds) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${totalMinutes}m`;
}

function formatAccumulatedDuration(seconds) {
  if (!seconds) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    const parts = [`${days}d`];
    if (hours > 0 || minutes > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.join(" ");
  }

  if (hours > 0) {
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${totalMinutes}m`;
}

function formatBarTotal(value) {
  return numberOrZero(value).toLocaleString();
}

function diveModeLabel(dive) {
  const code = dive?.fields?.dive_mode_code;
  const labels = {
    0: "Open Circuit",
    1: "Freedive",
    2: "Gauge",
    3: "CCR",
    4: "SCR"
  };
  return labels[code] || "Telemetry";
}

function diveTitle(dive) {
  if (!dive) return "Untitled Dive";
  const maxDepth = numberOrZero(dive.max_depth_m).toFixed(1);
  return `${dive.vendor} ${dive.product} Dive`;
}

function diveSubtitle(dive) {
  if (!dive) return "";
  return `${diveModeLabel(dive)} log captured ${formatDateTime(dive.started_at)}`;
}

function formatDepth(value) {
  if (value === null || value === undefined) return "--";
  return `${numberOrZero(value).toFixed(1)}m`;
}

function formatDepthNumber(value) {
  if (value === null || value === undefined) return "0.0";
  return numberOrZero(value).toFixed(1);
}

function surfaceTemperature(dive) {
  const fieldTemp = dive?.fields?.temperature_surface_c;
  if (typeof fieldTemp === "number") return fieldTemp;
  const samples = dive?.samples || [];
  const sampleWithTemp = samples.find((sample) => typeof sample.temperature_c === "number");
  return sampleWithTemp ? sampleWithTemp.temperature_c : null;
}

function formatTemperature(value) {
  return typeof value === "number" ? `${value.toFixed(0)}C` : "--";
}

function depthParts(value) {
  if (value === null || value === undefined) return { value: "--", unit: "" };
  return { value: numberOrZero(value).toFixed(1), unit: "m" };
}

function durationParts(seconds) {
  if (!seconds) return { value: "0", unit: "min" };
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { value: minutes ? `${hours}h ${minutes}` : `${hours}`, unit: minutes ? "min" : "h" };
  }
  return { value: `${totalMinutes}`, unit: "min" };
}

function temperatureParts(value) {
  return typeof value === "number" ? { value: value.toFixed(0), unit: "C" } : { value: "--", unit: "" };
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return "Unknown";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatTime(value) {
  const date = parseDate(value);
  if (!date) return "--";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "Unknown start time";
  return `${formatDate(value)} ${formatTime(value)}`;
}

function dayOfMonth(value) {
  const date = parseDate(value);
  return date ? String(date.getDate()).padStart(2, "0") : "--";
}

function monthShort(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "---";
}

const importRequirementFields = [
  { key: "site", label: "Dive Site", missingLabel: "Missing Dive Site", icon: "location_off" },
  { key: "buddy", label: "Buddy", missingLabel: "Missing Buddy", icon: "person_off" },
  { key: "guide", label: "Guide", missingLabel: "Missing Guide", icon: "badge" }
];

function compactDateStamp(value) {
  const date = parseDate(value);
  if (!date) return "--.--.----";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function paddedDiveIndex(dive) {
  return `#${String(dive?.id ?? 0).padStart(4, "0")}`;
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
  return {
    site: typeof logbook.site === "string" ? logbook.site : "",
    buddy: typeof logbook.buddy === "string" ? logbook.buddy : "",
    guide: typeof logbook.guide === "string" ? logbook.guide : "",
    notes: typeof logbook.notes === "string" ? logbook.notes : "",
    status: logbookStatus(logbook),
    completed_at: typeof logbook.completed_at === "string" ? logbook.completed_at : ""
  };
}

function effectiveImportDraft(dive, draft) {
  return { ...importDraftSeed(dive), ...(draft || {}) };
}

function normalizedImportValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function missingImportFields(logbook) {
  return importRequirementFields.filter((field) => !normalizedImportValue(logbook?.[field.key]));
}

function canCompleteImport(logbook) {
  return missingImportFields(logbook).length === 0;
}

function isImportComplete(logbook) {
  return logbookStatus(logbook) === "complete";
}

function isCommittedDive(dive) {
  return isImportComplete(logbookFields(dive));
}

function isImportedDive(dive) {
  return !isCommittedDive(dive);
}

function importCompletionPercent(logbook) {
  return Math.round(((importRequirementFields.length - missingImportFields(logbook).length) / importRequirementFields.length) * 100);
}

function gasSummary(dive) {
  const gas = primaryGasMix(dive);
  return { label: gasMixLabel(gas), detail: "" };
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

function averageImportCompletion(dives, draftsById) {
  if (!dives.length) return 0;
  const total = dives.reduce((sum, dive) => sum + importCompletionPercent(effectiveImportDraft(dive, draftsById[String(dive.id)])), 0);
  return Math.round(total / dives.length);
}

function profileBars(dive) {
  const samples = (dive?.samples || []).filter((sample) => typeof sample.depth_m === "number");
  if (!samples.length) return [14, 32, 58, 76, 70, 52, 28, 12];
  const bucketCount = 8;
  const maxDepth = Math.max(...samples.map((sample) => sample.depth_m), 1);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = Math.floor((samples.length * index) / bucketCount);
    const end = Math.max(start + 1, Math.floor((samples.length * (index + 1)) / bucketCount));
    const slice = samples.slice(start, end);
    const depth = Math.max(...slice.map((sample) => sample.depth_m), 0);
    return Math.max(10, Math.round((depth / maxDepth) * 100));
  });
  return buckets;
}

function diveSamples(dive) {
  return Array.isArray(dive?.samples) ? dive.samples : [];
}

function sampleTimeScale(dive) {
  const times = diveSamples(dive).map((sample) => sample.time_seconds).filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!times.length) return 1;
  const maxTime = Math.max(...times);
  const duration = numberOrZero(dive?.duration_seconds);
  if (duration > 0 && maxTime > duration * 5) return 1 / 1000;
  return 1;
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

function gasPercentValue(value, fallback = null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  if (value <= 1) {
    return Math.round(value * 100);
  }
  return Math.round(value);
}

function gasMixLabel(gasmix) {
  if (!gasmix) return "21%";
  const oxygenPercent = gasPercentValue(gasmix.oxygen_fraction, null);
  const secondaryPercent = gasPercentValue(gasmix.helium_fraction, null);
  const displayPercent = secondaryPercent ?? oxygenPercent ?? 21;
  return `${displayPercent}%`;
}

function primaryTank(dive) {
  const tanks = Array.isArray(dive?.fields?.tanks) ? dive.fields.tanks : [];
  return tanks.find(Boolean) || null;
}

function formatPressure(value) {
  return typeof value === "number" ? `${Math.round(value)} bar` : "--";
}

function tankLabel(tank) {
  if (!tank) return "Tank data unavailable";
  const volume = numberOrZero(tank.volume);
  const workPressure = tank.workpressure_bar;
  return workPressure ? `${volume.toFixed(1)}L / ${Math.round(workPressure)} bar` : `${volume.toFixed(1)}L cylinder`;
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
  const storedAverage = depthMetricValue(dive?.avg_depth_m)
    ?? depthMetricValue(dive?.fields?.avg_depth_m)
    ?? depthMetricValue(dive?.fields?.average_depth_m);
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
  const pressures = diveSamples(dive).map((sample) => normalizedPressureValue(dive, sample)).filter((value) => typeof value === "number");
  if (!pressures.length) return { begin: null, end: null };
  return { begin: Math.max(...pressures), end: Math.min(...pressures) };
}

function pressureRangeLabel(dive) {
  const range = pressureRange(dive);
  if (typeof range.begin !== "number" || typeof range.end !== "number") return "--";
  return `${Math.round(range.begin)} / ${Math.round(range.end)} bar`;
}

function pressureUsedLabel(dive) {
  const range = pressureRange(dive);
  if (typeof range.begin !== "number" || typeof range.end !== "number") return "--";
  return `${Math.max(0, Math.round(range.begin - range.end))} bar used`;
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

function downsampleSeries(series, targetSize = 36) {
  if (series.length <= targetSize) return series;
  return Array.from({ length: targetSize }, (_, index) => {
    const sourceIndex = Math.round((index * (series.length - 1)) / (targetSize - 1));
    return series[sourceIndex];
  });
}

function chartPoints(series, width, height, maxX, maxY, reverseY = false) {
  const padding = 10;
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;
  return series.map((point) => {
    const normalizedX = maxX > 0 ? point.time / maxX : 0;
    const normalizedY = maxY > 0 ? point.value / maxY : 0;
    const scaledY = reverseY ? 1 - normalizedY : normalizedY;
    return {
      x: padding + normalizedX * drawableWidth,
      y: padding + scaledY * drawableHeight
    };
  });
}

function linePath(points) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function areaPath(points, height) {
  if (!points.length) return "";
  const baseline = height - 10;
  return `${linePath(points)} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;
}

function depthChartPath(dive) {
  const width = 800;
  const height = 250;
  const series = downsampleSeries(depthSeries(dive));
  if (!series.length) {
    return {
      line: "M10,10 L90,88 L190,220 L310,176 L420,196 L560,112 L690,52 L790,18",
      area: "M10,10 L90,88 L190,220 L310,176 L420,196 L560,112 L690,52 L790,18 L790,240 L10,240 Z"
    };
  }
  const maxX = Math.max(numberOrZero(dive?.duration_seconds), series[series.length - 1]?.time || 1, 1);
  const maxY = Math.max(numberOrZero(dive?.max_depth_m), ...series.map((point) => point.value), 1);
  const points = chartPoints(series, width, height, maxX, maxY);
  return {
    line: linePath(points),
    area: areaPath(points, height)
  };
}

function pressureChartPath(dive) {
  const width = 800;
  const height = 250;
  const series = downsampleSeries(pressureSeries(dive));
  if (!series.length) {
    return "M10,18 L120,40 L230,84 L350,118 L470,154 L590,188 L700,220 L790,238";
  }
  const range = pressureRange(dive);
  const maxX = Math.max(numberOrZero(dive?.duration_seconds), series[series.length - 1]?.time || 1, 1);
  const maxY = Math.max(numberOrZero(range.begin), ...series.map((point) => point.value), 1);
  const points = chartPoints(series, width, height, maxX, maxY, true);
  return linePath(points);
}

function profileTimeLabels(dive) {
  const duration = Math.max(numberOrZero(dive?.duration_seconds), 1);
  return Array.from({ length: 6 }, (_, index) => {
    const seconds = Math.round((duration * index) / 5);
    return durationShort(seconds);
  });
}

function axisTicks(maxValue, formatter, reverse = false) {
  const safeMax = Math.max(numberOrZero(maxValue), 1);
  return Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const value = reverse ? safeMax * (1 - ratio) : safeMax * ratio;
    return formatter(value);
  });
}

function averageTemperature(dive) {
  const samples = diveSamples(dive).filter((sample) => typeof sample.temperature_c === "number");
  if (!samples.length) return surfaceTemperature(dive);
  return samples.reduce((sum, sample) => sum + sample.temperature_c, 0) / samples.length;
}

function minimumTemperature(dive) {
  const fieldValue = dive?.fields?.temperature_minimum_c;
  if (typeof fieldValue === "number") return fieldValue;
  const samples = diveSamples(dive).map((sample) => sample.temperature_c).filter((value) => typeof value === "number");
  return samples.length ? Math.min(...samples) : null;
}

function maximumTemperature(dive) {
  const fieldValue = dive?.fields?.temperature_maximum_c;
  if (typeof fieldValue === "number") return fieldValue;
  const samples = diveSamples(dive).map((sample) => sample.temperature_c).filter((value) => typeof value === "number");
  return samples.length ? Math.max(...samples) : null;
}

function formatDataSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function checkpointCards(dive) {
  const samples = diveSamples(dive).filter((sample) => {
    const time = sampleTimeSeconds(dive, sample);
    return normalizedDepthValue(sample) !== null
      && normalizedPressureValue(dive, sample) !== null
      && isValidDiveSampleTime(dive, time);
  });
  if (!samples.length) return [];
  const labels = ["Launch", "Descent", "Cruise", "Surface"];
  const indexes = [0, 0.25, 0.6, 1].map((ratio) => Math.min(samples.length - 1, Math.round((samples.length - 1) * ratio)));
  return indexes.map((sampleIndex, index) => {
    const sample = samples[sampleIndex];
    return {
      title: labels[index],
      time: durationShort(sampleTimeSeconds(dive, sample, sampleIndex)),
      depth: formatDepth(normalizedDepthValue(sample)),
      pressure: formatPressure(normalizedPressureValue(dive, sample))
    };
  });
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

function oxygenToxicityPercent(dive) {
  const values = diveSamples(dive).map((sample) => sample.cns_fraction).filter((value) => typeof value === "number");
  if (!values.length) return null;
  return Math.max(...values) * 100;
}

function decoStatusLabel(dive) {
  const decoSample = diveSamples(dive).find((sample) => sample.deco && typeof sample.deco.time_seconds === "number" && sample.deco.time_seconds > 0);
  return decoSample ? "Deco Active" : "No Deco";
}

function detailEquipmentTags(dive) {
  const tags = [
    `${dive.vendor} ${dive.product}`,
    diveModeLabel(dive),
    gasMixLabel(primaryGasMix(dive)),
    tankLabel(primaryTank(dive)),
    `${numberOrZero(dive.sample_count)} telemetry points`
  ];
  return [...new Set(tags.filter(Boolean))];
}

function diveNarrative(dive) {
  const paragraphs = [];
  const gas = gasMixLabel(primaryGasMix(dive));
  const tank = tankLabel(primaryTank(dive));
  const tempMin = minimumTemperature(dive);
  const tempMax = maximumTemperature(dive);
  paragraphs.push(
    `${diveModeLabel(dive)} telemetry captured ${numberOrZero(dive.sample_count)} sample points over ${durationShort(dive.duration_seconds)} with a maximum depth of ${formatDepth(dive.max_depth_m)} and an average depth of ${formatDepth(averageDepthValue(dive))}.`
  );
  paragraphs.push(
    `Primary breathing mix was ${gas}. ${tank}. Pressure profile shows ${pressureRangeLabel(dive)} with ${pressureUsedLabel(dive)}.`
  );
  paragraphs.push(
    `${typeof tempMin === "number" && typeof tempMax === "number" ? `Recorded water temperatures ranged from ${formatTemperature(tempMin)} to ${formatTemperature(tempMax)}.` : "Temperature telemetry was limited for this dive."} ${decoStatusLabel(dive)}. Raw import size ${formatDataSize(dive.raw_data_size)} on ${formatDateTime(dive.imported_at)}.`
  );
  return paragraphs;
}

function shortFingerprint(value) {
  if (!value) return "Unavailable";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export {
  filledIconStyle,
  parseDate,
  numberOrZero,
  durationShort,
  formatAccumulatedDuration,
  formatBarTotal,
  diveModeLabel,
  diveTitle,
  diveSubtitle,
  formatDepth,
  formatDepthNumber,
  surfaceTemperature,
  formatTemperature,
  depthParts,
  durationParts,
  temperatureParts,
  formatDate,
  formatTime,
  formatDateTime,
  dayOfMonth,
  monthShort,
  compactDateStamp,
  paddedDiveIndex,
  importDraftSeed,
  effectiveImportDraft,
  logbookStatus,
  missingImportFields,
  canCompleteImport,
  isImportComplete,
  isCommittedDive,
  isImportedDive,
  importCompletionPercent,
  gasSummary,
  importTemperature,
  isNightDive,
  averageImportCompletion,
  profileBars,
  pressureRange,
  pressureRangeLabel,
  pressureUsedLabel,
  depthSeries,
  pressureSeries,
  depthChartPath,
  pressureChartPath,
  profileTimeLabels,
  axisTicks,
  gasMixLabel,
  primaryGasMix,
  primaryTank,
  tankLabel,
  formatDataSize,
  checkpointCards,
  sacRate,
  oxygenToxicityPercent,
  decoStatusLabel,
  detailEquipmentTags,
  averageDepthValue,
  diveNarrative,
  shortFingerprint
};

const { createApp } = Vue;

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
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
  if (!date) return "----.--.--";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function paddedDiveIndex(dive) {
  return `#${String(dive?.id ?? 0).padStart(4, "0")}`;
}

function logbookFields(dive) {
  const logbook = dive?.fields?.logbook;
  return logbook && typeof logbook === "object" && !Array.isArray(logbook) ? logbook : {};
}

function importDraftSeed(dive) {
  const logbook = logbookFields(dive);
  return {
    site: typeof logbook.site === "string" ? logbook.site : "",
    buddy: typeof logbook.buddy === "string" ? logbook.buddy : "",
    guide: typeof logbook.guide === "string" ? logbook.guide : "",
    notes: typeof logbook.notes === "string" ? logbook.notes : "",
    status: typeof logbook.status === "string" ? logbook.status : "pending",
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
  return logbook?.status === "complete";
}

function importCompletionPercent(logbook) {
  return Math.round(((importRequirementFields.length - missingImportFields(logbook).length) / importRequirementFields.length) * 100);
}

function gasSummary(dive) {
  const gas = primaryGasMix(dive);
  const oxygenPercent = Math.round(numberOrZero(gas?.oxygen_fraction) * 100) || 21;
  const heliumPercent = Math.round(numberOrZero(gas?.helium_fraction) * 100);
  if (heliumPercent > 0) {
    return { label: "TMX", detail: `${oxygenPercent}/${heliumPercent}` };
  }
  if (oxygenPercent === 21) {
    return { label: "AIR", detail: "21%" };
  }
  return { label: "EAN", detail: `${oxygenPercent}%` };
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

function gasMixLabel(gasmix) {
  if (!gasmix) return "Air";
  const oxygenPercent = Math.round(numberOrZero(gasmix.oxygen_fraction) * 100);
  const heliumPercent = Math.round(numberOrZero(gasmix.helium_fraction) * 100);
  if (heliumPercent > 0) return `Trimix ${oxygenPercent}/${heliumPercent}`;
  if (oxygenPercent === 21) return "Air";
  return `Nitrox ${oxygenPercent}`;
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
    `${diveModeLabel(dive)} telemetry captured ${numberOrZero(dive.sample_count)} sample points over ${durationShort(dive.duration_seconds)} with a maximum depth of ${formatDepth(dive.max_depth_m)} and an average depth of ${formatDepth(dive.avg_depth_m)}.`
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

const DashboardView = {
  props: ["dives", "stats", "setView", "backendHealthy", "openDive"],
  methods: {
    dayOfMonth,
    monthShort,
    formatDate,
    diveTitle,
    diveSubtitle,
    formatDepth,
    formatDepthNumber,
    formatDateTime,
    formatDurationShort: durationShort,
    formatTemperature,
    surfaceTemperature,
    profileBars,
    diveModeLabel,
    pressureUsedLabel,
    decoStatusLabel,
    formatAccumulatedDuration,
    formatBarTotal
  },
  computed: {
    recentDives() {
      return this.dives.slice(0, 5);
    },
    featuredDive() {
      return this.recentDives[0] || null;
    },
    dashboardStatus() {
      if (!this.featuredDive) return "Nominal";
      return this.decoStatusLabel(this.featuredDive) === "Deco Active" ? "Decompression" : "Nominal";
    },
    filledIconStyle() {
      return filledIconStyle;
    },
    surfaceWindowLabel() {
      if (!this.featuredDive) return "Surface 00:00h";
      const hours = Math.max(2, Math.round(numberOrZero(this.featuredDive.duration_seconds) / 1200));
      return `Surface 0${hours}:45h`;
    },
    mobileOxygenLabel() {
      const value = oxygenToxicityPercent(this.featuredDive);
      return typeof value === "number" ? `${value.toFixed(0)}%` : "94%";
    },
    mobileBars() {
      return profileBars(this.featuredDive || {}).slice(0, 10);
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div class="space-y-4">
          <div class="flex items-end justify-between">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Current Status</p>
              <h3 class="mt-1 font-headline text-3xl font-bold uppercase tracking-tight text-primary">{{ dashboardStatus }}</h3>
            </div>
            <span class="inline-flex items-center rounded-full bg-tertiary-container/40 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ surfaceWindowLabel }}</span>
          </div>
          <div class="h-1 overflow-hidden rounded-full bg-surface-container-highest">
            <div class="h-full bg-primary shadow-[0_0_8px_rgba(156,202,255,0.5)]" :style="{ width: stats.bottomTimeProgress + '%' }"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2 rounded-xl border-l-2 border-primary/30 bg-surface-container-low p-4">
            <div class="flex items-start justify-between">
              <span class="material-symbols-outlined text-xl text-primary">scuba_diving</span>
              <span class="font-label text-[10px] text-on-surface-variant">LOGGED</span>
            </div>
            <div class="pt-2">
              <div class="font-headline text-3xl font-bold">{{ stats.totalDives }}</div>
              <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Total Dives</div>
            </div>
          </div>
          <div class="space-y-2 rounded-xl border-l-2 border-tertiary/30 bg-surface-container-low p-4">
            <div class="flex items-start justify-between">
              <span class="material-symbols-outlined text-xl text-tertiary">straighten</span>
              <span class="font-label text-[10px] text-on-surface-variant">RECORD</span>
            </div>
            <div class="pt-2">
              <div class="font-headline text-3xl font-bold">{{ formatDepthNumber(stats.maxDepth) }}<span class="ml-1 text-sm text-on-surface-variant">M</span></div>
              <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Max Depth</div>
            </div>
          </div>
          <div class="col-span-2 flex items-center justify-between rounded-xl bg-surface-container-high p-4">
            <div class="flex items-center gap-4">
              <div class="rounded-lg bg-primary-container p-3 text-primary">
                <span class="material-symbols-outlined" :style="filledIconStyle">schedule</span>
              </div>
              <div>
                <div class="font-headline text-2xl font-bold">{{ formatAccumulatedDuration(stats.totalSeconds) }}</div>
                <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Accumulated Bottom Time</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
          </div>
        </div>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-headline text-lg font-bold uppercase tracking-tight text-primary-fixed-dim">Recent Expeditions</h4>
            <button @click="setView('logs')" class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">View All</button>
          </div>
          <div class="space-y-3">
            <article
              v-for="dive in recentDives.slice(0, 3)"
              :key="'mobile-' + dive.id"
              @click="openDive(dive.id)"
              @keyup.enter="openDive(dive.id)"
              tabindex="0"
              role="button"
              class="glass-panel flex cursor-pointer items-center gap-4 rounded-xl p-4 transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
            >
              <div class="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-outline-variant/20 bg-[radial-gradient(circle_at_30%_30%,rgba(156,202,255,0.35),transparent_35%),linear-gradient(180deg,#132c40,#000f1d)]">
                <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest to-transparent"></div>
              </div>
              <div class="min-w-0 flex-1">
                <h5 class="truncate font-headline text-sm font-bold tracking-tight">{{ diveTitle(dive) }}</h5>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }} | {{ diveModeLabel(dive) }}</p>
              </div>
              <div class="text-right">
                <div class="font-headline text-sm font-bold text-tertiary">{{ formatDepth(dive.max_depth_m) }}</div>
                <div class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDurationShort(dive.duration_seconds).replace(/m/g, 'min') }}</div>
              </div>
            </article>
          </div>
        </section>

        <section class="space-y-4">
          <h4 class="font-headline text-lg font-bold uppercase tracking-tight text-primary-fixed-dim">Oxygen Saturation</h4>
          <div class="relative h-32 overflow-hidden rounded-xl border-l-2 border-primary/20 bg-surface-container-low p-4">
            <div class="absolute inset-x-2 bottom-2 top-8 flex items-end gap-1">
              <div v-for="(bar, index) in mobileBars" :key="'bar-' + index" class="w-full rounded-sm bg-primary/20" :style="{ height: Math.max(20, bar) + '%' }"></div>
            </div>
            <div class="relative z-10 flex justify-between">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">Avg {{ mobileOxygenLabel }}</span>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">{{ backendHealthy ? 'Backend Synced' : 'Backend Pending' }}</span>
            </div>
          </div>
        </section>
      </section>

      <section class="hidden space-y-10 md:block">
        <header>
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Dive Overview</p>
            <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight">Diver: <span class="text-primary">VALKYRIE-09</span></h3>
          </div>
        </header>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">database</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Dive Count</p>
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ stats.totalDives }}</p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">timer</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Bottom Time</p>
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ formatAccumulatedDuration(stats.totalSeconds) }}</p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-tertiary/50">straighten</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Max Depth</p>
              <p class="mt-2 font-headline text-4xl font-bold text-tertiary">{{ formatDepthNumber(stats.maxDepth) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">m</span></p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between border-l-2 border-primary/20 bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">water_drop</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Consumption</p>
              <p class="mt-2 font-headline text-4xl font-bold">{{ formatBarTotal(stats.totalBarConsumed) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">bar</span></p>
            </div>
          </div>
        </div>
        <section class="space-y-6">
          <div class="space-y-6">
            <div class="relative h-[400px] overflow-hidden bg-surface-container-low">
              <div class="absolute inset-0 opacity-25 mix-blend-screen bg-[radial-gradient(circle_at_30%_40%,rgba(156,202,255,0.3),transparent_18rem),radial-gradient(circle_at_70%_60%,rgba(255,183,125,0.15),transparent_16rem),linear-gradient(180deg,#062135,#001525)]"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-surface-dim via-transparent to-transparent"></div>
              <div class="absolute left-6 top-6 z-10">
                <h4 class="font-headline text-xl font-bold tracking-tight">DIVE ACTIVITY: <span class="text-primary">EPSILON-9</span></h4>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Telemetry coverage from imported dive logs</p>
              </div>
              <div class="absolute left-[30%] top-[40%] h-3 w-3 rounded-full bg-primary shadow-[0_0_16px_rgba(156,202,255,0.9)]"></div>
              <div class="absolute left-[68%] top-[62%] h-3 w-3 rounded-full bg-tertiary shadow-[0_0_16px_rgba(255,183,125,0.75)]"></div>
              <div class="absolute bottom-6 right-6 z-10 flex gap-2">
                <button class="bg-surface-container-high/80 p-2 text-secondary transition-colors hover:text-primary"><span class="material-symbols-outlined">zoom_in</span></button>
                <button class="bg-surface-container-high/80 p-2 text-secondary transition-colors hover:text-primary"><span class="material-symbols-outlined">zoom_out</span></button>
              </div>
            </div>
            <div class="bg-surface-container-low p-6">
              <div class="mb-6 flex items-center justify-between">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Recent Expeditions</p>
                  <h4 class="mt-2 font-headline text-2xl font-bold tracking-tight">Recent Dives</h4>
                </div>
                <button @click="setView('logs')" class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary transition-colors hover:text-primary">View All</button>
              </div>
              <div class="space-y-4">
                <article
                  v-for="dive in recentDives"
                  :key="dive.id"
                  @click="openDive(dive.id)"
                  @keyup.enter="openDive(dive.id)"
                  tabindex="0"
                  role="button"
                  class="flex cursor-pointer items-center justify-between gap-4 bg-surface-container-high/40 p-4 transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
                >
                  <div class="flex min-w-0 items-center gap-4">
                    <div class="flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
                      <span class="material-symbols-outlined">scuba_diving</span>
                    </div>
                    <div class="min-w-0">
                      <h5 class="truncate text-sm font-bold tracking-tight">{{ diveTitle(dive) }}</h5>
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ formatDate(dive.started_at) }} | {{ diveModeLabel(dive) }}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="font-headline text-lg font-bold">{{ formatDepth(dive.max_depth_m) }}</p>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{{ formatDurationShort(dive.duration_seconds).replace(/m/g, 'min') }}</p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </section>
    </section>
  `
};

const LogsView = {
  props: ["dives", "searchText", "openDive", "openImportQueue", "setSearchText"],
  data() {
    return {
      sortOption: "newest",
      deviceFilter: "all",
      modeFilter: "all",
      currentPage: 1,
      pageSize: 8
    };
  },
  watch: {
    searchText() {
      this.currentPage = 1;
    },
    sortOption() {
      this.currentPage = 1;
    },
    deviceFilter() {
      this.currentPage = 1;
    },
    modeFilter() {
      this.currentPage = 1;
    }
  },
  computed: {
    deviceOptions() {
      return [...new Set(this.dives.map((dive) => `${dive.vendor} ${dive.product}`))];
    },
    modeOptions() {
      return [...new Set(this.dives.map((dive) => diveModeLabel(dive)))];
    },
    filteredDives() {
      const search = (this.searchText || "").toLowerCase();
      const filtered = this.dives.filter((dive) => {
        const device = `${dive.vendor} ${dive.product}`;
        const matchesSearch = !search || [
          device,
          diveModeLabel(dive),
          dive.raw_sha256,
          formatDate(dive.started_at)
        ].join(" ").toLowerCase().includes(search);
        const matchesDevice = this.deviceFilter === "all" || device === this.deviceFilter;
        const matchesMode = this.modeFilter === "all" || diveModeLabel(dive) === this.modeFilter;
        return matchesSearch && matchesDevice && matchesMode;
      });
      const sorted = [...filtered];
      sorted.sort((left, right) => {
        if (this.sortOption === "deepest") return numberOrZero(right.max_depth_m) - numberOrZero(left.max_depth_m);
        if (this.sortOption === "longest") return numberOrZero(right.duration_seconds) - numberOrZero(left.duration_seconds);
        const leftTime = parseDate(left.started_at)?.getTime() || 0;
        const rightTime = parseDate(right.started_at)?.getTime() || 0;
        return this.sortOption === "oldest" ? leftTime - rightTime : rightTime - leftTime;
      });
      return sorted;
    },
    pageCount() {
      return Math.max(1, Math.ceil(this.filteredDives.length / this.pageSize));
    },
    pagedDives() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredDives.slice(start, start + this.pageSize);
    },
    highlightedDive() {
      return this.filteredDives[0] || null;
    },
    paginationLabel() {
      if (!this.filteredDives.length) return "0 dives";
      const start = (this.currentPage - 1) * this.pageSize + 1;
      const end = Math.min(this.currentPage * this.pageSize, this.filteredDives.length);
      return `${start}-${end} of ${this.filteredDives.length} dives`;
    }
  },
  methods: {
    nextPage() {
      if (this.currentPage < this.pageCount) this.currentPage += 1;
    },
    previousPage() {
      if (this.currentPage > 1) this.currentPage -= 1;
    },
    formatDate,
    formatTime,
    formatDepth,
    formatTemperature,
    formatDurationShort: durationShort,
    surfaceTemperature,
    diveModeLabel,
    diveTitle
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div class="mb-2 flex gap-3">
          <div class="relative flex-1">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
            <input :value="searchText" @input="setSearchText($event.target.value)" type="text" class="w-full rounded-lg border-none bg-surface-container-high py-3 pl-10 pr-4 text-sm font-label tracking-[0.14em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20" placeholder="SEARCH LOGS..." />
          </div>
          <button class="flex w-12 items-center justify-center rounded-lg bg-surface-container-high active:scale-95">
            <span class="material-symbols-outlined text-primary">filter_list</span>
          </button>
        </div>

        <div class="flex items-end justify-between px-1">
          <div class="flex flex-col">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Dive Records</span>
            <span class="font-headline text-2xl font-bold tracking-tight text-primary">TOTAL_DIVES: {{ filteredDives.length }}</span>
          </div>
          <div class="text-right">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-tertiary">Critical Depth</span>
            <div class="font-headline text-xl font-medium text-tertiary">{{ highlightedDive ? formatDepth(highlightedDive.max_depth_m) : '--' }}</div>
          </div>
        </div>

        <div class="space-y-4">
          <article v-for="dive in pagedDives" :key="'mobile-log-' + dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="rounded-xl bg-surface-container-low p-4 transition-all active:scale-[0.98] focus:bg-surface-container-high focus:outline-none">
            <div class="flex gap-4">
              <div class="relative flex h-24 w-16 flex-shrink-0 flex-col items-center justify-center overflow-hidden rounded bg-surface-container-high">
                <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle at 2px 2px, #9ccaff 1px, transparent 0); background-size: 8px 8px;"></div>
                <span class="z-10 font-label text-[10px] font-bold uppercase text-on-surface-variant/70">ID</span>
                <span class="z-10 font-headline text-xl font-bold text-primary">{{ dive.id }}</span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col justify-between py-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-headline text-lg font-bold tracking-tight">{{ diveTitle(dive) }}</h3>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</p>
                  </div>
                  <span class="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
                </div>
                <div class="mt-4 flex items-center gap-6">
                  <div class="flex flex-col">
                    <span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">Max Depth</span>
                    <span class="font-headline text-sm font-semibold text-primary">{{ formatDepth(dive.max_depth_m) }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">Duration</span>
                    <span class="font-headline text-sm font-semibold">{{ formatDurationShort(dive.duration_seconds) }}</span>
                  </div>
                  <div class="ml-auto">
                    <span class="rounded bg-primary/10 px-2 py-1 font-label text-[9px] font-bold uppercase tracking-[0.14em]" :class="dive.max_depth_m > 40 ? 'bg-tertiary/10 text-tertiary' : 'text-primary'">{{ dive.max_depth_m > 40 ? 'Alert Log' : 'Success' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="hidden space-y-8 md:block">
      <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div class="mb-2 flex items-center gap-3">
            <span class="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(156,202,255,0.8)]"></span>
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Dive Logs</span>
          </div>
          <h3 class="font-headline text-5xl font-bold tracking-tight">Dive Log Database</h3>
          <p class="mt-2 max-w-2xl text-sm text-on-surface-variant">Comprehensive telemetry records for all sub-surface excursions and operational deployments.</p>
        </div>
        <div class="flex gap-3">
          <button class="flex items-center gap-2 bg-surface-container-high px-6 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant transition-colors hover:text-primary">
            <span class="material-symbols-outlined text-sm">filter_list</span>
            Filter Parameters
          </button>
          <button @click="openImportQueue()" class="flex items-center gap-2 bg-primary px-6 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
            <span class="material-symbols-outlined text-sm">add</span>
            New Entry
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div class="relative overflow-hidden rounded-lg bg-surface-container-low p-6">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Total Dives</span>
          <p class="mt-2 font-headline text-4xl font-bold text-primary">{{ dives.length }}</p>
          <p class="mt-1 font-label text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Archive size</p>
        </div>
        <div class="rounded-lg bg-surface-container-low p-6">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Visible Rows</span>
          <p class="mt-2 font-headline text-4xl font-bold">{{ filteredDives.length }}</p>
          <p class="mt-1 font-label text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Current filters</p>
        </div>
        <div class="rounded-lg bg-surface-container-low p-6">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Max Depth</span>
          <p class="mt-2 font-headline text-4xl font-bold text-tertiary">{{ highlightedDive ? formatDepth(highlightedDive.max_depth_m) : '--' }}</p>
          <p class="mt-1 font-label text-[10px] uppercase tracking-[0.16em] text-tertiary/80">Selected highlight</p>
        </div>
        <div class="rounded-lg bg-surface-container-low p-6">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Avg Temp</span>
          <p class="mt-2 font-headline text-4xl font-bold">{{ highlightedDive ? formatTemperature(surfaceTemperature(highlightedDive)) : '--' }}</p>
          <p class="mt-1 font-label text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Surface estimate</p>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div class="bg-surface-container-low p-6 shadow-panel">
          <div class="flex flex-wrap gap-4">
            <div class="flex min-w-[220px] flex-1 items-center gap-2 bg-surface-container-high px-4 py-3">
              <span class="material-symbols-outlined text-primary">sort</span>
              <select v-model="sortOption" class="w-full border-none bg-transparent p-0 text-sm font-bold text-on-surface focus:ring-0">
                <option value="newest">Date (Newest First)</option>
                <option value="oldest">Date (Oldest First)</option>
                <option value="deepest">Depth (Deepest)</option>
                <option value="longest">Duration (Longest)</option>
              </select>
            </div>
            <div class="flex items-center gap-2 bg-surface-container-high px-4 py-3">
              <span class="material-symbols-outlined text-primary">monitoring</span>
              <select v-model="deviceFilter" class="border-none bg-transparent p-0 pr-6 text-sm font-bold text-on-surface focus:ring-0">
                <option value="all">All Devices</option>
                <option v-for="device in deviceOptions" :key="device" :value="device">{{ device }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2 bg-surface-container-high px-4 py-3">
              <span class="material-symbols-outlined text-primary">filter_alt</span>
              <select v-model="modeFilter" class="border-none bg-transparent p-0 pr-6 text-sm font-bold text-on-surface focus:ring-0">
                <option value="all">All Modes</option>
                <option v-for="mode in modeOptions" :key="mode" :value="mode">{{ mode }}</option>
              </select>
            </div>
          </div>
        </div>
        <div class="border-l-2 border-primary bg-surface-container-high p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Recent Highlight</p>
          <p class="mt-3 font-headline text-xl font-bold">{{ highlightedDive ? highlightedDive.vendor + ' ' + highlightedDive.product : 'No dive loaded' }}</p>
          <p class="mt-1 text-sm text-secondary">{{ highlightedDive ? formatDepth(highlightedDive.max_depth_m) + ' max' : 'Import dives to populate this panel.' }}</p>
          <button v-if="highlightedDive" @click="openDive(highlightedDive.id)" class="mt-5 bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
            Open Detail
          </button>
        </div>
      </div>
      <div class="overflow-hidden bg-surface-container-low shadow-panel">
        <div class="hidden grid-cols-12 gap-4 bg-surface-container-high/50 px-8 py-4 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary md:grid">
          <div class="col-span-1">Dive ID</div><div class="col-span-3">Deployment Date</div><div class="col-span-2">Device</div><div class="col-span-2">Mode</div><div class="col-span-1 text-center">Depth</div><div class="col-span-1 text-center">Duration</div><div class="col-span-1 text-center">Temp</div><div class="col-span-1 text-right">Action</div>
        </div>
        <div class="divide-y divide-outline-variant/10">
          <article v-for="dive in pagedDives" :key="dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="grid cursor-pointer gap-4 px-5 py-6 text-left transition-colors hover:bg-surface-container-highest/30 focus:bg-surface-container-highest/30 focus:outline-none md:grid-cols-12 md:px-8">
            <div class="md:col-span-1"><p class="font-headline text-sm font-bold tracking-widest text-primary">#{{ dive.id }}</p></div>
            <div class="md:col-span-3"><p class="text-sm font-bold">{{ formatDate(dive.started_at) }}</p><p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{{ formatTime(dive.started_at) }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-extrabold">{{ dive.vendor }}</p><p class="text-xs text-on-surface-variant">{{ dive.product }}</p></div>
            <div class="md:col-span-2"><span class="inline-flex bg-surface-container-highest px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ diveModeLabel(dive) }}</span></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-lg font-bold" :class="dive.max_depth_m > 40 ? 'text-tertiary' : 'text-on-surface'">{{ formatDepth(dive.max_depth_m) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-sm font-medium">{{ formatDurationShort(dive.duration_seconds) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="text-sm font-bold text-secondary">{{ formatTemperature(surfaceTemperature(dive)) }}</p></div>
            <div class="md:col-span-1 md:text-right"><span class="material-symbols-outlined text-on-surface-variant transition-colors hover:text-primary">analytics</span></div>
          </article>
          <div v-if="pagedDives.length === 0" class="px-8 py-16 text-center">
            <p class="font-headline text-2xl font-bold">No dives match the current filters</p>
            <p class="mt-2 text-on-surface-variant">Change the search, mode, or device filters.</p>
          </div>
        </div>
        <div class="flex flex-col items-center justify-between gap-4 bg-surface-container-high/30 px-8 py-6 md:flex-row">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Displaying {{ paginationLabel }}</p>
          <div class="flex items-center gap-2">
            <button @click="previousPage" :disabled="currentPage === 1" class="bg-surface-container-high px-3 py-2 text-on-surface-variant transition-colors hover:text-primary disabled:opacity-30"><span class="material-symbols-outlined">chevron_left</span></button>
            <span class="border border-primary/20 bg-primary/10 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ currentPage }}</span>
            <button @click="nextPage" :disabled="currentPage >= pageCount" class="bg-surface-container-high px-3 py-2 text-on-surface-variant transition-colors hover:text-primary disabled:opacity-30"><span class="material-symbols-outlined">chevron_right</span></button>
          </div>
        </div>
      </div>
      </section>
    </section>
  `
};

const DiveImportView = {
  props: [
    "dives",
    "importDrafts",
    "selectedImportId",
    "selectImportDive",
    "updateImportDraft",
    "saveImportDraft",
    "savingImportId",
    "importError",
    "importStatusMessage",
    "openDive",
    "setView",
    "fetchDives"
  ],
  computed: {
    pendingDives() {
      return this.dives.filter((dive) => !isImportComplete(effectiveImportDraft(dive, this.importDrafts[String(dive.id)])));
    },
    selectedDive() {
      return this.pendingDives.find((dive) => String(dive.id) === String(this.selectedImportId)) || this.pendingDives[0] || null;
    },
    selectedDraft() {
      return this.selectedDive ? effectiveImportDraft(this.selectedDive, this.importDrafts[String(this.selectedDive.id)]) : null;
    },
    selectedGas() {
      return this.selectedDive ? gasSummary(this.selectedDive) : { label: "--", detail: "" };
    },
    averageCompletion() {
      return averageImportCompletion(this.pendingDives, this.importDrafts);
    },
    nextStepLabel() {
      if (!this.selectedDraft) return "Refresh queue";
      const [nextMissing] = missingImportFields(this.selectedDraft);
      return nextMissing ? `Tag ${nextMissing.label}` : "Commit record";
    },
    filledIconStyle() {
      return filledIconStyle;
    }
  },
  methods: {
    compactDateStamp,
    paddedDiveIndex,
    formatDate,
    formatTime,
    formatDepthNumber,
    formatDurationShort: durationShort,
    formatTemperature,
    importTemperature,
    gasSummary,
    isNightDive,
    canCompleteImport,
    importCompletionPercent,
    missingImportFields,
    missingFields(dive) {
      return missingImportFields(effectiveImportDraft(dive, this.importDrafts[String(dive.id)]));
    },
    completionForDive(dive) {
      return importCompletionPercent(effectiveImportDraft(dive, this.importDrafts[String(dive.id)]));
    },
    durationMinutes(dive) {
      return Math.round(numberOrZero(dive?.duration_seconds) / 60);
    },
    isSaving(diveId) {
      return String(this.savingImportId) === String(diveId);
    },
    updateField(key, value) {
      if (!this.selectedDive) return;
      this.updateImportDraft(this.selectedDive.id, key, value);
    },
    saveSelectedDraft(commit = false) {
      if (!this.selectedDive) return;
      this.saveImportDraft(this.selectedDive.id, commit);
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div class="flex items-end justify-between">
          <div>
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Queue Status</span>
            <h3 class="mt-1 font-headline text-3xl font-bold tracking-tight text-primary">IMPORTED_DIVES</h3>
          </div>
          <span class="rounded bg-tertiary-container px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-tertiary-container">{{ pendingDives.length }} Pending</span>
        </div>

        <div v-if="importStatusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ importStatusMessage }}</div>
        <div v-if="importError" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ importError }}</div>

        <div v-if="pendingDives.length" class="space-y-6">
          <article v-for="dive in pendingDives" :key="'mobile-import-' + dive.id" class="overflow-hidden rounded-xl bg-surface-container-low shadow-panel">
            <div class="h-1 w-full overflow-hidden bg-primary/20">
              <div class="h-full bg-primary" :style="{ width: completionForDive(dive) + '%' }"></div>
            </div>
            <div class="space-y-5 p-5">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-label text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant opacity-70">IMPORT_ID: {{ paddedDiveIndex(dive) }}</p>
                  <h3 class="mt-1 font-headline text-xl font-bold">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</h3>
                </div>
                <span class="material-symbols-outlined text-primary" :style="filledIconStyle">sailing</span>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border-l-2 border-primary bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Depth</p>
                  <p class="font-headline text-2xl font-bold text-primary">{{ formatDepthNumber(dive.max_depth_m) }}<span class="ml-1 text-xs font-normal opacity-60">M</span></p>
                </div>
                <div class="rounded-lg border-l-2 border-secondary bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Time</p>
                  <p class="font-headline text-2xl font-bold text-secondary">{{ durationMinutes(dive) }}<span class="ml-1 text-xs font-normal opacity-60">MIN</span></p>
                </div>
                <div class="rounded-lg bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Temp</p>
                  <p class="font-headline text-lg font-bold">{{ formatTemperature(importTemperature(dive)) }}</p>
                </div>
                <div class="rounded-lg bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Gas</p>
                  <p class="font-headline text-lg font-bold">{{ gasSummary(dive).label }}<span class="ml-1 text-xs font-normal opacity-60">{{ gasSummary(dive).detail }}</span></p>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <span v-for="field in missingFields(dive)" :key="'chip-' + dive.id + '-' + field.key" class="inline-flex items-center gap-1 rounded bg-tertiary-container/40 px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em]" :class="field.key === 'site' ? 'text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'">
                  <span class="material-symbols-outlined text-sm">{{ field.icon }}</span>
                  {{ field.missingLabel }}
                </span>
              </div>

              <button @click="selectImportDive(dive.id)" class="flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 font-headline font-bold text-on-primary">
                <span>COMPLETE RECORD</span>
                <span class="material-symbols-outlined">chevron_right</span>
              </button>

              <section v-if="selectedDive && selectedDive.id === dive.id" class="space-y-4 rounded-xl bg-surface-container-high p-4">
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
                  <input :value="selectedDraft.site" @input="updateField('site', $event.target.value)" type="text" placeholder="Blue Hole / House Reef" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                </label>
                <div class="grid grid-cols-1 gap-4">
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
                    <input :value="selectedDraft.buddy" @input="updateField('buddy', $event.target.value)" type="text" placeholder="Diver name" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                  </label>
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
                    <input :value="selectedDraft.guide" @input="updateField('guide', $event.target.value)" type="text" placeholder="Guide or instructor" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                  </label>
                </div>
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
                  <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="4" placeholder="Visibility, current, wildlife, entry notes..." class="w-full resize-none rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"></textarea>
                </label>
                <div class="flex flex-col gap-3">
                  <button @click="saveSelectedDraft(false)" :disabled="isSaving(dive.id)" class="w-full rounded-lg bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface disabled:opacity-50">
                    {{ isSaving(dive.id) ? 'Saving...' : 'Save Draft' }}
                  </button>
                  <button @click="saveSelectedDraft(true)" :disabled="isSaving(dive.id) || !canCompleteImport(selectedDraft)" class="w-full rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary disabled:opacity-50">
                    {{ isSaving(dive.id) ? 'Saving...' : 'Complete Record' }}
                  </button>
                </div>
              </section>
            </div>
          </article>

          <div class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant/30 p-8 text-center opacity-60">
            <span class="material-symbols-outlined mb-3 text-4xl">settings_input_component</span>
            <p class="font-headline text-lg font-bold">SCAN_FOR_COMPUTER</p>
            <p class="text-xs text-on-surface-variant">Ready to import new data via Bluetooth LE</p>
          </div>
        </div>

        <section v-else class="space-y-4 rounded-xl bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Import Queue Clear</p>
          <p class="font-headline text-2xl font-bold">All imported dives have been committed.</p>
          <button @click="fetchDives" class="rounded-lg bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Refresh Queue</button>
        </section>
      </section>

      <section class="hidden space-y-10 md:block">
      <header class="space-y-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div class="mb-2 flex items-center gap-2 text-primary/60">
              <span class="material-symbols-outlined text-sm">file_download</span>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.28em]">Synchronization Module / Queued Data</span>
            </div>
            <h3 class="font-headline text-5xl font-bold tracking-tight">Imported Dives</h3>
          </div>
          <button @click="fetchDives" class="inline-flex items-center gap-2 bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary transition-colors hover:bg-surface-container-highest">
            <span class="material-symbols-outlined text-sm">sync</span>
            Refresh Queue
          </button>
        </div>
        <div class="glass-panel bg-surface-container-high/40 p-5 shadow-panel md:p-6">
          <div class="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <p class="max-w-3xl text-sm leading-7 text-on-surface-variant">
              Imported dives remain in a pending state until the diver adds the required registry details. Complete the
              dive site, buddy, and guide fields below before committing the record to the permanent logbook.
            </p>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="min-w-[90px] bg-background/40 px-4 py-3">
                <p class="font-headline text-2xl font-bold text-primary">{{ pendingDives.length }}</p>
                <p class="font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Pending</p>
              </div>
              <div class="min-w-[90px] bg-background/40 px-4 py-3">
                <p class="font-headline text-2xl font-bold text-secondary">{{ dives.length }}</p>
                <p class="font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Total Logs</p>
              </div>
              <div class="min-w-[90px] bg-background/40 px-4 py-3">
                <p class="font-headline text-2xl font-bold text-tertiary">{{ averageCompletion }}%</p>
                <p class="font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Completion</p>
              </div>
            </div>
          </div>
        </div>
        <div v-if="importStatusMessage" class="bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ importStatusMessage }}</div>
        <div v-if="importError" class="bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ importError }}</div>
      </header>

      <div v-if="pendingDives.length" class="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section class="space-y-4">
          <article
            v-for="dive in pendingDives"
            :key="dive.id"
            class="relative overflow-hidden bg-surface-container-low transition-all duration-300"
            :class="selectedDive && selectedDive.id === dive.id ? 'shadow-[0_0_0_1px_rgba(156,202,255,0.22)]' : 'hover:bg-surface-container'"
          >
            <div class="absolute right-4 top-4 flex flex-wrap gap-2">
              <span v-if="isNightDive(dive)" class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Night Dive</span>
              <span class="bg-tertiary-container/40 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Pending</span>
            </div>
            <div class="flex flex-col lg:flex-row">
              <div class="w-full bg-surface-container-highest/30 p-6 lg:w-48">
                <div class="mb-5">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Date</p>
                  <p class="mt-1 font-headline text-lg font-bold text-primary">{{ compactDateStamp(dive.started_at) }}</p>
                  <p class="text-[10px] text-secondary/60">{{ formatTime(dive.started_at) }}</p>
                </div>
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Index</p>
                  <p class="mt-1 font-headline text-lg font-bold">{{ paddedDiveIndex(dive) }}</p>
                </div>
              </div>
              <div class="flex-1 p-6 lg:p-8">
                <div class="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Max Depth</p>
                    <p class="mt-2 font-headline text-3xl font-bold">{{ formatDepthNumber(dive.max_depth_m) }}<span class="ml-1 text-xs font-normal text-secondary">M</span></p>
                  </div>
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Duration</p>
                    <p class="mt-2 font-headline text-3xl font-bold">{{ formatDurationShort(dive.duration_seconds) }}<span class="ml-1 text-xs font-normal text-secondary"> / Dive</span></p>
                  </div>
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Min Temp</p>
                    <p class="mt-2 font-headline text-3xl font-bold">{{ formatTemperature(importTemperature(dive)) }}</p>
                  </div>
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Gas Mix</p>
                    <p class="mt-2 font-headline text-3xl font-bold">{{ gasSummary(dive).label }}<span class="ml-1 text-xs font-normal text-secondary">{{ gasSummary(dive).detail }}</span></p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-3">
                  <span
                    v-for="field in missingFields(dive)"
                    :key="field.key"
                    class="inline-flex items-center gap-2 bg-surface-container-highest/50 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-error"
                  >
                    <span class="material-symbols-outlined text-[12px]">{{ field.icon }}</span>
                    {{ field.missingLabel }}
                  </span>
                </div>
              </div>
              <div class="flex w-full flex-col justify-center gap-4 bg-surface-container-high/20 p-6 lg:w-64 lg:p-8">
                <button @click="selectImportDive(dive.id)" class="w-full bg-primary px-5 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110">
                  Complete Record
                </button>
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Progress</span>
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ completionForDive(dive) }}%</span>
                  </div>
                  <div class="h-1 bg-surface-container-highest">
                    <div class="h-full bg-primary transition-all" :style="{ width: completionForDive(dive) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>

        <aside class="xl:sticky xl:top-24">
          <section v-if="selectedDive" class="space-y-6 bg-surface-container-low p-6 shadow-panel md:p-8">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Metadata Completion</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ paddedDiveIndex(selectedDive) }}</h4>
                <p class="mt-2 text-sm text-on-surface-variant">{{ formatDate(selectedDive.started_at) }} | {{ selectedDive.vendor }} {{ selectedDive.product }}</p>
              </div>
              <span class="bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">{{ importCompletionPercent(selectedDraft) }}% Ready</span>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="bg-surface-container-high p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Max Depth</p>
                <p class="mt-2 font-headline text-2xl font-bold text-primary">{{ formatDepthNumber(selectedDive.max_depth_m) }}m</p>
              </div>
              <div class="bg-surface-container-high p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Duration</p>
                <p class="mt-2 font-headline text-2xl font-bold">{{ formatDurationShort(selectedDive.duration_seconds) }}</p>
              </div>
            </div>

            <div class="space-y-4">
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Site</span>
                <input :value="selectedDraft.site" @input="updateField('site', $event.target.value)" type="text" placeholder="Blue Hole / House Reef" class="w-full border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
              </label>
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Buddy</span>
                  <input :value="selectedDraft.buddy" @input="updateField('buddy', $event.target.value)" type="text" placeholder="Diver name" class="w-full border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                </label>
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Guide</span>
                  <input :value="selectedDraft.guide" @input="updateField('guide', $event.target.value)" type="text" placeholder="Guide or instructor" class="w-full border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                </label>
              </div>
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Notes</span>
                <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="5" placeholder="Visibility, current, wildlife, entry notes, incidents..." class="w-full resize-none border-none bg-surface-container-highest/70 px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"></textarea>
              </label>
            </div>

            <div class="space-y-3 bg-surface-container-high p-4">
              <div class="flex items-center justify-between gap-4">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Next Required Step</span>
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-tertiary">{{ nextStepLabel }}</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="field in missingImportFields(selectedDraft)"
                  :key="'selected-' + field.key"
                  class="inline-flex items-center gap-2 bg-background/40 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-error"
                >
                  <span class="material-symbols-outlined text-[12px]">{{ field.icon }}</span>
                  {{ field.missingLabel }}
                </span>
                <span v-if="!missingImportFields(selectedDraft).length" class="inline-flex items-center gap-2 bg-primary/10 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  <span class="material-symbols-outlined text-[12px]">task_alt</span>
                  Ready To Commit
                </span>
              </div>
            </div>

            <div class="flex flex-col gap-3 md:flex-row">
              <button @click="saveSelectedDraft(false)" :disabled="isSaving(selectedDive.id)" class="flex-1 bg-surface-container-high px-5 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary disabled:opacity-50">
                {{ isSaving(selectedDive.id) ? 'Saving...' : 'Save Draft' }}
              </button>
              <button @click="saveSelectedDraft(true)" :disabled="isSaving(selectedDive.id) || !canCompleteImport(selectedDraft)" class="flex-1 bg-primary px-5 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {{ isSaving(selectedDive.id) ? 'Saving...' : 'Complete Record' }}
              </button>
            </div>

            <div class="flex items-center justify-between gap-4 bg-surface-container-high/50 p-4">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Telemetry Ready</p>
                <p class="mt-1 text-sm text-on-surface-variant">{{ selectedGas.label }} {{ selectedGas.detail }} | {{ formatTemperature(importTemperature(selectedDive)) }} min</p>
              </div>
              <button @click="openDive(selectedDive.id)" class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Open Detail</button>
            </div>
          </section>
        </aside>
      </div>

      <section v-else class="space-y-6 bg-surface-container-low p-10 shadow-panel">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Import Queue Clear</p>
        <h4 class="font-headline text-4xl font-bold tracking-tight">All imported dives have been committed.</h4>
        <p class="max-w-2xl text-sm leading-7 text-on-surface-variant">The pending import queue is empty. Continue with the dive log or inspect the most recent telemetry detail.</p>
        <div class="flex flex-wrap gap-3">
          <button @click="setView('logs')" class="bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Return To Logs</button>
          <button @click="fetchDives" class="bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Refresh Queue</button>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div class="bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Device Sync</h4>
          <div class="mt-6 flex items-center justify-between gap-3">
            <span class="text-sm font-semibold">{{ dives[0] ? dives[0].vendor + ' ' + dives[0].product : 'No device synced' }}</span>
            <span class="bg-primary/10 px-2 py-1 font-label text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Connected</span>
          </div>
          <div class="mt-4 h-1 bg-surface-container-highest"><div class="h-full bg-primary" :style="{ width: Math.min(100, dives.length * 12) + '%' }"></div></div>
          <p class="mt-2 text-[10px] text-secondary/60">Imported depth: {{ dives.length }} logs cached locally</p>
        </div>
        <div class="bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Incomplete Logs</h4>
          <div class="mt-6 flex items-end gap-3">
            <span class="font-headline text-4xl font-bold">{{ pendingDives.length }}</span>
            <span class="pb-1 text-xs text-secondary/60">logs remaining</span>
          </div>
          <p class="mt-2 text-[10px] text-secondary/60">Average data completion: {{ averageCompletion }}%</p>
        </div>
        <div class="bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Next Step</h4>
          <div class="mt-6 flex items-center gap-4">
            <div class="flex h-11 w-11 items-center justify-center bg-surface-container-highest text-primary">
              <span class="material-symbols-outlined">map</span>
            </div>
            <div>
              <p class="text-sm font-bold">{{ nextStepLabel }}</p>
              <p class="text-[10px] text-secondary/60">Geo-tagging and buddy validation recommended</p>
            </div>
          </div>
        </div>
      </section>
      </section>
    </section>
  `
};

const DiveDetailView = {
  props: ["dive", "closeDetail"],
  computed: {
    depthProfile() {
      return depthChartPath(this.dive);
    },
    pressureProfile() {
      return pressureChartPath(this.dive);
    },
    depthAxisLabels() {
      const maxDepth = Math.max(numberOrZero(this.dive?.max_depth_m), ...depthSeries(this.dive).map((point) => point.value), 1);
      return axisTicks(maxDepth, (value) => `${Math.round(value)}m`);
    },
    pressureAxisLabels() {
      const range = pressureRange(this.dive);
      const maxPressure = Math.max(numberOrZero(range.begin), ...pressureSeries(this.dive).map((point) => point.value), 1);
      return axisTicks(maxPressure, (value) => `${Math.round(value)} bar`, true);
    },
    timeLabels() {
      return profileTimeLabels(this.dive);
    },
    checkpoints() {
      return checkpointCards(this.dive);
    },
    narrative() {
      return diveNarrative(this.dive);
    },
    equipmentTags() {
      return detailEquipmentTags(this.dive);
    },
    pressureRangeText() {
      return pressureRangeLabel(this.dive);
    },
    sacRateText() {
      const value = sacRate(this.dive);
      return typeof value === "number" ? `${value.toFixed(1)} L/min` : "--";
    },
    oxygenText() {
      const value = oxygenToxicityPercent(this.dive);
      return typeof value === "number" ? `${value.toFixed(0)} CNS%` : "--";
    },
    mobileTimeLabels() {
      if (!this.timeLabels.length) return ["0m", "--", "--"];
      const middleIndex = Math.floor(this.timeLabels.length / 2);
      return [
        this.timeLabels[0],
        this.timeLabels[middleIndex] || this.timeLabels[0],
        this.timeLabels[this.timeLabels.length - 1] || this.timeLabels[0]
      ];
    },
    gradientId() {
      return `depthGradient-${this.dive?.id || "selected"}`;
    }
  },
  methods: {
    diveModeLabel,
    diveTitle,
    formatDate,
    formatTime,
    formatDateTime,
    formatDepth,
    formatDepthNumber,
    formatTemperature,
    formatDurationShort: durationShort,
    gasMixLabel,
    primaryGasMix,
    primaryTank,
    tankLabel,
    pressureRangeLabel,
    surfaceTemperature,
    decoStatusLabel,
    shortFingerprint,
    formatDataSize,
    depthParts,
    durationParts,
    temperatureParts,
    durationMinutes(dive) {
      return Math.round(numberOrZero(dive?.duration_seconds) / 60);
    }
  },
  template: `
    <section v-if="dive" class="relative overflow-hidden bg-surface-container-low p-6 shadow-panel md:p-8">
      <div class="absolute inset-0 technical-grid pointer-events-none"></div>
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(156,240,255,0.35),transparent_22rem)] pointer-events-none"></div>
      <div class="relative z-10">
        <section class="space-y-8 md:hidden">
          <header class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <button @click="closeDetail" class="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                <span class="material-symbols-outlined text-base">arrow_back</span>
                Back
              </button>
              <span class="rounded bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive ID {{ dive.id }}</span>
            </div>

            <section class="relative min-h-[17rem] overflow-hidden rounded-[1.5rem] p-6">
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(156,202,255,0.22),transparent_22%),radial-gradient(circle_at_80%_25%,rgba(255,183,125,0.18),transparent_18%),linear-gradient(180deg,#0f2a3f_0%,#021523_100%)]"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent"></div>
              <div class="absolute inset-0 technical-grid opacity-10"></div>
              <div class="relative z-10 flex h-full flex-col justify-end space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded bg-tertiary-container/40 px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-tertiary">{{ diveModeLabel(dive) }}</span>
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }}</span>
                </div>
                <h3 class="font-headline text-3xl font-bold tracking-tight text-on-surface">{{ diveTitle(dive) }}</h3>
                <div class="flex items-center gap-2 text-sm text-on-surface-variant">
                  <span class="material-symbols-outlined text-sm">monitoring</span>
                  <span>{{ dive.vendor }} {{ dive.product }}</span>
                </div>
              </div>
            </section>
          </header>

          <section class="overflow-hidden rounded-xl shadow-panel">
            <div class="grid grid-cols-3 gap-px bg-background/20">
              <div class="bg-surface-container-high p-4 text-center">
                <span class="font-label text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">Duration</span>
                <div class="mt-1 flex items-baseline justify-center gap-1">
                  <span class="font-headline text-xl font-bold text-primary">{{ durationMinutes(dive) }}</span>
                  <span class="font-label text-[10px] uppercase text-on-surface-variant">Min</span>
                </div>
              </div>
              <div class="bg-surface-container-high p-4 text-center">
                <span class="font-label text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">Max Depth</span>
                <div class="mt-1 flex items-baseline justify-center gap-1">
                  <span class="font-headline text-xl font-bold text-primary">{{ formatDepthNumber(dive.max_depth_m) }}</span>
                  <span class="font-label text-[10px] uppercase text-on-surface-variant">M</span>
                </div>
              </div>
              <div class="bg-surface-container-high p-4 text-center">
                <span class="font-label text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">Temp</span>
                <div class="mt-1 flex items-baseline justify-center gap-1">
                  <span class="font-headline text-xl font-bold text-tertiary">{{ formatTemperature(surfaceTemperature(dive)).replace(' C', '') }}</span>
                  <span class="font-label text-[10px] uppercase text-on-surface-variant">C</span>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-end justify-between">
              <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Profile Analysis</h4>
              <div class="flex gap-4">
                <div class="flex items-center gap-1.5">
                  <div class="h-2 w-2 rounded-full bg-primary"></div>
                  <span class="font-label text-[9px] uppercase text-on-surface-variant">Depth</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="h-2 w-2 rounded-full border border-tertiary border-dashed"></div>
                  <span class="font-label text-[9px] uppercase text-on-surface-variant">Air</span>
                </div>
              </div>
            </div>

            <div class="relative overflow-hidden rounded-xl bg-surface-container-low p-4">
              <div class="absolute inset-0 technical-grid opacity-[0.05]"></div>
              <div class="relative grid grid-cols-[auto_1fr_auto] gap-3">
                <div class="flex h-48 flex-col justify-between py-1 text-right">
                  <span class="font-label text-[8px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Depth</span>
                  <span v-for="label in depthAxisLabels" :key="'mobile-depth-' + label" class="font-label text-[8px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">{{ label }}</span>
                </div>
                <svg class="h-48 w-full" viewBox="0 0 800 250" preserveAspectRatio="none">
                  <line x1="0" x2="800" y1="10" y2="10" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <line x1="0" x2="800" y1="56" y2="56" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <line x1="0" x2="800" y1="102" y2="102" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <line x1="0" x2="800" y1="148" y2="148" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <line x1="0" x2="800" y1="194" y2="194" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <line x1="0" x2="800" y1="240" y2="240" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                  <path :d="depthProfile.area" :fill="'url(#' + gradientId + ')'" opacity="0.9"></path>
                  <path :d="depthProfile.line" fill="none" stroke="#9CCAFF" stroke-width="2.5" stroke-linejoin="round"></path>
                  <path :d="pressureProfile" fill="none" stroke="#FFB77D" stroke-width="2" stroke-dasharray="5"></path>
                  <defs>
                    <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#80bdfe" stop-opacity="0.26"></stop>
                      <stop offset="100%" stop-color="#80bdfe" stop-opacity="0"></stop>
                    </linearGradient>
                  </defs>
                </svg>
                <div class="flex h-48 flex-col justify-between py-1">
                  <span class="font-label text-[8px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">Air</span>
                  <span v-for="label in pressureAxisLabels" :key="'mobile-pressure-' + label" class="font-label text-[8px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">{{ label }}</span>
                </div>
              </div>
              <div class="relative mt-3 flex items-center justify-between font-label text-[8px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/50">
                <span v-for="label in mobileTimeLabels" :key="'mobile-time-' + label">{{ label }}</span>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Observations</h4>
            <div class="rounded-xl border-l-2 border-primary/30 bg-surface-container-low p-5">
              <p v-for="paragraph in narrative.slice(0, 2)" :key="'mobile-note-' + paragraph" class="text-sm leading-relaxed text-on-surface-variant">{{ paragraph }}</p>
            </div>
          </section>

          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Dive Checkpoints</h4>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{{ checkpoints.length }} events</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <article v-for="card in checkpoints" :key="'mobile-' + card.title" class="rounded-xl bg-[linear-gradient(160deg,rgba(19,44,64,0.9),rgba(31,55,75,0.7))] p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ card.title }}</p>
                <div class="mt-4 space-y-2">
                  <div>
                    <p class="font-label text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">Time</p>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ card.time }}</p>
                  </div>
                  <div>
                    <p class="font-label text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">Depth</p>
                    <p class="text-sm font-bold text-primary">{{ card.depth }}</p>
                  </div>
                  <div>
                    <p class="font-label text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">Pressure</p>
                    <p class="text-sm font-bold text-tertiary">{{ card.pressure }}</p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="grid grid-cols-3 gap-3 rounded-xl bg-surface-container-low p-4">
            <div>
              <p class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">SAC Rate</p>
              <p class="mt-1 font-headline text-lg font-bold text-on-surface">{{ sacRateText }}</p>
            </div>
            <div>
              <p class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">O2 Load</p>
              <p class="mt-1 font-headline text-lg font-bold text-on-surface">{{ oxygenText }}</p>
            </div>
            <div>
              <p class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Status</p>
              <p class="mt-1 font-headline text-lg font-bold" :class="decoStatusLabel(dive) === 'No Deco' ? 'text-primary' : 'text-tertiary'">{{ decoStatusLabel(dive) }}</p>
            </div>
          </section>
        </section>

        <section class="hidden space-y-8 md:block">
        <header class="space-y-6">
          <div class="flex flex-wrap items-center gap-3">
            <button @click="closeDetail" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-panel">
              <span class="material-symbols-outlined text-base">arrow_back</span>
              Back To Logs
            </button>
            <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Dive ID: {{ dive.id }}</span>
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</span>
          </div>
          <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 class="font-headline text-4xl font-bold tracking-tight text-on-surface md:text-5xl">{{ diveTitle(dive) }}</h3>
              <div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-secondary">
                <div class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-base">location_on</span><span>{{ diveModeLabel(dive) }} telemetry log from {{ dive.vendor }} {{ dive.product }}</span></div>
                <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Imported {{ formatDate(dive.imported_at) }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button class="bg-surface-container-high p-3 text-secondary transition-colors hover:text-primary">
                <span class="material-symbols-outlined">share</span>
              </button>
              <button class="bg-surface-container-high p-3 text-secondary transition-colors hover:text-primary">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="inline-flex items-center gap-2 bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
                <span class="material-symbols-outlined">download</span>
                Export PDF
              </button>
            </div>
          </div>
        </header>

        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div class="rounded-[1.2rem] bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Duration</p>
            <p class="mt-2 font-headline text-3xl font-bold">{{ durationParts(dive.duration_seconds).value }}<span class="ml-0.5 text-primary">{{ durationParts(dive.duration_seconds).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] border-b-2 border-primary/20 bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Max Depth</p>
            <p class="mt-2 font-headline text-3xl font-bold text-primary">{{ depthParts(dive.max_depth_m).value }}<span class="ml-0.5 text-primary">{{ depthParts(dive.max_depth_m).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Avg Depth</p>
            <p class="mt-2 font-headline text-3xl font-bold text-secondary">{{ depthParts(dive.avg_depth_m).value }}<span class="ml-0.5 text-primary">{{ depthParts(dive.avg_depth_m).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Temperature</p>
            <p class="mt-2 font-headline text-3xl font-bold">{{ temperatureParts(surfaceTemperature(dive)).value }}<span class="ml-0.5 text-primary">{{ temperatureParts(surfaceTemperature(dive)).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Pressure</p>
            <p class="mt-2 font-headline text-3xl font-bold">{{ pressureRangeText.replace(' bar', '') }}<span v-if="pressureRangeText !== '--'" class="ml-1 text-primary">bar</span></p>
          </div>
          <div class="rounded-[1.2rem] bg-surface-container-high p-5">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Samples</p>
            <p class="mt-2 font-headline text-3xl font-bold">{{ dive.sample_count }}</p>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-6">
          <section class="col-span-12 rounded-[1.5rem] bg-surface-container-high p-6 lg:col-span-8">
            <div class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h4 class="font-headline text-lg font-bold">Dive Profile</h4>
              <div class="flex flex-wrap gap-4">
                <div class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-primary"></span><span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Depth (m)</span></div>
                <div class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-tertiary"></span><span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Air (bar)</span></div>
              </div>
            </div>
            <div class="min-h-[360px]">
              <div class="grid grid-cols-[auto_1fr_auto] gap-4">
                <div class="flex h-[320px] flex-col justify-between pb-2 pt-2 text-right">
                  <span class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Depth</span>
                  <span v-for="label in depthAxisLabels" :key="'depth-' + label" class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ label }}</span>
                </div>
                <svg class="h-[320px] w-full" viewBox="0 0 800 250" preserveAspectRatio="none">
                  <line x1="0" x2="800" y1="10" y2="10" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <line x1="0" x2="800" y1="56" y2="56" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <line x1="0" x2="800" y1="102" y2="102" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <line x1="0" x2="800" y1="148" y2="148" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <line x1="0" x2="800" y1="194" y2="194" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <line x1="0" x2="800" y1="240" y2="240" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                  <path :d="depthProfile.area" :fill="'url(#' + gradientId + ')'" opacity="0.95"></path>
                  <path :d="depthProfile.line" fill="none" stroke="#12629d" stroke-width="3" stroke-linejoin="round"></path>
                  <path :d="pressureProfile" fill="none" stroke="#FFB77D" stroke-width="2.5" stroke-dasharray="6"></path>
                  <defs>
                    <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#80bdfe" stop-opacity="0.36"></stop>
                      <stop offset="100%" stop-color="#80bdfe" stop-opacity="0"></stop>
                    </linearGradient>
                  </defs>
                </svg>
                <div class="flex h-[320px] flex-col justify-between pb-2 pt-2">
                  <span class="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Air</span>
                  <span v-for="label in pressureAxisLabels" :key="'pressure-' + label" class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ label }}</span>
                </div>
              </div>
              <div class="mt-4 grid grid-cols-6 gap-2 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">
                <span v-for="label in timeLabels" :key="label" class="text-center">{{ label }}</span>
              </div>
              <div class="mt-2 text-center font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">
                Time
              </div>
            </div>
          </section>

          <aside class="col-span-12 flex flex-col gap-6 lg:col-span-4">
            <section class="rounded-[1.5rem] bg-surface-container-low p-6">
              <h4 class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Gas Configuration</h4>
              <div class="mt-5 space-y-4">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-sm text-secondary">Primary Mix</span>
                  <span class="rounded-full bg-secondary-fixed px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-on-secondary-container">{{ gasMixLabel(primaryGasMix(dive)) }}</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-sm text-secondary">Tank Volume</span>
                  <span class="text-sm font-bold">{{ tankLabel(primaryTank(dive)) }}</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-sm text-secondary">Start/End Pressure</span>
                  <span class="text-sm font-bold">{{ pressureRangeText }}</span>
                </div>
              </div>
            </section>

            <section class="rounded-[1.5rem] bg-surface-container-low p-6">
              <h4 class="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface">Equipment Set</h4>
              <div class="mt-5 flex flex-wrap gap-2">
                <span v-for="tag in equipmentTags" :key="tag" class="rounded bg-surface-container-highest px-3 py-2 text-xs font-semibold text-secondary">{{ tag }}</span>
              </div>
            </section>

            <section class="rounded-[1.5rem] bg-surface-container-high p-6">
              <h4 class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Telemetry Record</h4>
              <div class="mt-5 space-y-4 text-sm">
                <div class="flex items-center justify-between gap-4"><span class="text-secondary">Fingerprint</span><span class="font-mono text-xs font-bold">{{ shortFingerprint(dive.fingerprint_hex || dive.raw_sha256) }}</span></div>
                <div class="flex items-center justify-between gap-4"><span class="text-secondary">Raw Payload</span><span class="font-bold">{{ formatDataSize(dive.raw_data_size) }}</span></div>
                <div class="flex items-center justify-between gap-4"><span class="text-secondary">Imported At</span><span class="font-bold">{{ formatDateTime(dive.imported_at) }}</span></div>
              </div>
            </section>
          </aside>

          <section class="col-span-12 rounded-[1.5rem] bg-surface-container-low p-6 lg:col-span-7">
            <h4 class="mb-6 flex items-center gap-2 font-headline text-lg font-bold">
              <span class="material-symbols-outlined text-secondary">description</span>
              Diver's Log & Observations
            </h4>
            <div class="space-y-4 text-sm leading-7 text-on-surface-variant">
              <p v-for="paragraph in narrative" :key="paragraph">{{ paragraph }}</p>
            </div>
          </section>

          <section class="col-span-12 rounded-[1.5rem] bg-surface-container-low p-6 lg:col-span-5">
            <div class="mb-6 flex items-center justify-between gap-4">
              <h4 class="flex items-center gap-2 font-headline text-lg font-bold">
                <span class="material-symbols-outlined text-secondary">photo_library</span>
                Dive Checkpoints
              </h4>
              <span class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">{{ checkpoints.length }} telemetry moments</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <article v-for="card in checkpoints" :key="card.title" class="aspect-square rounded-[1rem] bg-[linear-gradient(160deg,rgba(19,44,64,0.9),rgba(31,55,75,0.7))] p-4">
                <p class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">{{ card.title }}</p>
                <div class="mt-6 space-y-3">
                  <div><p class="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Time</p><p class="mt-1 font-headline text-2xl font-bold">{{ card.time }}</p></div>
                  <div><p class="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Depth</p><p class="mt-1 text-sm font-bold">{{ card.depth }}</p></div>
                  <div><p class="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Pressure</p><p class="mt-1 text-sm font-bold">{{ card.pressure }}</p></div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div class="flex flex-wrap items-end gap-8 border-t border-outline-variant/15 pt-8">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">SAC Rate</p>
            <p class="mt-1 font-headline text-xl font-bold">{{ sacRateText }}</p>
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Oxygen Toxicity</p>
            <p class="mt-1 font-headline text-xl font-bold">{{ oxygenText }}</p>
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Deco Status</p>
            <p class="mt-1 font-headline text-xl font-bold" :class="decoStatusLabel(dive) === 'No Deco' ? 'text-emerald-600' : 'text-primary'">{{ decoStatusLabel(dive) }}</p>
          </div>
          <div class="ml-auto flex items-center gap-4 bg-surface-container-high px-4 py-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-highest text-primary">
              <span class="material-symbols-outlined">verified</span>
            </div>
            <div class="text-right">
              <p class="text-[10px] font-black uppercase tracking-[0.22em] text-secondary">Telemetry Source</p>
              <p class="text-sm font-bold">{{ dive.vendor }} {{ dive.product }} <span class="ml-1 text-secondary/70">#{{ dive.id }}</span></p>
            </div>
          </div>
        </div>
        </section>
      </div>
    </section>
    <section v-else class="rounded-[2rem] bg-surface-container-low p-10 shadow-panel">
      <p class="font-headline text-2xl font-bold">Selected dive is unavailable</p>
      <button @click="closeDetail" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Return to dive logs</button>
    </section>
  `
};

const EquipmentView = {
  props: ["searchText"],
  data() {
    return {
      equipmentFilter: "All",
      equipmentFilters: ["All", "Life Support", "Computers", "Exposure"],
      serviceFocus: "Scubapro MK25 EVO",
      equipment: [
        { name: "Scubapro MK25 EVO/A700", serial: "7041289945", lastService: "Jan 12, 2023", metaLabel: "Depth Rating", metaValue: "300m / 1000ft", status: "Ready", category: "Life Support", icon: "air" },
        { name: "Shearwater Teric", serial: "TER-9902-A", lastService: "May 05, 2022", metaLabel: "Battery", metaValue: "Service Req.", status: "Service Soon", category: "Computers", icon: "watch" },
        { name: "Mares Dragon SLS", serial: "BC-440211", lastService: "Aug 18, 2023", metaLabel: "Lift", metaValue: "19kg / 42lbs", status: "Ready", category: "Life Support", icon: "scuba_diving" },
        { name: "Fourth Element Argosy", serial: "DRY-FE-001", lastService: "Sep 30, 2023", metaLabel: "Issue", metaValue: "Neck Seal", status: "Repairing", category: "Exposure", icon: "checkroom" }
      ],
      serviceRecords: [
        { month: "Jan", day: "12", year: "2023", title: "Annual Overhaul", description: "Full kit replacement, O-rings, high-pressure seat.", type: "Official Service", typeClass: "bg-secondary-container text-on-secondary-container", cost: "$185.00" },
        { month: "Jul", day: "04", year: "2022", title: "Visual Inspection", description: "Post-expedition rinse and functional pressure test.", type: "User Check", typeClass: "bg-surface-container-highest text-on-surface-variant", cost: "$0.00" },
        { month: "Jan", day: "20", year: "2022", title: "Initial Calibration", description: "Out-of-box adjustment and nitrox cleaning.", type: "Official Service", typeClass: "bg-secondary-container text-on-secondary-container", cost: "$45.00" }
      ]
    };
  },
  computed: {
    filteredEquipment() {
      const search = (this.searchText || "").toLowerCase();
      return this.equipment.filter((item) => {
        const matchesFilter = this.equipmentFilter === "All" || item.category === this.equipmentFilter;
        const matchesSearch = !search || `${item.name} ${item.serial} ${item.metaValue}`.toLowerCase().includes(search);
        return matchesFilter && matchesSearch;
      });
    },
    nextMaintenanceItem() {
      return "Scubapro MK25 Regulator";
    },
    nextMaintenanceDate() {
      return "Oct 24, 2023";
    }
  },
  methods: {
    statusClass(status) {
      if (status === "Ready") return "bg-primary/10 text-primary";
      if (status === "Service Soon") return "bg-tertiary/10 text-tertiary";
      return "bg-error-container text-on-error-container";
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div class="relative overflow-hidden bg-surface-container-low p-6 md:col-span-2">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Asset Totals</p>
          <div class="mt-4 flex items-baseline gap-2">
            <h3 class="font-headline text-5xl font-bold">{{ equipment.length }}</h3>
            <span class="font-label text-sm uppercase tracking-[0.16em] text-secondary">Active Units</span>
          </div>
          <div class="mt-6 grid grid-cols-3 gap-2">
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Regulators</p><p class="mt-1 font-headline text-lg font-bold text-primary">06</p></div>
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Cylinders</p><p class="mt-1 font-headline text-lg font-bold text-primary">14</p></div>
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Computers</p><p class="mt-1 font-headline text-lg font-bold text-primary">04</p></div>
          </div>
        </div>
        <div class="border-l-2 border-tertiary bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Next Maintenance</p>
          <h3 class="mt-4 font-headline text-3xl font-bold">{{ nextMaintenanceDate }}</h3>
          <p class="mt-1 text-sm text-secondary">{{ nextMaintenanceItem }}</p>
          <div class="mt-8 h-1 overflow-hidden bg-surface-container-highest"><div class="h-full w-4/5 bg-tertiary"></div></div>
        </div>
      </section>
      <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div class="flex-1">
          <div class="mb-6 flex items-end justify-between gap-4">
            <div>
              <h4 class="font-headline text-2xl font-bold tracking-tight">ASSET REGISTRY</h4>
              <p class="font-label text-[10px] uppercase tracking-[0.24em] text-secondary/70">Deep-Sea Operational Hardware</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button v-for="filter in equipmentFilters" :key="filter" @click="equipmentFilter = filter" class="px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] transition-colors" :class="equipmentFilter === filter ? 'bg-surface-container-high text-primary' : 'bg-surface-container-low text-on-surface-variant hover:text-primary'">{{ filter }}</button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <article v-for="item in filteredEquipment" :key="item.name" class="group relative bg-surface-container-low p-5 transition-colors hover:bg-surface-container-high">
              <div class="flex gap-4">
                <div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded bg-surface-container-highest">
                  <span class="material-symbols-outlined text-5xl text-secondary/60 transition-colors group-hover:text-primary">{{ item.icon }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h5 class="font-headline text-lg font-bold leading-tight">{{ item.name }}</h5>
                      <p class="mt-1 font-label text-[10px] uppercase tracking-[0.2em] text-secondary">SN: {{ item.serial }}</p>
                    </div>
                    <span class="px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-[0.18em]" :class="statusClass(item.status)">{{ item.status }}</span>
                  </div>
                  <div class="mt-4 grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-3">
                    <div><p class="font-label text-[8px] uppercase text-secondary">Last Service</p><p class="mt-1 text-[11px] font-headline">{{ item.lastService }}</p></div>
                    <div><p class="font-label text-[8px] uppercase text-secondary">{{ item.metaLabel }}</p><p class="mt-1 text-[11px] font-headline">{{ item.metaValue }}</p></div>
                    <div><p class="font-label text-[8px] uppercase text-secondary">Category</p><p class="mt-1 text-[11px] font-headline">{{ item.category }}</p></div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
        <aside class="w-full bg-surface-container-low p-6 lg:w-80">
          <h4 class="font-headline text-lg font-bold uppercase tracking-tight">Service History</h4>
          <div class="relative mt-6 space-y-6 before:absolute before:bottom-0 before:left-[11px] before:top-2 before:w-px before:bg-outline-variant/30 before:content-['']">
            <article v-for="record in serviceRecords" :key="record.title + record.month + record.day + record.year" class="relative pl-8">
              <span class="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-highest text-secondary"><span class="material-symbols-outlined text-[14px]">build</span></span>
              <div>
                <p class="font-label text-[10px] font-bold uppercase text-primary">{{ record.day }} {{ record.month }} {{ record.year }}</p>
                <h5 class="mt-1 font-headline text-xs font-bold uppercase">{{ record.title }}</h5>
                <p class="mt-1 text-[11px] leading-relaxed text-secondary/70">{{ record.description }}</p>
                <p class="mt-2 text-[11px] font-bold">{{ record.cost }}</p>
              </div>
            </article>
          </div>
        </aside>
      </div>
    </section>
  `
};

const SettingsView = {
  data() {
    return {
      settingsProfile: {
        name: "Elias Thorne",
        email: "elias.thorne@cartographer.marine",
        certification: "Master Scuba Diver",
        registry: "MSD-992-0402-X"
      },
      settingsUnits: {
        depth: "metric",
        temperature: "fahrenheit",
        pressure: "bar"
      },
      settingsSafety: {
        mix: "Nitrox (32% O2)",
        stopDepth: 5,
        stopMinutes: 3
      },
      unitCards: [
        { key: "depth", label: "Depth", icon: "waves", options: [{ value: "metric", label: "METRIC (M)" }, { value: "imperial", label: "IMPERIAL (FT)" }] },
        { key: "temperature", label: "Temperature", icon: "thermostat", options: [{ value: "celsius", label: "CELSIUS" }, { value: "fahrenheit", label: "FAHRENHEIT" }] },
        { key: "pressure", label: "Pressure", icon: "tire_repair", options: [{ value: "bar", label: "BAR" }, { value: "psi", label: "PSI" }] }
      ]
    };
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <div class="max-w-5xl">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">System Configuration</p>
        <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight text-primary">SYSTEM CONFIG</h3>
        <p class="mt-3 max-w-3xl text-sm text-secondary">Modify operational parameters, safety thresholds, and telemetry units for the DiveVault logbook interface.</p>
      </div>
      <section class="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div class="flex flex-col gap-8 lg:col-span-8">
          <div class="group relative overflow-hidden bg-surface-container-low p-8">
            <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl"></div>
            <div class="relative z-10 flex items-start gap-6">
              <div class="h-24 w-24 rounded-lg border border-primary/20 bg-surface-container-highest"></div>
              <div class="flex-1">
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Operational Identity</h4>
                <h3 class="mt-2 font-headline text-2xl font-bold">{{ settingsProfile.name }}</h3>
                <p class="mt-1 text-sm text-secondary">{{ settingsProfile.email }}</p>
                <div class="mt-4 flex gap-3">
                  <button class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Edit Credentials</button>
                  <button class="border border-primary/10 bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Sync License</button>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="border-l-4 border-tertiary bg-surface-container-high p-6">
              <div class="mb-6 flex items-center gap-3">
                <span class="material-symbols-outlined text-tertiary">security</span>
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Safety Protocols</h4>
              </div>
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Gas Mix Warning</p><p class="text-[10px] text-secondary/60">Alert if pO2 exceeds 1.4 bar</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Safety Stop Timer</p><p class="text-[10px] text-secondary/60">Auto-start at 5m depth</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Ascent Rate Alarm</p><p class="text-[10px] text-secondary/60">Critical threshold &gt; 9m/min</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
              </div>
            </div>
            <div class="bg-surface-container-high p-6">
              <div class="mb-6 flex items-center gap-3">
                <span class="material-symbols-outlined text-primary">settings_input_component</span>
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Unit Systems</h4>
              </div>
              <div class="space-y-8">
                <div class="flex flex-col gap-4">
                  <span class="font-label text-[10px] uppercase tracking-[0.22em] text-secondary/60">Global Configuration</span>
                  <div class="flex rounded-lg bg-surface-container-lowest p-1">
                    <button class="flex-1 rounded px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em]" :class="settingsUnits.depth === 'metric' ? 'bg-primary text-on-primary' : 'text-secondary'" @click="settingsUnits.depth = 'metric'">Metric</button>
                    <button class="flex-1 rounded px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em]" :class="settingsUnits.depth === 'imperial' ? 'bg-primary text-on-primary' : 'text-secondary'" @click="settingsUnits.depth = 'imperial'">Imperial</button>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="border border-outline-variant/10 bg-surface-container-lowest p-4"><p class="font-label text-[10px] text-secondary/60">TEMP</p><p class="mt-1 font-headline text-lg font-bold">{{ settingsUnits.temperature === 'celsius' ? 'CELSIUS' : 'FAHRENHEIT' }}</p></div>
                  <div class="border border-outline-variant/10 bg-surface-container-lowest p-4"><p class="font-label text-[10px] text-secondary/60">PRESSURE</p><p class="mt-1 font-headline text-lg font-bold">{{ settingsUnits.pressure.toUpperCase() }}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-8 lg:col-span-4">
          <div class="glass-panel bg-surface-container-high p-6 shadow-panel">
            <h4 class="mb-6 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</h4>
            <div class="flex flex-col gap-4">
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">picture_as_pdf</span><span class="text-sm font-headline font-bold">Export Logs (PDF)</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">table_chart</span><span class="text-sm font-headline font-bold">Raw Telemetry (CSV)</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">cloud_sync</span><span class="text-sm font-headline font-bold">Cloud Synchronization</span></span>
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Online</span>
              </button>
            </div>
            <div class="mt-12 border-t border-outline-variant/10 pt-8">
              <h5 class="mb-4 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-error">Danger Zone</h5>
              <div class="flex flex-col gap-3">
                <button class="w-full rounded border border-error/20 p-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-error transition-all hover:bg-error-container">Purge All Dive Data</button>
                <button class="w-full rounded p-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/40 transition-colors hover:text-error">Deactivate Operator Account</button>
              </div>
            </div>
          </div>
          <div class="border border-outline-variant/10 bg-surface-container-low p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(156,202,255,0.6)]"></span>
              <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">System Integrity</h4>
            </div>
            <div class="space-y-4">
              <div><div class="mb-1 flex items-end justify-between"><span class="text-[10px] text-secondary/60">Firmware</span><span class="text-sm font-headline font-bold">v2.4.9-ABYSS</span></div><div class="h-1 overflow-hidden rounded-full bg-surface-container-highest"><div class="h-full w-[94%] bg-primary"></div></div></div>
              <div><div class="mb-1 flex items-end justify-between"><span class="text-[10px] text-secondary/60">Encrypted Storage</span><span class="text-sm font-headline font-bold">1.2 GB / 5 GB</span></div></div>
            </div>
          </div>
        </div>
      </section>
    </section>
  `
};

createApp({
  components: {
    DashboardView,
    LogsView,
    DiveImportView,
    DiveDetailView,
    EquipmentView,
    SettingsView
  },
  data() {
    return {
      activeView: "dashboard",
      selectedDiveId: null,
      selectedImportId: null,
      searchText: "",
      dives: [],
      importDrafts: {},
      savingImportId: null,
      importError: "",
      importStatusMessage: "",
      loading: true,
      error: "",
      backendHealthy: false,
      filledIconStyle,
      navItems: [
        { id: "dashboard", label: "Dashboard", mobileLabel: "Dashboard", icon: "dashboard", mobileIcon: "dashboard", eyebrow: "Dive Overview", title: "Logbook" },
        { id: "logs", label: "Dive Logs", mobileLabel: "Logs", icon: "waves", mobileIcon: "sailing", eyebrow: "Dive Logs", title: "Dive Log Database" },
        { id: "equipment", label: "Equipment", mobileLabel: "Gear", icon: "scuba_diving", mobileIcon: "construction", eyebrow: "Asset Registry", title: "Equipment Management" },
        { id: "settings", label: "Settings", mobileLabel: "Settings", icon: "settings", mobileIcon: "settings", eyebrow: "System Configuration", title: "System Config" }
      ]
    };
  },
  computed: {
    activeSection() {
      if (this.activeView === "imports") {
        return { eyebrow: "Synchronization Module", title: "Imported Dives" };
      }
      if (this.activeView === "logs" && this.selectedDive) {
        return { eyebrow: "Dive Archive", title: "Dive Detail" };
      }
      return this.navItems.find((item) => item.id === this.activeView) || this.navItems[0];
    },
    selectedDive() {
      return this.dives.find((dive) => String(dive.id) === String(this.selectedDiveId)) || null;
    },
    backendStatusLabel() {
      if (this.loading) return "Syncing telemetry";
      if (this.error) return "Backend unreachable";
      return this.backendHealthy ? "Backend online" : "Backend idle";
    },
    statusDetail() {
      if (this.loading) return "Waiting for API response.";
      if (this.error) return "Check the Python server and API routes.";
      return `${this.dives.length} dives loaded from /api/dives`;
    },
    stats() {
      const totalDives = this.dives.length;
      const totalSeconds = this.dives.reduce((sum, dive) => sum + numberOrZero(dive.duration_seconds), 0);
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      const maxDepth = this.dives.reduce((max, dive) => Math.max(max, numberOrZero(dive.max_depth_m)), 0);
      const totalBarConsumed = this.dives.reduce((sum, dive) => {
        const range = pressureRange(dive);
        if (typeof range.begin !== "number" || typeof range.end !== "number") return sum;
        return sum + Math.max(0, Math.round(range.begin - range.end));
      }, 0);
      return {
        totalDives,
        totalSeconds,
        totalHours,
        maxDepth,
        totalBarConsumed,
        bottomTimeProgress: Math.min(100, Math.round((totalHours / 100) * 100))
      };
    }
  },
  methods: {
    setSearchText(value) {
      this.searchText = value;
    },
    setView(view) {
      this.activeView = view;
      if (view !== "logs") this.selectedDiveId = null;
      if (view !== "imports") this.selectedImportId = null;
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = view;
    },
    openDive(diveId) {
      this.activeView = "logs";
      this.selectedDiveId = diveId;
      this.selectedImportId = null;
      window.location.hash = `logs/${diveId}`;
    },
    closeDiveDetail() {
      this.activeView = "logs";
      this.selectedDiveId = null;
      window.location.hash = "logs";
    },
    syncImportDrafts() {
      const nextDrafts = {};
      this.dives.forEach((dive) => {
        const diveId = String(dive.id);
        nextDrafts[diveId] = importDraftSeed(dive);
      });
      this.importDrafts = nextDrafts;
    },
    selectNextPendingImport(dives = this.dives, drafts = this.importDrafts, preferredId = this.selectedImportId) {
      const pending = dives.filter((dive) => !isImportComplete(effectiveImportDraft(dive, drafts[String(dive.id)])));
      if (preferredId && pending.some((dive) => String(dive.id) === String(preferredId))) {
        this.selectedImportId = preferredId;
        return;
      }
      this.selectedImportId = pending[0]?.id || null;
    },
    openImportQueue(diveId = null) {
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.importError = "";
      this.importStatusMessage = "";
      this.selectNextPendingImport(this.dives, this.importDrafts, diveId || this.selectedImportId);
      if (diveId && !this.selectedImportId) {
        this.selectedImportId = diveId;
      }
      window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
    },
    selectImportDive(diveId) {
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedImportId = diveId;
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = `imports/${diveId}`;
    },
    updateImportDraft(diveId, key, value) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      const currentDraft = effectiveImportDraft(dive, this.importDrafts[id]);
      this.importDrafts = {
        ...this.importDrafts,
        [id]: {
          ...currentDraft,
          [key]: value,
          status: "pending"
        }
      };
      this.importStatusMessage = "";
      this.importError = "";
    },
    async saveImportDraft(diveId, commit = false) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.importError = "Dive could not be found for metadata update.";
        return false;
      }

      const draft = effectiveImportDraft(dive, this.importDrafts[id]);
      const missing = missingImportFields(draft);
      if (commit && missing.length) {
        this.importError = `${missing[0].label} is required before completing this record.`;
        return false;
      }

      this.savingImportId = id;
      this.importError = "";
      this.importStatusMessage = "";
      try {
        const response = await fetch(`/api/dives/${diveId}/logbook`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commit,
            logbook: {
              ...draft,
              status: commit ? "complete" : "pending"
            }
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        const updatedDive = payload;
        const nextDives = this.dives.map((entry) => (String(entry.id) === id ? updatedDive : entry));
        const nextDrafts = {
          ...this.importDrafts,
          [id]: importDraftSeed(updatedDive)
        };

        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.importStatusMessage = commit
          ? `${paddedDiveIndex(updatedDive)} committed to the registry.`
          : `Draft saved for ${paddedDiveIndex(updatedDive)}.`;

        if (commit) {
          this.selectNextPendingImport(nextDives, nextDrafts, null);
          window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
        }
        return true;
      } catch (error) {
        this.importError = error.message || "Unable to save import metadata.";
        return false;
      } finally {
        this.savingImportId = null;
      }
    },
    cycleView() {
      const currentView = this.activeView === "logs" ? "logs" : this.activeView;
      const index = this.navItems.findIndex((item) => item.id === currentView);
      const next = this.navItems[(index + 1) % this.navItems.length];
      this.setView(next.id);
    },
    syncViewFromHash() {
      const hash = window.location.hash.replace("#", "");
      const [view, diveId] = hash.split("/");
      if (view === "imports") {
        this.activeView = "imports";
        this.selectedDiveId = null;
        this.selectedImportId = diveId || this.selectedImportId;
        return;
      }
      if (this.navItems.some((item) => item.id === view)) {
        this.activeView = view;
        this.selectedDiveId = view === "logs" && diveId ? diveId : null;
        if (view !== "imports") this.selectedImportId = null;
      }
    },
    async fetchDives() {
      this.loading = true;
      this.error = "";
      try {
        const healthResponse = await fetch("/api/health");
        this.backendHealthy = healthResponse.ok;
        const diveResponse = await fetch("/api/dives?limit=250&include_samples=1");
        if (!diveResponse.ok) {
          throw new Error(`API returned ${diveResponse.status}`);
        }
        const payload = await diveResponse.json();
        this.dives = Array.isArray(payload.dives) ? payload.dives : [];
        this.syncImportDrafts();
        this.selectNextPendingImport(this.dives, this.importDrafts, this.selectedImportId);
      } catch (error) {
        this.error = error.message || "Unknown frontend error";
      } finally {
        this.loading = false;
      }
    }
  },
  mounted() {
    this.syncViewFromHash();
    window.addEventListener("hashchange", this.syncViewFromHash);
    this.fetchDives();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncViewFromHash);
  },
  template: `
    <div class="min-h-screen bg-background text-on-background">
      <aside class="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col bg-background shadow-[40px_0_40px_-20px_rgba(0,15,29,0.4)] md:flex md:w-64">
        <div class="p-6">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-surface-container-high text-primary shadow-panel">
            <span class="material-symbols-outlined text-3xl" :style="filledIconStyle">waves</span>
          </div>
        </div>
        <nav class="mt-8 flex-1 space-y-2">
          <button v-for="item in navItems" :key="item.id" @click="setView(item.id)" class="group flex w-full items-center gap-4 p-4 text-left transition-all duration-300" :class="activeView === item.id ? 'border-r-4 border-primary bg-surface-container-high/70 text-primary' : 'text-secondary opacity-70 hover:bg-surface-container-high hover:text-primary hover:opacity-100'">
            <span class="material-symbols-outlined transition-transform group-active:scale-90" :style="activeView === item.id ? filledIconStyle : ''">{{ item.icon }}</span>
            <span class="hidden font-label text-[10px] font-bold uppercase tracking-[0.2em] md:block">{{ item.label }}</span>
          </button>
        </nav>
        <div class="mt-auto p-6">
          <button @click="openImportQueue()" class="hidden w-full items-center justify-center gap-2 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 md:flex">
            <span class="material-symbols-outlined text-sm">add</span>
            Log New Dive
          </button>
        </div>
      </aside>
      <header class="fixed left-0 right-0 top-0 z-30 h-16 border-b border-primary/10 bg-surface-container-high/95 backdrop-blur-xl md:left-64 md:bg-background/80">
        <div class="flex h-full items-center justify-between px-6 md:hidden">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">waves</span>
            <h2 class="font-headline text-lg font-bold uppercase tracking-[0.14em] text-primary">DiveVault</h2>
          </div>
          <button class="rounded-full p-2 text-primary transition-colors hover:bg-surface-container-highest">
            <span class="material-symbols-outlined">notifications</span>
          </button>
        </div>
        <div class="hidden h-full items-center justify-between px-8 md:flex">
          <h2 class="font-headline text-2xl font-bold tracking-[0.08em] text-primary">DiveVault</h2>
          <div class="flex items-center gap-4">
            <div class="relative">
              <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-sm text-primary">search</span>
              <input v-model.trim="searchText" type="text" class="w-56 border-none bg-surface-container-highest py-1.5 pl-4 pr-10 text-xs text-on-surface-variant focus:ring-1 focus:ring-primary" :placeholder="activeView === 'equipment' ? 'SEARCH ASSETS...' : 'SEARCH ARCHIVES...'" />
            </div>
            <button class="text-secondary transition-colors hover:text-primary"><span class="material-symbols-outlined">notifications</span></button>
            <button class="text-secondary transition-colors hover:text-primary"><span class="material-symbols-outlined">emergency_home</span></button>
            <div class="hidden h-8 w-8 rounded-full border border-primary/30 bg-surface-container-highest md:block"></div>
          </div>
        </div>
      </header>
      <main class="pb-24 pt-20 md:ml-64">
        <div class="mx-auto max-w-md px-4 md:max-w-7xl md:px-8">
          <section v-if="loading" class="bg-surface-container-low p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold">Loading telemetry...</p>
            <p class="mt-2 text-on-surface-variant">Pulling dive data from the backend.</p>
          </section>
          <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold text-on-error-container">Frontend could not load dive data</p>
            <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
            <button @click="fetchDives" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Retry</button>
          </section>
          <dashboard-view v-else-if="activeView === 'dashboard'" :dives="dives" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive"></dashboard-view>
          <logs-view v-else-if="activeView === 'logs' && !selectedDive" :dives="dives" :search-text="searchText" :open-dive="openDive" :open-import-queue="openImportQueue" :set-search-text="setSearchText"></logs-view>
          <dive-import-view v-else-if="activeView === 'imports'" :dives="dives" :import-drafts="importDrafts" :selected-import-id="selectedImportId" :select-import-dive="selectImportDive" :update-import-draft="updateImportDraft" :save-import-draft="saveImportDraft" :saving-import-id="savingImportId" :import-error="importError" :import-status-message="importStatusMessage" :open-dive="openDive" :set-view="setView" :fetch-dives="fetchDives"></dive-import-view>
          <dive-detail-view v-else-if="activeView === 'logs' && selectedDive" :dive="selectedDive" :close-detail="closeDiveDetail"></dive-detail-view>
          <equipment-view v-else-if="activeView === 'equipment'" :search-text="searchText"></equipment-view>
          <settings-view v-else-if="activeView === 'settings'"></settings-view>
        </div>
      </main>
      <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-primary/10 bg-surface-container-low/80 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="setView(item.id)"
          class="flex flex-col items-center justify-center rounded-lg px-3 py-1 transition-all"
          :class="activeView === item.id || (activeView === 'imports' && item.id === 'logs') ? 'bg-surface-container-high text-primary' : 'text-secondary/60'"
        >
          <span class="material-symbols-outlined mb-1" :style="activeView === item.id || (activeView === 'imports' && item.id === 'logs') ? filledIconStyle : ''">{{ item.mobileIcon || item.icon }}</span>
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ item.mobileLabel }}</span>
        </button>
      </nav>
    </div>
  `
}).mount("#app");

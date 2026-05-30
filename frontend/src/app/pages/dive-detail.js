import { buildDiveSequenceMap, depthChartPath, pressureChartPath, numberOrZero, depthSeries, axisTicks, pressureRange, pressureSeries, profileTimeLabels, checkpointCards, detailEquipmentTags, pressureRangeLabel, pressureUsedLabel, diveModeLabel, diveTitle, formatDate, formatTime, formatDepth, formatDepthNumber, formatTemperature, durationShort, gasMixLabel, primaryGasMix, primaryTank, tankLabel, surfaceTemperature, depthParts, durationParts, temperatureParts, averageDepthValue, importDraftSeed, paddedDiveIndex, diveNarrative, sacRate } from "../utils/core.js";
import { diveMapPreview } from "../utils/map-preview.js";

const PROFILE_CHART_WIDTH = 800;
const PROFILE_CHART_HEIGHT = 250;
const PROFILE_CHART_PADDING = 10;

export default {
  name: "DiveDetailView",
  props: ["dive", "allDives", "diveSites", "deletingDiveId", "closeDetail", "openDiveEditor", "deleteDive", "publicView"],
  data() {
    return {
      profileHover: null
    };
  },
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
    depthPlotSeries() {
      return depthSeries(this.dive);
    },
    hasDepthProfile() {
      return this.depthPlotSeries.length > 0;
    },
    pressurePlotSeries() {
      return pressureSeries(this.dive);
    },
    hasPressureProfile() {
      return this.pressurePlotSeries.length > 0;
    },
    profileMaxTime() {
      const depthLast = this.depthPlotSeries[this.depthPlotSeries.length - 1]?.time || 0;
      const pressureLast = this.pressurePlotSeries[this.pressurePlotSeries.length - 1]?.time || 0;
      return Math.max(numberOrZero(this.dive?.duration_seconds), depthLast, pressureLast, 1);
    },
    profileMaxDepthValue() {
      return Math.max(numberOrZero(this.dive?.max_depth_m), ...this.depthPlotSeries.map((point) => point.value), 1);
    },
    profileMaxPressureValue() {
      const range = pressureRange(this.dive);
      return Math.max(numberOrZero(range.begin), ...this.pressurePlotSeries.map((point) => point.value), 1);
    },
    checkpoints() {
      return checkpointCards(this.dive);
    },
    hasCheckpoints() {
      return this.checkpoints.length > 0;
    },
    equipmentTags() {
      return detailEquipmentTags(this.dive);
    },
    equipmentItems() {
      const snapshot = importDraftSeed(this.dive)?.equipment_snapshot;
      if (Array.isArray(snapshot) && snapshot.length) {
        return snapshot
          .map((item) => ({
            label: item?.name || item?.category || "Equipment",
            category: item?.category || "Gear",
            icon: this.equipmentIcon(item)
          }))
          .filter((item) => item.label);
      }
      return this.equipmentTags.map((tag) => ({ label: tag, category: "Gear", icon: "scuba_diving" }));
    },
    logbookMetadata() {
      const draft = importDraftSeed(this.dive);
      const items = [
        { key: "site", label: "Dive Site", value: draft.site, icon: "location_on" },
        { key: "weather", label: "Weather", value: draft.weather_description, icon: "partly_cloudy_day" },
        { key: "visibility", label: "Visibility", value: draft.visibility, icon: "visibility" },
        { key: "buddy", label: "Buddy", value: draft.buddy, icon: "diversity_3" },
        { key: "guide", label: "Guide", value: draft.guide, icon: "badge" },
        { key: "wetsuit", label: "Suit", value: draft.wetsuit_description, icon: "checkroom" },
        { key: "notes", label: "Notes", value: draft.notes, icon: "notes" }
      ];
      return items
        .map((item) => {
          const value = typeof item.value === "string" ? item.value.trim() : "";
          return { ...item, value: this.logbookDisplayValue(item.key, value) };
        })
        .filter((item) => item.value);
    },
    hasLogbookMetadata() {
      return this.logbookMetadata.length > 0;
    },
    weatherSummary() {
      const value = importDraftSeed(this.dive)?.weather_description;
      return typeof value === "string" && value.trim() ? value.trim() : "";
    },
    pressureRangeText() {
      return pressureRangeLabel(this.dive);
    },
    pressureUsedText() {
      return pressureUsedLabel(this.dive);
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
    },
    averageDepth() {
      return averageDepthValue(this.dive);
    },
    diveSequenceMap() {
      return buildDiveSequenceMap(this.allDives);
    },
    displayDiveIndex() {
      return paddedDiveIndex(this.dive, this.diveSequenceMap);
    },
    diveNarrativeLines() {
      return diveNarrative(this.dive);
    },
    mapPreview() {
      return diveMapPreview(this.dive, this.diveSites, 12);
    },
    weightTelemetry() {
      const weight = importDraftSeed(this.dive)?.weight_description;
      return typeof weight === "string" && weight.trim() ? weight.trim() : "Not logged";
    },
    importSourceLabel() {
      const product = typeof this.dive?.product === "string" ? this.dive.product.trim() : "";
      return product ? `Imported from ${product}` : `Imported ${formatDate(this.dive?.imported_at)}`;
    },
    heroMetricTiles() {
      const metrics = [
        { label: "Duration", icon: "timer", value: durationParts(this.dive?.duration_seconds).value, unit: durationParts(this.dive?.duration_seconds).unit, tone: "text-primary" },
        { label: "Max Depth", icon: "south", value: depthParts(this.dive?.max_depth_m).value, unit: depthParts(this.dive?.max_depth_m).unit, tone: "text-primary" },
        { label: "Avg Temp", icon: "thermostat", value: temperatureParts(surfaceTemperature(this.dive)).value, unit: temperatureParts(surfaceTemperature(this.dive)).unit, tone: "text-tertiary" },
        { label: "Air Consumed", icon: "air", value: this.pressureUsedText.replace(" used", ""), unit: "", tone: "text-tertiary" }
      ];
      return metrics;
    },
    diveSystemCards() {
      const sac = sacRate(this.dive);
      return [
        { label: "Breathing Mix", value: gasMixLabel(primaryGasMix(this.dive)), detail: "Air (Standard)", icon: "air" },
        { label: "Pressure", value: this.pressureRangeText, detail: this.pressureUsedText, icon: "speed" },
        { label: "Weight", value: this.weightTelemetry, detail: "Weight carried", icon: "fitness_center" },
        { label: "SAC Rate", value: typeof sac === "number" ? `${sac.toFixed(1)} L/min` : "No SAC", detail: "Surface air consumption", icon: "speed" }
      ];
    },
    profileHoverTooltipStyle() {
      if (!this.profileHover) return {};
      const leftPercent = Math.min(Math.max((this.profileHover.x / PROFILE_CHART_WIDTH) * 100, 12), 88);
      const topPercent = Math.min(Math.max((this.profileHover.depthY / PROFILE_CHART_HEIGHT) * 100, 12), 88);
      return {
        left: `${leftPercent}%`,
        top: `${topPercent}%`
      };
    },
    isDeleting() {
      return String(this.deletingDiveId) === String(this.dive?.id);
    }
  },
  methods: {
    diveModeLabel,
    diveTitle,
    formatDate,
    formatTime,
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
    depthParts,
    durationParts,
    temperatureParts,
    equipmentIcon(item) {
      const icon = typeof item?.icon === "string" ? item.icon.trim() : "";
      if (icon) return icon;
      const category = String(item?.category || item?.type || item?.name || "").toLowerCase();
      if (category.includes("regulator")) return "air";
      if (category.includes("computer") || category.includes("watch")) return "watch";
      if (category.includes("fin")) return "water";
      if (category.includes("mask")) return "visibility";
      if (category.includes("weight")) return "fitness_center";
      if (category.includes("tank") || category.includes("cylinder")) return "opacity";
      if (category.includes("bcd") || category.includes("bc")) return "backpack";
      if (category.includes("camera")) return "photo_camera";
      if (category.includes("torch") || category.includes("light")) return "flashlight_on";
      if (category.includes("suit") || category.includes("exposure")) return "waves";
      return "scuba_diving";
    },
    logbookDisplayValue(key, value) {
      if (!value) return "";
      if (key !== "weather") return value;
      const normalized = value.toLowerCase();
      const weatherLabels = {
        sun: "Sunny",
        sunny: "Sunny",
        clouds: "Cloudy",
        cloudy: "Cloudy",
        rain: "Rain",
        rainy: "Rain",
        wind: "Windy",
        windy: "Windy"
      };
      if (weatherLabels[normalized]) return weatherLabels[normalized];
      return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
    diveSiteTitle(dive) {
      const site = importDraftSeed(dive)?.site;
      return typeof site === "string" && site.trim() ? site.trim() : diveTitle(dive);
    },
    nearestSeriesPoint(series, time) {
      if (!series.length) return null;
      return series.reduce((nearest, point) => {
        if (!nearest) return point;
        return Math.abs(point.time - time) < Math.abs(nearest.time - time) ? point : nearest;
      }, null);
    },
    profileScaledX(time) {
      const drawableWidth = PROFILE_CHART_WIDTH - PROFILE_CHART_PADDING * 2;
      return PROFILE_CHART_PADDING + (time / this.profileMaxTime) * drawableWidth;
    },
    profileScaledY(value, maxValue, reverse = false) {
      const drawableHeight = PROFILE_CHART_HEIGHT - PROFILE_CHART_PADDING * 2;
      const normalized = maxValue > 0 ? value / maxValue : 0;
      const scaledY = reverse ? 1 - normalized : normalized;
      return PROFILE_CHART_PADDING + scaledY * drawableHeight;
    },
    profileAxisTickStyle(index) {
      const y = PROFILE_CHART_PADDING + ((PROFILE_CHART_HEIGHT - PROFILE_CHART_PADDING * 2) * index) / 5;
      return {
        top: `${(y / PROFILE_CHART_HEIGHT) * 100}%`
      };
    },
    updateProfileHover(event) {
      if (!this.depthPlotSeries.length) {
        this.profileHover = null;
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const relativeX = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
      const drawableWidth = PROFILE_CHART_WIDTH - PROFILE_CHART_PADDING * 2;
      const normalizedX = bounds.width > 0 ? relativeX / bounds.width : 0;
      const targetTime = normalizedX * this.profileMaxTime;
      const depthPoint = this.nearestSeriesPoint(this.depthPlotSeries, targetTime);
      if (!depthPoint) {
        this.profileHover = null;
        return;
      }

      const pressurePoint = this.nearestSeriesPoint(this.pressurePlotSeries, depthPoint.time);
      const x = this.profileScaledX(depthPoint.time);

      this.profileHover = {
        x,
        depthY: this.profileScaledY(depthPoint.value, this.profileMaxDepthValue),
        pressureY: pressurePoint ? this.profileScaledY(pressurePoint.value, this.profileMaxPressureValue, true) : null,
        timeLabel: this.formatDurationShort(depthPoint.time),
        depthLabel: `${depthPoint.value.toFixed(1)} m`,
        pressureLabel: pressurePoint ? `${Math.round(pressurePoint.value)} bar` : null
      };
    },
    clearProfileHover() {
      this.profileHover = null;
    },
    removeDive() {
      if (!this.dive) return;
      this.deleteDive(this.dive.id);
    },
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
              <div class="flex items-center gap-2">
                <button v-if="!publicView" @click="removeDive()" :disabled="isDeleting" aria-label="Remove dive" title="Remove dive" class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-error-container/20 text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
                  <span class="material-symbols-outlined text-sm">delete</span>
                </button>
                <span class="rounded bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive {{ displayDiveIndex }}</span>
              </div>
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
                <h3 class="font-headline text-3xl font-bold tracking-tight text-on-surface">{{ diveSiteTitle(dive) }}</h3>
                <div class="text-sm text-on-surface-variant">Imported {{ formatDate(dive.imported_at) }}</div>
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

          <section v-if="hasDepthProfile" class="space-y-4">
            <div class="flex items-end justify-between">
              <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Profile Analysis</h4>
              <div class="flex gap-4">
                <div class="flex items-center gap-1.5">
                  <div class="h-2 w-2 rounded-full bg-primary"></div>
                  <span class="font-label text-[9px] uppercase text-on-surface-variant">Depth</span>
                </div>
                <div v-if="hasPressureProfile" class="flex items-center gap-1.5">
                  <div class="h-2 w-2 rounded-full border border-tertiary border-dashed"></div>
                  <span class="font-label text-[9px] uppercase text-on-surface-variant">Air</span>
                </div>
              </div>
            </div>

            <div class="relative overflow-hidden rounded-xl bg-surface-container-low p-4">
              <div class="absolute inset-0 technical-grid opacity-[0.05]"></div>
              <div class="relative grid grid-cols-[auto_1fr_auto] gap-3">
                <div class="relative h-48 w-10 pr-1 text-right">
                  <span
                    v-for="(label, index) in depthAxisLabels"
                    :key="'mobile-depth-' + label"
                    class="absolute right-1 font-label text-[8px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60 -translate-y-1/2"
                    :style="profileAxisTickStyle(index)"
                  >{{ label }}</span>
                </div>
                <div class="relative h-48">
                  <svg class="h-48 w-full" viewBox="0 0 800 250" preserveAspectRatio="none">
                    <line x1="0" x2="800" y1="10" y2="10" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <line x1="0" x2="800" y1="56" y2="56" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <line x1="0" x2="800" y1="102" y2="102" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <line x1="0" x2="800" y1="148" y2="148" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <line x1="0" x2="800" y1="194" y2="194" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <line x1="0" x2="800" y1="240" y2="240" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.15"></line>
                    <path :d="depthProfile.area" :fill="'url(#' + gradientId + ')'" opacity="0.9"></path>
                    <path :d="depthProfile.line" fill="none" stroke="#9CCAFF" stroke-width="2.5" stroke-linejoin="round"></path>
                    <path v-if="hasPressureProfile" :d="pressureProfile" fill="none" stroke="#FFB77D" stroke-width="2" stroke-dasharray="5"></path>
                    <line v-if="profileHover" :x1="profileHover.x" :x2="profileHover.x" y1="10" y2="240" stroke="#d9ecff" stroke-width="1.5" stroke-dasharray="4" opacity="0.45"></line>
                    <circle v-if="profileHover" :cx="profileHover.x" :cy="profileHover.depthY" r="4.5" fill="#9CCAFF" stroke="#0b2940" stroke-width="2"></circle>
                    <circle v-if="hasPressureProfile && profileHover && profileHover.pressureY !== null" :cx="profileHover.x" :cy="profileHover.pressureY" r="4.5" fill="#FFB77D" stroke="#0b2940" stroke-width="2"></circle>
                    <rect
                      x="0"
                      y="0"
                      width="800"
                      height="250"
                      fill="transparent"
                      @mousemove="updateProfileHover"
                      @mouseleave="clearProfileHover"
                    ></rect>
                    <defs>
                      <linearGradient :id="gradientId" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="#80bdfe" stop-opacity="0.26"></stop>
                        <stop offset="100%" stop-color="#80bdfe" stop-opacity="0"></stop>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div
                    v-if="profileHover"
                    class="pointer-events-none absolute z-10 min-w-[8.5rem] rounded-lg border border-primary/18 bg-background/92 px-3 py-2 text-left shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-sm"
                    :style="profileHoverTooltipStyle"
                  >
                    <p class="font-label text-[8px] font-bold uppercase tracking-[0.16em] text-secondary">{{ profileHover.timeLabel }}</p>
                    <p class="mt-1 text-xs font-semibold text-primary">Depth: {{ profileHover.depthLabel }}</p>
                    <p v-if="profileHover.pressureLabel" class="mt-1 text-xs font-semibold text-tertiary">Air: {{ profileHover.pressureLabel }}</p>
                  </div>
                </div>
                <div class="relative h-48 w-12 pl-1">
                  <span
                    v-if="hasPressureProfile"
                    v-for="(label, index) in pressureAxisLabels"
                    :key="'mobile-pressure-' + label"
                    class="absolute left-1 font-label text-[8px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60 -translate-y-1/2"
                    :style="profileAxisTickStyle(index)"
                  >{{ label }}</span>
                </div>
              </div>
              <div class="relative mt-3 flex items-center justify-between font-label text-[8px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/50">
                <span v-for="label in mobileTimeLabels" :key="'mobile-time-' + label">{{ label }}</span>
              </div>
            </div>
          </section>

          <section v-if="hasLogbookMetadata" class="space-y-4">
            <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Logbook Details</h4>
            <div class="space-y-3">
              <article v-for="item in logbookMetadata" :key="'mobile-logbook-' + item.key" class="rounded-xl bg-surface-container-high/70 p-4">
                <div class="flex items-start gap-3">
                  <span class="material-symbols-outlined mt-0.5 text-lg text-primary">{{ item.icon }}</span>
                  <div class="min-w-0">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.label }}</p>
                    <p class="mt-2 text-sm leading-6 text-on-surface">{{ item.value }}</p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="hasCheckpoints" class="space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="font-headline text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Dive Checkpoints</h4>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{{ checkpoints.length }} events</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <article v-for="card in checkpoints" :key="'mobile-' + card.title" class="rounded-xl bg-surface-container-high/70 p-4">
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

        </section>

        <section class="hidden space-y-8 md:block">
          <header class="relative min-h-[19rem] overflow-hidden rounded-[2rem] border border-primary/10 bg-surface-container-low shadow-panel">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_55%_12%,rgba(42,160,178,0.38),transparent_18rem),linear-gradient(120deg,rgba(0,21,37,0.88),rgba(0,21,37,0.48)_45%,rgba(0,21,37,0.9)),linear-gradient(165deg,transparent_0_28%,rgba(156,202,255,0.16)_29%,transparent_31%_42%,rgba(156,202,255,0.1)_43%,transparent_45%)]"></div>
            <div class="absolute inset-0 technical-grid opacity-[0.1]"></div>
            <div class="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,transparent,rgb(var(--color-background)_/_0.82))]"></div>
            <div class="relative z-10 flex items-start justify-between gap-5 p-8">
              <button @click="closeDetail" class="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-background/35 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary shadow-panel transition-colors hover:bg-primary/10">
                <span class="material-symbols-outlined text-base">arrow_back</span>
                Back To Logs
              </button>
              <div v-if="!publicView" class="flex gap-2">
                <button @click="openDiveEditor(dive.id)" aria-label="Edit dive" title="Edit dive" class="group inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-background/35 text-secondary transition-colors hover:bg-primary/10 hover:text-primary">
                  <span class="material-symbols-outlined text-[21px] leading-none transition-transform group-hover:-rotate-6 group-hover:scale-110">edit</span>
                </button>
                <button @click="removeDive()" :disabled="isDeleting" aria-label="Remove dive" title="Remove dive" class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-error/20 bg-error-container/15 text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
                  <span class="material-symbols-outlined text-[21px] leading-none">delete</span>
                </button>
              </div>
            </div>

            <div class="absolute bottom-8 left-8 right-8 z-10">
              <div class="flex flex-wrap items-center gap-3 font-label text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                <span class="rounded bg-background/55 px-2 py-1 text-on-surface">{{ formatDate(dive.started_at) }}</span>
                <span class="h-1 w-1 rounded-full bg-tertiary"></span>
                <span>{{ formatTime(dive.started_at) }}</span>
                <span class="h-1 w-1 rounded-full bg-tertiary"></span>
                <span>{{ importSourceLabel }}</span>
              </div>
              <h3 class="mt-3 max-w-5xl font-headline text-5xl font-bold leading-[0.95] tracking-tight text-on-surface xl:text-6xl">{{ diveSiteTitle(dive) }}</h3>
              <div class="mt-5 flex flex-wrap gap-10">
                <div v-for="metric in heroMetricTiles" :key="'hero-metric-' + metric.label" class="min-w-[7rem]">
                  <p class="font-label text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{{ metric.label }}</p>
                  <p class="mt-1 font-headline text-2xl font-bold text-on-surface">{{ metric.value }}<span class="ml-1 text-sm text-on-surface-variant">{{ metric.unit }}</span></p>
                </div>
              </div>
            </div>
          </header>

          <div class="grid grid-cols-12 gap-6">
            <main class="col-span-12 space-y-6 xl:col-span-8">
              <section v-if="hasLogbookMetadata" class="rounded-[1.5rem] border border-primary/10 bg-surface-container-low/82 p-6 shadow-panel">
                <div class="mb-6 flex items-center justify-between gap-4">
                  <h4 class="flex items-center gap-3 font-headline text-xl font-bold">
                    <span class="material-symbols-outlined text-primary">assignment</span>
                    Logbook Details
                  </h4>
                  <p v-if="weatherSummary" class="max-w-sm truncate text-xs text-on-surface-variant">{{ weatherSummary }}</p>
                  <span class="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">{{ logbookMetadata.length }} fields</span>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <article v-for="item in logbookMetadata" :key="'desktop-logbook-' + item.key" class="rounded-xl bg-surface-container-high/70 p-4">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-2xl text-primary">{{ item.icon }}</span>
                      <div class="min-w-0">
                        <p class="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-secondary">{{ item.label }}</p>
                        <p class="mt-1 block min-h-5 text-sm font-bold leading-5 text-on-surface">{{ item.value }}</p>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              <section class="overflow-hidden rounded-[1.5rem] border border-primary/10 bg-surface-container-low/80 shadow-panel">
                <div v-if="mapPreview" class="relative min-h-[20rem]">
                  <img :src="mapPreview.imageUrl" alt="" class="absolute inset-0 h-full w-full object-cover opacity-95" />
                  <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,21,37,0.06)_0%,rgba(0,21,37,0.08)_38%,rgb(var(--color-background)_/_0.82)_100%),radial-gradient(circle_at_center,rgb(var(--color-primary)_/_0.16),transparent_17rem)]"></div>
                  <div class="absolute -translate-x-1/2 -translate-y-1/2" :style="{ left: mapPreview.imageMarkerLeft, top: mapPreview.imageMarkerTop }">
                    <span class="relative flex h-16 w-16 items-center justify-center">
                      <span class="absolute h-full w-full rounded-full bg-tertiary/20 ring-1 ring-tertiary/40"></span>
                      <span class="relative flex h-5 w-5 items-center justify-center rounded-full bg-tertiary shadow-[0_0_22px_rgb(var(--color-tertiary)_/_0.7)]">
                        <span class="h-2 w-2 rounded-full bg-on-tertiary"></span>
                      </span>
                    </span>
                  </div>
                  <div class="absolute bottom-6 left-6 right-6">
                    <p class="flex items-center gap-2 text-lg font-bold text-on-surface">
                      <span class="material-symbols-outlined text-primary">explore</span>
                      {{ diveSiteTitle(dive) }}
                    </p>
                    <p class="mt-2 text-sm text-on-surface-variant">Dive site navigation grid</p>
                  </div>
                </div>
                <div v-else class="relative flex min-h-[20rem] flex-col justify-end overflow-hidden p-6">
                  <div class="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-surface-container-high)_/_0.7),rgb(var(--color-surface-container-low)_/_0.9)),radial-gradient(circle_at_70%_25%,rgb(var(--color-primary)_/_0.18),transparent_18rem)]"></div>
                  <div class="absolute inset-0 technical-grid opacity-[0.12]"></div>
                  <div class="relative">
                    <p class="flex items-center gap-2 text-lg font-bold text-on-surface">
                      <span class="material-symbols-outlined text-primary">explore</span>
                      {{ diveSiteTitle(dive) }}
                    </p>
                    <p class="mt-2 text-sm text-on-surface-variant">No coordinates are available for this dive or its saved dive site yet.</p>
                  </div>
                </div>
              </section>
            </main>

            <aside class="col-span-12 space-y-6 xl:col-span-4">
              <section class="rounded-[1.5rem] border border-primary/10 bg-surface-container-low/82 p-6 shadow-panel">
                <h4 class="font-label text-sm font-bold uppercase tracking-[0.22em] text-on-surface">Technical Telemetry</h4>
                <div class="mt-5 divide-y divide-primary/10">
                  <article v-for="card in diveSystemCards" :key="'system-' + card.label" class="py-5 first:pt-0 last:pb-0">
                    <div class="mb-3 flex items-center justify-between gap-4">
                      <span class="material-symbols-outlined text-xl text-primary">{{ card.icon }}</span>
                      <span class="material-symbols-outlined text-xl text-on-surface-variant/35">tune</span>
                    </div>
                    <p class="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ card.label }}</p>
                    <p class="mt-2 font-headline text-2xl font-bold text-on-surface">{{ card.value }}</p>
                    <p class="mt-1 text-xs text-on-surface-variant">{{ card.detail }}</p>
                  </article>
                </div>
              </section>

            </aside>

            <section class="col-span-12 pt-8">
              <div class="mb-5 flex items-center justify-between">
                <h4 class="font-headline text-xl font-bold">Equipment Setup</h4>
                <span class="font-label text-xs font-bold uppercase tracking-[0.16em] text-primary">View Config</span>
              </div>
              <div class="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
                <article v-for="item in equipmentItems" :key="item.category + '-' + item.label" class="flex items-center gap-4 rounded-xl border border-primary/10 bg-surface-container-low/75 p-4">
                  <span class="material-symbols-outlined flex h-11 w-11 items-center justify-center rounded-lg bg-surface-container-high text-primary">{{ item.icon }}</span>
                  <div class="min-w-0">
                    <p class="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.category }}</p>
                    <p class="truncate text-sm font-bold text-on-surface">{{ item.label }}</p>
                  </div>
                </article>
              </div>
            </section>
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

import { buildDiveSequenceMap, depthChartPath, pressureChartPath, numberOrZero, depthSeries, axisTicks, pressureRange, pressureSeries, profileTimeLabels, checkpointCards, detailEquipmentTags, pressureRangeLabel, diveModeLabel, diveTitle, formatDate, formatTime, formatDepth, formatDepthNumber, formatTemperature, durationShort, gasMixLabel, primaryGasMix, primaryTank, tankLabel, surfaceTemperature, depthParts, durationParts, temperatureParts, averageDepthValue, importDraftSeed, paddedDiveIndex } from "../core.js";

const PROFILE_CHART_WIDTH = 800;
const PROFILE_CHART_HEIGHT = 250;
const PROFILE_CHART_PADDING = 10;

export default {
  name: "DiveDetailView",
  props: ["dive", "allDives", "deletingDiveId", "closeDetail", "openDiveEditor", "deleteDive", "publicView"],
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
    equipmentTags() {
      return detailEquipmentTags(this.dive);
    },
    pressureRangeText() {
      return pressureRangeLabel(this.dive);
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
                <button v-if="!publicView" @click="removeDive()" :disabled="isDeleting" class="inline-flex items-center gap-2 rounded-lg bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container disabled:opacity-50">
                  <span class="material-symbols-outlined text-sm">delete</span>
                  {{ isDeleting ? 'Removing...' : 'Remove' }}
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

          <section class="space-y-4">
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

        </section>

        <section class="hidden space-y-8 md:block">
        <header class="space-y-6">
          <div class="flex flex-wrap items-center gap-3">
            <button @click="closeDetail" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary shadow-panel">
              <span class="material-symbols-outlined text-base">arrow_back</span>
              Back To Logs
            </button>
            <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Dive: {{ displayDiveIndex }}</span>
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</span>
            </div>
            <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h3 class="font-headline text-4xl font-bold tracking-tight text-on-surface md:text-5xl">{{ diveSiteTitle(dive) }}</h3>
              <div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-secondary">
                <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Imported {{ formatDate(dive.imported_at) }}</span>
              </div>
              </div>
            <div v-if="!publicView" class="flex flex-wrap gap-3">
              <button class="bg-surface-container-high p-3 text-secondary transition-colors hover:text-primary">
                <span class="material-symbols-outlined">share</span>
              </button>
              <button @click="openDiveEditor(dive.id)" class="bg-surface-container-high p-3 text-secondary transition-colors hover:text-primary">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button @click="removeDive()" :disabled="isDeleting" class="inline-flex items-center gap-2 bg-error-container/20 px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
                <span class="material-symbols-outlined text-sm">delete</span>
                {{ isDeleting ? 'Removing...' : 'Remove Dive' }}
              </button>
              <button class="inline-flex items-center gap-2 bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
                <span class="material-symbols-outlined">download</span>
                Export PDF
              </button>
            </div>
          </div>
        </header>

        <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Duration</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ durationParts(dive.duration_seconds).value }}<span class="ml-0.5 text-on-surface">{{ durationParts(dive.duration_seconds).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Max Depth</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ depthParts(dive.max_depth_m).value }}<span class="ml-0.5 text-on-surface">{{ depthParts(dive.max_depth_m).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Avg Depth</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ depthParts(averageDepth).value }}<span class="ml-0.5 text-on-surface">{{ depthParts(averageDepth).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Temperature</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ temperatureParts(surfaceTemperature(dive)).value }}<span class="ml-0.5 text-on-surface">{{ temperatureParts(surfaceTemperature(dive)).unit }}</span></p>
          </div>
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Pressure</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ pressureRangeText.replace(' bar', '') }}<span v-if="pressureRangeText !== '--'" class="ml-1 text-on-surface">bar</span></p>
          </div>
          <div class="rounded-[1.2rem] border border-primary/10 bg-surface-container-high p-5 shadow-[inset_0_1px_0_rgba(205,229,255,0.03)]">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Samples</p>
            <p class="mt-2 font-headline text-3xl font-bold text-on-surface">{{ dive.sample_count }}</p>
          </div>
        </div>

        <div class="grid grid-cols-12 gap-6">
          <section class="col-span-12 rounded-[1.5rem] bg-surface-container-high p-6">
            <div class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h4 class="font-headline text-lg font-bold">Dive Profile</h4>
              <div class="flex flex-wrap gap-4">
                <div class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-primary"></span><span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Depth (m)</span></div>
                <div v-if="hasPressureProfile" class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-tertiary"></span><span class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Air (bar)</span></div>
              </div>
            </div>
            <div class="min-h-[360px]">
              <div class="grid grid-cols-[auto_1fr_auto] gap-4">
                <div class="relative h-[320px] w-12 text-right">
                  <span
                    v-for="(label, index) in depthAxisLabels"
                    :key="'depth-' + label"
                    class="absolute right-0 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary -translate-y-1/2"
                    :style="profileAxisTickStyle(index)"
                  >{{ label }}</span>
                </div>
                <div class="relative h-[320px]">
                  <svg class="h-[320px] w-full" viewBox="0 0 800 250" preserveAspectRatio="none">
                    <line x1="0" x2="800" y1="10" y2="10" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <line x1="0" x2="800" y1="56" y2="56" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <line x1="0" x2="800" y1="102" y2="102" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <line x1="0" x2="800" y1="148" y2="148" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <line x1="0" x2="800" y1="194" y2="194" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <line x1="0" x2="800" y1="240" y2="240" stroke="#c1c7d1" stroke-width="1" stroke-dasharray="4" opacity="0.25"></line>
                    <path :d="depthProfile.area" :fill="'url(#' + gradientId + ')'" opacity="0.95"></path>
                    <path :d="depthProfile.line" fill="none" stroke="#12629d" stroke-width="3" stroke-linejoin="round"></path>
                    <path v-if="hasPressureProfile" :d="pressureProfile" fill="none" stroke="#FFB77D" stroke-width="2.5" stroke-dasharray="6"></path>
                    <line v-if="profileHover" :x1="profileHover.x" :x2="profileHover.x" y1="10" y2="240" stroke="#d9ecff" stroke-width="1.5" stroke-dasharray="4" opacity="0.5"></line>
                    <circle v-if="profileHover" :cx="profileHover.x" :cy="profileHover.depthY" r="5" fill="#9CCAFF" stroke="#0b2940" stroke-width="2.5"></circle>
                    <circle v-if="hasPressureProfile && profileHover && profileHover.pressureY !== null" :cx="profileHover.x" :cy="profileHover.pressureY" r="5" fill="#FFB77D" stroke="#0b2940" stroke-width="2.5"></circle>
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
                        <stop offset="0%" stop-color="#80bdfe" stop-opacity="0.36"></stop>
                        <stop offset="100%" stop-color="#80bdfe" stop-opacity="0"></stop>
                      </linearGradient>
                    </defs>
                  </svg>
                  <div
                    v-if="profileHover"
                    class="pointer-events-none absolute z-10 min-w-[9.5rem] rounded-xl border border-primary/18 bg-background/92 px-3 py-2 text-left shadow-[0_16px_34px_rgba(0,0,0,0.34)] backdrop-blur-sm"
                    :style="profileHoverTooltipStyle"
                  >
                    <p class="font-label text-[8px] font-bold uppercase tracking-[0.16em] text-secondary">{{ profileHover.timeLabel }}</p>
                    <p class="mt-1 text-sm font-semibold text-primary">Depth: {{ profileHover.depthLabel }}</p>
                    <p v-if="profileHover.pressureLabel" class="mt-1 text-sm font-semibold text-tertiary">Air: {{ profileHover.pressureLabel }}</p>
                  </div>
                </div>
                <div class="relative h-[320px] w-14">
                  <span
                    v-if="hasPressureProfile"
                    v-for="(label, index) in pressureAxisLabels"
                    :key="'pressure-' + label"
                    class="absolute left-0 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary -translate-y-1/2"
                    :style="profileAxisTickStyle(index)"
                  >{{ label }}</span>
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

          <section class="col-span-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
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

            <section class="rounded-[1.5rem] bg-surface-container-low p-6">
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

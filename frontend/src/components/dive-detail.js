import { depthChartPath, pressureChartPath, numberOrZero, depthSeries, axisTicks, pressureRange, pressureSeries, profileTimeLabels, checkpointCards, diveNarrative, detailEquipmentTags, pressureRangeLabel, sacRate, oxygenToxicityPercent, diveModeLabel, diveTitle, formatDate, formatTime, formatDateTime, formatDepth, formatDepthNumber, formatTemperature, durationShort, gasMixLabel, primaryGasMix, primaryTank, tankLabel, surfaceTemperature, decoStatusLabel, shortFingerprint, formatDataSize, depthParts, durationParts, temperatureParts, averageDepthValue } from "../core.js";

export default {
  name: "DiveDetailView",
  props: ["dive", "deletingDiveId", "closeDetail", "openDiveEditor", "deleteDive"],
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
    },
    averageDepth() {
      return averageDepthValue(this.dive);
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
                <button @click="removeDive()" :disabled="isDeleting" class="inline-flex items-center gap-2 rounded-lg bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container disabled:opacity-50">
                  <span class="material-symbols-outlined text-sm">delete</span>
                  {{ isDeleting ? 'Removing...' : 'Remove' }}
                </button>
                <span class="rounded bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive ID {{ dive.id }}</span>
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
            <p class="mt-2 font-headline text-3xl font-bold text-secondary">{{ depthParts(averageDepth).value }}<span class="ml-0.5 text-primary">{{ depthParts(averageDepth).unit }}</span></p>
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

import { dayOfMonth, monthShort, formatDate, diveTitle, diveSubtitle, formatDepth, formatDepthNumber, formatDateTime, durationShort, formatTemperature, surfaceTemperature, profileBars, diveModeLabel, pressureUsedLabel, decoStatusLabel, formatAccumulatedDuration, formatBarTotal, filledIconStyle, numberOrZero, oxygenToxicityPercent } from "../core.js";

export default {
  name: "DashboardView",
  props: ["dives", "stats", "setView", "backendHealthy", "openDive", "currentUserName"],
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
    },
    dashboardUserName() {
      return this.currentUserName || "Diver";
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
            <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight">Diver: <span class="text-primary">{{ dashboardUserName }}</span></h3>
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


import { formatDate, numberOrZero, parseDate, formatTime, formatDepth, formatTemperature, durationShort, surfaceTemperature, diveTitle, pressureUsedLabel, importDraftSeed } from "../core.js";

export default {
  name: "LogsView",
  props: ["dives", "searchText", "openDive", "openImportQueue", "setSearchText", "statusMessage", "errorMessage"],
  data() {
    return {
      sortOption: "newest",
      deviceFilter: "all",
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
    }
  },
  computed: {
    deviceOptions() {
      return [...new Set(this.dives.map((dive) => `${dive.vendor} ${dive.product}`))];
    },
    filteredDives() {
      const search = (this.searchText || "").toLowerCase();
      const filtered = this.dives.filter((dive) => {
        const device = `${dive.vendor} ${dive.product}`;
        const site = this.diveSiteLabel(dive);
        const matchesSearch = !search || [
          device,
          site,
          dive.vendor,
          dive.product,
          dive.raw_sha256,
          formatDate(dive.started_at)
        ].join(" ").toLowerCase().includes(search);
        const matchesDevice = this.deviceFilter === "all" || device === this.deviceFilter;
        return matchesSearch && matchesDevice;
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
    diveTitle,
    pressureUsedLabel,
    diveSiteLabel(dive) {
      const site = typeof importDraftSeed(dive)?.site === "string" ? importDraftSeed(dive).site.trim() : "";
      return site || "Site pending";
    },
    diveComputerLabel(dive) {
      const product = typeof dive?.product === "string" ? dive.product.trim() : "";
      return product || "Unknown computer";
    },
    diveDeviceLabel(dive) {
      const vendor = typeof dive?.vendor === "string" ? dive.vendor.trim() : "";
      return vendor || "Unknown device";
    }
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div v-if="statusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ errorMessage }}</div>

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
                    <p class="mt-1 truncate text-sm text-secondary">{{ diveSiteLabel(dive) }}</p>
                  </div>
                  <span class="material-symbols-outlined text-sm text-on-surface-variant">chevron_right</span>
                </div>
                <div class="mt-4 grid grid-cols-3 gap-4">
                  <div class="flex flex-col">
                    <span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">Max Depth</span>
                    <span class="font-headline text-sm font-semibold text-primary">{{ formatDepth(dive.max_depth_m) }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">Duration</span>
                    <span class="font-headline text-sm font-semibold">{{ formatDurationShort(dive.duration_seconds) }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="font-label text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/60">Bar Used</span>
                    <span class="font-headline text-sm font-semibold text-tertiary">{{ pressureUsedLabel(dive) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="hidden space-y-8 md:block">
      <div v-if="statusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ statusMessage }}</div>
      <div v-if="errorMessage" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ errorMessage }}</div>

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
          <div class="col-span-1">Dive ID</div><div class="col-span-2">Date</div><div class="col-span-2">Dive Site</div><div class="col-span-1">Device</div><div class="col-span-2">Dive Computer</div><div class="col-span-1 text-center">Depth</div><div class="col-span-1 text-center">Duration</div><div class="col-span-1 text-center">Bar Used</div><div class="col-span-1 text-center">Temp</div>
        </div>
        <div class="divide-y divide-outline-variant/10">
          <article v-for="dive in pagedDives" :key="dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="grid cursor-pointer gap-4 px-5 py-6 text-left transition-colors hover:bg-surface-container-highest/30 focus:bg-surface-container-highest/30 focus:outline-none md:grid-cols-12 md:px-8">
            <div class="md:col-span-1"><p class="font-headline text-sm font-bold tracking-widest text-primary">#{{ dive.id }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-bold">{{ formatDate(dive.started_at) }}</p><p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{{ formatTime(dive.started_at) }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-extrabold">{{ diveSiteLabel(dive) }}</p></div>
            <div class="md:col-span-1"><p class="text-sm font-extrabold">{{ diveDeviceLabel(dive) }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-extrabold">{{ diveComputerLabel(dive) }}</p><p class="text-xs text-on-surface-variant">{{ diveTitle(dive) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-lg font-bold" :class="dive.max_depth_m > 40 ? 'text-tertiary' : 'text-on-surface'">{{ formatDepth(dive.max_depth_m) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-sm font-medium">{{ formatDurationShort(dive.duration_seconds) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="text-sm font-bold text-tertiary">{{ pressureUsedLabel(dive) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="text-sm font-bold text-secondary">{{ formatTemperature(surfaceTemperature(dive)) }}</p></div>
          </article>
          <div v-if="pagedDives.length === 0" class="px-8 py-16 text-center">
            <p class="font-headline text-2xl font-bold">No dives match the current filters</p>
            <p class="mt-2 text-on-surface-variant">Change the search or device filters, or complete imported dives before they enter the logbook.</p>
            <button @click="openImportQueue()" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
              Open Imported Queue
            </button>
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

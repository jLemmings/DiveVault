import { buildDiveSequenceMap, formatDate, numberOrZero, parseDate, formatTime, formatDepth, formatTemperature, durationShort, surfaceTemperature, diveTitle, pressureUsedLabel, importDraftSeed, paddedDiveIndex } from "../core.js";
import { diveMapPreview } from "../map-preview.js";

export default {
  name: "LogsView",
  props: ["dives", "diveSites", "logbookDisplayFields", "searchText", "openDive", "openImportQueue", "openManualDive", "setSearchText", "statusMessage", "errorMessage"],
  data() {
    return {
      sortKey: "date",
      sortDirection: "desc",
      mobileControlsOpen: false,
      currentPage: 1,
      pageSize: 10,
      pageSizeOptions: [5, 10, 20, 50]
    };
  },
  watch: {
    searchText() {
      this.currentPage = 1;
    },
    sortKey() {
      this.currentPage = 1;
    },
    sortDirection() {
      this.currentPage = 1;
    },
    pageSize() {
      this.currentPage = 1;
    }
  },
  computed: {
    diveSequenceMap() {
      return buildDiveSequenceMap(this.dives);
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
        return matchesSearch;
      });
      const sorted = [...filtered];
      sorted.sort((left, right) => {
        const direction = this.sortDirection === "asc" ? 1 : -1;
        const comparison = this.compareDives(left, right);
        if (comparison !== 0) return comparison * direction;
        return (numberOrZero(left.id) - numberOrZero(right.id)) * direction;
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
    paginationLabel() {
      if (!this.filteredDives.length) return "0 dives";
      const start = (this.currentPage - 1) * this.pageSize + 1;
      const end = Math.min(this.currentPage * this.pageSize, this.filteredDives.length);
      return `${start}-${end} of ${this.filteredDives.length} dives`;
    },
    pageCountLabel() {
      return `${this.currentPage} / ${this.pageCount}`;
    },
    mobileSortOptions() {
      return [
        { key: "date", label: "Date" },
        { key: "id", label: "Dive Number" },
        { key: "depth", label: "Max Depth" },
        { key: "barUsed", label: "Bar Used" }
      ];
    },
    activeSortLabel() {
      return this.mobileSortOptions.find((option) => option.key === this.sortKey)?.label || "Date";
    }
  },
  methods: {
    t(key, fallback = key, params = {}) {
      return typeof this.$t === "function" ? this.$t(key, fallback, params) : fallback;
    },
    optionalFieldConfig() {
      return [
        { key: "weather_description", label: this.t("Weather", "Weather") },
        { key: "visibility", label: this.t("Visibility", "Visibility") },
        { key: "wetsuit_description", label: this.t("Wetsuit", "Wetsuit") }
      ];
    },
    compareDives(left, right) {
      if (this.sortKey === "id") {
        const leftSequence = this.diveSequenceMap.get(String(left.id)) ?? numberOrZero(left.id);
        const rightSequence = this.diveSequenceMap.get(String(right.id)) ?? numberOrZero(right.id);
        return leftSequence - rightSequence;
      }
      if (this.sortKey === "depth") return numberOrZero(left.max_depth_m) - numberOrZero(right.max_depth_m);
      if (this.sortKey === "duration") return numberOrZero(left.duration_seconds) - numberOrZero(right.duration_seconds);
      if (this.sortKey === "barUsed") return this.barUsedValue(left) - this.barUsedValue(right);
      if (this.sortKey === "temp") return this.temperatureValue(left) - this.temperatureValue(right);
      if (this.sortKey === "site") return this.compareText(this.diveSiteLabel(left), this.diveSiteLabel(right));
      if (this.sortKey === "device") return this.compareText(this.diveDeviceLabel(left), this.diveDeviceLabel(right));
      if (this.sortKey === "computer") return this.compareText(this.diveComputerLabel(left), this.diveComputerLabel(right));
      const leftTime = parseDate(left.started_at)?.getTime() || 0;
      const rightTime = parseDate(right.started_at)?.getTime() || 0;
      return leftTime - rightTime;
    },
    compareText(left, right) {
      return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
    },
    barUsedValue(dive) {
      const label = pressureUsedLabel(dive);
      const match = /(\d+)/.exec(label);
      return match ? Number(match[1]) : -1;
    },
    temperatureValue(dive) {
      return numberOrZero(surfaceTemperature(dive));
    },
    toggleSort(key) {
      if (this.sortKey === key) {
        this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        return;
      }
      this.sortKey = key;
      this.sortDirection = ["date", "depth", "duration", "barUsed", "temp", "id"].includes(key) ? "desc" : "asc";
    },
    toggleMobileControls() {
      this.mobileControlsOpen = !this.mobileControlsOpen;
    },
    setMobileSort(key) {
      this.toggleSort(key);
      this.mobileControlsOpen = false;
    },
    sortIndicator(key) {
      if (this.sortKey !== key) return "unfold_more";
      return this.sortDirection === "asc" ? "arrow_upward" : "arrow_downward";
    },
    sortHeaderClass(key) {
      return this.sortKey === key ? "text-primary" : "text-secondary";
    },
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
    displayDiveIndex(dive) {
      return paddedDiveIndex(dive, this.diveSequenceMap);
    },
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
    },
    configuredLogbookMeta(dive) {
      const draft = importDraftSeed(dive);
      const enabled = Array.isArray(this.logbookDisplayFields) ? this.logbookDisplayFields : [];
      return this.optionalFieldConfig()
        .filter((item) => enabled.includes(item.key))
        .map((item) => ({ ...item, value: typeof draft?.[item.key] === "string" ? draft[item.key].trim() : "" }))
        .filter((item) => item.value);
    },
    diveMapPreview(dive) {
      return diveMapPreview(dive, this.diveSites);
    }
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div v-if="statusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ errorMessage }}</div>

        <div class="mb-2 flex gap-2">
          <div class="relative flex-1">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
            <input :value="searchText" @input="setSearchText($event.target.value)" type="text" class="w-full rounded-lg border-none bg-surface-container-high py-2.5 pl-10 pr-4 text-sm font-label tracking-[0.12em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20" placeholder="Search Logs..." />
          </div>
          <button @click="toggleMobileControls" class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container-high active:scale-95" :class="mobileControlsOpen ? 'text-primary' : 'text-on-surface-variant'">
            <span class="material-symbols-outlined">{{ mobileControlsOpen ? 'close' : 'filter_list' }}</span>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button @click="openManualDive()" class="rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
            New Entry
          </button>
          <button @click="openImportQueue()" class="rounded-lg bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Imported Queue
          </button>
        </div>

        <div v-if="mobileControlsOpen" class="space-y-4 rounded-xl bg-surface-container-low px-4 py-4 shadow-panel">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Order By</p>
              <p class="mt-1 text-sm font-semibold text-on-surface">{{ activeSortLabel }} · {{ sortDirection === 'asc' ? 'Ascending' : 'Descending' }}</p>
            </div>
            <button
              type="button"
              @click="toggleSort(sortKey)"
              class="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              <span class="material-symbols-outlined text-sm">{{ sortDirection === 'asc' ? 'north' : 'south' }}</span>
              {{ sortDirection === 'asc' ? 'Asc' : 'Desc' }}
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="option in mobileSortOptions"
              :key="'mobile-sort-' + option.key"
              type="button"
              @click="setMobileSort(option.key)"
              class="rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors"
              :class="sortKey === option.key ? 'bg-primary/12 text-primary' : 'bg-surface-container-high text-on-surface-variant'"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="space-y-4">
          <article v-for="dive in pagedDives" :key="'mobile-log-' + dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="rounded-xl bg-surface-container-low p-4 transition-all active:scale-[0.98] focus:bg-surface-container-high focus:outline-none">
            <div class="flex gap-4">
              <div class="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded bg-surface-container-high">
                <template v-if="diveMapPreview(dive)">
                  <img :src="diveMapPreview(dive).tileUrl" alt="" class="h-full w-full object-cover opacity-90" />
                  <div class="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent"></div>
                  <span class="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_12px_rgba(156,202,255,0.8)]" :style="{ left: diveMapPreview(dive).markerLeft, top: diveMapPreview(dive).markerTop }"></span>
                  <span class="absolute bottom-1 left-1 right-1 rounded bg-background/72 px-1 py-0.5 text-center font-label text-[9px] font-bold text-primary">{{ displayDiveIndex(dive) }}</span>
                </template>
                <template v-else>
                  <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle at 2px 2px, #9ccaff 1px, transparent 0); background-size: 8px 8px;"></div>
                  <div class="flex h-full flex-col items-center justify-center">
                    <span class="z-10 font-label text-[10px] font-bold uppercase text-on-surface-variant/70">ID</span>
                    <span class="z-10 font-headline text-xl font-bold text-primary">{{ displayDiveIndex(dive) }}</span>
                  </div>
                </template>
              </div>
              <div class="flex min-w-0 flex-1 flex-col justify-between py-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-headline text-lg font-bold tracking-tight">{{ diveSiteLabel(dive) }}</h3>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</p>
                    <p class="mt-1 truncate text-sm text-secondary">{{ diveDeviceLabel(dive) }} / {{ diveComputerLabel(dive) }}</p>
                    <div v-if="configuredLogbookMeta(dive).length" class="mt-2 flex flex-wrap gap-2">
                      <span v-for="item in configuredLogbookMeta(dive)" :key="'mobile-meta-' + dive.id + '-' + item.key" class="rounded-full bg-surface-container-high px-2.5 py-1 font-label text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{{ item.label }}: {{ item.value }}</span>
                    </div>
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

        <div class="rounded-xl bg-surface-container-low px-4 py-3">
          <label class="flex items-center justify-between gap-4">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Dives Per Page</span>
            <select v-model.number="pageSize" class="rounded-lg border-none bg-surface-container-high px-3 py-2 text-sm font-bold text-on-surface focus:ring-1 focus:ring-primary/20">
              <option v-for="size in pageSizeOptions" :key="'mobile-page-size-' + size" :value="size">{{ size }}</option>
            </select>
          </label>
        </div>

        <div class="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{{ paginationLabel }}</p>
            <p class="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Page {{ pageCountLabel }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="previousPage"
              :disabled="currentPage === 1"
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-colors hover:text-primary disabled:opacity-30"
            >
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <span class="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ currentPage }}</span>
            <button
              type="button"
              @click="nextPage"
              :disabled="currentPage >= pageCount"
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-colors hover:text-primary disabled:opacity-30"
            >
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
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
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative min-w-[18rem] flex-1 sm:w-[24rem] sm:flex-none">
            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
            <input
              :value="searchText"
              @input="setSearchText($event.target.value)"
              type="text"
              class="w-full bg-surface-container-high py-3 pl-12 pr-4 text-sm font-label tracking-[0.12em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20"
              placeholder="Search dive logs..."
            />
          </div>
          <button @click="openManualDive()" class="flex items-center gap-2 bg-primary px-6 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
            <span class="material-symbols-outlined text-sm">add</span>
            New Entry
          </button>
        </div>
      </div>
      <div class="overflow-hidden bg-surface-container-low shadow-panel">
        <div class="hidden grid-cols-12 gap-4 bg-surface-container-high/50 px-8 py-4 font-label text-[11px] font-extrabold uppercase tracking-[0.2em] text-secondary md:grid">
          <button type="button" @click="toggleSort('id')" class="col-span-1 flex items-center gap-1 bg-transparent p-0 text-left transition-colors hover:text-primary" :class="sortHeaderClass('id')"><span>Dive ID</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('id') }}</span></button>
          <button type="button" @click="toggleSort('date')" class="col-span-2 flex items-center gap-1 bg-transparent p-0 text-left transition-colors hover:text-primary" :class="sortHeaderClass('date')"><span>Date</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('date') }}</span></button>
          <button type="button" @click="toggleSort('site')" class="col-span-2 flex items-center gap-1 bg-transparent p-0 text-left transition-colors hover:text-primary" :class="sortHeaderClass('site')"><span>Dive Site</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('site') }}</span></button>
          <button type="button" @click="toggleSort('device')" class="col-span-1 flex items-center gap-1 bg-transparent p-0 text-left transition-colors hover:text-primary" :class="sortHeaderClass('device')"><span>Device</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('device') }}</span></button>
          <button type="button" @click="toggleSort('computer')" class="col-span-2 flex items-center gap-1 bg-transparent p-0 text-left transition-colors hover:text-primary" :class="sortHeaderClass('computer')"><span>Dive Computer</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('computer') }}</span></button>
          <button type="button" @click="toggleSort('depth')" class="col-span-1 flex items-center justify-center gap-1 bg-transparent p-0 text-center transition-colors hover:text-primary" :class="sortHeaderClass('depth')"><span>Depth</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('depth') }}</span></button>
          <button type="button" @click="toggleSort('duration')" class="col-span-1 flex items-center justify-center gap-1 bg-transparent p-0 text-center transition-colors hover:text-primary" :class="sortHeaderClass('duration')"><span>Duration</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('duration') }}</span></button>
          <button type="button" @click="toggleSort('barUsed')" class="col-span-1 flex items-center justify-center gap-1 bg-transparent p-0 text-center transition-colors hover:text-primary" :class="sortHeaderClass('barUsed')"><span>Bar Used</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('barUsed') }}</span></button>
          <button type="button" @click="toggleSort('temp')" class="col-span-1 flex items-center justify-center gap-1 bg-transparent p-0 text-center transition-colors hover:text-primary" :class="sortHeaderClass('temp')"><span>Temp</span><span class="material-symbols-outlined text-sm">{{ sortIndicator('temp') }}</span></button>
        </div>
        <div class="divide-y divide-outline-variant/10">
          <article v-for="dive in pagedDives" :key="dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="grid cursor-pointer gap-4 px-5 py-6 text-left transition-colors hover:bg-surface-container-highest/30 focus:bg-surface-container-highest/30 focus:outline-none md:grid-cols-12 md:px-8">
            <div class="md:col-span-1"><p class="font-headline text-sm font-bold tracking-widest text-primary">{{ displayDiveIndex(dive) }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-bold">{{ formatDate(dive.started_at) }}</p><p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{{ formatTime(dive.started_at) }}</p></div>
            <div class="md:col-span-2">
              <p class="text-sm font-extrabold">{{ diveSiteLabel(dive) }}</p>
              <div v-if="configuredLogbookMeta(dive).length" class="mt-2 space-y-1">
                <p v-for="item in configuredLogbookMeta(dive)" :key="'desktop-meta-' + dive.id + '-' + item.key" class="text-xs text-on-surface-variant"><span class="font-semibold text-secondary">{{ item.label }}:</span> {{ item.value }}</p>
              </div>
            </div>
            <div class="md:col-span-1"><p class="text-sm font-extrabold">{{ diveDeviceLabel(dive) }}</p></div>
            <div class="md:col-span-2"><p class="text-sm font-extrabold">{{ diveComputerLabel(dive) }}</p><p class="text-xs text-on-surface-variant">{{ diveTitle(dive) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-lg font-bold" :class="dive.max_depth_m > 40 ? 'text-tertiary' : 'text-on-surface'">{{ formatDepth(dive.max_depth_m) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="font-headline text-sm font-medium">{{ formatDurationShort(dive.duration_seconds) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="text-sm font-bold text-tertiary">{{ pressureUsedLabel(dive) }}</p></div>
            <div class="md:col-span-1 md:text-center"><p class="text-sm font-bold text-secondary">{{ formatTemperature(surfaceTemperature(dive)) }}</p></div>
          </article>
          <div v-if="pagedDives.length === 0" class="px-8 py-16 text-center">
            <p class="font-headline text-2xl font-bold">No dives match the current filters</p>
            <p class="mt-2 text-on-surface-variant">Change the search or complete imported dives before they enter the logbook.</p>
            <button @click="openImportQueue()" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
              Open Imported Queue
            </button>
          </div>
        </div>
        <div class="flex flex-col items-center justify-between gap-4 bg-surface-container-high/30 px-8 py-6 md:flex-row">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Displaying {{ paginationLabel }}</p>
            <p class="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Page {{ pageCountLabel }}</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-3 bg-surface-container-high px-4 py-2 text-sm font-bold text-on-surface">
              <span>Dives Per Page</span>
              <select v-model.number="pageSize" class="border-none bg-transparent p-0 pr-6 text-sm font-bold text-on-surface focus:ring-0">
                <option v-for="size in pageSizeOptions" :key="'desktop-page-size-' + size" :value="size">{{ size }}</option>
              </select>
            </label>
          </div>
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

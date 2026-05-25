import { buildDiveSequenceMap, formatDate, numberOrZero, parseDate, formatTime, formatDepth, formatTemperature, durationShort, surfaceTemperature, diveTitle, diveDeviceLabel, pressureUsedLabel, importDraftSeed, paddedDiveIndex } from "../core.js";
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
        const device = diveDeviceLabel(dive);
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
        { key: "buddy", label: this.t("Buddy", "Buddy"), icon: "diversity_3" },
        { key: "guide", label: this.t("Guide", "Guide"), icon: "badge" },
        { key: "weather_description", label: this.t("Weather", "Weather"), icon: "partly_cloudy_day" },
        { key: "visibility", label: this.t("Visibility", "Visibility"), icon: "visibility" },
        { key: "wetsuit_description", label: this.t("Suit", "Suit"), icon: "checkroom" },
        { key: "weight_description", label: this.t("Weights", "Weights"), icon: "fitness_center" },
        { key: "notes", label: this.t("Notes", "Notes"), icon: "notes" }
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
    pressureUsedTableLabel(dive) {
      return pressureUsedLabel(dive).replace(/\s+used$/i, "");
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
      if (diveDeviceLabel(dive) === "Manual Entry") return "Manual Entry";
      const product = typeof dive?.product === "string" ? dive.product.trim() : "";
      return product || "Unknown computer";
    },
    diveDeviceLabel,
    configuredLogbookMeta(dive) {
      const draft = importDraftSeed(dive);
      return this.optionalFieldConfig()
        .map((item) => ({ ...item, value: typeof draft?.[item.key] === "string" ? draft[item.key].trim() : "" }))
        .filter((item) => item.value);
    },
    diveMapPreview(dive) {
      return diveMapPreview(dive, this.diveSites);
    }
  },
  template: `
    <section class="dashboard-command-center text-on-surface">
      <section class="space-y-6 md:hidden">
        <div v-if="statusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ errorMessage }}</div>

        <div class="dashboard-glass-card p-4">
        <div class="flex gap-2">
          <div class="relative flex-1">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
            <input :value="searchText" @input="setSearchText($event.target.value)" type="text" class="w-full rounded-lg border border-primary/10 bg-surface-container-high/70 py-2.5 pl-10 pr-4 text-sm font-label tracking-[0.12em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20" placeholder="Search Logs..." />
          </div>
          <button @click="toggleMobileControls" class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-surface-container-high/70 active:scale-95" :class="mobileControlsOpen ? 'text-primary' : 'text-on-surface-variant'">
            <span class="material-symbols-outlined">{{ mobileControlsOpen ? 'close' : 'filter_list' }}</span>
          </button>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <button @click="openManualDive()" class="rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
            New Entry
          </button>
          <button @click="openImportQueue()" class="rounded-lg bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Imported Queue
          </button>
        </div>
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
          <article v-for="dive in pagedDives" :key="'mobile-log-' + dive.id" @click="openDive(dive.id)" @keyup.enter="openDive(dive.id)" tabindex="0" role="button" class="log-dive-card p-4 transition-all active:scale-[0.98] focus:outline-none">
            <div>
              <div class="flex min-w-0 flex-1 flex-col justify-between">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-headline text-lg font-bold tracking-tight">{{ diveSiteLabel(dive) }}</h3>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }} | {{ formatTime(dive.started_at) }}</p>
                    <p class="mt-1 truncate text-sm text-secondary">{{ diveDeviceLabel(dive) }} / {{ diveComputerLabel(dive) }}</p>
                    <div v-if="configuredLogbookMeta(dive).length" class="mt-2 flex flex-wrap gap-2">
                      <span v-for="item in configuredLogbookMeta(dive)" :key="'mobile-meta-' + dive.id + '-' + item.key" class="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 font-label text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                        <span class="material-symbols-outlined text-[13px] leading-none">{{ item.icon }}</span>
                        <span class="truncate">{{ item.label }}: {{ item.value }}</span>
                      </span>
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
                    <span class="font-headline text-sm font-semibold">{{ pressureUsedTableLabel(dive) }}</span>
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

      <div class="flex flex-col justify-end gap-3 lg:flex-row lg:items-center">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative min-w-[18rem] flex-1 sm:w-[24rem] sm:flex-none">
            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
            <input
              :value="searchText"
              @input="setSearchText($event.target.value)"
              type="text"
              class="w-full rounded-xl border border-primary/10 bg-surface-container-high/70 py-3 pl-12 pr-4 text-sm font-label tracking-[0.12em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20"
              placeholder="Search dive logs..."
            />
          </div>
          <button @click="openManualDive()" class="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
            <span class="material-symbols-outlined text-sm">add</span>
            New Entry
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="flex flex-wrap gap-3">
          <button type="button" @click="toggleSort('date')" class="log-filter-chip" :class="sortHeaderClass('date')">
            <span class="material-symbols-outlined text-base">calendar_month</span>
            Date
            <span class="material-symbols-outlined text-sm">{{ sortIndicator('date') }}</span>
          </button>
          <button type="button" @click="toggleSort('depth')" class="log-filter-chip" :class="sortHeaderClass('depth')">
            <span class="material-symbols-outlined text-base">straighten</span>
            {{ t("Depth", "Depth") }}
            <span class="material-symbols-outlined text-sm">{{ sortIndicator('depth') }}</span>
          </button>
          <button type="button" @click="toggleSort('site')" class="log-filter-chip" :class="sortHeaderClass('site')">
            <span class="material-symbols-outlined text-base">location_on</span>
            Location
            <span class="material-symbols-outlined text-sm">{{ sortIndicator('site') }}</span>
          </button>
        </div>
        <p class="font-label text-sm font-bold tracking-[0.08em] text-on-surface-variant">Displaying {{ paginationLabel }}</p>
      </div>

      <div v-if="pagedDives.length" class="grid gap-6 xl:grid-cols-3">
        <article
          v-for="dive in pagedDives"
          :key="'desktop-card-' + dive.id"
          @click="openDive(dive.id)"
          @keyup.enter="openDive(dive.id)"
          tabindex="0"
          role="button"
          class="log-dive-card cursor-pointer p-5 transition-all hover:-translate-y-0.5 focus:-translate-y-0.5 focus:outline-none"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h3 class="truncate text-lg font-extrabold text-primary">{{ diveSiteLabel(dive) }}</h3>
              <p class="mt-1 font-label text-[11px] font-bold tracking-[0.14em] text-on-surface-variant">{{ formatDate(dive.started_at) }} &bull; {{ formatTime(dive.started_at) }}</p>
            </div>
            <p class="font-label text-[11px] font-bold tracking-[0.14em] text-on-surface">{{ displayDiveIndex(dive) }}</p>
          </div>

          <div class="mt-4 border-t border-outline-variant/18 pt-4">
            <div class="grid grid-cols-2 gap-x-6 gap-y-4">
              <div class="log-card-metric">
                <span class="material-symbols-outlined text-lg text-primary">straighten</span>
                <div>
                  <p>{{ t("Depth", "Depth") }}</p>
                  <strong>{{ formatDepth(dive.max_depth_m) }}</strong>
                </div>
              </div>
              <div class="log-card-metric">
                <span class="material-symbols-outlined text-lg text-primary">timer</span>
                <div>
                  <p>{{ t("Duration", "Duration") }}</p>
                  <strong>{{ formatDurationShort(dive.duration_seconds) }}</strong>
                </div>
              </div>
              <div class="log-card-metric">
                <span class="material-symbols-outlined text-lg text-secondary">thermometer</span>
                <div>
                  <p>{{ t("Temperature", "Temperature") }}</p>
                  <strong class="text-secondary">{{ formatTemperature(surfaceTemperature(dive)) }}</strong>
                </div>
              </div>
              <div class="log-card-metric">
                <span class="material-symbols-outlined text-lg" :class="barUsedValue(dive) > 180 ? 'text-tertiary' : 'text-primary'">air</span>
                <div>
                  <p>{{ t("Air", "Air") }}</p>
                  <strong :class="barUsedValue(dive) > 180 ? 'text-tertiary' : ''">{{ pressureUsedTableLabel(dive) }}</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between border-t border-outline-variant/18 pt-4">
            <div class="flex min-w-0 items-center gap-2 text-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-base">computer</span>
              <span class="truncate">{{ diveComputerLabel(dive) }}</span>
            </div>
            <div class="flex flex-wrap justify-end gap-1.5">
              <span v-for="item in configuredLogbookMeta(dive)" :key="'desktop-card-meta-' + dive.id + '-' + item.key" :title="item.label + ': ' + item.value" class="inline-flex max-w-[12rem] items-center gap-1 rounded bg-surface-container-high px-2 py-1 font-label text-[9px] font-bold uppercase tracking-[0.12em] text-secondary">
                <span class="material-symbols-outlined text-[13px] leading-none">{{ item.icon }}</span>
                <span class="truncate">{{ item.value }}</span>
              </span>
              <span v-if="dive.max_depth_m > 40" class="rounded bg-tertiary/14 px-2 py-1 font-label text-[9px] font-bold uppercase tracking-[0.12em] text-tertiary">Deep</span>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="log-empty-card px-8 py-16 text-center">
        <p class="font-headline text-2xl font-bold">No dives match the current filters</p>
        <p class="mt-2 text-on-surface-variant">Change the search or complete imported dives before they enter the logbook.</p>
        <button @click="openImportQueue()" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
          Open Imported Queue
        </button>
      </div>

      <div class="flex flex-col items-center justify-center gap-4 pt-6 md:flex-row">
        <button @click="previousPage" :disabled="currentPage === 1" class="log-page-button"><span class="material-symbols-outlined">chevron_left</span></button>
        <span class="font-label text-sm font-bold text-on-surface">Page {{ pageCountLabel }}</span>
        <button @click="nextPage" :disabled="currentPage >= pageCount" class="log-page-button"><span class="material-symbols-outlined">chevron_right</span></button>
        <label class="ml-0 flex items-center gap-3 rounded-lg border border-primary/12 bg-surface-container-high/55 px-4 py-2 text-sm font-bold text-on-surface md:ml-6">
          <span>Dives Per Page</span>
          <select v-model.number="pageSize" class="border-none bg-transparent p-0 pr-6 text-sm font-bold text-on-surface focus:ring-0">
            <option v-for="size in pageSizeOptions" :key="'desktop-page-size-' + size" :value="size">{{ size }}</option>
          </select>
        </label>
      </div>
      </section>
    </section>
  `
};

const { createApp } = Vue;
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

import { UserButton, useAuth, useUser } from "@clerk/vue";
import { filledIconStyle, importDraftSeed, isImportComplete, effectiveImportDraft, missingImportFields, paddedDiveIndex, isCommittedDive } from "./core.js";
import DashboardView from "./components/dashboard.js";
import DiveDetailView from "./components/dive-detail.js";
import DiveImportEditorView from "./components/import-edit.js";
import DiveImportView from "./components/imports.js";
import EquipmentView from "./components/equipment.js";
import LogbookEditorView from "./components/logbook-edit.js";
import LoginView from "./components/login.js";
import LogsView from "./components/logs.js";
import SettingsView from "./components/settings.js";

export default {
  name: "DiveVaultApp",
  components: {
    LoginView,
    DashboardView,
    LogsView,
    DiveImportView,
    DiveImportEditorView,
    LogbookEditorView,
    DiveDetailView,
    EquipmentView,
    SettingsView,
    UserButton
  },
  setup() {
    const { getToken, isLoaded, isSignedIn, sessionId, signOut } = useAuth();
    const { user } = useUser();

    return {
      clerkGetToken: getToken,
      clerkLoaded: isLoaded,
      clerkSessionId: sessionId,
      clerkSignOut: signOut,
      clerkSignedIn: isSignedIn,
      clerkUser: user
    };
  },
  data() {
    return {
      isAuthenticated: false,
      sessionEmail: "",
      activeView: "dashboard",
      selectedDiveId: null,
      selectedImportId: null,
      selectedEditDiveId: null,
      searchText: "",
      dives: [],
      importDrafts: {},
      savingImportId: null,
      bulkImportSavePending: false,
      importError: "",
      importStatusMessage: "",
      loading: true,
      error: "",
      backendHealthy: false,
      dashboardStats: {
        totalDives: 0,
        totalSeconds: 0,
        totalHours: 0,
        maxDepth: 0,
        totalBarConsumed: 0,
        averageDurationSeconds: 0,
        averageMaxDepth: 0,
        bottomTimeProgress: 0
      },
      lastAuthenticatedSessionId: null,
      requestTimeoutMs: 15000,
      cliAuthCode: "",
      filledIconStyle,
      navItems: [
        { id: "dashboard", label: "Dashboard", mobileLabel: "Dashboard", icon: "dashboard", mobileIcon: "dashboard", eyebrow: "Dive Overview", title: "Logbook" },
        { id: "logs", label: "Dive Logs", mobileLabel: "Logs", icon: "waves", mobileIcon: "sailing", eyebrow: "Dive Logs", title: "Dive Log Database" },
        { id: "equipment", label: "Equipment", mobileLabel: "Gear", icon: "scuba_diving", mobileIcon: "construction", eyebrow: "Asset Registry", title: "Equipment Management" },
        { id: "settings", label: "Settings", mobileLabel: "Settings", icon: "settings", mobileIcon: "settings", eyebrow: "System Configuration", title: "System Config" }
      ]
    };
  },
  watch: {
    clerkLoaded: {
      handler() {
        this.syncAuthState();
      },
      immediate: true
    },
    clerkSignedIn: {
      handler() {
        this.syncAuthState();
      },
      immediate: true
    },
    clerkSessionId() {
      this.syncAuthState();
    },
    clerkUser: {
      handler() {
        this.sessionEmail = this.currentUserEmail;
      },
      deep: true,
      immediate: true
    }
  },
  computed: {
    currentUserEmail() {
      return this.clerkUser?.primaryEmailAddress?.emailAddress
        || this.clerkUser?.emailAddresses?.[0]?.emailAddress
        || "";
    },
    currentUserName() {
      const firstName = this.clerkUser?.firstName?.trim() || "";
      const lastName = this.clerkUser?.lastName?.trim() || "";
      return [firstName, lastName].filter(Boolean).join(" ") || this.currentUserEmail || "Diver";
    },
    activeSection() {
      if (this.activeView === "edit" && this.selectedEditDive) {
        return { eyebrow: "Dive Archive", title: "Logbook Editor" };
      }
      if (this.activeView === "imports" && this.selectedImportDive) {
        return { eyebrow: "Synchronization Module", title: "Imported Dive Editor" };
      }
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
    selectedImportDive() {
      const dive = this.dives.find((entry) => String(entry.id) === String(this.selectedImportId)) || null;
      return dive && !isCommittedDive(dive) ? dive : null;
    },
    selectedImportDraft() {
      return this.selectedImportDive
        ? effectiveImportDraft(this.selectedImportDive, this.importDrafts[String(this.selectedImportDive.id)])
        : null;
    },
    selectedEditDive() {
      const dive = this.dives.find((entry) => String(entry.id) === String(this.selectedEditDiveId)) || null;
      return dive && isCommittedDive(dive) ? dive : null;
    },
    selectedEditDraft() {
      return this.selectedEditDive
        ? effectiveImportDraft(this.selectedEditDive, this.importDrafts[String(this.selectedEditDive.id)])
        : null;
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
      return this.dashboardStats;
    },
    committedDives() {
      return this.dives.filter((dive) => isCommittedDive(dive));
    },
    importedDiveCount() {
      return this.dives.length - this.committedDives.length;
    }
  },
  methods: {
    resetAuthenticatedState() {
      this.isAuthenticated = false;
      this.sessionEmail = "";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      this.searchText = "";
      this.dives = [];
      this.importDrafts = {};
      this.savingImportId = null;
      this.bulkImportSavePending = false;
      this.importError = "";
      this.importStatusMessage = "";
      this.loading = false;
      this.error = "";
      this.backendHealthy = false;
      this.dashboardStats = {
        totalDives: 0,
        totalSeconds: 0,
        totalHours: 0,
        maxDepth: 0,
        totalBarConsumed: 0,
        averageDurationSeconds: 0,
        averageMaxDepth: 0,
        bottomTimeProgress: 0
      };
      this.lastAuthenticatedSessionId = null;
    },
    async syncAuthState() {
      if (!this.clerkLoaded) {
        this.loading = true;
        return;
      }

      this.isAuthenticated = Boolean(this.clerkSignedIn);
      this.sessionEmail = this.currentUserEmail;

      if (!this.isAuthenticated || !this.clerkSessionId) {
        this.resetAuthenticatedState();
        return;
      }

      if (this.lastAuthenticatedSessionId === this.clerkSessionId) {
        return;
      }

      this.lastAuthenticatedSessionId = this.clerkSessionId;
      this.syncViewFromHash();
      await this.fetchDives();
    },
    withTimeout(promise, timeoutMs, errorMessage) {
      return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error(errorMessage));
        }, timeoutMs);

        Promise.resolve(promise).then(
          (value) => {
            window.clearTimeout(timeoutId);
            resolve(value);
          },
          (error) => {
            window.clearTimeout(timeoutId);
            reject(error);
          }
        );
      });
    },
    async authenticatedFetch(resource, options = {}, requestOptions = {}) {
      const timeoutMs = requestOptions.timeoutMs || this.requestTimeoutMs;
      const headers = new Headers(options.headers || {});
      const requireAuth = requestOptions.requireAuth !== false;

      let token = null;
      if (requireAuth && typeof this.clerkGetToken === "function") {
        token = await this.withTimeout(
          this.clerkGetToken(),
          timeoutMs,
          "Timed out while waiting for the Clerk session token."
        );
      }

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await fetch(resource, {
          ...options,
          credentials: "include",
          headers,
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error(`Request to ${resource} timed out after ${Math.round(timeoutMs / 1000)}s.`);
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    setSearchText(value) {
      this.searchText = value;
    },
    async setView(view) {
      this.activeView = view;
      if (view !== "logs") this.selectedDiveId = null;
      if (view !== "imports") this.selectedImportId = null;
      if (view !== "edit") this.selectedEditDiveId = null;
      if (view !== "settings") this.cliAuthCode = "";
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = view;
      if (this.isAuthenticated && ["dashboard", "logs", "imports", "edit"].includes(view)) {
        await this.fetchDives();
      }
    },
    openDive(diveId) {
      this.activeView = "logs";
      this.selectedDiveId = diveId;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      window.location.hash = `logs/${diveId}`;
    },
    closeDiveDetail() {
      this.activeView = "logs";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
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
    resolvePendingImportId(dives = this.dives, drafts = this.importDrafts, preferredId = null) {
      const pending = dives.filter((dive) => !isImportComplete(effectiveImportDraft(dive, drafts[String(dive.id)])));
      if (preferredId && pending.some((dive) => String(dive.id) === String(preferredId))) {
        return preferredId;
      }
      return pending[0]?.id || null;
    },
    isPendingImportId(diveId, dives = this.dives, drafts = this.importDrafts) {
      return dives.some((dive) => String(dive.id) === String(diveId) && !isImportComplete(effectiveImportDraft(dive, drafts[String(dive.id)])));
    },
    async openImportQueue(diveId = null) {
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
      this.importError = "";
      this.importStatusMessage = "";
      if (this.isAuthenticated) {
        await this.fetchDives();
      }
      this.selectedImportId = diveId ? this.resolvePendingImportId(this.dives, this.importDrafts, diveId) : null;
      window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
    },
    selectImportDive(diveId) {
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
      this.selectedImportId = this.resolvePendingImportId(this.dives, this.importDrafts, diveId);
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
    },
    backToImportQueue() {
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      window.location.hash = "imports";
    },
    async openDiveEditor(diveId) {
      this.activeView = "edit";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = diveId;
      this.importError = "";
      this.importStatusMessage = "";
      if (this.isAuthenticated) {
        await this.fetchDives();
      }
      if (!this.selectedEditDive) {
        this.selectedEditDiveId = null;
        window.location.hash = "logs";
        return;
      }
      window.location.hash = `edit/${diveId}`;
    },
    closeDiveEditor() {
      if (!this.selectedEditDiveId) {
        this.activeView = "logs";
        window.location.hash = "logs";
        return;
      }
      this.activeView = "logs";
      this.selectedDiveId = this.selectedEditDiveId;
      this.selectedEditDiveId = null;
      window.location.hash = `logs/${this.selectedDiveId}`;
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
          status: "imported"
        }
      };
      this.importStatusMessage = "";
      this.importError = "";
    },
    async persistImportDraft(diveId, draft, commit = false) {
      const response = await this.authenticatedFetch(`/api/dives/${diveId}/logbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit,
          logbook: {
            ...draft,
            status: commit ? "complete" : "imported"
          }
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      return payload;
    },
    async saveImportDraft(diveId, commit = false) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.importError = "Dive could not be found for metadata update.";
        return false;
      }

      const wasCommitted = isCommittedDive(dive);
      const draft = effectiveImportDraft(dive, this.importDrafts[id]);
      const missing = missingImportFields(draft);
      if ((commit || wasCommitted) && missing.length) {
        this.importError = `${missing[0].label} is required before completing this record.`;
        return false;
      }

      this.savingImportId = id;
      this.importError = "";
      this.importStatusMessage = "";
      try {
        const shouldCommit = commit || wasCommitted;
        const updatedDive = await this.persistImportDraft(diveId, draft, shouldCommit);
        const nextDives = this.dives.map((entry) => (String(entry.id) === id ? updatedDive : entry));
        const nextDrafts = {
          ...this.importDrafts,
          [id]: importDraftSeed(updatedDive)
        };

        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.importStatusMessage = shouldCommit && !wasCommitted
          ? `${paddedDiveIndex(updatedDive)} committed to the registry.`
          : wasCommitted
            ? `${paddedDiveIndex(updatedDive)} metadata updated.`
            : `Draft saved for ${paddedDiveIndex(updatedDive)}.`;

        if (shouldCommit && !wasCommitted) {
          this.selectedImportId = this.resolvePendingImportId(nextDives, nextDrafts, null);
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
    async saveExistingDiveLogbook(diveId) {
      return this.saveImportDraft(diveId, true);
    },
    async applyBuddyGuideToPendingImports(diveId) {
      const id = String(diveId);
      const sourceDive = this.dives.find((entry) => String(entry.id) === id);
      if (!sourceDive) {
        this.importError = "Dive could not be found for bulk metadata update.";
        return false;
      }

      const sourceDraft = effectiveImportDraft(sourceDive, this.importDrafts[id]);
      const updates = {};
      if (typeof sourceDraft.buddy === "string" && sourceDraft.buddy.trim()) {
        updates.buddy = sourceDraft.buddy;
      }
      if (typeof sourceDraft.guide === "string" && sourceDraft.guide.trim()) {
        updates.guide = sourceDraft.guide;
      }

      const updateKeys = Object.keys(updates);
      if (!updateKeys.length) {
        this.importError = "Enter a buddy or guide before applying the values across imported dives.";
        this.importStatusMessage = "";
        return false;
      }

      const pendingDives = this.dives.filter((entry) => !isImportComplete(effectiveImportDraft(entry, this.importDrafts[String(entry.id)])));
      if (!pendingDives.length) {
        this.importError = "There are no imported dives waiting for metadata updates.";
        this.importStatusMessage = "";
        return false;
      }

      this.bulkImportSavePending = true;
      this.importError = "";
      this.importStatusMessage = "";

      let nextDives = this.dives.slice();
      let nextDrafts = { ...this.importDrafts };
      let updatedCount = 0;

      try {
        for (const pendingDive of pendingDives) {
          const pendingId = String(pendingDive.id);
          const currentDraft = effectiveImportDraft(pendingDive, nextDrafts[pendingId]);
          const updatedDive = await this.persistImportDraft(
            pendingDive.id,
            {
              ...currentDraft,
              ...updates,
              status: "imported"
            },
            false
          );

          nextDives = nextDives.map((entry) => (String(entry.id) === pendingId ? updatedDive : entry));
          nextDrafts = {
            ...nextDrafts,
            [pendingId]: importDraftSeed(updatedDive)
          };
          updatedCount += 1;
        }

        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.selectedImportId = this.resolvePendingImportId(nextDives, nextDrafts, id);

        const appliedLabel = updateKeys.length === 2 ? "buddy and guide" : updateKeys[0];
        this.importStatusMessage = `Applied ${appliedLabel} to ${updatedCount} imported ${updatedCount === 1 ? "dive" : "dives"}. Dive sites were left unchanged.`;
        return true;
      } catch (error) {
        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.importError = error.message || "Unable to apply buddy and guide across imported dives.";
        return false;
      } finally {
        this.bulkImportSavePending = false;
      }
    },
    cycleView() {
      const currentView = this.activeView === "logs" ? "logs" : this.activeView;
      const index = this.navItems.findIndex((item) => item.id === currentView);
      const next = this.navItems[(index + 1) % this.navItems.length];
      this.setView(next.id);
    },
    syncViewFromHash() {
      if (!this.isAuthenticated) return;
      const hash = window.location.hash.replace("#", "");
      const [view, segment, value] = hash.split("/");
      this.cliAuthCode = view === "settings" && segment === "cli-auth" ? decodeURIComponent(value || "") : "";
      if (view === "imports") {
        this.activeView = "imports";
        this.selectedDiveId = null;
        this.selectedEditDiveId = null;
        this.selectedImportId = segment || null;
        return;
      }
      if (view === "edit") {
        this.activeView = "edit";
        this.selectedDiveId = null;
        this.selectedImportId = null;
        this.selectedEditDiveId = segment || null;
        return;
      }
      if (this.navItems.some((item) => item.id === view)) {
        this.activeView = view;
        this.selectedDiveId = view === "logs" && segment ? segment : null;
        if (view !== "imports") this.selectedImportId = null;
        if (view !== "edit") this.selectedEditDiveId = null;
      }
    },
    async fetchDives() {
      this.loading = true;
      this.error = "";
      try {
        const healthResponse = await this.authenticatedFetch("/api/health", {}, { requireAuth: false });
        this.backendHealthy = healthResponse.ok;
        const diveResponse = await this.authenticatedFetch("/api/dives?limit=250&include_samples=1");
        if (!diveResponse.ok) {
          const payload = await diveResponse.json().catch(() => null);
          throw new Error(payload?.error || `API returned ${diveResponse.status}`);
        }
        const payload = await diveResponse.json();
        this.dives = Array.isArray(payload.dives) ? payload.dives : [];
        this.dashboardStats = payload?.stats && typeof payload.stats === "object"
          ? { ...this.dashboardStats, ...payload.stats }
          : { ...this.dashboardStats, totalDives: this.dives.length };
        this.syncImportDrafts();
        if (this.selectedImportId && !this.isPendingImportId(this.selectedImportId, this.dives, this.importDrafts)) {
          this.selectedImportId = null;
          if (this.activeView === "imports") {
            window.location.hash = "imports";
          }
        }
        if (this.selectedEditDiveId && !this.dives.some((dive) => String(dive.id) === String(this.selectedEditDiveId) && isCommittedDive(dive))) {
          this.selectedEditDiveId = null;
          if (this.activeView === "edit") {
            window.location.hash = "logs";
          }
        }
      } catch (error) {
        this.error = error.message || "Unknown frontend error";
      } finally {
        this.loading = false;
      }
    }
  },
  mounted() {
    window.addEventListener("hashchange", this.syncViewFromHash);
    this.syncAuthState();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncViewFromHash);
  },
  template: `
    <div v-if="!clerkLoaded" class="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <section class="bg-surface-container-low p-10 shadow-panel">
        <p class="font-headline text-2xl font-bold">Loading secure access...</p>
        <p class="mt-2 text-on-surface-variant">Waiting for Clerk to initialize the authenticated session.</p>
      </section>
    </div>
    <login-view v-else-if="!isAuthenticated"></login-view>
    <div v-else class="min-h-screen bg-background text-on-background">
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
          <user-button after-sign-out-url="/"></user-button>
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
            <div
              class="hidden h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-surface-container-highest font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary md:flex"
              :title="sessionEmail"
            >
              {{ sessionEmail ? sessionEmail.charAt(0) : 'D' }}
            </div>
            <user-button after-sign-out-url="/"></user-button>
          </div>
        </div>
      </header>
      <main class="pb-24 pt-20 md:ml-64">
        <div class="mx-auto max-w-md px-4 md:px-8" :class="activeView === 'imports' ? 'md:max-w-[92rem]' : 'md:max-w-7xl'">
          <section v-if="loading" class="bg-surface-container-low p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold">Loading telemetry...</p>
            <p class="mt-2 text-on-surface-variant">Pulling dive data from the backend.</p>
          </section>
          <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold text-on-error-container">Frontend could not load dive data</p>
            <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
            <button @click="fetchDives" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Retry</button>
          </section>
          <dashboard-view v-else-if="activeView === 'dashboard'" :dives="committedDives" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <logs-view v-else-if="activeView === 'logs' && !selectedDive" :dives="committedDives" :search-text="searchText" :open-dive="openDive" :open-import-queue="openImportQueue" :set-search-text="setSearchText"></logs-view>
          <dive-import-editor-view v-else-if="activeView === 'imports' && selectedImportDive" :dive="selectedImportDive" :draft="selectedImportDraft" :saving-import-id="savingImportId" :bulk-import-save-pending="bulkImportSavePending" :import-error="importError" :import-status-message="importStatusMessage" :update-import-draft="updateImportDraft" :save-import-draft="saveImportDraft" :apply-buddy-guide-to-pending-imports="applyBuddyGuideToPendingImports" :back-to-queue="backToImportQueue"></dive-import-editor-view>
          <dive-import-view v-else-if="activeView === 'imports'" :dives="dives" :import-drafts="importDrafts" :selected-import-id="selectedImportId" :select-import-dive="selectImportDive" :import-error="importError" :import-status-message="importStatusMessage" :set-view="setView" :fetch-dives="fetchDives"></dive-import-view>
          <logbook-editor-view v-else-if="activeView === 'edit' && selectedEditDive" :dive="selectedEditDive" :draft="selectedEditDraft" :saving-import-id="savingImportId" :status-message="importStatusMessage" :error-message="importError" :update-dive-draft="updateImportDraft" :save-dive-logbook="saveExistingDiveLogbook" :close-editor="closeDiveEditor"></logbook-editor-view>
          <dive-detail-view v-else-if="activeView === 'logs' && selectedDive" :dive="selectedDive" :close-detail="closeDiveDetail" :open-dive-editor="openDiveEditor"></dive-detail-view>
          <equipment-view v-else-if="activeView === 'equipment'" :search-text="searchText"></equipment-view>
          <settings-view v-else-if="activeView === 'settings'" :cli-auth-code="cliAuthCode"></settings-view>
        </div>
      </main>
      <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-primary/10 bg-surface-container-low/80 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="setView(item.id)"
          class="flex flex-col items-center justify-center rounded-lg px-3 py-1 transition-all"
          :class="activeView === item.id || ((activeView === 'imports' || activeView === 'edit') && item.id === 'logs') ? 'bg-surface-container-high text-primary' : 'text-secondary/60'"
        >
          <span class="material-symbols-outlined mb-1" :style="activeView === item.id || ((activeView === 'imports' || activeView === 'edit') && item.id === 'logs') ? filledIconStyle : ''">{{ item.mobileIcon || item.icon }}</span>
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ item.mobileLabel }}</span>
        </button>
      </nav>
    </div>
  `
};

import { useAuth, useUser } from "./auth.js";
import { filledIconStyle, importDraftSeed, isImportComplete, effectiveImportDraft, missingImportFields, paddedDiveIndex, isCommittedDive } from "./core.js";
import DashboardView from "./components/dashboard.js";
import DiveDetailView from "./components/dive-detail.js";
import DiveImportEditorView from "./components/import-edit.js";
import DiveImportView from "./components/imports.js";
import EquipmentView from "./components/equipment.js";
import LogbookEditorView from "./components/logbook-edit.js";
import LoginView from "./components/login.js";
import LogsView from "./components/logs.js";
import ManualDiveEntryView from "./components/manual-dive.js";
import PublicProfileView from "./components/public-profile.js";
import SettingsView, { SETTINGS_SECTIONS } from "./components/settings.js";
import { createTranslator } from "./i18n/index.js";

const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0]?.id || "diver-details";
const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((section) => section.id));
const i18n = createTranslator("en");

function createManualDiveDraft() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return {
    date: localDate.toISOString().slice(0, 10),
    time: localDate.toISOString().slice(11, 16),
    durationMinutes: "45",
    maxDepthM: "",
    temperatureC: "",
    tankVolumeL: "",
    site: "",
    buddy: "",
    guide: "",
    notes: ""
  };
}

export default {
  name: "DiveVaultApp",
  components: {
    LoginView,
    DashboardView,
    LogsView,
    ManualDiveEntryView,
    DiveImportView,
    DiveImportEditorView,
    LogbookEditorView,
    DiveDetailView,
    EquipmentView,
    SettingsView,
    PublicProfileView
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
      publicRouteSlug: typeof window !== "undefined"
        ? (window.location.pathname.match(/^\/public\/([^/]+)\/?$/)?.[1] || "")
        : "",
      sessionEmail: "",
      activeView: "dashboard",
      selectedDiveId: null,
      selectedImportId: null,
      selectedEditDiveId: null,
      manualDiveDraft: createManualDiveDraft(),
      manualDiveCreating: false,
      manualDiveError: "",
      searchText: "",
      dives: [],
      profileDiveSites: [],
      profileBuddies: [],
      profileGuides: [],
      importDrafts: {},
      savingImportId: null,
      bulkImportSavePending: false,
      deletingDiveId: null,
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
      activeSettingsSection: DEFAULT_SETTINGS_SECTION,
      settingsMenuExpanded: false,
      mobileAccountMenuOpen: false,
      filledIconStyle,
      navItems: [
        { id: "dashboard", label: "Dashboard", mobileLabel: "Dashboard", icon: "dashboard", mobileIcon: "dashboard", eyebrow: "Dive Overview", title: "Logbook" },
        { id: "logs", label: "Dive Logs", mobileLabel: "Logs", icon: "waves", mobileIcon: "sailing", eyebrow: "Dive Logs", title: "Dive Log Database" },
        { id: "equipment", label: "Equipment", mobileLabel: "WIP", icon: "construction", mobileIcon: "construction", eyebrow: "Work In Progress", title: "Equipment Coming Soon", disabled: true, badge: "WIP" },
        { id: "settings", label: "Settings", mobileLabel: "Settings", icon: "settings", mobileIcon: "settings", eyebrow: "System Configuration", title: "System Config" }
      ],
      i18nLocale: "en"
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
    currentUserInitials() {
      const source = this.currentUserName || "Diver";
      const initials = source
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
      return initials || "DV";
    },
    activeSection() {
      if (this.activeView === "edit" && this.selectedEditDive) {
        return { eyebrow: "Dive Archive", title: "Logbook Editor" };
      }
      if (this.activeView === "create") {
        return { eyebrow: "Dive Archive", title: "Manual Dive Entry" };
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
    },
    isPublicRoute() {
      return Boolean(this.publicRouteSlug);
    },
    settingsSubnavItems() {
      return SETTINGS_SECTIONS;
    },
    loadingViewKey() {
      if (this.activeView === "edit") return "edit";
      if (this.activeView === "create") return "edit";
      if (this.activeView === "imports") return "imports";
      if (this.activeView === "settings") return "settings";
      if (this.activeView === "logs" && this.selectedDiveId) return "detail";
      if (this.activeView === "logs") return "logs";
      return "dashboard";
    }
  },
  methods: {
    t(key, fallback = key) {
      return i18n.t(key, fallback);
    },
    setLocale(locale) {
      i18n.setLocale(locale);
      this.i18nLocale = i18n.locale;
    },
    syncRouteMode() {
      this.publicRouteSlug = typeof window !== "undefined"
        ? (window.location.pathname.match(/^\/public\/([^/]+)\/?$/)?.[1] || "")
        : "";
    },
    handleBrowserNavigation() {
      this.syncRouteMode();
      if (!this.isPublicRoute) {
        this.syncViewFromHash();
      }
    },
    normalizeSettingsSection(sectionId) {
      return SETTINGS_SECTION_IDS.has(sectionId) ? sectionId : DEFAULT_SETTINGS_SECTION;
    },
    settingsHash(sectionId = this.activeSettingsSection) {
      return `settings/${this.normalizeSettingsSection(sectionId)}`;
    },
    resetAuthenticatedState() {
      this.isAuthenticated = false;
      this.sessionEmail = "";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      this.manualDiveDraft = createManualDiveDraft();
      this.manualDiveCreating = false;
      this.manualDiveError = "";
      this.searchText = "";
      this.dives = [];
      this.profileDiveSites = [];
      this.profileBuddies = [];
      this.profileGuides = [];
      this.importDrafts = {};
      this.savingImportId = null;
      this.bulkImportSavePending = false;
      this.deletingDiveId = null;
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
      this.activeSettingsSection = DEFAULT_SETTINGS_SECTION;
      this.settingsMenuExpanded = false;
      this.lastAuthenticatedSessionId = null;
    },
    async syncAuthState() {
      if (this.isPublicRoute) {
        this.loading = false;
        return;
      }

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
      await Promise.all([this.fetchDives(), this.fetchProfileData()]);
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
    toggleMobileAccountMenu() {
      this.mobileAccountMenuOpen = !this.mobileAccountMenuOpen;
    },
    closeMobileAccountMenu() {
      this.mobileAccountMenuOpen = false;
    },
    async openMobileSettings() {
      this.closeMobileAccountMenu();
      await this.setView("settings");
    },
    async signOutUser() {
      this.closeMobileAccountMenu();
      if (typeof this.clerkSignOut !== "function") {
        return;
      }
      await this.clerkSignOut({ redirectUrl: "/" });
    },
    isDisabledNavItem(view) {
      return Boolean(this.navItems.find((item) => item.id === view)?.disabled);
    },
    async handleNavItemClick(view) {
      if (this.isDisabledNavItem(view)) {
        return;
      }
      if (view === "settings") {
        if (this.activeView === "settings") {
          this.settingsMenuExpanded = !this.settingsMenuExpanded;
          return;
        }
        this.settingsMenuExpanded = true;
      } else {
        this.settingsMenuExpanded = false;
      }
      await this.setView(view);
    },
    async setView(view) {
      if (this.isDisabledNavItem(view)) {
        return;
      }
      this.closeMobileAccountMenu();
      this.activeView = view;
      if (view !== "logs") this.selectedDiveId = null;
      if (view !== "imports") this.selectedImportId = null;
      if (view !== "edit") this.selectedEditDiveId = null;
      if (view !== "create") this.manualDiveError = "";
      if (view !== "settings") this.cliAuthCode = "";
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = view === "settings" ? this.settingsHash() : view;
      if (this.isAuthenticated && ["dashboard", "logs", "imports", "edit"].includes(view)) {
        await this.fetchDives();
      }
    },
    openManualDiveCreator() {
      this.closeMobileAccountMenu();
      this.activeView = "create";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      this.manualDiveDraft = createManualDiveDraft();
      this.manualDiveCreating = false;
      this.manualDiveError = "";
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = "create";
    },
    closeManualDiveCreator() {
      this.closeMobileAccountMenu();
      this.activeView = "logs";
      this.manualDiveError = "";
      window.location.hash = "logs";
    },
    updateManualDiveDraft(key, value) {
      this.manualDiveDraft = {
        ...this.manualDiveDraft,
        [key]: value
      };
      this.manualDiveError = "";
    },
    setSettingsSection(sectionId) {
      this.closeMobileAccountMenu();
      this.activeView = "settings";
      this.activeSettingsSection = this.normalizeSettingsSection(sectionId);
      this.settingsMenuExpanded = true;
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      this.cliAuthCode = "";
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = this.settingsHash(this.activeSettingsSection);
    },
    openDive(diveId) {
      this.closeMobileAccountMenu();
      this.activeView = "logs";
      this.selectedDiveId = diveId;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      window.location.hash = `logs/${diveId}`;
    },
    closeDiveDetail() {
      this.closeMobileAccountMenu();
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
      this.closeMobileAccountMenu();
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
      this.closeMobileAccountMenu();
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
      this.selectedImportId = this.resolvePendingImportId(this.dives, this.importDrafts, diveId);
      this.importError = "";
      this.importStatusMessage = "";
      window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
    },
    backToImportQueue() {
      this.closeMobileAccountMenu();
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      window.location.hash = "imports";
    },
    async openDiveEditor(diveId) {
      this.closeMobileAccountMenu();
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
      this.closeMobileAccountMenu();
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
    encodeBase64Utf8(value) {
      const bytes = new TextEncoder().encode(String(value ?? ""));
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return window.btoa(binary);
    },
    async sha256Hex(value) {
      const bytes = new TextEncoder().encode(String(value ?? ""));
      const hash = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash)).map((entry) => entry.toString(16).padStart(2, "0")).join("");
    },
    manualDiveStartedAt() {
      const date = String(this.manualDiveDraft.date || "").trim();
      const time = String(this.manualDiveDraft.time || "").trim();
      if (!date || !time) {
        throw new Error("Manual dives require a valid local start date and time.");
      }
      const startedAt = new Date(`${date}T${time}`);
      if (Number.isNaN(startedAt.getTime())) {
        throw new Error("Manual dives require a valid local start date and time.");
      }
      return startedAt.toISOString();
    },
    async createManualDive() {
      const site = String(this.manualDiveDraft.site || "").trim();
      const buddy = String(this.manualDiveDraft.buddy || "").trim();
      const guide = String(this.manualDiveDraft.guide || "").trim();
      const notes = String(this.manualDiveDraft.notes || "").trim();
      const durationMinutes = Number.parseFloat(this.manualDiveDraft.durationMinutes);
      const maxDepthM = Number.parseFloat(this.manualDiveDraft.maxDepthM);
      const temperatureInput = String(this.manualDiveDraft.temperatureC || "").trim();
      const tankVolumeInput = String(this.manualDiveDraft.tankVolumeL || "").trim();
      const temperatureC = temperatureInput === "" ? null : Number.parseFloat(temperatureInput);
      const tankVolume = tankVolumeInput === "" ? null : Number.parseFloat(tankVolumeInput);

      if (!site || !buddy || !guide) {
        this.manualDiveError = "Dive site, buddy, and guide are required for manual entries.";
        return;
      }
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        this.manualDiveError = "Duration must be greater than zero.";
        return;
      }
      if (!Number.isFinite(maxDepthM) || maxDepthM < 0) {
        this.manualDiveError = "Max depth must be zero or greater.";
        return;
      }
      if (temperatureInput && !Number.isFinite(temperatureC)) {
        this.manualDiveError = "Temperature must be a valid number.";
        return;
      }
      if (tankVolumeInput && (!Number.isFinite(tankVolume) || tankVolume <= 0)) {
        this.manualDiveError = "Tank volume must be greater than zero.";
        return;
      }

      const startedAt = this.manualDiveStartedAt();
      const completedAt = new Date().toISOString();
      const rawSource = JSON.stringify({
        source: "manual",
        created_at: completedAt,
        started_at: startedAt,
        duration_seconds: Math.round(durationMinutes * 60),
        max_depth_m: maxDepthM,
        site,
        buddy,
        guide
      });

      const rawDataB64 = this.encodeBase64Utf8(rawSource);
      const rawSha256 = await this.sha256Hex(rawSource);
      const fields = {
        manual_entry: true,
        source: "manual",
        logbook: {
          site,
          buddy,
          guide,
          notes,
          status: "complete",
          completed_at: completedAt
        }
      };

      if (Number.isFinite(temperatureC)) {
        fields.temperature_surface_c = temperatureC;
        fields.temperature_minimum_c = temperatureC;
        fields.temperature_maximum_c = temperatureC;
      }

      if (Number.isFinite(tankVolume)) {
        fields.tanks = [{ volume: tankVolume }];
      }

      this.manualDiveCreating = true;
      this.manualDiveError = "";
      try {
        const response = await this.authenticatedFetch("/api/dives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor: "Manual",
            product: "Logbook Entry",
            dive_uid: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            raw_sha256: rawSha256,
            raw_data_b64: rawDataB64,
            started_at: startedAt,
            duration_seconds: Math.round(durationMinutes * 60),
            max_depth_m: maxDepthM,
            avg_depth_m: null,
            fields,
            samples: []
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        await this.fetchDives();
        this.manualDiveDraft = createManualDiveDraft();
        this.importStatusMessage = "Manual dive created.";
        if (payload?.id) {
          this.openDive(payload.id);
        } else {
          await this.setView("logs");
        }
      } catch (error) {
        this.manualDiveError = error?.message || "Unable to create manual dive.";
      } finally {
        this.manualDiveCreating = false;
      }
    },
    async persistImportDraft(diveId, draft, commit = false) {
      const response = await this.authenticatedFetch(`/api/dives/${diveId}/logbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit,
          tank_volume_l: draft.tank_volume_l || null,
          logbook: {
            site: draft.site,
            buddy: draft.buddy,
            guide: draft.guide,
            notes: draft.notes,
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
          ? `${paddedDiveIndex(updatedDive, nextDives)} committed to the registry.`
          : wasCommitted
            ? `${paddedDiveIndex(updatedDive, nextDives)} metadata updated.`
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
    async createDiveSite(sitePayload) {
      const name = typeof sitePayload?.name === "string" ? sitePayload.name.trim() : "";
      if (!name) {
        throw new Error("Enter a dive site name before saving it.");
      }

      const existingSite = this.profileDiveSites.find(
        (site) => typeof site?.name === "string" && site.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (existingSite) {
        return existingSite;
      }

      const response = await this.authenticatedFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dive_sites: [
            ...this.profileDiveSites,
            {
              name,
              location: typeof sitePayload?.location === "string" ? sitePayload.location.trim() : "",
              country: typeof sitePayload?.country === "string" ? sitePayload.country.trim() : "",
              latitude: sitePayload?.latitude ?? null,
              longitude: sitePayload?.longitude ?? null
            }
          ]
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }

      this.handleProfileUpdated(payload);
      return this.profileDiveSites.find(
        (site) => typeof site?.name === "string" && site.name.trim().toLowerCase() === name.toLowerCase()
      ) || { name };
    },
    async searchDiveSiteLocation(query) {
      const normalizedQuery = typeof query === "string" ? query.trim() : "";
      if (!normalizedQuery) {
        throw new Error("Enter a location before searching for GPS coordinates.");
      }

      const response = await this.authenticatedFetch(`/api/geocode/search?q=${encodeURIComponent(normalizedQuery)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      if (!payload?.found || !payload?.result) {
        return null;
      }
      return payload.result;
    },
    async translateText(text, { source = "auto", target = "en" } = {}) {
      const normalizedText = typeof text === "string" ? text.trim() : "";
      if (!normalizedText) {
        throw new Error("Enter text before translating.");
      }
      const normalizedTarget = typeof target === "string" ? target.trim().toLowerCase() : "";
      if (!normalizedTarget) {
        throw new Error("Choose a target language.");
      }
      const normalizedSource = typeof source === "string" && source.trim() ? source.trim().toLowerCase() : "auto";

      const response = await this.authenticatedFetch(
        `/api/translation/translate?q=${encodeURIComponent(normalizedText)}&source=${encodeURIComponent(normalizedSource)}&target=${encodeURIComponent(normalizedTarget)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      if (!payload?.translated_text) {
        throw new Error("Translation service returned an empty response.");
      }
      return payload.translated_text;
    },
    async deleteDive(diveId) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.importError = "Dive could not be found for deletion.";
        this.importStatusMessage = "";
        return false;
      }

      const importedRecord = !isCommittedDive(dive);
      const confirmed = window.confirm(
        importedRecord
          ? `Delete ${paddedDiveIndex(dive)} from the import queue? This cannot be undone.`
          : `Delete ${paddedDiveIndex(dive, this.dives)} from the dive log? This cannot be undone.`
      );
      if (!confirmed) {
        return false;
      }

      this.deletingDiveId = id;
      this.importError = "";
      this.importStatusMessage = "";

      try {
        const response = await this.authenticatedFetch(`/api/dives/${diveId}`, {
          method: "DELETE"
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        if (String(this.selectedDiveId) === id) {
          this.selectedDiveId = null;
        }
        if (String(this.selectedImportId) === id) {
          this.selectedImportId = null;
        }
        if (String(this.selectedEditDiveId) === id) {
          this.selectedEditDiveId = null;
        }

        if (importedRecord) {
          this.activeView = "imports";
          window.location.hash = "imports";
        } else {
          this.activeView = "logs";
          window.location.hash = "logs";
        }

        await this.fetchDives();
        this.importStatusMessage = `${paddedDiveIndex(dive, this.dives)} removed from the ${importedRecord ? "import queue" : "dive log"}.`;
        return true;
      } catch (error) {
        this.importError = error.message || "Unable to delete the dive.";
        return false;
      } finally {
        this.deletingDiveId = null;
      }
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
      for (let offset = 1; offset <= this.navItems.length; offset += 1) {
        const next = this.navItems[(index + offset) % this.navItems.length];
        if (!next.disabled) {
          this.setView(next.id);
          return;
        }
      }
    },
    syncViewFromHash() {
      if (!this.isAuthenticated) return;
      const hash = window.location.hash.replace("#", "");
      const [view, segment, value] = hash.split("/");
      if (view === "imports") {
        this.cliAuthCode = "";
        this.activeView = "imports";
        this.selectedDiveId = null;
        this.selectedEditDiveId = null;
        this.selectedImportId = segment || null;
        return;
      }
      if (view === "edit") {
        this.cliAuthCode = "";
        this.activeView = "edit";
        this.selectedDiveId = null;
        this.selectedImportId = null;
        this.selectedEditDiveId = segment || null;
        return;
      }
      if (view === "create") {
        this.cliAuthCode = "";
        this.activeView = "create";
        this.selectedDiveId = null;
        this.selectedImportId = null;
        this.selectedEditDiveId = null;
        this.manualDiveError = "";
        return;
      }
      if (view === "settings") {
        this.activeView = "settings";
        this.settingsMenuExpanded = true;
        this.selectedDiveId = null;
        this.selectedImportId = null;
        this.selectedEditDiveId = null;
        if (segment === "cli-auth") {
          this.cliAuthCode = decodeURIComponent(value || "");
          this.activeSettingsSection = "data-management";
        } else {
          this.cliAuthCode = "";
          this.activeSettingsSection = this.normalizeSettingsSection(segment);
        }
        return;
      }
      this.cliAuthCode = "";
      if (this.navItems.some((item) => item.id === view && !item.disabled)) {
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
    },
    async fetchProfileData() {
      try {
        const response = await this.authenticatedFetch("/api/profile");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.handleProfileUpdated(payload);
      } catch (_error) {
        this.profileDiveSites = [];
        this.profileBuddies = [];
        this.profileGuides = [];
      }
    },
    handleProfileUpdated(payload) {
      this.profileDiveSites = Array.isArray(payload?.dive_sites) ? payload.dive_sites : [];
      this.profileBuddies = Array.isArray(payload?.buddies) ? payload.buddies : [];
      this.profileGuides = Array.isArray(payload?.guides) ? payload.guides : [];
    }
  },
  mounted() {
    window.addEventListener("hashchange", this.handleBrowserNavigation);
    window.addEventListener("popstate", this.handleBrowserNavigation);
    const browserLocale = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
    this.setLocale(browserLocale);
    this.syncRouteMode();
    this.syncAuthState();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.handleBrowserNavigation);
    window.removeEventListener("popstate", this.handleBrowserNavigation);
  },
  template: `
    <public-profile-view v-if="isPublicRoute" :slug="publicRouteSlug"></public-profile-view>
    <div v-else-if="!clerkLoaded" class="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <section class="bg-surface-container-low p-10 shadow-panel">
        <p class="font-headline text-2xl font-bold">Loading secure access...</p>
      </section>
    </div>
    <login-view v-else-if="!isAuthenticated"></login-view>
    <div v-else class="min-h-screen bg-background text-on-background">
      <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-background shadow-[40px_0_40px_-20px_rgba(0,15,29,0.4)] md:flex">
        <div class="flex justify-center px-6 pb-4 pt-6">
          <div class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl shadow-panel">
            <img src="/logo.png" alt="DiveVault" class="h-full w-full object-cover" />
          </div>
        </div>
        <nav class="mt-8 flex-1 space-y-2">
          <div v-for="item in navItems" :key="item.id" class="space-y-2">
            <button @click="handleNavItemClick(item.id)" :disabled="item.disabled" class="group flex w-full items-center gap-4 p-4 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-100" :class="item.disabled ? 'border-l-4 border-tertiary bg-tertiary/12 text-tertiary' : ((activeView === item.id || (activeView === 'create' && item.id === 'logs')) ? 'border-r-4 border-primary bg-surface-container-high/70 text-primary' : 'text-secondary opacity-70 hover:bg-surface-container-high hover:text-primary hover:opacity-100')">
              <span class="material-symbols-outlined transition-transform group-active:scale-90" :style="(activeView === item.id || (activeView === 'create' && item.id === 'logs')) && !item.disabled ? filledIconStyle : ''">{{ item.icon }}</span>
              <span class="hidden items-center gap-2 font-label text-[11px] font-bold md:flex">
                <span>{{ item.label }}</span>
                <span v-if="item.badge" class="rounded bg-tertiary px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-background">{{ item.badge }}</span>
              </span>
              <span v-if="item.id === 'settings'" class="material-symbols-outlined ml-auto hidden text-base opacity-70 md:flex">
                {{ activeView === 'settings' && settingsMenuExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right' }}
              </span>
            </button>
            <div
              v-if="item.id === 'settings' && activeView === 'settings' && settingsMenuExpanded"
              class="ml-14 mr-4 flex flex-col gap-1 border-l border-primary/10 pl-4"
            >
              <button
                v-for="section in settingsSubnavItems"
                :key="section.id"
                @click="setSettingsSection(section.id)"
                class="flex items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                :class="activeSettingsSection === section.id ? 'bg-surface-container-high/80 text-primary' : 'text-secondary opacity-80 hover:bg-surface-container-high/60 hover:text-primary hover:opacity-100'"
              >
                <span class="material-symbols-outlined mt-0.5 text-[18px]" :style="activeSettingsSection === section.id ? filledIconStyle : ''">{{ section.icon }}</span>
                <div class="min-w-0">
                  <p class="font-label text-[10px] font-bold">{{ section.label }}</p>
                </div>
              </button>
            </div>
          </div>
        </nav>
        <div class="mt-auto p-6">
          <button @click="openManualDiveCreator()" class="hidden w-full items-center justify-center gap-2 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 md:flex">
            <span class="material-symbols-outlined text-sm">add</span>
            Log New Dive
          </button>
        </div>
      </aside>
      <header class="fixed left-0 right-0 top-0 z-30 h-16 border-b border-primary/10 bg-surface-container-high/95 backdrop-blur-xl md:left-64 md:bg-background/80">
        <div class="relative flex h-full items-center justify-between px-6 md:hidden">
          <div class="flex items-center gap-3">
            <div class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl shadow-panel">
              <img src="/logo.png" alt="DiveVault" class="h-full w-full object-cover" />
            </div>
            <h2 class="font-headline text-lg font-bold uppercase tracking-[0.14em] text-primary">DiveVault</h2>
          </div>
          <div class="relative">
            <button @click="toggleMobileAccountMenu" class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-surface-container-high text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
              {{ currentUserInitials }}
            </button>
            <div v-if="mobileAccountMenuOpen" class="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-56 rounded-2xl border border-primary/10 bg-surface-container-low p-3 shadow-panel">
              <div class="border-b border-primary/10 pb-3">
                <p class="truncate text-sm font-semibold text-on-surface">{{ currentUserName }}</p>
                <p class="mt-1 truncate text-xs text-secondary">{{ currentUserEmail }}</p>
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <button @click="openMobileSettings()" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Open Settings
                </button>
                <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="hidden h-full items-center justify-between px-8 md:flex">
          <h2 class="font-headline text-2xl font-bold tracking-[0.08em] text-primary">DiveVault</h2>
          <div class="flex items-center gap-3 rounded-2xl border border-primary/10 bg-surface-container-high/70 px-3 py-2 text-on-surface">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              {{ currentUserInitials }}
            </div>
            <div class="min-w-0">
              <p class="max-w-[12rem] truncate text-sm font-semibold text-on-surface">{{ currentUserName }}</p>
              <p class="max-w-[12rem] truncate text-xs text-secondary">{{ currentUserEmail }}</p>
            </div>
            <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
              Sign Out
            </button>
          </div>
        </div>
      </header>
      <main class="pb-24 pt-20 md:ml-64">
        <div class="mx-auto max-w-md px-4 md:px-8" :class="activeView === 'imports' ? 'md:max-w-[92rem]' : 'md:max-w-7xl'">
          <section v-if="loading" class="space-y-6">
            <div class="border border-primary/10 bg-surface-container-low p-6 shadow-panel animate-pulse">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                {{ loadingViewKey === 'dashboard' ? 'Loading Dashboard'
                  : loadingViewKey === 'logs' ? 'Loading Dive Log'
                  : loadingViewKey === 'detail' ? 'Loading Dive Detail'
                  : loadingViewKey === 'imports' ? 'Loading Imports'
                  : loadingViewKey === 'edit' ? 'Loading Dive Editor'
                  : 'Loading Settings' }}
              </p>
              <div class="mt-4 h-9 w-56 bg-surface-container-high"></div>
              <div class="mt-3 h-4 w-72 max-w-full bg-surface-container-high/80"></div>
            </div>

            <div v-if="loadingViewKey === 'dashboard'" class="space-y-6 animate-pulse">
              <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div v-for="index in 4" :key="'dashboard-stat-' + index" class="h-32 bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
                <div class="h-[28rem] bg-surface-container-low shadow-panel"></div>
                <div class="h-[28rem] bg-surface-container-low shadow-panel"></div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'logs'" class="space-y-6 animate-pulse">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div v-for="index in 4" :key="'logs-stat-' + index" class="h-28 bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                <div class="h-24 bg-surface-container-low shadow-panel"></div>
                <div class="h-24 bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="overflow-hidden bg-surface-container-low shadow-panel">
                <div class="h-14 bg-surface-container-high/60"></div>
                <div class="space-y-px bg-outline-variant/10">
                  <div v-for="index in 6" :key="'logs-row-' + index" class="h-20 bg-surface-container-low"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'detail'" class="space-y-6 animate-pulse">
              <div class="h-28 bg-surface-container-low shadow-panel"></div>
              <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <div v-for="index in 6" :key="'detail-stat-' + index" class="h-28 bg-surface-container-high shadow-panel"></div>
              </div>
              <div class="h-[26rem] bg-surface-container-high shadow-panel"></div>
              <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div v-for="index in 3" :key="'detail-panel-' + index" class="h-56 bg-surface-container-low shadow-panel"></div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'imports'" class="space-y-6 animate-pulse">
              <div class="h-32 bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.82fr)]">
                <div class="h-[30rem] bg-surface-container-low shadow-panel"></div>
                <div class="h-[30rem] bg-surface-container-low shadow-panel"></div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'edit'" class="space-y-6 animate-pulse">
              <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
                <div class="h-56 bg-surface-container-low shadow-panel"></div>
                <div class="h-56 bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
                <div class="h-[34rem] bg-surface-container-low shadow-panel"></div>
                <div class="h-[34rem] bg-surface-container-low shadow-panel"></div>
              </div>
            </div>

            <div v-else class="space-y-6 animate-pulse">
              <div class="h-24 bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 md:grid-cols-2">
                <div v-for="index in 4" :key="'settings-panel-' + index" class="h-56 bg-surface-container-low shadow-panel"></div>
              </div>
            </div>
          </section>
          <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold text-on-error-container">Frontend could not load dive data</p>
            <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
            <button @click="fetchDives" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Retry</button>
          </section>
          <dashboard-view v-else-if="activeView === 'dashboard'" :dives="committedDives" :all-dives="dives" :dive-sites="profileDiveSites" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <logs-view v-else-if="activeView === 'logs' && !selectedDive" :dives="committedDives" :dive-sites="profileDiveSites" :search-text="searchText" :open-dive="openDive" :open-import-queue="openImportQueue" :open-manual-dive="openManualDiveCreator" :set-search-text="setSearchText" :delete-dive="deleteDive" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError"></logs-view>
          <manual-dive-entry-view v-else-if="activeView === 'create'" :draft="manualDiveDraft" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :creating="manualDiveCreating" :error-message="manualDiveError" :update-draft="updateManualDiveDraft" :create-manual-dive="createManualDive" :close-creator="closeManualDiveCreator" :create-dive-site="createDiveSite" :search-dive-site-location="searchDiveSiteLocation" :translate-text="translateText" :t="t"></manual-dive-entry-view>
          <dive-import-editor-view v-else-if="activeView === 'imports' && selectedImportDive" :dive="selectedImportDive" :draft="selectedImportDraft" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :saving-import-id="savingImportId" :bulk-import-save-pending="bulkImportSavePending" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :update-import-draft="updateImportDraft" :save-import-draft="saveImportDraft" :delete-dive="deleteDive" :apply-buddy-guide-to-pending-imports="applyBuddyGuideToPendingImports" :create-dive-site="createDiveSite" :back-to-queue="backToImportQueue"></dive-import-editor-view>
          <dive-import-view v-else-if="activeView === 'imports'" :dives="dives" :import-drafts="importDrafts" :selected-import-id="selectedImportId" :select-import-dive="selectImportDive" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :delete-dive="deleteDive" :set-view="setView" :fetch-dives="fetchDives"></dive-import-view>
          <logbook-editor-view v-else-if="activeView === 'edit' && selectedEditDive" :dive="selectedEditDive" :all-dives="dives" :draft="selectedEditDraft" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :saving-import-id="savingImportId" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError" :update-dive-draft="updateImportDraft" :save-dive-logbook="saveExistingDiveLogbook" :delete-dive="deleteDive" :create-dive-site="createDiveSite" :close-editor="closeDiveEditor"></logbook-editor-view>
          <dive-detail-view v-else-if="activeView === 'logs' && selectedDive" :dive="selectedDive" :all-dives="dives" :deleting-dive-id="deletingDiveId" :close-detail="closeDiveDetail" :open-dive-editor="openDiveEditor" :delete-dive="deleteDive"></dive-detail-view>
          <equipment-view v-else-if="activeView === 'equipment'" :search-text="searchText"></equipment-view>
          <settings-view v-else-if="activeView === 'settings'" :cli-auth-code="cliAuthCode" :active-section="activeSettingsSection" :set-active-section="setSettingsSection" :profile-updated="handleProfileUpdated" :refresh-dives="fetchDives"></settings-view>
        </div>
      </main>
      <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-primary/10 bg-surface-container-low/80 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <button
          v-for="item in navItems"
          :key="item.id"
          @click="setView(item.id)"
          :disabled="item.disabled"
          class="flex flex-col items-center justify-center rounded-lg px-3 py-1 transition-all disabled:cursor-not-allowed disabled:opacity-100"
          :class="item.disabled ? 'bg-tertiary/12 text-tertiary' : (activeView === item.id || ((activeView === 'imports' || activeView === 'edit' || activeView === 'create') && item.id === 'logs') ? 'bg-surface-container-high text-primary' : 'text-secondary/60')"
        >
          <span class="material-symbols-outlined mb-1" :style="!item.disabled && (activeView === item.id || ((activeView === 'imports' || activeView === 'edit' || activeView === 'create') && item.id === 'logs')) ? filledIconStyle : ''">{{ item.mobileIcon || item.icon }}</span>
          <span class="font-label text-[10px] font-bold">{{ item.mobileLabel }}</span>
        </button>
      </nav>
    </div>
  `
};

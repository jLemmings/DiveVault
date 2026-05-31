<script>
import { useAuth, useUser } from "./composables/auth.js";
import { filledIconStyle, importDraftSeed, isImportComplete, effectiveImportDraft, missingImportFields, normalizeRequiredLogbookFields, paddedDiveIndex, isCommittedDive } from "./utils/core.js";
import DashboardView from "./pages/Dashboard.vue";
import DiveDetailView from "./pages/DiveDetail.vue";
import DiveImportEditorView from "./pages/ImportEdit.vue";
import DiveImportView from "./pages/Imports.vue";
import EquipmentView from "./pages/Equipment.vue";
import LogbookEditorView from "./pages/LogbookEdit.vue";
import LoginView from "./pages/Login.vue";
import LogsView from "./pages/Logs.vue";
import ManualDiveEntryView from "./pages/ManualDive.vue";
import PublicProfileView from "./pages/PublicProfile.vue";
import SettingsView, { SETTINGS_SECTIONS } from "./pages/Settings.vue";
import { i18n, MESSAGES } from "./i18n/index.js";
import { NAV_ITEMS } from "./navigation.js";
import { createManualDiveDraft } from "./utils/dive-drafts.js";
import {
  applyDocumentTheme,
  getBrowserLocale,
  getStoredLocale,
  getStoredThemePreference,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  normalizeThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY
} from "./utils/preferences.js";

const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0]?.id || "diver-details";
const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((section) => section.id));
const SUPPORTED_LOCALES = new Set(Object.keys(MESSAGES));

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
      authGetToken: getToken,
      authLoaded: isLoaded,
      authSessionId: sessionId,
      authSignOut: signOut,
      authSignedIn: isSignedIn,
      authUser: user
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
      profileLogbookDisplayFields: [],
      profileRequiredLogbookFields: ["site"],
      profileEquipmentSelectionEnabled: true,
      equipment: [],
      equipmentSaving: false,
      equipmentServicingId: null,
      equipmentStatusMessage: "",
      equipmentError: "",
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
      mobileAccountMenuOpen: false,
      desktopAccountMenuOpen: false,
      passwordDialogOpen: false,
      passwordForm: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      },
      passwordSubmitting: false,
      passwordError: "",
      passwordStatus: "",
      filledIconStyle,
      navItems: NAV_ITEMS,
      i18nLocale: getStoredLocale(SUPPORTED_LOCALES) || "en",
      themePreference: getStoredThemePreference(),
      resolvedTheme: applyDocumentTheme(getStoredThemePreference()),
      themeMediaQuery: null
    };
  },
  watch: {
    authLoaded: {
      handler() {
        this.syncAuthState();
      },
      immediate: true
    },
    authSignedIn: {
      handler() {
        this.syncAuthState();
      },
      immediate: true
    },
    authSessionId() {
      this.syncAuthState();
    },
    authUser: {
      handler() {
        this.sessionEmail = this.currentUserEmail;
      },
      deep: true,
      immediate: true
    }
  },
  computed: {
    currentUserEmail() {
      return this.authUser?.primaryEmailAddress?.emailAddress
        || this.authUser?.emailAddresses?.[0]?.emailAddress
        || "";
    },
    currentUserName() {
      const firstName = this.authUser?.firstName?.trim() || "";
      const lastName = this.authUser?.lastName?.trim() || "";
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
    defaultEquipmentIds() {
      return this.equipment
        .filter((item) => item?.is_default || item?.is_standard)
        .map((item) => String(item.id))
        .filter(Boolean);
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
    activeMenuTitle() {
      if (this.activeView === "edit" || this.activeView === "create" || this.activeView === "imports") {
        return this.navItems.find((item) => item.id === "logs")?.label || "Dive Logs";
      }
      if (this.activeView === "logs") {
        return this.navItems.find((item) => item.id === "logs")?.label || "Dive Logs";
      }
      return this.navItems.find((item) => item.id === this.activeView)?.label || "Dashboard";
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
    canManageUsers() {
      return Boolean(this.authUser?.isOwner);
    },
    desktopNavItems() {
      return this.navItems.filter((item) => item.id !== "map");
    },
    mobileNavItems() {
      return this.navItems;
    },
    loadingViewKey() {
      if (this.activeView === "edit") return "edit";
      if (this.activeView === "create") return "create";
      if (this.activeView === "imports") return "imports";
      if (this.activeView === "map") return "map";
      if (this.activeView === "settings") return "settings";
      if (this.activeView === "equipment") return "equipment";
      if (this.activeView === "logs" && this.selectedDiveId) return "detail";
      if (this.activeView === "logs") return "logs";
      return "dashboard";
    }
  },
  methods: {
    t(key, fallback = key, params = {}) {
      return i18n.t(key, fallback, params);
    },
    setLocale(locale) {
      const normalizedLocale = normalizeLocale(locale, SUPPORTED_LOCALES);
      i18n.setLocale(normalizedLocale);
      this.i18nLocale = i18n.locale;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, this.i18nLocale);
        } catch (_error) {
          // Ignore storage failures and keep the active locale in memory.
        }
      }
    },
    setThemePreference(themePreference) {
      const normalizedTheme = normalizeThemePreference(themePreference);
      this.themePreference = normalizedTheme;
      this.resolvedTheme = applyDocumentTheme(normalizedTheme);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
        } catch (_error) {
          // Ignore storage failures and keep the active theme in memory.
        }
      }
    },
    syncSystemTheme() {
      if (this.themePreference !== "system") return;
      this.resolvedTheme = applyDocumentTheme(this.themePreference);
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
      if (!SETTINGS_SECTION_IDS.has(sectionId)) {
        return DEFAULT_SETTINGS_SECTION;
      }
      if (sectionId === "manage-users" && !this.canManageUsers) {
        return DEFAULT_SETTINGS_SECTION;
      }
      return sectionId;
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
      this.profileLogbookDisplayFields = [];
      this.profileRequiredLogbookFields = ["site"];
      this.profileEquipmentSelectionEnabled = true;
      this.equipment = [];
      this.equipmentSaving = false;
      this.equipmentServicingId = null;
      this.equipmentStatusMessage = "";
      this.equipmentError = "";
      this.importDrafts = {};
      this.savingImportId = null;
      this.bulkImportSavePending = false;
      this.deletingDiveId = null;
      this.importError = "";
      this.importStatusMessage = "";
      this.loading = false;
      this.error = "";
      this.backendHealthy = false;
      this.passwordDialogOpen = false;
      this.passwordForm = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
      this.passwordSubmitting = false;
      this.passwordError = "";
      this.passwordStatus = "";
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
      this.desktopAccountMenuOpen = false;
      this.lastAuthenticatedSessionId = null;
    },
    async syncAuthState() {
      if (this.isPublicRoute) {
        this.loading = false;
        return;
      }

      if (!this.authLoaded) {
        this.loading = true;
        return;
      }

      this.isAuthenticated = Boolean(this.authSignedIn);
      this.sessionEmail = this.currentUserEmail;

      if (!this.isAuthenticated || !this.authSessionId) {
        this.resetAuthenticatedState();
        return;
      }

      if (this.lastAuthenticatedSessionId === this.authSessionId) {
        return;
      }

      this.lastAuthenticatedSessionId = this.authSessionId;
      this.syncViewFromHash();
      await Promise.all([this.fetchDives(), this.fetchProfileData(), this.fetchEquipment()]);
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
      if (requireAuth && typeof this.authGetToken === "function") {
        token = await this.withTimeout(
          this.authGetToken(),
          timeoutMs,
          "Timed out while waiting for the Authentication session token."
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
      this.desktopAccountMenuOpen = false;
    },
    toggleDesktopAccountMenu() {
      this.desktopAccountMenuOpen = !this.desktopAccountMenuOpen;
    },
    closeDesktopAccountMenu() {
      this.desktopAccountMenuOpen = false;
    },
    async openMobileSettings() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      await this.setView("settings");
    },
    async signOutUser() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      if (typeof this.authSignOut !== "function") {
        return;
      }
      await this.authSignOut({ redirectUrl: "/" });
    },
    openPasswordDialog() {
      this.closeMobileAccountMenu();
      this.closeDesktopAccountMenu();
      this.passwordDialogOpen = true;
      this.passwordError = "";
      this.passwordStatus = "";
      this.passwordForm = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
    },
    closePasswordDialog() {
      this.passwordDialogOpen = false;
      this.passwordSubmitting = false;
      this.passwordError = "";
      this.passwordStatus = "";
      this.passwordForm = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      };
    },
    async submitPasswordChange() {
      this.passwordSubmitting = true;
      this.passwordError = "";
      this.passwordStatus = "";
      const currentPassword = this.passwordForm.currentPassword;
      const newPassword = this.passwordForm.newPassword;
      const confirmPassword = this.passwordForm.confirmPassword;
      if (!currentPassword || !newPassword) {
        this.passwordError = "Current password and new password are required.";
        this.passwordSubmitting = false;
        return;
      }
      if (newPassword.length < 8) {
        this.passwordError = "New password must be at least 8 characters.";
        this.passwordSubmitting = false;
        return;
      }
      if (newPassword !== confirmPassword) {
        this.passwordError = "New password confirmation does not match.";
        this.passwordSubmitting = false;
        return;
      }
      try {
        const response = await this.authenticatedFetch("/api/auth/password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.passwordStatus = "Password updated.";
        window.setTimeout(() => {
          if (this.passwordDialogOpen) {
            this.closePasswordDialog();
          }
        }, 900);
      } catch (error) {
        this.passwordError = error?.message || "Could not update the password.";
      } finally {
        this.passwordSubmitting = false;
      }
    },
    isDisabledNavItem(view) {
      return Boolean(this.navItems.find((item) => item.id === view)?.disabled);
    },
    async handleNavItemClick(view) {
      if (this.isDisabledNavItem(view)) {
        return;
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
      const weatherDescription = String(this.manualDiveDraft.weatherDescription || "").trim();
      const visibility = String(this.manualDiveDraft.visibility || "").trim();
      const wetsuitDescription = String(this.manualDiveDraft.wetsuitDescription || "").trim();
      const weightDescription = String(this.manualDiveDraft.weightDescription || "").trim();
      const notes = String(this.manualDiveDraft.notes || "").trim();
      const selectedEquipmentIds = Array.isArray(this.manualDiveDraft.equipment_ids) ? this.manualDiveDraft.equipment_ids.map(String) : [];
      const equipmentIds = this.profileEquipmentSelectionEnabled ? selectedEquipmentIds : [];
      const durationMinutes = Number.parseFloat(this.manualDiveDraft.durationMinutes);
      const maxDepthM = Number.parseFloat(this.manualDiveDraft.maxDepthM);
      const temperatureInput = String(this.manualDiveDraft.temperatureC || "").trim();
      const tankVolumeInput = String(this.manualDiveDraft.tankVolumeL || "").trim();
      const beginPressureInput = String(this.manualDiveDraft.beginPressureBar || "").trim();
      const endPressureInput = String(this.manualDiveDraft.endPressureBar || "").trim();
      const temperatureC = temperatureInput === "" ? null : Number.parseFloat(temperatureInput);
      const tankVolume = tankVolumeInput === "" ? null : Number.parseFloat(tankVolumeInput);
      const beginPressure = beginPressureInput === "" ? null : Number.parseFloat(beginPressureInput);
      const endPressure = endPressureInput === "" ? null : Number.parseFloat(endPressureInput);

      const missingRequired = missingImportFields({
        site,
        buddy,
        guide,
        weather_description: weatherDescription,
        visibility,
        wetsuit_description: wetsuitDescription,
        weight_description: weightDescription,
        notes
      }, this.profileRequiredLogbookFields);
      if (missingRequired.length) {
        this.manualDiveError = `${missingRequired[0].label} is required for manual entries.`;
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
      if (beginPressureInput && (!Number.isFinite(beginPressure) || beginPressure < 0 || beginPressure > 400)) {
        this.manualDiveError = "Entry tank pressure must be between 0 and 400 bar.";
        return;
      }
      if (endPressureInput && (!Number.isFinite(endPressure) || endPressure < 0 || endPressure > 400)) {
        this.manualDiveError = "Exit tank pressure must be between 0 and 400 bar.";
        return;
      }
      if (beginPressure !== null && endPressure !== null && endPressure > beginPressure) {
        this.manualDiveError = "Exit tank pressure cannot be higher than entry tank pressure.";
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
          weather_description: weatherDescription,
          visibility,
          wetsuit_description: wetsuitDescription,
          weight_description: weightDescription,
          notes,
          equipment_ids: equipmentIds,
          status: "complete",
          completed_at: completedAt
        }
      };

      if (Number.isFinite(temperatureC)) {
        fields.temperature_surface_c = temperatureC;
        fields.temperature_minimum_c = temperatureC;
        fields.temperature_maximum_c = temperatureC;
      }

      if (Number.isFinite(tankVolume) || Number.isFinite(beginPressure) || Number.isFinite(endPressure)) {
        const tank = {};
        if (Number.isFinite(tankVolume)) tank.volume = tankVolume;
        if (Number.isFinite(beginPressure)) tank.beginpressure_bar = Math.round(beginPressure);
        if (Number.isFinite(endPressure)) tank.endpressure_bar = Math.round(endPressure);
        fields.tanks = [tank];
      }

      this.manualDiveCreating = true;
      this.manualDiveError = "";
      try {
        const response = await this.authenticatedFetch("/api/dives", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vendor: "Manual",
            product: "Entry",
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
    async uploadCsvImport(file, options = {}) {
      if (!file) return false;
      const navigateToQueue = options.navigateToQueue !== false;
      const setImportFeedback = options.setImportFeedback !== false;
      if (setImportFeedback) {
        this.importError = "";
        this.importStatusMessage = "";
      }
      const refreshAfterImport = options.refreshDives !== false;
      try {
        const csvText = await file.text();
        const response = await this.authenticatedFetch("/api/imports/csv", {
          method: "POST",
          headers: { "Content-Type": "text/csv; charset=utf-8" },
          body: csvText
        }, { timeoutMs: 30000 });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (refreshAfterImport) {
          await this.fetchDives();
        }
        if (setImportFeedback) {
          this.importStatusMessage = `CSV import processed ${payload.rows || 0} row(s): ${payload.inserted || 0} new, ${payload.duplicates || 0} duplicate.`;
        }
        if (navigateToQueue) {
          this.activeView = "imports";
          this.selectedImportId = this.resolvePendingImportId(this.dives, this.importDrafts, null);
          window.location.hash = this.selectedImportId ? `imports/${this.selectedImportId}` : "imports";
        }
        return payload;
      } catch (error) {
        if (setImportFeedback) {
          this.importError = error?.message || "Unable to import CSV file.";
        }
        throw error;
      }
    },
    async uploadSubsurfaceImport(file, options = {}) {
      if (!file) return false;
      const dryRun = options.dryRun === true;
      const refreshAfterImport = options.refreshDives !== false;
      const response = await this.authenticatedFetch(`/api/imports/subsurface${dryRun ? '?dry_run=1' : ''}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/xml" },
        body: file
      }, { timeoutMs: 30000 });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      if (!dryRun && refreshAfterImport) {
        await this.fetchDives();
      }
      return payload;
    },
    async persistImportDraft(diveId, draft, commit = false) {
      const beginPressureInput = String(draft.begin_pressure_bar || "").trim();
      const endPressureInput = String(draft.end_pressure_bar || "").trim();
      const beginPressure = beginPressureInput === "" ? null : Number.parseFloat(beginPressureInput);
      const endPressure = endPressureInput === "" ? null : Number.parseFloat(endPressureInput);
      if (beginPressureInput && (!Number.isFinite(beginPressure) || beginPressure < 0 || beginPressure > 400)) {
        throw new Error("Entry tank pressure must be between 0 and 400 bar.");
      }
      if (endPressureInput && (!Number.isFinite(endPressure) || endPressure < 0 || endPressure > 400)) {
        throw new Error("Exit tank pressure must be between 0 and 400 bar.");
      }
      if (beginPressure !== null && endPressure !== null && endPressure > beginPressure) {
        throw new Error("Exit tank pressure cannot be higher than entry tank pressure.");
      }

      const response = await this.authenticatedFetch(`/api/dives/${diveId}/logbook`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit,
          tank_volume_l: draft.tank_volume_l || null,
          begin_pressure_bar: draft.begin_pressure_bar || null,
          end_pressure_bar: draft.end_pressure_bar || null,
          logbook: {
            site: draft.site,
            buddy: draft.buddy,
            guide: draft.guide,
            weather_description: draft.weather_description,
            visibility: draft.visibility,
            wetsuit_description: draft.wetsuit_description,
            weight_description: draft.weight_description,
            notes: draft.notes,
            equipment_ids: Array.isArray(draft.equipment_ids) ? draft.equipment_ids : [],
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
      const missing = missingImportFields(draft, this.profileRequiredLogbookFields);
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
        this.profileLogbookDisplayFields = [];
        this.profileEquipmentSelectionEnabled = true;
      }
    },
    async fetchEquipment() {
      try {
        const response = await this.authenticatedFetch("/api/equipment");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
      } catch (error) {
        this.equipment = [];
        this.equipmentError = error?.message || "Unable to load equipment.";
      }
    },
    async saveEquipment(equipment) {
      this.equipmentSaving = true;
      this.equipmentError = "";
      this.equipmentStatusMessage = "";
      try {
        const response = await this.authenticatedFetch("/api/equipment", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ equipment })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
        this.equipmentStatusMessage = "Equipment inventory saved.";
        return this.equipment;
      } catch (error) {
        this.equipmentError = error?.message || "Unable to save equipment.";
        return false;
      } finally {
        this.equipmentSaving = false;
      }
    },
    async markEquipmentServiced(equipmentId) {
      this.equipmentServicingId = String(equipmentId);
      this.equipmentError = "";
      this.equipmentStatusMessage = "";
      try {
        const response = await this.authenticatedFetch(`/api/equipment/${encodeURIComponent(equipmentId)}/service`, {
          method: "POST"
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        const updated = payload?.equipment;
        if (updated?.id) {
          this.equipment = this.equipment.map((item) => String(item.id) === String(updated.id) ? updated : item);
        } else {
          await this.fetchEquipment();
        }
        this.equipmentStatusMessage = "Equipment marked as serviced.";
        return true;
      } catch (error) {
        this.equipmentError = error?.message || "Unable to mark equipment as serviced.";
        return false;
      } finally {
        this.equipmentServicingId = null;
      }
    },
    handleProfileUpdated(payload) {
      this.profileDiveSites = Array.isArray(payload?.dive_sites) ? payload.dive_sites : [];
      this.profileBuddies = Array.isArray(payload?.buddies) ? payload.buddies : [];
      this.profileGuides = Array.isArray(payload?.guides) ? payload.guides : [];
      this.profileLogbookDisplayFields = Array.isArray(payload?.logbook_display_fields) ? payload.logbook_display_fields : [];
      this.profileRequiredLogbookFields = normalizeRequiredLogbookFields(payload?.required_logbook_fields);
      this.profileEquipmentSelectionEnabled = payload?.equipment_selection_enabled !== false;
    }
  },
  mounted() {
    window.addEventListener("hashchange", this.handleBrowserNavigation);
    window.addEventListener("popstate", this.handleBrowserNavigation);
    this.setLocale(getStoredLocale(SUPPORTED_LOCALES) || getBrowserLocale(SUPPORTED_LOCALES));
    this.setThemePreference(getStoredThemePreference());
    if (typeof window.matchMedia === "function") {
      this.themeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
      if (typeof this.themeMediaQuery.addEventListener === "function") {
        this.themeMediaQuery.addEventListener("change", this.syncSystemTheme);
      } else {
        this.themeMediaQuery.addListener?.(this.syncSystemTheme);
      }
    }
    this.syncRouteMode();
    this.syncAuthState();
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.handleBrowserNavigation);
    window.removeEventListener("popstate", this.handleBrowserNavigation);
    if (typeof this.themeMediaQuery?.removeEventListener === "function") {
      this.themeMediaQuery.removeEventListener("change", this.syncSystemTheme);
    } else {
      this.themeMediaQuery?.removeListener?.(this.syncSystemTheme);
    }
  },
};
</script>

<template>
    <public-profile-view v-if="isPublicRoute" :slug="publicRouteSlug"></public-profile-view>
    <div v-else-if="!authLoaded" class="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <section class="bg-surface-container-low p-10 shadow-panel">
        <p class="font-headline text-2xl font-bold">Loading secure access...</p>
      </section>
    </div>
    <login-view v-else-if="!isAuthenticated" :current-locale="i18nLocale" :set-locale="setLocale"></login-view>
    <div v-else class="app-stage relative min-h-screen overflow-hidden bg-background text-on-background">
      <div class="app-stage-wave auth-stage-wave auth-stage-wave-back"></div>
      <div class="app-stage-wave auth-stage-wave auth-stage-wave-front"></div>
      <div class="app-stage-caustics auth-stage-caustics"></div>
      <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-background shadow-[40px_0_40px_-20px_rgba(0,15,29,0.4)] md:flex">
        <div class="flex justify-center px-4 pb-2 pt-5">
          <div class="flex h-32 w-full items-center justify-center rounded-3xl shadow-panel">
            <img src="/logo-headline.png" alt="DiveVault" class="max-h-full w-full object-contain p-2" />
          </div>
        </div>
        <nav class="mt-6 flex-1 space-y-2">
          <div v-for="item in desktopNavItems" :key="item.id" class="space-y-2">
            <button @click="handleNavItemClick(item.id)" :disabled="item.disabled" class="group flex w-full items-center gap-4 p-4 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-100" :class="item.disabled ? 'border-l-4 border-tertiary bg-tertiary/12 text-tertiary' : ((activeView === item.id || (activeView === 'create' && item.id === 'logs')) ? 'border-r-4 border-primary bg-surface-container-high/70 text-primary' : 'text-secondary opacity-70 hover:bg-surface-container-high hover:text-primary hover:opacity-100')">
              <span class="material-symbols-outlined transition-transform group-active:scale-90" :style="(activeView === item.id || (activeView === 'create' && item.id === 'logs')) && !item.disabled ? filledIconStyle : ''">{{ item.icon }}</span>
              <span class="hidden items-center gap-2 font-label text-[11px] font-bold md:flex">
                <span>{{ item.label }}</span>
                <span v-if="item.badge" class="rounded bg-tertiary px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-background">{{ item.badge }}</span>
              </span>
            </button>
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
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl shadow-panel">
              <img src="/logo.png" alt="DiveVault" class="max-h-full max-w-full object-contain p-1" />
            </div>
            <h2 class="font-headline text-lg font-bold uppercase tracking-[0.14em] text-primary">{{ activeMenuTitle }}</h2>
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
                <button @click="openPasswordDialog" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Change Password
                </button>
                <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="hidden h-full items-center justify-between px-8 md:flex">
          <h2 class="font-headline text-2xl font-bold tracking-[0.08em] text-primary">{{ activeMenuTitle }}</h2>
          <div class="relative flex items-center gap-4 border-l border-primary/10 pl-5 text-on-surface">
            <div class="min-w-0 text-right">
              <p class="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-secondary/70">Diver</p>
              <p class="max-w-[11rem] truncate text-sm font-semibold leading-5 text-on-surface">{{ currentUserName }}</p>
            </div>
            <button
              @click="toggleDesktopAccountMenu"
              type="button"
              aria-label="Account menu"
              :aria-expanded="desktopAccountMenuOpen ? 'true' : 'false'"
              class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-background/50 text-[11px] font-bold uppercase tracking-[0.12em] text-primary shadow-[inset_0_1px_0_rgba(205,229,255,0.08)] transition-colors hover:border-primary/35 hover:bg-primary/12"
            >
              {{ currentUserInitials }}
              <span class="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-background bg-surface-container-high text-secondary">
                <span class="material-symbols-outlined text-[14px] transition-transform" :class="desktopAccountMenuOpen ? 'rotate-180 text-primary' : ''">expand_more</span>
              </span>
            </button>
            <div v-if="desktopAccountMenuOpen" class="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-56 rounded-2xl border border-primary/10 bg-surface-container-low p-3 shadow-panel">
              <div class="border-b border-primary/10 pb-3">
                <p class="truncate text-sm font-semibold text-on-surface">{{ currentUserName }}</p>
                <p class="mt-1 truncate text-xs text-secondary">{{ currentUserEmail }}</p>
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <button @click="openPasswordDialog" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Change Password
                </button>
                <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main class="relative z-10 md:ml-64" :class="activeView === 'map' ? 'px-0 pb-0 pt-16' : 'pb-24 pt-20'">
        <div class="mx-auto" :class="activeView === 'map' ? 'w-full max-w-none px-0 md:max-w-[96rem] md:px-8' : 'max-w-md px-4 md:max-w-[96rem] md:px-8'">
          <section v-if="loading" class="space-y-6">
            <div class="border border-primary/10 bg-surface-container-low p-6 shadow-panel animate-pulse">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                {{ loadingViewKey === 'dashboard' ? 'Loading Dashboard'
                  : loadingViewKey === 'map' ? 'Loading Dive Map'
                  : loadingViewKey === 'logs' ? 'Loading Dive Log'
                  : loadingViewKey === 'detail' ? 'Loading Dive Detail'
                  : loadingViewKey === 'imports' ? 'Loading Imports'
                  : loadingViewKey === 'edit' ? 'Loading Dive Editor'
                  : loadingViewKey === 'create' ? 'Loading Manual Entry'
                  : loadingViewKey === 'equipment' ? 'Loading Equipment'
                  : 'Loading Settings' }}
              </p>
              <div class="mt-4 h-9 w-56 bg-surface-container-high"></div>
              <div class="mt-3 h-4 w-72 max-w-full bg-surface-container-high/80"></div>
            </div>

            <div v-if="loadingViewKey === 'dashboard'" class="space-y-6 animate-pulse">
              <div class="dashboard-command-center space-y-6">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div v-for="index in 4" :key="'dashboard-stat-' + index" class="h-36 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <div class="space-y-6">
                    <div class="h-[28rem] rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                    <div class="grid gap-4 md:grid-cols-3">
                      <div v-for="index in 3" :key="'dashboard-recent-' + index" class="h-28 rounded-2xl bg-surface-container-low shadow-panel"></div>
                    </div>
                  </div>
                  <div class="space-y-4">
                    <div class="h-44 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                    <div class="h-44 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'map'" class="dashboard-command-center dashboard-map-only animate-pulse">
              <section class="dashboard-section dashboard-map-section relative min-h-[calc(100vh-10rem)]">
                <div class="dashboard-glass-card dashboard-map-panel relative h-full min-h-[calc(100vh-10rem)] overflow-hidden rounded-[1.5rem] bg-surface-container-low shadow-panel">
                  <div class="absolute left-6 top-6 z-10 space-y-3">
                    <div class="h-4 w-40 rounded bg-surface-container-high"></div>
                    <div class="h-9 w-72 rounded bg-surface-container-high"></div>
                    <div class="h-4 w-96 max-w-full rounded bg-surface-container-high"></div>
                  </div>
                  <div class="absolute inset-0 bg-surface-container-high/60"></div>
                  <div class="absolute inset-0 technical-grid opacity-[0.12]"></div>
                  <div class="absolute bottom-8 left-8 flex gap-3">
                    <div v-for="index in 4" :key="'map-site-chip-' + index" class="h-14 w-44 rounded-xl bg-surface-container-low"></div>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="loadingViewKey === 'equipment'" class="dashboard-command-center animate-pulse">
              <div class="flex justify-end">
                <div class="h-12 w-[24rem] rounded-xl bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="settings-stat-strip">
                <div v-for="index in 2" :key="'equipment-stat-' + index" class="h-20 rounded-2xl bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="equipment-page-layout">
                <aside class="settings-panel settings-card equipment-service-sidebar h-[34rem] bg-surface-container-low shadow-panel"></aside>
                <section class="min-w-0">
                  <div class="equipment-items-grid">
                    <div v-for="index in 6" :key="'equipment-card-' + index" class="h-64 rounded-2xl bg-surface-container-low shadow-panel"></div>
                  </div>
                </section>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'logs'" class="space-y-6 animate-pulse">
              <div class="dashboard-command-center space-y-6">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div v-for="index in 4" :key="'logs-stat-' + index" class="h-32 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                  <div class="h-24 rounded-2xl bg-surface-container-low shadow-panel"></div>
                  <div class="h-24 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="space-y-4">
                  <div v-for="index in 5" :key="'logs-card-' + index" class="h-36 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'detail'" class="space-y-6 animate-pulse">
              <div class="relative h-[19rem] overflow-hidden rounded-[2rem] bg-surface-container-low shadow-panel">
                <div class="absolute left-8 top-8 h-11 w-36 rounded-xl bg-surface-container-high"></div>
                <div class="absolute bottom-8 left-8 right-8 space-y-5">
                  <div class="h-5 w-80 rounded bg-surface-container-high"></div>
                  <div class="h-14 max-w-3xl rounded bg-surface-container-high"></div>
                  <div class="flex flex-wrap gap-10">
                    <div v-for="index in 4" :key="'detail-hero-metric-' + index" class="space-y-2">
                      <div class="h-3 w-24 rounded bg-surface-container-high"></div>
                      <div class="h-8 w-20 rounded bg-surface-container-high"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-12 gap-6">
                <div class="col-span-12 space-y-6 xl:col-span-8">
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="mb-6 flex items-center justify-between">
                      <div class="h-6 w-52 rounded bg-surface-container-high"></div>
                      <div class="h-7 w-24 rounded-full bg-surface-container-high"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                      <div v-for="index in 6" :key="'detail-logbook-' + index" class="h-24 rounded-xl bg-surface-container-high"></div>
                    </div>
                  </div>
                  <div class="h-[20rem] rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="col-span-12 xl:col-span-4">
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="mb-5 h-5 w-56 rounded bg-surface-container-high"></div>
                    <div class="divide-y divide-primary/10">
                      <div v-for="index in 4" :key="'detail-telemetry-' + index" class="space-y-3 py-5 first:pt-0 last:pb-0">
                        <div class="h-5 w-5 rounded bg-surface-container-high"></div>
                        <div class="h-3 w-32 rounded bg-surface-container-high"></div>
                        <div class="h-7 w-28 rounded bg-surface-container-high"></div>
                        <div class="h-3 w-40 rounded bg-surface-container-high"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-span-12 pt-8">
                  <div class="mb-5 h-6 w-44 rounded bg-surface-container-high"></div>
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
                    <div v-for="index in 5" :key="'detail-equipment-' + index" class="h-20 rounded-xl bg-surface-container-low shadow-panel"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'imports'" class="space-y-6 animate-pulse">
              <div class="h-36 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.82fr)]">
                <div class="space-y-4">
                  <div v-for="index in 5" :key="'imports-row-' + index" class="h-28 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="space-y-4">
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'edit'" class="space-y-6 animate-pulse">
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
                <div class="space-y-6">
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="grid gap-4 md:grid-cols-2">
                      <div v-for="index in 10" :key="'edit-field-' + index" class="h-16 rounded-xl bg-surface-container-high"></div>
                    </div>
                  </div>
                </div>
                <div class="space-y-4">
                  <div class="h-64 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'create'" class="space-y-6 animate-pulse">
              <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
                <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                  <div class="grid gap-4 md:grid-cols-2">
                    <div v-for="index in 12" :key="'create-field-' + index" class="h-16 rounded-xl bg-surface-container-high"></div>
                  </div>
                </div>
                <div class="space-y-4">
                  <div class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else class="settings-layout animate-pulse">
              <aside class="settings-section-nav h-[42rem] bg-surface-container-low shadow-panel">
                <div class="space-y-3 p-4">
                  <div v-for="index in 8" :key="'settings-nav-' + index" class="h-14 rounded-xl bg-surface-container-high"></div>
                </div>
              </aside>
              <section class="min-w-0 space-y-6">
                <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                <div class="grid gap-6 md:grid-cols-2">
                  <div v-for="index in 4" :key="'settings-panel-' + index" class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </section>
            </div>
          </section>
          <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold text-on-error-container">Frontend could not load dive data</p>
            <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
            <button @click="fetchDives" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Retry</button>
          </section>
          <dashboard-view v-else-if="activeView === 'dashboard'" display-mode="dashboard" :dives="committedDives" :all-dives="dives" :dive-sites="profileDiveSites" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <dashboard-view v-else-if="activeView === 'map'" display-mode="map" :dives="committedDives" :all-dives="dives" :dive-sites="profileDiveSites" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <logs-view v-else-if="activeView === 'logs' && !selectedDive" :dives="committedDives" :dive-sites="profileDiveSites" :logbook-display-fields="profileLogbookDisplayFields" :search-text="searchText" :open-dive="openDive" :open-import-queue="openImportQueue" :open-manual-dive="openManualDiveCreator" :set-search-text="setSearchText" :delete-dive="deleteDive" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError"></logs-view>
          <manual-dive-entry-view v-else-if="activeView === 'create'" :draft="manualDiveDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :creating="manualDiveCreating" :error-message="manualDiveError" :update-draft="updateManualDiveDraft" :create-manual-dive="createManualDive" :close-creator="closeManualDiveCreator" :create-dive-site="createDiveSite" :search-dive-site-location="searchDiveSiteLocation"></manual-dive-entry-view>
          <dive-import-editor-view v-else-if="activeView === 'imports' && selectedImportDive" :dive="selectedImportDive" :draft="selectedImportDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :saving-import-id="savingImportId" :bulk-import-save-pending="bulkImportSavePending" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :update-import-draft="updateImportDraft" :save-import-draft="saveImportDraft" :delete-dive="deleteDive" :apply-buddy-guide-to-pending-imports="applyBuddyGuideToPendingImports" :create-dive-site="createDiveSite" :back-to-queue="backToImportQueue"></dive-import-editor-view>
          <dive-import-view v-else-if="activeView === 'imports'" :dives="dives" :import-drafts="importDrafts" :required-logbook-fields="profileRequiredLogbookFields" :selected-import-id="selectedImportId" :select-import-dive="selectImportDive" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :delete-dive="deleteDive" :set-view="setView" :fetch-dives="fetchDives"></dive-import-view>
          <logbook-editor-view v-else-if="activeView === 'edit' && selectedEditDive" :dive="selectedEditDive" :all-dives="dives" :draft="selectedEditDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :saving-import-id="savingImportId" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError" :update-dive-draft="updateImportDraft" :save-dive-logbook="saveExistingDiveLogbook" :delete-dive="deleteDive" :create-dive-site="createDiveSite" :close-editor="closeDiveEditor"></logbook-editor-view>
          <dive-detail-view v-else-if="activeView === 'logs' && selectedDive" :dive="selectedDive" :all-dives="dives" :dive-sites="profileDiveSites" :deleting-dive-id="deletingDiveId" :close-detail="closeDiveDetail" :open-dive-editor="openDiveEditor" :delete-dive="deleteDive"></dive-detail-view>
          <equipment-view v-else-if="activeView === 'equipment'" :equipment="equipment" :search-text="searchText" :set-search-text="setSearchText" :saving="equipmentSaving" :status-message="equipmentStatusMessage" :error-message="equipmentError" :save-equipment="saveEquipment"></equipment-view>
          <settings-view v-else-if="activeView === 'settings'" :cli-auth-code="cliAuthCode" :active-section="activeSettingsSection" :set-active-section="setSettingsSection" :profile-updated="handleProfileUpdated" :refresh-dives="fetchDives" :open-import-queue="openImportQueue" :upload-csv-import="uploadCsvImport" :upload-subsurface-import="uploadSubsurfaceImport" :current-locale="i18nLocale" :set-locale="setLocale" :theme-preference="themePreference" :resolved-theme="resolvedTheme" :set-theme-preference="setThemePreference"></settings-view>
        </div>
      </main>
      <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-primary/10 bg-surface-container-low/80 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <button
          v-for="item in mobileNavItems"
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
      <div
        v-if="passwordDialogOpen"
        @click.self="closePasswordDialog"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="w-full max-w-md rounded-3xl border border-primary/10 bg-surface-container-low p-6 shadow-panel">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Account Security</p>
              <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Change Password</h3>
              <p class="mt-3 text-sm leading-6 text-secondary">Update the password for your current DiveVault account.</p>
            </div>
            <button @click="closePasswordDialog" :disabled="passwordSubmitting" class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/10 text-secondary transition-colors hover:bg-surface-container-high">
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <p v-if="passwordStatus" class="mt-5 text-sm text-primary">{{ passwordStatus }}</p>
          <p v-if="passwordError" class="mt-5 text-sm text-error">{{ passwordError }}</p>

          <div class="mt-5 space-y-4">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Current Password</span>
              <input v-model="passwordForm.currentPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">New Password</span>
              <input v-model="passwordForm.newPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Confirm New Password</span>
              <input v-model="passwordForm.confirmPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            <button @click="submitPasswordChange" :disabled="passwordSubmitting" class="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary transition-all hover:brightness-110">
              {{ passwordSubmitting ? 'Updating Password' : 'Update Password' }}
            </button>
            <button @click="closePasswordDialog" :disabled="passwordSubmitting" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
</template>

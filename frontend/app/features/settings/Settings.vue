<script>
import { createProfileCollectionMethods } from "~/features/settings/methods/profile-collection-methods.js";
import { createDataManagementMethods } from "~/features/settings/methods/data-management-methods.js";
import { createUserManagementMethods } from "~/features/settings/methods/user-management-methods.js";
import { defineAsyncComponent } from "vue";
import { useAuth, useUser } from "~/shared/composables/auth.js";
import { createApiClient } from "~/shared/api/client.js";
import { createSettingsCollectionOptions } from "~/shared/composables/settings-collection-options.js";
import { createSettingsDiveSiteMapOptions } from "~/shared/composables/settings-dive-site-map.js";
import { logbookRequirementFieldOptions, normalizeRequiredLogbookFields } from "~/shared/utils/core.js";
import ApplicationSettingsTab from "~/features/settings/components/ApplicationSettingsTab.vue";
import BackupTab from "~/features/settings/components/BackupTab.vue";
import BuddiesTab from "~/features/settings/components/BuddiesTab.vue";
import DataManagementTab from "~/features/settings/components/DataManagementTab.vue";
import DiveSitesTab from "~/features/settings/components/DiveSitesTab.vue";
import DiverDetailsTab from "~/features/settings/components/DiverDetailsTab.vue";
import GuidesTab from "~/features/settings/components/GuidesTab.vue";
import UserManagementTab from "~/features/settings/components/UserManagementTab.vue";
import { LOCALES } from "~/i18n/locales.js";
import { SETTINGS_SECTIONS } from "~/config/settings-sections.js";
import packageJson from "../../../package.json";

import {
  THEME_OPTIONS,
  formatBytes,
  formatSettingsDateTime as formatDateTime,
  emptyProfile,
  cloneBuddies,
  cloneDiveSites,
  cloneGuides,
  cloneLicenses,
  cloneProfile,
  emptyInviteDraft,
  editableLicensePayload,
  comparableLicenses,
  editableDiveSitePayload,
  comparableDiveSites,
  editableBuddyPayload,
  comparableBuddies,
  editableGuidePayload,
  comparableGuides,
  normalizeBuddies,
  normalizeDiveSites,
  normalizeGuides,
  normalizeLicenses
} from "~/shared/utils/settings-profile.js";

const APP_VERSION = packageJson?.version || "0.0.0";
const LicensePdfPreview = defineAsyncComponent(() => import("~/shared/components/LicensePdfPreview.vue"));

export default {
  name: "SettingsView",
  components: {
    ApplicationSettingsTab,
    BackupTab,
    BuddiesTab,
    DataManagementTab,
    DiveSitesTab,
    DiverDetailsTab,
    GuidesTab,
    UserManagementTab,
    LicensePdfPreview
  },
  props: {
    cliAuthCode: {
      type: String,
      default: ""
    },
    activeSection: {
      type: String,
      default: () => SETTINGS_SECTIONS[0]?.id || "diver-details"
    },
    setActiveSection: {
      type: Function,
      default: null
    },
    profileUpdated: {
      type: Function,
      default: null
    },
    refreshDives: {
      type: Function,
      default: null
    },
    openImportQueue: {
      type: Function,
      default: null
    },
    uploadCsvImport: {
      type: Function,
      default: null
    },
    uploadSubsurfaceImport: {
      type: Function,
      default: null
    },
    currentLocale: {
      type: String,
      default: "en"
    },
    setLocale: {
      type: Function,
      default: null
    },
    themePreference: {
      type: String,
      default: "system"
    },
    resolvedTheme: {
      type: String,
      default: "dark"
    },
    setThemePreference: {
      type: Function,
      default: null
    }
  },
  setup() {
    const { getToken } = useAuth();
    const { user } = useUser();

    return {
      authGetToken: getToken,
      authUser: user
    };
  },
  provide() {
    return {
      settingsContext: this
    };
  },
  data() {
    return {
      settingsProfile: emptyProfile(),
      profileDraft: {
        name: "",
        email: ""
      },
      selectedLocale: this.currentLocale || "en",
      selectedThemePreference: this.themePreference || "system",
      publicSharingDraft: {
        public_dives_enabled: false
      },
      licenseDrafts: [],
      diveSiteDrafts: [],
      buddyDrafts: [],
      guideDrafts: [],
      isProfileEditing: false,
      areLicensesEditing: false,
      areDiveSitesEditing: false,
      areBuddiesEditing: false,
      areGuidesEditing: false,
      profileLoading: true,
      profileSaving: false,
      publicSharingSaving: false,
      licensesSaving: false,
      diveSitesSaving: false,
      buddiesSaving: false,
      guidesSaving: false,
      licenseUploadingId: null,
      diveSiteLookupId: null,
      profileStatus: "",
      profileError: "",
      dataManagementStatus: "",
      dataManagementWarning: "",
      dataManagementError: "",
      dataManagementAction: "",
      importReadyForReview: false,
      pendingImportFile: null,
      pendingImportKind: "",
      importPreview: null,
      manageUsersLoading: false,
      manageUsersSaving: false,
      manageUsersStatus: "",
      manageUsersError: "",
      authSettings: {
        public_registration_enabled: false,
        owner_user_id: "",
        user_count: 0,
        initialized: false
      },
      authUsers: [],
      inviteDraft: emptyInviteDraft(),
      inviteSubmitting: false,
      latestInviteUrl: "",
      desktopSyncStatus: "",
      desktopSyncError: "",
      desktopSyncApproving: false,
      profileStatusTimeoutId: null,
      pendingLicenseUploadId: null,
      activeLicenseDocument: null,
      activeLicensePreview: null,
      licenseFilter: "",
      diveSiteFilter: "",
      diveSitePage: 1,
      diveSitePageSize: 10,
      diveSitePageSizeOptions: [5, 10, 20, 50],
      openDiveSiteMapIds: [],
      buddyFilter: "",
      guideFilter: "",
      pendingCreation: null,
      pendingCreationError: "",
      pendingCreationSubmitting: false,
      pendingCreationLookupLoading: false,
      pendingRemoval: null,
      editingLicenseIds: [],
      editingDiveSiteIds: [],
      editingBuddyIds: [],
      editingGuideIds: [],
      expandedLicenseIds: [],
      expandedDiveSiteIds: [],
      expandedBuddyIds: [],
      expandedGuideIds: [],
      licenseExpandedSnapshot: null,
      diveSiteExpandedSnapshot: null,
      buddyExpandedSnapshot: null,
      guideExpandedSnapshot: null
    };
  },
  computed: {
    hasCliAuthCode() {
      return Boolean(this.cliAuthCode);
    },
    canManageUsers() {
      return Boolean(this.authUser?.isOwner);
    },
    currentUserEmail() {
      return this.authUser?.primaryEmailAddress?.emailAddress || this.authUser?.emailAddresses?.[0]?.emailAddress || "";
    },
    currentUserName() {
      const firstName = this.authUser?.firstName?.trim() || "";
      const lastName = this.authUser?.lastName?.trim() || "";
      return [firstName, lastName].filter(Boolean).join(" ") || this.currentUserEmail || "";
    },
    licenses() {
      return this.settingsProfile.licenses;
    },
    diveSites() {
      return this.settingsProfile.dive_sites;
    },
    buddies() {
      return this.settingsProfile.buddies;
    },
    guides() {
      return this.settingsProfile.guides;
    },
    visibleLicenses() {
      return this.sortAndFilterCollection(
        this.areLicensesEditing ? this.licenseDrafts : this.licenses,
        this.licenseFilter,
        (license) => this.licenseSortKey(license),
        (license) => [license?.certification_name, license?.company, license?.student_number, license?.instructor_number],
        this.editingLicenseIds
      );
    },
    visibleDiveSites() {
      return this.sortAndFilterCollection(
        this.areDiveSitesEditing ? this.diveSiteDrafts : this.diveSites,
        this.diveSiteFilter,
        (site) => this.diveSiteSortKey(site),
        (site) => [site?.name, site?.location, site?.country],
        this.editingDiveSiteIds
      );
    },
    diveSitePageCount() {
      return Math.max(1, Math.ceil(this.visibleDiveSites.length / this.diveSitePageSize));
    },
    pagedDiveSites() {
      const start = (this.diveSitePage - 1) * this.diveSitePageSize;
      return this.visibleDiveSites.slice(start, start + this.diveSitePageSize);
    },
    diveSitePaginationLabel() {
      if (!this.visibleDiveSites.length) return "0 dive sites";
      const start = (this.diveSitePage - 1) * this.diveSitePageSize + 1;
      const end = Math.min(this.diveSitePage * this.diveSitePageSize, this.visibleDiveSites.length);
      return `${start}-${end} of ${this.visibleDiveSites.length} dive sites`;
    },
    visibleBuddies() {
      return this.sortAndFilterCollection(
        this.areBuddiesEditing ? this.buddyDrafts : this.buddies,
        this.buddyFilter,
        (buddy) => this.buddySortKey(buddy),
        (buddy) => [buddy?.name],
        this.editingBuddyIds
      );
    },
    visibleGuides() {
      return this.sortAndFilterCollection(
        this.areGuidesEditing ? this.guideDrafts : this.guides,
        this.guideFilter,
        (guide) => this.guideSortKey(guide),
        (guide) => [guide?.name],
        this.editingGuideIds
      );
    },
    isInteractionLocked() {
      return (
        this.profileLoading ||
        this.profileSaving ||
        this.publicSharingSaving ||
        this.licensesSaving ||
        this.diveSitesSaving ||
        this.buddiesSaving ||
        this.guidesSaving ||
        Boolean(this.licenseUploadingId)
      );
    },
    hasUnsavedProfileChanges() {
      return (
        JSON.stringify({
          name: (this.profileDraft.name || "").trim(),
          email: (this.profileDraft.email || "").trim()
        }) !==
        JSON.stringify({
          name: (this.settingsProfile.name || "").trim(),
          email: (this.settingsProfile.email || "").trim()
        })
      );
    },
    hasUnsavedPublicSharingChanges() {
      return Boolean(this.publicSharingDraft.public_dives_enabled) !== Boolean(this.settingsProfile.public_dives_enabled);
    },
    publicProfileUrl() {
      if (!this.settingsProfile.public_slug || typeof window === "undefined") return "";
      return `${window.location.origin}/public/${this.settingsProfile.public_slug}`;
    },
    settingsOverviewStats() {
      const stats = [
        { id: "licenses", label: "Licenses", value: this.licenses.length, icon: "workspace_premium" },
        { id: "sites", label: "Dive sites", value: this.diveSites.length, icon: "pin_drop" },
        { id: "buddies", label: "Buddies", value: this.buddies.length, icon: "groups" },
        { id: "guides", label: "Guides", value: this.guides.length, icon: "support_agent" }
      ];
      if (this.canManageUsers) {
        stats.push({ id: "users", label: "Users", value: this.authUsers.length, icon: "group_add" });
      }
      return stats;
    },
    availableLanguages() {
      return LOCALES.map((locale) => ({
        value: locale.code,
        label: locale.name
      }));
    },
    availableThemeOptions() {
      return THEME_OPTIONS;
    },
    selectedThemeLabel() {
      const label = this.availableThemeOptions.find((theme) => theme.value === this.selectedThemePreference)?.label || "System default";
      return this.t(label, label);
    },
    settingsSections() {
      return SETTINGS_SECTIONS.filter((section) => section.id !== "manage-users" || this.canManageUsers);
    },
    activeSettingsSection() {
      return this.settingsSections.some((section) => section.id === this.activeSection)
        ? this.activeSection
        : this.settingsSections[0]?.id || "diver-details";
    },
    isDataManagementBusy() {
      return Boolean(this.dataManagementAction);
    },
    canConfirmImportPreview() {
      return Boolean(
        this.importPreview && Number(this.importPreview.invalid_rows || 0) === 0 && Number(this.importPreview.ready_rows || 0) > 0
      );
    },
    pendingCreationType() {
      return this.pendingCreation?.type || "";
    },
    pendingCreationDraft() {
      return this.pendingCreation?.draft || null;
    },
    pendingCreationTitle() {
      const titleByType = {
        license: "Add license",
        "dive-site": "Add dive site",
        buddy: "Add buddy",
        guide: "Add guide"
      };
      return titleByType[this.pendingCreationType] || "Add item";
    },
    pendingCreationSubmitLabel() {
      const labelByType = {
        license: "Save license",
        "dive-site": "Save dive site",
        buddy: "Save buddy",
        guide: "Save guide"
      };
      return labelByType[this.pendingCreationType] || "Save";
    },
    ownerUserId() {
      return this.authSettings.owner_user_id || "";
    },
    appVersion() {
      return APP_VERSION;
    }
  },
  watch: {
    canManageUsers: {
      async handler(value) {
        if (value) {
          await this.fetchUserManagement();
          return;
        }
        this.authUsers = [];
        this.latestInviteUrl = "";
        this.manageUsersStatus = "";
        this.manageUsersError = "";
      },
      immediate: true
    },
    currentUserName: {
      handler() {
        this.syncAuthenticationDefaults();
      },
      immediate: true
    },
    currentUserEmail: {
      handler() {
        this.syncAuthenticationDefaults();
      },
      immediate: true
    },
    currentLocale: {
      handler(value) {
        this.selectedLocale = value || "en";
      },
      immediate: true
    },
    themePreference: {
      handler(value) {
        this.selectedThemePreference = value || "system";
      },
      immediate: true
    },
    profileStatus(value) {
      this.clearProfileStatusTimer();
      if (!value) {
        return;
      }
      this.profileStatusTimeoutId = window.setTimeout(() => {
        this.profileStatus = "";
        this.profileStatusTimeoutId = null;
      }, 3000);
    },
    diveSiteFilter() {
      this.diveSitePage = 1;
    },
    diveSitePageSize() {
      this.closeAllDiveSiteMaps();
      this.diveSitePage = 1;
    },
    areDiveSitesEditing() {
      this.closeAllDiveSiteMaps();
      this.diveSitePage = 1;
    },
    visibleDiveSites() {
      if (this.diveSitePage > this.diveSitePageCount) {
        this.diveSitePage = this.diveSitePageCount;
      }
    },
    activeSettingsSection() {
      this.clearProfileStatusFeedback();
      if (this.activeSettingsSection !== "dive-sites") {
        this.closeAllDiveSiteMaps();
      }
      if (this.activeSettingsSection === "dive-sites") {
        this.diveSitePage = 1;
      }
    }
  },
  mounted() {
    this.fetchProfile();
  },
  beforeUnmount() {
    this.clearProfileStatusTimer();
    this.closeAllDiveSiteMaps();
  },
  methods: {
    ...createUserManagementMethods(),
    ...createDataManagementMethods(),
    ...createProfileCollectionMethods(),
    ...createSettingsCollectionOptions(),
    ...createSettingsDiveSiteMapOptions(),
    clearProfileStatusTimer() {
      if (this.profileStatusTimeoutId) {
        window.clearTimeout(this.profileStatusTimeoutId);
        this.profileStatusTimeoutId = null;
      }
    },
    clearProfileStatusFeedback() {
      this.clearProfileStatusTimer();
      this.profileStatus = "";
    },
    selectSettingsSection(sectionId) {
      if (typeof this.setActiveSection === "function") {
        this.setActiveSection(sectionId);
      }
    },
    async changePreferredLanguage(value) {
      if (value?.target?.value || typeof value === "string") {
        this.selectedLocale = value?.target?.value || value;
      }
      if (typeof this.setLocale === "function") {
        await this.setLocale(this.selectedLocale);
      }
      const languageLabel =
        this.availableLanguages.find((language) => language.value === this.selectedLocale)?.label || this.selectedLocale;
      this.profileError = "";
      this.profileStatus = `Language set to ${languageLabel}.`;
    },
    changeThemePreference() {
      if (typeof this.setThemePreference === "function") {
        this.setThemePreference(this.selectedThemePreference);
      }
      this.profileError = "";
      this.profileStatus = this.t("Theme set to {theme}.", "Theme set to {theme}.", { theme: this.selectedThemeLabel });
    },
    syncAuthenticationDefaults() {
      if (!this.settingsProfile.name && this.currentUserName) {
        this.settingsProfile.name = this.currentUserName;
      }
      if (!this.settingsProfile.email && this.currentUserEmail) {
        this.settingsProfile.email = this.currentUserEmail;
      }

      if (!this.isProfileEditing) {
        if (!this.profileDraft.name && this.settingsProfile.name) {
          this.profileDraft.name = this.settingsProfile.name;
        }
        if (!this.profileDraft.email && this.settingsProfile.email) {
          this.profileDraft.email = this.settingsProfile.email;
        }
      }
    },
    hydrateProfile(payload = {}) {
      return cloneProfile({
        name: payload?.name || "",
        email: payload?.email || "",
        public_dives_enabled: Boolean(payload?.public_dives_enabled),
        public_slug: payload?.public_slug || "",
        logbook_display_fields: Array.isArray(payload?.logbook_display_fields) ? payload.logbook_display_fields : [],
        required_logbook_fields: normalizeRequiredLogbookFields(payload?.required_logbook_fields),
        equipment_selection_enabled: payload?.equipment_selection_enabled !== false,
        licenses: normalizeLicenses(payload?.licenses),
        dive_sites: normalizeDiveSites(payload?.dive_sites),
        buddies: normalizeBuddies(payload?.buddies),
        guides: normalizeGuides(payload?.guides)
      });
    },
    resetDraftsFromProfile() {
      this.profileDraft = {
        name: this.settingsProfile.name,
        email: this.settingsProfile.email
      };
      this.publicSharingDraft = {
        public_dives_enabled: Boolean(this.settingsProfile.public_dives_enabled)
      };
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
      this.editingLicenseIds = [];
      this.editingDiveSiteIds = [];
      this.editingBuddyIds = [];
      this.editingGuideIds = [];
      this.licenseExpandedSnapshot = null;
      this.diveSiteExpandedSnapshot = null;
      this.buddyExpandedSnapshot = null;
      this.guideExpandedSnapshot = null;
      this.syncExpandedPanels();
    },
    notifyProfileUpdated(profile) {
      if (typeof this.profileUpdated === "function") {
        this.profileUpdated(profile);
      }
    },
    t(key, fallback = key, params = {}) {
      return typeof this.$t === "function" ? this.$t(key, fallback, params) : fallback;
    },
    displayValue(value, fallback = "Not provided") {
      return value ? value : fallback;
    },
    optionalLogbookFieldOptions() {
      return [
        {
          key: "weather_description",
          label: this.t("settings.logLayout.weather", "Weather description"),
          detail: this.t("settings.logLayout.weather.detail", "Show sea state and weather conditions in log rows.")
        },
        {
          key: "visibility",
          label: this.t("Visibility", "Visibility"),
          detail: this.t("settings.logLayout.visibility.detail", "Show underwater visibility notes in log rows.")
        },
        {
          key: "wetsuit_description",
          label: this.t("settings.logLayout.wetsuit", "Wetsuit description"),
          detail: this.t("settings.logLayout.wetsuit.detail", "Show exposure protection details in log rows.")
        },
        {
          key: "weight_description",
          label: this.t("settings.logLayout.weights", "Weights"),
          detail: this.t("settings.logLayout.weights.detail", "Show weight configuration notes in log rows.")
        }
      ];
    },
    requiredLogbookFieldOptions() {
      const detailByKey = {
        site: this.t("settings.requiredLogbook.site.detail", "Require a dive site before a log entry can be completed."),
        buddy: this.t("settings.requiredLogbook.buddy.detail", "Require a named buddy before a log entry can be completed."),
        guide: this.t("settings.requiredLogbook.guide.detail", "Require a guide or instructor before a log entry can be completed."),
        weather_description: this.t(
          "settings.requiredLogbook.weather.detail",
          "Require weather notes before a log entry can be completed."
        ),
        visibility: this.t("settings.requiredLogbook.visibility.detail", "Require visibility notes before a log entry can be completed."),
        wetsuit_description: this.t(
          "settings.requiredLogbook.wetsuit.detail",
          "Require exposure protection notes before a log entry can be completed."
        ),
        weight_description: this.t(
          "settings.requiredLogbook.weights.detail",
          "Require weight configuration notes before a log entry can be completed."
        ),
        notes: this.t("settings.requiredLogbook.notes.detail", "Require general dive notes before a log entry can be completed.")
      };
      return logbookRequirementFieldOptions.map((field) => ({
        ...field,
        label: this.t(`settings.requiredLogbook.${field.key}`, field.label),
        detail: detailByKey[field.key] || ""
      }));
    },
    logbookFieldEnabled(fieldKey) {
      return Array.isArray(this.settingsProfile.logbook_display_fields) && this.settingsProfile.logbook_display_fields.includes(fieldKey);
    },
    toggleLogbookDisplayField(fieldKey) {
      const active = new Set(Array.isArray(this.settingsProfile.logbook_display_fields) ? this.settingsProfile.logbook_display_fields : []);
      if (active.has(fieldKey)) active.delete(fieldKey);
      else active.add(fieldKey);
      const ordered = this.optionalLogbookFieldOptions()
        .map((option) => option.key)
        .filter((key) => active.has(key));
      this.settingsProfile = this.hydrateProfile({
        ...this.settingsProfile,
        logbook_display_fields: ordered
      });
    },
    requiredLogbookFieldEnabled(fieldKey) {
      return Array.isArray(this.settingsProfile.required_logbook_fields) && this.settingsProfile.required_logbook_fields.includes(fieldKey);
    },
    toggleRequiredLogbookField(fieldKey) {
      const active = new Set(normalizeRequiredLogbookFields(this.settingsProfile.required_logbook_fields));
      if (fieldKey === "site") {
        active.add("site");
      } else if (active.has(fieldKey)) {
        active.delete(fieldKey);
      } else {
        active.add(fieldKey);
      }
      const ordered = this.requiredLogbookFieldOptions()
        .map((option) => option.key)
        .filter((key) => active.has(key));
      this.settingsProfile = this.hydrateProfile({
        ...this.settingsProfile,
        required_logbook_fields: ordered
      });
    },
    toggleEquipmentSelectionEnabled() {
      this.settingsProfile = this.hydrateProfile({
        ...this.settingsProfile,
        equipment_selection_enabled: !this.settingsProfile.equipment_selection_enabled
      });
    },
    licenseTitle(license, index) {
      return license.certification_name || license.company || `License ${index + 1}`;
    },
    licenseSortKey(license) {
      return license?.certification_name || license?.company || license?.student_number || license?.id || "";
    },
    licenseExistsOnServer(licenseId) {
      return this.settingsProfile.licenses.some((license) => license.id === licenseId);
    },
    hasUnsavedLicenseChanges() {
      return JSON.stringify(comparableLicenses(this.licenseDrafts)) !== JSON.stringify(comparableLicenses(this.settingsProfile.licenses));
    },
    hasUnsavedDiveSiteChanges() {
      return (
        JSON.stringify(comparableDiveSites(this.diveSiteDrafts)) !== JSON.stringify(comparableDiveSites(this.settingsProfile.dive_sites))
      );
    },
    hasUnsavedBuddyChanges() {
      return JSON.stringify(comparableBuddies(this.buddyDrafts)) !== JSON.stringify(comparableBuddies(this.settingsProfile.buddies));
    },
    hasUnsavedGuideChanges() {
      return JSON.stringify(comparableGuides(this.guideDrafts)) !== JSON.stringify(comparableGuides(this.settingsProfile.guides));
    },
    diveSiteTitle(site, index) {
      return site.name || `Dive Site ${index + 1}`;
    },
    pagedDiveSiteTitle(site, index) {
      return this.diveSiteTitle(site, (this.diveSitePage - 1) * this.diveSitePageSize + index);
    },
    diveSiteSortKey(site) {
      return site?.name || site?.location || site?.country || site?.id || "";
    },
    nextDiveSitePage() {
      if (this.diveSitePage < this.diveSitePageCount) {
        this.closeAllDiveSiteMaps();
        this.diveSitePage += 1;
      }
    },
    previousDiveSitePage() {
      if (this.diveSitePage > 1) {
        this.closeAllDiveSiteMaps();
        this.diveSitePage -= 1;
      }
    },
    buddyTitle(buddy, index) {
      return buddy.name || `Buddy ${index + 1}`;
    },
    buddySortKey(buddy) {
      return buddy?.name || buddy?.id || "";
    },
    guideTitle(guide, index) {
      return guide.name || `Guide ${index + 1}`;
    },
    guideSortKey(guide) {
      return guide?.name || guide?.id || "";
    },
    apiClient() {
      return createApiClient({
        getToken: () => this.authGetToken({ skipCache: true })
      });
    },
    async authenticatedFetch(resource, options = {}) {
      return this.apiClient().request(resource, options);
    },
    async fetchProfile() {
      this.profileLoading = true;
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.syncAuthenticationDefaults();
        this.resetDraftsFromProfile();
      } catch (error) {
        this.profileError = error?.message || "Could not load the user profile.";
      } finally {
        this.profileLoading = false;
      }
    },
    async readErrorResponse(response, fallbackMessage) {
      const payload = await response
        .clone()
        .json()
        .catch(() => null);
      if (payload?.error) return payload.error;
      const bodyText = await response.text().catch(() => "");
      return bodyText || fallbackMessage || `API returned ${response.status}`;
    },
    beginProfileEdit() {
      this.profileError = "";
      this.profileStatus = "";
      this.profileDraft = {
        name: this.settingsProfile.name || this.currentUserName || "",
        email: this.settingsProfile.email || this.currentUserEmail || ""
      };
      this.isProfileEditing = true;
    },
    cancelProfileEdit() {
      this.profileDraft = {
        name: this.settingsProfile.name,
        email: this.settingsProfile.email
      };
      this.isProfileEditing = false;
    },
    async saveProfile() {
      this.profileSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: this.profileDraft.name,
            email: this.profileDraft.email,
            logbook_display_fields: this.settingsProfile.logbook_display_fields,
            required_logbook_fields: this.settingsProfile.required_logbook_fields,
            equipment_selection_enabled: this.settingsProfile.equipment_selection_enabled,
            licenses: this.settingsProfile.licenses.map(editableLicensePayload),
            dive_sites: this.settingsProfile.dive_sites.map(editableDiveSitePayload),
            buddies: this.settingsProfile.buddies.map(editableBuddyPayload),
            guides: this.settingsProfile.guides.map(editableGuidePayload)
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.resetDraftsFromProfile();
        this.isProfileEditing = false;
        this.profileStatus = "Profile updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the user profile.";
      } finally {
        this.profileSaving = false;
      }
    },
    async savePublicSharing() {
      this.publicSharingSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            public_dives_enabled: Boolean(this.publicSharingDraft.public_dives_enabled)
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.resetDraftsFromProfile();
        this.profileStatus = this.settingsProfile.public_dives_enabled ? "Public dive profile enabled." : "Public dive profile disabled.";
      } catch (error) {
        this.profileError = error?.message || "Could not update public dive sharing.";
      } finally {
        this.publicSharingSaving = false;
      }
    },
    async copyPublicProfileUrl() {
      if (!this.publicProfileUrl || !navigator?.clipboard?.writeText) {
        this.profileError = "Clipboard access is unavailable in this browser.";
        return;
      }
      try {
        await navigator.clipboard.writeText(this.publicProfileUrl);
        this.profileStatus = "Public profile link copied.";
        this.profileError = "";
      } catch {
        this.profileError = "Could not copy the public profile link.";
      }
    },
    diveSiteHasCoordinates(site) {
      return (
        site?.latitude !== "" &&
        site?.latitude !== null &&
        site?.latitude !== undefined &&
        site?.longitude !== "" &&
        site?.longitude !== null &&
        site?.longitude !== undefined
      );
    },
    formatBytes,
    formatDateTime
  }
};
</script>

<template>
  <section class="dashboard-command-center text-on-surface">
    <header class="settings-stat-strip">
      <article v-for="stat in settingsOverviewStats" :key="stat.id" class="settings-stat-pill">
        <span class="material-symbols-outlined settings-stat-pill-icon">{{ stat.icon }}</span>
        <p class="settings-stat-pill-label">{{ stat.label }}</p>
        <div v-if="profileLoading" class="settings-loading-bar settings-loading-bar-stat"></div>
        <p v-else class="settings-stat-pill-value">{{ stat.value }}</p>
      </article>
    </header>

    <div v-if="profileStatus" class="settings-feedback border-outline-variant/60 bg-primary/10 text-primary shadow-panel">
      {{ profileStatus }}
    </div>
    <div v-if="profileError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">
      {{ profileError }}
    </div>

    <div class="settings-mobile-nav settings-panel flex gap-3 overflow-x-auto p-3 md:hidden">
      <UButton
        v-for="section in settingsSections"
        :key="section.id"
        @click="selectSettingsSection(section.id)"
        class="min-w-[14rem] shrink-0 rounded-xl border px-4 py-3 text-left transition-colors"
        :class="
          activeSettingsSection === section.id
            ? 'border-primary/30 bg-surface-container-high text-primary'
            : 'border-outline-variant/60 bg-background/10 text-secondary'
        "
      >
        <div class="flex items-start gap-3">
          <span class="material-symbols-outlined mt-0.5 text-lg">{{ section.icon }}</span>
          <div>
            <p class="font-label text-xs font-medium">{{ section.label }}</p>
            <p class="mt-2 text-xs leading-5 opacity-80">{{ section.description }}</p>
          </div>
        </div>
      </UButton>
    </div>

    <section class="settings-page-layout">
      <aside class="settings-section-nav settings-panel">
        <UButton
          v-for="section in settingsSections"
          :key="'desktop-settings-' + section.id"
          type="button"
          @click="selectSettingsSection(section.id)"
          class="settings-section-nav-item"
          :class="activeSettingsSection === section.id ? 'is-active' : ''"
        >
          <span class="material-symbols-outlined settings-section-nav-icon">{{ section.icon }}</span>
          <span class="min-w-0">
            <span class="settings-section-nav-label">{{ section.label }}</span>
            <span class="settings-section-nav-description">{{ section.description }}</span>
          </span>
        </UButton>
      </aside>

      <section class="settings-content">
        <div v-if="profileLoading" class="settings-panel settings-card settings-loading-state">
          <div>
            <p class="font-label text-xs font-medium text-primary">Loading</p>
            <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Loading settings</h4>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Loading your profile...</p>
          </div>

          <div class="settings-loading-grid">
            <div class="settings-loading-card">
              <div class="settings-loading-bar settings-loading-bar-title"></div>
              <div class="settings-loading-bar settings-loading-bar-body"></div>
              <div class="settings-loading-bar settings-loading-bar-body settings-loading-bar-short"></div>
            </div>
            <div class="settings-loading-card">
              <div class="settings-loading-bar settings-loading-bar-title"></div>
              <div class="settings-loading-bar settings-loading-bar-body"></div>
              <div class="settings-loading-bar settings-loading-bar-body"></div>
            </div>
            <div class="settings-loading-card">
              <div class="settings-loading-bar settings-loading-bar-title"></div>
              <div class="settings-loading-bar settings-loading-bar-body"></div>
              <div class="settings-loading-bar settings-loading-bar-body settings-loading-bar-short"></div>
            </div>
          </div>
        </div>

        <template v-else>
          <diver-details-tab v-if="activeSettingsSection === 'diver-details'" />
          <application-settings-tab v-if="activeSettingsSection === 'application-settings'" />
          <dive-sites-tab v-if="activeSettingsSection === 'dive-sites'" />
          <buddies-tab v-if="activeSettingsSection === 'buddies'" />
          <guides-tab v-if="activeSettingsSection === 'dive-guide'" />
          <data-management-tab v-if="activeSettingsSection === 'data-management'" />
          <user-management-tab v-if="activeSettingsSection === 'manage-users' && canManageUsers" />
          <backup-tab v-if="activeSettingsSection === 'backup'" />
        </template>
      </section>
    </section>

    <div
      v-if="pendingCreation"
      @click.self="closeCreateDialog"
      class="fixed inset-0 z-[55] flex items-center justify-center bg-background/88 px-6 py-8"
    >
      <div class="settings-modal-card">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-label text-xs font-medium text-primary">New entry</p>
            <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ pendingCreationTitle }}</h3>
            <p class="mt-3 text-sm text-secondary">This entry stays out of the list until you save it here.</p>
          </div>
          <UButton
            type="button"
            @click="closeCreateDialog"
            :disabled="pendingCreationSubmitting"
            class="settings-button settings-button-ghost"
          >
            Close
          </UButton>
        </div>

        <div v-if="pendingCreationError" class="settings-feedback mt-5 border-error/20 bg-error-container/20 text-on-error-container">
          {{ pendingCreationError }}
        </div>

        <div v-if="pendingCreationType === 'license'" class="settings-modal-grid mt-6">
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Company</span>
            <UInput v-model="pendingCreationDraft.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
          </label>
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Certification name</span>
            <UInput
              v-model="pendingCreationDraft.certification_name"
              type="text"
              class="settings-input"
              placeholder="Advanced Open Water"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Student number</span>
            <UInput
              v-model="pendingCreationDraft.student_number"
              type="text"
              class="settings-input"
              placeholder="Student or certification number"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Certification date</span>
            <UInput v-model="pendingCreationDraft.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
          </label>
          <label class="space-y-2 md:col-span-2">
            <span class="font-label text-xs font-medium text-secondary">Instructor number</span>
            <UInput v-model="pendingCreationDraft.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
          </label>
          <div class="settings-side-panel md:col-span-2">
            <p class="font-label text-xs font-medium text-primary">PDF upload</p>
            <p class="mt-2 text-sm text-secondary">
              Save the license first. You can attach or replace the PDF from the saved license card.
            </p>
          </div>
        </div>

        <div v-else-if="pendingCreationType === 'dive-site'" class="settings-modal-section mt-6">
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Site name</span>
            <UInput v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
          </label>
          <div class="settings-side-panel settings-modal-subsection">
            <div class="settings-modal-section">
              <div class="settings-modal-header">
                <div>
                  <p class="font-label text-xs font-medium text-primary">GPS lookup</p>
                  <p class="settings-modal-copy mt-2 text-sm text-secondary">
                    Search from the location text, then adjust latitude and longitude if needed.
                  </p>
                </div>
                <UButton
                  type="button"
                  @click="searchPendingDiveSiteLocation"
                  :disabled="pendingCreationLookupLoading"
                  class="settings-button settings-button-secondary settings-modal-lookup-button"
                >
                  {{ pendingCreationLookupLoading ? "Searching GPS" : "Search GPS from location" }}
                </UButton>
              </div>
              <label class="space-y-2">
                <span class="font-label text-xs font-medium text-secondary">Location</span>
                <UInput v-model="pendingCreationDraft.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
              </label>
              <div class="settings-modal-site-grid">
                <label class="space-y-2">
                  <span class="font-label text-xs font-medium text-secondary">Country</span>
                  <UInput v-model="pendingCreationDraft.country" type="text" class="settings-input" placeholder="Egypt" />
                </label>
                <label class="space-y-2">
                  <span class="font-label text-xs font-medium text-secondary">Latitude</span>
                  <UInput
                    v-model="pendingCreationDraft.latitude"
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    class="settings-input"
                    placeholder="25.1234"
                  />
                </label>
                <label class="space-y-2">
                  <span class="font-label text-xs font-medium text-secondary">Longitude</span>
                  <UInput
                    v-model="pendingCreationDraft.longitude"
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    class="settings-input"
                    placeholder="-80.4567"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="pendingCreationType === 'buddy'" class="settings-modal-grid mt-6">
          <label class="space-y-2 md:col-span-2">
            <span class="font-label text-xs font-medium text-secondary">Buddy name</span>
            <UInput v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Sam Carter" />
          </label>
        </div>

        <div v-else-if="pendingCreationType === 'guide'" class="settings-modal-grid mt-6">
          <label class="space-y-2 md:col-span-2">
            <span class="font-label text-xs font-medium text-secondary">Guide name</span>
            <UInput v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Kai Jensen" />
          </label>
        </div>

        <div class="settings-modal-actions">
          <UButton
            type="button"
            @click="closeCreateDialog"
            :disabled="pendingCreationSubmitting"
            class="settings-button settings-button-ghost"
          >
            Cancel
          </UButton>
          <UButton
            type="button"
            @click="confirmCreateDialog"
            :disabled="pendingCreationSubmitting"
            class="settings-button settings-button-primary"
          >
            {{ pendingCreationSubmitting ? "Saving..." : pendingCreationSubmitLabel }}
          </UButton>
        </div>
      </div>
    </div>

    <div
      v-if="activeLicenseDocument"
      @click.self="closeLicenseDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6 py-8"
    >
      <div
        class="relative max-h-full w-full max-w-5xl overflow-auto border border-outline-variant/60 bg-surface-container-low p-4 shadow-panel"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <p class="font-label text-xs font-medium text-primary">License PDF</p>
            <p class="mt-1 text-sm text-secondary">{{ activeLicenseDocument.pdf?.filename || "License PDF" }}</p>
          </div>
          <UButton type="button" @click="closeLicenseDocument" class="settings-button settings-button-secondary"> Close </UButton>
        </div>
        <license-pdf-preview
          :pdf="activeLicenseDocument.pdf"
          :authenticated-fetch="authenticatedFetch"
          @open-preview="openLicensePreview($event, activeLicenseDocument)"
        />
      </div>
    </div>

    <div
      v-if="activeLicensePreview"
      @click.self="closeLicensePreview"
      class="fixed inset-0 z-[55] flex items-center justify-center bg-background/90 px-6 py-8"
    >
      <div
        class="relative max-h-full w-full max-w-5xl overflow-auto border border-outline-variant/60 bg-surface-container-low p-4 shadow-panel"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <p class="font-label text-xs font-medium text-primary">License preview</p>
            <p class="mt-1 text-sm text-secondary">{{ activeLicensePreview.filename }} - Page {{ activeLicensePreview.pageNumber }}</p>
          </div>
          <UButton type="button" @click="closeLicensePreview" class="settings-button settings-button-secondary"> Close </UButton>
        </div>
        <img
          :src="activeLicensePreview.image"
          :alt="activeLicensePreview.filename"
          class="mx-auto max-h-[80vh] w-auto max-w-full bg-white"
        />
      </div>
    </div>

    <div
      v-if="pendingRemoval"
      @click.self="closeRemovalDialog"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-background/88 px-6 py-8"
    >
      <div class="settings-confirm-dialog">
        <div>
          <p class="font-label text-xs font-medium text-primary">Confirm removal</p>
          <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Remove {{ pendingRemoval.label }}?</h3>
          <p class="mt-3 text-sm text-secondary">This action cannot be undone.</p>
        </div>
        <div class="settings-confirm-actions">
          <UButton type="button" @click="closeRemovalDialog" class="settings-button settings-button-ghost"> Cancel </UButton>
          <UButton type="button" @click="confirmPendingRemoval" class="settings-button settings-button-danger"> Remove </UButton>
        </div>
      </div>
    </div>
  </section>
</template>

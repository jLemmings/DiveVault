<script>
import { defineAsyncComponent } from "vue";
import { useAuth, useUser } from "~/shared/composables/auth.js";
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
import { SETTINGS_SECTIONS } from "~/settings-sections.js";
import packageJson from "../../../package.json";

import {
  MAX_LICENSE_BYTES,
  THEME_OPTIONS,
  formatBytes,
  formatSettingsDateTime as formatDateTime,
  bytesToBase64,
  emptyProfile,
  emptyLicense,
  emptyDiveSite,
  emptyBuddy,
  emptyGuide,
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
  normalizeLicenses,
  duplicateImportWarning
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
      return this.authUser?.primaryEmailAddress?.emailAddress
        || this.authUser?.emailAddresses?.[0]?.emailAddress
        || "";
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
        (license) => [
          license?.certification_name,
          license?.company,
          license?.student_number,
          license?.instructor_number
        ],
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
      return this.profileLoading
        || this.profileSaving
        || this.publicSharingSaving
        || this.licensesSaving
        || this.diveSitesSaving
        || this.buddiesSaving
        || this.guidesSaving
        || Boolean(this.licenseUploadingId);
    },
    hasUnsavedProfileChanges() {
      return JSON.stringify({
        name: (this.profileDraft.name || "").trim(),
        email: (this.profileDraft.email || "").trim()
      }) !== JSON.stringify({
        name: (this.settingsProfile.name || "").trim(),
        email: (this.settingsProfile.email || "").trim()
      });
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
        { id: "sites", label: "Dive Sites", value: this.diveSites.length, icon: "pin_drop" },
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
      const label = this.availableThemeOptions.find((theme) => theme.value === this.selectedThemePreference)?.label || "System Default";
      return this.t(label, label);
    },
    settingsSections() {
      return SETTINGS_SECTIONS.filter((section) => section.id !== "manage-users" || this.canManageUsers);
    },
    activeSettingsSection() {
      return this.settingsSections.some((section) => section.id === this.activeSection)
        ? this.activeSection
        : (this.settingsSections[0]?.id || "diver-details");
    },
    isDataManagementBusy() {
      return Boolean(this.dataManagementAction);
    },
    canConfirmImportPreview() {
      return Boolean(
        this.importPreview
          && Number(this.importPreview.invalid_rows || 0) === 0
          && Number(this.importPreview.ready_rows || 0) > 0
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
        license: "Add License",
        "dive-site": "Add Dive Site",
        buddy: "Add Buddy",
        guide: "Add Guide"
      };
      return titleByType[this.pendingCreationType] || "Add Item";
    },
    pendingCreationSubmitLabel() {
      const labelByType = {
        license: "Save License",
        "dive-site": "Save Dive Site",
        buddy: "Save Buddy",
        guide: "Save Guide"
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
      const languageLabel = this.availableLanguages.find((language) => language.value === this.selectedLocale)?.label || this.selectedLocale;
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
    resetDataManagementFeedback() {
      this.dataManagementStatus = "";
      this.dataManagementWarning = "";
      this.dataManagementError = "";
      this.importReadyForReview = false;
    },
    duplicateImportWarning,
    importKindLabel(kind) {
      return kind === "subsurface" ? "Subsurface export" : "CSV file";
    },
    normalizedImportPreview(payload, kind, file) {
      const summary = payload?.summary || payload || {};
      const rows = Array.isArray(summary.dives) ? summary.dives : [];
      return {
        ...summary,
        kind,
        label: this.importKindLabel(kind),
        fileName: file?.name || "",
        rows: Number(summary.rows || rows.length || 0),
        valid_rows: Number(summary.valid_rows || 0),
        invalid_rows: Number(summary.invalid_rows || 0),
        ready_rows: Number(summary.ready_rows || 0),
        duplicates: Number(summary.duplicates || 0),
        dives: rows
      };
    },
    importPreviewStatusLabel(row) {
      if (!row?.valid) return "Invalid";
      if (row?.status === "inserted") return "Imported";
      if (row?.duplicate) return "Duplicate";
      return "Ready";
    },
    importPreviewStatusClass(row) {
      if (!row?.valid) return "border-error/25 bg-error-container/20 text-on-error-container";
      if (row?.duplicate) return "border-tertiary/30 bg-tertiary/10 text-tertiary";
      return "border-primary/25 bg-primary/10 text-primary";
    },
    importResultStatus(payload, label) {
      const inserted = Number(payload?.inserted ?? 0);
      const rows = Number(payload?.rows ?? 0);
      const duplicates = Number(payload?.duplicates ?? 0);
      if (inserted <= 0 && duplicates > 0) {
        return `No new dives were added from this ${label}.`;
      }
      return `${label} import complete. ${inserted} new dives added from ${rows} dive${rows === 1 ? '' : 's'}; ${duplicates} duplicate dive${duplicates === 1 ? '' : 's'} skipped. Next step: review the imported dives and complete their logbook fields.`;
    },
    displayValue(value, fallback = "Not provided") {
      return value ? value : fallback;
    },
    optionalLogbookFieldOptions() {
      return [
        { key: "weather_description", label: this.t("settings.logLayout.weather", "Weather description"), detail: this.t("settings.logLayout.weather.detail", "Show sea state and weather conditions in log rows.") },
        { key: "visibility", label: this.t("Visibility", "Visibility"), detail: this.t("settings.logLayout.visibility.detail", "Show underwater visibility notes in log rows.") },
        { key: "wetsuit_description", label: this.t("settings.logLayout.wetsuit", "Wetsuit description"), detail: this.t("settings.logLayout.wetsuit.detail", "Show exposure protection details in log rows.") },
        { key: "weight_description", label: this.t("settings.logLayout.weights", "Weights"), detail: this.t("settings.logLayout.weights.detail", "Show weight configuration notes in log rows.") }
      ];
    },
    requiredLogbookFieldOptions() {
      const detailByKey = {
        site: this.t("settings.requiredLogbook.site.detail", "Require a dive site before a log entry can be completed."),
        buddy: this.t("settings.requiredLogbook.buddy.detail", "Require a named buddy before a log entry can be completed."),
        guide: this.t("settings.requiredLogbook.guide.detail", "Require a guide or instructor before a log entry can be completed."),
        weather_description: this.t("settings.requiredLogbook.weather.detail", "Require weather notes before a log entry can be completed."),
        visibility: this.t("settings.requiredLogbook.visibility.detail", "Require visibility notes before a log entry can be completed."),
        wetsuit_description: this.t("settings.requiredLogbook.wetsuit.detail", "Require exposure protection notes before a log entry can be completed."),
        weight_description: this.t("settings.requiredLogbook.weights.detail", "Require weight configuration notes before a log entry can be completed."),
        notes: this.t("settings.requiredLogbook.notes.detail", "Require general dive notes before a log entry can be completed.")
      };
      return logbookRequirementFieldOptions.map((field) => ({
        ...field,
        label: this.t(`settings.requiredLogbook.${field.key}`, field.label),
        detail: detailByKey[field.key] || ""
      }));
    },
    logbookFieldEnabled(fieldKey) {
      return Array.isArray(this.settingsProfile.logbook_display_fields)
        && this.settingsProfile.logbook_display_fields.includes(fieldKey);
    },
    toggleLogbookDisplayField(fieldKey) {
      const active = new Set(Array.isArray(this.settingsProfile.logbook_display_fields) ? this.settingsProfile.logbook_display_fields : []);
      if (active.has(fieldKey)) active.delete(fieldKey);
      else active.add(fieldKey);
      const ordered = this.optionalLogbookFieldOptions().map((option) => option.key).filter((key) => active.has(key));
      this.settingsProfile = this.hydrateProfile({
        ...this.settingsProfile,
        logbook_display_fields: ordered
      });
    },
    requiredLogbookFieldEnabled(fieldKey) {
      return Array.isArray(this.settingsProfile.required_logbook_fields)
        && this.settingsProfile.required_logbook_fields.includes(fieldKey);
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
      const ordered = this.requiredLogbookFieldOptions().map((option) => option.key).filter((key) => active.has(key));
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
      return JSON.stringify(comparableLicenses(this.licenseDrafts))
        !== JSON.stringify(comparableLicenses(this.settingsProfile.licenses));
    },
    hasUnsavedDiveSiteChanges() {
      return JSON.stringify(comparableDiveSites(this.diveSiteDrafts))
        !== JSON.stringify(comparableDiveSites(this.settingsProfile.dive_sites));
    },
    hasUnsavedBuddyChanges() {
      return JSON.stringify(comparableBuddies(this.buddyDrafts))
        !== JSON.stringify(comparableBuddies(this.settingsProfile.buddies));
    },
    hasUnsavedGuideChanges() {
      return JSON.stringify(comparableGuides(this.guideDrafts))
        !== JSON.stringify(comparableGuides(this.settingsProfile.guides));
    },
    diveSiteTitle(site, index) {
      return site.name || `Dive Site ${index + 1}`;
    },
    pagedDiveSiteTitle(site, index) {
      return this.diveSiteTitle(site, ((this.diveSitePage - 1) * this.diveSitePageSize) + index);
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
    async authenticatedFetch(resource, options = {}) {
      const token = await this.authGetToken({ skipCache: true });
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(resource, {
        ...options,
        credentials: "include",
        headers
      });
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
      const payload = await response.clone().json().catch(() => null);
      if (payload?.error) return payload.error;
      const bodyText = await response.text().catch(() => "");
      return bodyText || fallbackMessage || `API returned ${response.status}`;
    },
    async fetchUserManagement() {
      if (!this.canManageUsers) {
        return;
      }
      this.manageUsersLoading = true;
      this.manageUsersError = "";
      try {
        const [settingsResponse, usersResponse] = await Promise.all([
          this.authenticatedFetch("/api/auth/settings"),
          this.authenticatedFetch("/api/users")
        ]);
        if (!settingsResponse.ok) {
          throw new Error(await this.readErrorResponse(settingsResponse, "Could not load authentication settings."));
        }
        if (!usersResponse.ok) {
          throw new Error(await this.readErrorResponse(usersResponse, "Could not load the user directory."));
        }
        const settingsPayload = await settingsResponse.json().catch(() => ({}));
        const usersPayload = await usersResponse.json().catch(() => ({}));
        this.authSettings = {
          public_registration_enabled: Boolean(settingsPayload?.public_registration_enabled),
          owner_user_id: settingsPayload?.owner_user_id || "",
          user_count: Number(settingsPayload?.user_count || 0),
          initialized: Boolean(settingsPayload?.initialized)
        };
        this.authUsers = Array.isArray(usersPayload?.users) ? usersPayload.users : [];
      } catch (error) {
        this.manageUsersError = error?.message || "Could not load user management.";
      } finally {
        this.manageUsersLoading = false;
      }
    },
    async savePublicRegistrationSetting() {
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch("/api/auth/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_registration_enabled: Boolean(this.authSettings.public_registration_enabled)
          })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update public registration."));
        }
        const payload = await response.json().catch(() => ({}));
        this.authSettings = {
          public_registration_enabled: Boolean(payload?.public_registration_enabled),
          owner_user_id: payload?.owner_user_id || "",
          user_count: Number(payload?.user_count || this.authUsers.length),
          initialized: Boolean(payload?.initialized)
        };
        this.manageUsersStatus = this.authSettings.public_registration_enabled
          ? "Public registration enabled."
          : "Public registration disabled.";
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update public registration.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async createUserInvite() {
      this.inviteSubmitting = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch("/api/auth/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.inviteDraft)
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not create the invitation."));
        }
        const payload = await response.json().catch(() => ({}));
        const inviteUrl = String(payload?.invite_url || "");
        this.latestInviteUrl = inviteUrl.startsWith("/")
          ? `${window.location.origin}${inviteUrl}`
          : inviteUrl;
        this.manageUsersStatus = `Invitation created for ${this.inviteDraft.email.trim()}.`;
        this.inviteDraft = {
          ...emptyInviteDraft(),
          role: this.inviteDraft.role,
          expires_in_days: this.inviteDraft.expires_in_days
        };
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not create the invitation.";
      } finally {
        this.inviteSubmitting = false;
      }
    },
    async copyLatestInviteUrl() {
      if (!this.latestInviteUrl || !navigator?.clipboard?.writeText) {
        this.manageUsersError = "Clipboard access is unavailable in this browser.";
        return;
      }
      try {
        await navigator.clipboard.writeText(this.latestInviteUrl);
        this.manageUsersStatus = "Invitation link copied.";
        this.manageUsersError = "";
      } catch (_error) {
        this.manageUsersError = "Could not copy the invitation link.";
      }
    },
    async toggleManagedUserActive(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !Boolean(user.is_active) })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update the user status."));
        }
        const payload = await response.json().catch(() => ({}));
        const updatedUser = payload?.user || user;
        this.manageUsersStatus = updatedUser.is_active
          ? `Reactivated ${updatedUser.email}.`
          : `Deactivated ${updatedUser.email}.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update the user status.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async toggleManagedUserRole(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      const nextRole = user.role === "admin" ? "user" : "admin";
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole })
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not update the user role."));
        }
        this.manageUsersStatus = `${user.email} is now ${nextRole}.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not update the user role.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    async deleteManagedUser(user) {
      if (!user?.id || user.id === this.ownerUserId) {
        return;
      }
      const confirmed = window.confirm(`Delete ${user.email}? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
      this.manageUsersSaving = true;
      this.manageUsersError = "";
      this.manageUsersStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/users/${user.id}`, {
          method: "DELETE"
        });
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, "Could not delete the user."));
        }
        this.manageUsersStatus = `${user.email} was removed.`;
        await this.fetchUserManagement();
      } catch (error) {
        this.manageUsersError = error?.message || "Could not delete the user.";
      } finally {
        this.manageUsersSaving = false;
      }
    },
    downloadBlob(blob, filename) {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    },
    filenameFromDisposition(value, fallback) {
      if (typeof value !== "string" || !value.trim()) return fallback;
      const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
      if (utf8Match?.[1]) {
        try {
          return decodeURIComponent(utf8Match[1]);
        } catch (_error) {
          return utf8Match[1];
        }
      }
      const plainMatch = value.match(/filename=\"?([^\";]+)\"?/i);
      return plainMatch?.[1] || fallback;
    },
    async exportDownload(endpoint, fallbackFilename, actionLabel, successMessage) {
      this.dataManagementAction = actionLabel;
      this.resetDataManagementFeedback();
      try {
        const response = await this.authenticatedFetch(endpoint);
        if (!response.ok) {
          throw new Error(await this.readErrorResponse(response, `Could not ${actionLabel.toLowerCase()}.`));
        }
        const blob = await response.blob();
        const filename = this.filenameFromDisposition(
          response.headers.get("Content-Disposition"),
          fallbackFilename
        );
        this.downloadBlob(blob, filename);
        this.dataManagementStatus = successMessage;
      } catch (error) {
        this.dataManagementError = error?.message || `Could not ${actionLabel.toLowerCase()}.`;
      } finally {
        this.dataManagementAction = "";
      }
    },
    exportDivePdf() {
      return this.exportDownload(
        "/api/exports/dives.pdf",
        "divevault-dives.pdf",
        "Exporting PDF",
        "Dive log PDF downloaded."
      );
    },
    exportDiveCsv() {
      return this.exportDownload(
        "/api/exports/dives.csv",
        "divevault-dives.csv",
        "Exporting CSV",
        "Dive telemetry CSV downloaded."
      );
    },
    async handleCsvImportSelection(event) {
      const file = event?.target?.files?.[0];
      if (event?.target) {
        event.target.value = "";
      }
      if (!file || typeof this.uploadCsvImport !== "function") return;

      this.dataManagementAction = "Previewing CSV";
      this.resetDataManagementFeedback();
      this.pendingImportFile = file;
      this.pendingImportKind = "csv";
      this.importPreview = null;
      try {
        const payload = await this.uploadCsvImport(file, {
          dryRun: true,
          navigateToQueue: false,
          setImportFeedback: false,
          refreshDives: false
        });
        this.importPreview = this.normalizedImportPreview(payload, "csv", file);
        const rows = Number(this.importPreview.rows || 0);
        this.dataManagementStatus = `CSV preview ready: ${rows} row${rows === 1 ? '' : 's'} checked. Review the table before importing.`;
      } catch (error) {
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
        this.dataManagementError = error?.message || "Could not import the CSV file.";
      } finally {
        this.dataManagementAction = "";
      }
    },
    async handleSubsurfaceImportSelection(event) {
      const file = event?.target?.files?.[0];
      if (event?.target) {
        event.target.value = "";
      }
      if (!file || typeof this.uploadSubsurfaceImport !== "function") return;

      this.dataManagementAction = "Previewing Subsurface";
      this.resetDataManagementFeedback();
      this.pendingImportFile = file;
      this.pendingImportKind = "subsurface";
      this.importPreview = null;
      try {
        const payload = await this.uploadSubsurfaceImport(file, { dryRun: true });
        this.importPreview = this.normalizedImportPreview(payload, "subsurface", file);
        const rows = Number(this.importPreview.rows || 0);
        this.dataManagementStatus = `Subsurface export preview ready: ${rows} dive${rows === 1 ? '' : 's'} checked. Review the table before importing.`;
      } catch (error) {
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
        this.dataManagementError = error?.message || "Could not preview the Subsurface export.";
      } finally {
        this.dataManagementAction = "";
      }
    },
    async confirmImportPreview() {
      if (!this.pendingImportFile || !this.pendingImportKind || !this.canConfirmImportPreview) return;
      const kind = this.pendingImportKind;
      const file = this.pendingImportFile;
      const label = this.importKindLabel(kind);
      const upload = kind === "subsurface" ? this.uploadSubsurfaceImport : this.uploadCsvImport;
      if (typeof upload !== "function") return;

      this.dataManagementAction = kind === "subsurface" ? "Importing Subsurface" : "Importing CSV";
      this.dataManagementError = "";
      try {
        const payload = await upload(file, {
          dryRun: false,
          navigateToQueue: false,
          setImportFeedback: false,
          refreshDives: false
        });
        this.dataManagementStatus = this.importResultStatus(payload, label);
        this.dataManagementWarning = this.duplicateImportWarning(payload, label);
        this.importReadyForReview = Number(payload?.inserted ?? 0) > 0;
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
      } catch (error) {
        this.dataManagementError = error?.message || `Could not import the ${label}.`;
      } finally {
        this.dataManagementAction = "";
      }
    },
    cancelImportPreview() {
      this.pendingImportFile = null;
      this.pendingImportKind = "";
      this.importPreview = null;
      this.resetDataManagementFeedback();
    },
    reviewImportQueue() {
      if (typeof this.openImportQueue === "function") {
        this.openImportQueue();
      }
    },
    exportBackup() {
      return this.exportDownload(
        "/api/backup/export",
        "divevault-backup.zip",
        "Exporting Backup",
        "Full backup downloaded."
      );
    },
    async handleBackupImportSelection(event) {
      const file = event?.target?.files?.[0];
      event.target.value = "";
      if (!file) return;

      this.dataManagementAction = "Importing Backup";
      this.resetDataManagementFeedback();
      try {
        const response = await this.authenticatedFetch("/api/backup/import", {
          method: "POST",
          headers: {
            "Content-Type": file.type || (file.name.toLowerCase().endsWith(".zip") ? "application/zip" : "application/json")
          },
          body: file
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        if (payload?.profile) {
          this.settingsProfile = this.hydrateProfile(payload.profile);
          this.notifyProfileUpdated(this.settingsProfile);
        } else {
          await this.fetchProfile();
        }

        this.isProfileEditing = false;
        this.areLicensesEditing = false;
        this.areDiveSitesEditing = false;
        this.areBuddiesEditing = false;
        this.areGuidesEditing = false;
        this.resetDraftsFromProfile();

        if (typeof this.refreshDives === "function") {
          await this.refreshDives();
        }

        const summary = payload?.summary || {};
        this.dataManagementStatus = `Backup imported. ${summary.dives_inserted ?? 0} new dives added from ${summary.dives_in_backup ?? 0} backup dives.`;
      } catch (error) {
        this.dataManagementError = error?.message || "Could not import the backup file.";
      } finally {
        this.dataManagementAction = "";
      }
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
        this.profileStatus = this.settingsProfile.public_dives_enabled
          ? "Public dive profile enabled."
          : "Public dive profile disabled.";
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
      } catch (_error) {
        this.profileError = "Could not copy the public profile link.";
      }
    },
    beginLicensesEdit() {
      this.beginCollectionEdit({
        draftKey: "licenseDrafts",
        sourceItems: this.settingsProfile.licenses,
        editingKey: "areLicensesEditing",
        expandedKey: "expandedLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        cloneItems: cloneLicenses
      });
    },
    cancelLicensesEdit() {
      this.pendingLicenseUploadId = null;
      this.cancelCollectionEdit({
        draftKey: "licenseDrafts",
        sourceItems: this.settingsProfile.licenses,
        editingKey: "areLicensesEditing",
        editingIdsKey: "editingLicenseIds",
        expandedKey: "expandedLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        cloneItems: cloneLicenses
      });
    },
    beginDiveSitesEdit() {
      this.beginCollectionEdit({
        draftKey: "diveSiteDrafts",
        sourceItems: this.settingsProfile.dive_sites,
        editingKey: "areDiveSitesEditing",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        cloneItems: cloneDiveSites
      });
    },
    cancelDiveSitesEdit() {
      this.cancelCollectionEdit({
        draftKey: "diveSiteDrafts",
        sourceItems: this.settingsProfile.dive_sites,
        editingKey: "areDiveSitesEditing",
        editingIdsKey: "editingDiveSiteIds",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        cloneItems: cloneDiveSites,
        afterCancel: this.closeAllDiveSiteMaps
      });
    },
    beginBuddiesEdit() {
      this.beginCollectionEdit({
        draftKey: "buddyDrafts",
        sourceItems: this.settingsProfile.buddies,
        editingKey: "areBuddiesEditing",
        expandedKey: "expandedBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        cloneItems: cloneBuddies
      });
    },
    cancelBuddiesEdit() {
      this.cancelCollectionEdit({
        draftKey: "buddyDrafts",
        sourceItems: this.settingsProfile.buddies,
        editingKey: "areBuddiesEditing",
        editingIdsKey: "editingBuddyIds",
        expandedKey: "expandedBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        cloneItems: cloneBuddies
      });
    },
    beginGuidesEdit() {
      this.beginCollectionEdit({
        draftKey: "guideDrafts",
        sourceItems: this.settingsProfile.guides,
        editingKey: "areGuidesEditing",
        expandedKey: "expandedGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        cloneItems: cloneGuides
      });
    },
    cancelGuidesEdit() {
      this.cancelCollectionEdit({
        draftKey: "guideDrafts",
        sourceItems: this.settingsProfile.guides,
        editingKey: "areGuidesEditing",
        editingIdsKey: "editingGuideIds",
        expandedKey: "expandedGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        cloneItems: cloneGuides
      });
    },
    async saveLicenses() {
      return this.saveProfileCollection({
        collectionKey: "licenses",
        draftKey: "licenseDrafts",
        payloadMapper: editableLicensePayload,
        savingKey: "licensesSaving",
        editingKey: "areLicensesEditing",
        editingIdsKey: "editingLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        successMessage: "Licenses updated.",
        errorMessage: "Could not save the license list."
      });
    },
    addLicense() {
      this.licenseDrafts = [emptyLicense(), ...this.licenseDrafts];
    },
    addLicenseEntry() {
      this.openCreateDialog("license");
    },
    addDiveSite() {
      this.diveSiteDrafts = [emptyDiveSite(), ...this.diveSiteDrafts];
    },
    addDiveSiteEntry() {
      this.openCreateDialog("dive-site");
    },
    addBuddy() {
      this.buddyDrafts = [emptyBuddy(), ...this.buddyDrafts];
    },
    addBuddyEntry() {
      this.openCreateDialog("buddy");
    },
    addGuide() {
      this.guideDrafts = [emptyGuide(), ...this.guideDrafts];
    },
    addGuideEntry() {
      this.openCreateDialog("guide");
    },
    removeLicense(index) {
      this.removeDraftEntry({
        draftKey: "licenseDrafts",
        editingIdsKey: "editingLicenseIds",
        editingKey: "areLicensesEditing",
        closeEditingWhenEmpty: true
      }, index);
    },
    removeDiveSite(index) {
      this.removeDraftEntry({
        draftKey: "diveSiteDrafts",
        editingIdsKey: "editingDiveSiteIds",
        editingKey: "areDiveSitesEditing"
      }, index);
    },
    removeBuddy(index) {
      this.removeDraftEntry({
        draftKey: "buddyDrafts",
        editingIdsKey: "editingBuddyIds",
        editingKey: "areBuddiesEditing"
      }, index);
    },
    removeGuide(index) {
      this.removeDraftEntry({
        draftKey: "guideDrafts",
        editingIdsKey: "editingGuideIds",
        editingKey: "areGuidesEditing"
      }, index);
    },
    openRemovalDialog(type, itemId, label, kindLabel) {
      this.pendingRemoval = {
        type,
        itemId,
        label: label || kindLabel,
        kindLabel
      };
    },
    closeRemovalDialog() {
      this.pendingRemoval = null;
    },
    async confirmPendingRemoval() {
      const pending = this.pendingRemoval;
      if (!pending) return;

      const collectionByType = {
        license: this.licenseDrafts,
        "dive-site": this.diveSiteDrafts,
        buddy: this.buddyDrafts,
        guide: this.guideDrafts
      };
      const currentCollection = collectionByType[pending.type] || [];
      const index = currentCollection.findIndex((entry) => entry?.id === pending.itemId);
      if (index === -1) {
        this.closeRemovalDialog();
        return;
      }

      this.closeRemovalDialog();
      if (pending.type === "license") {
        await this.removeLicenseConfirmed(index);
        return;
      }
      if (pending.type === "dive-site") {
        await this.removeDiveSiteConfirmed(index);
        return;
      }
      if (pending.type === "buddy") {
        await this.removeBuddyConfirmed(index);
        return;
      }
      if (pending.type === "guide") {
        await this.removeGuideConfirmed(index);
      }
    },
    confirmRemoveLicense(index) {
      const license = this.licenseDrafts[index];
      if (!license) return;
      const label = this.licenseTitle(license, index);
      this.openRemovalDialog("license", license.id, label, "this license");
    },
    confirmRemoveLicenseItem(licenseId) {
      const index = this.findCollectionIndexById(this.licenseDrafts, licenseId);
      if (index !== -1) {
        this.confirmRemoveLicense(index);
      }
    },
    async removeLicenseConfirmed(index) {
      const license = this.licenseDrafts[index];
      if (!license) return;
      const label = this.licenseTitle(license, index);
      const existedOnServer = this.licenseExistsOnServer(license.id);
      this.removeLicense(index);
      if (existedOnServer) {
        await this.saveLicenses();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveDiveSite(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;
      const label = this.diveSiteTitle(site, index);
      this.openRemovalDialog("dive-site", site.id, label, "this dive site");
    },
    confirmRemoveDiveSiteItem(siteId) {
      const index = this.findCollectionIndexById(this.diveSiteDrafts, siteId);
      if (index !== -1) {
        this.confirmRemoveDiveSite(index);
      }
    },
    async removeDiveSiteConfirmed(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;
      const label = this.diveSiteTitle(site, index);
      const existedOnServer = this.settingsProfile.dive_sites.some((entry) => entry.id === site.id);
      this.removeDiveSite(index);
      if (existedOnServer) {
        await this.saveDiveSites();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveBuddy(index) {
      const buddy = this.buddyDrafts[index];
      if (!buddy) return;
      const label = this.buddyTitle(buddy, index);
      this.openRemovalDialog("buddy", buddy.id, label, "this buddy");
    },
    confirmRemoveBuddyItem(buddyId) {
      const index = this.findCollectionIndexById(this.buddyDrafts, buddyId);
      if (index !== -1) {
        this.confirmRemoveBuddy(index);
      }
    },
    async removeBuddyConfirmed(index) {
      const buddy = this.buddyDrafts[index];
      if (!buddy) return;
      const label = this.buddyTitle(buddy, index);
      const existedOnServer = this.settingsProfile.buddies.some((entry) => entry.id === buddy.id);
      this.removeBuddy(index);
      if (existedOnServer) {
        await this.saveBuddies();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveGuide(index) {
      const guide = this.guideDrafts[index];
      if (!guide) return;
      const label = this.guideTitle(guide, index);
      this.openRemovalDialog("guide", guide.id, label, "this guide");
    },
    confirmRemoveGuideItem(guideId) {
      const index = this.findCollectionIndexById(this.guideDrafts, guideId);
      if (index !== -1) {
        this.confirmRemoveGuide(index);
      }
    },
    async removeGuideConfirmed(index) {
      const guide = this.guideDrafts[index];
      if (!guide) return;
      const label = this.guideTitle(guide, index);
      const existedOnServer = this.settingsProfile.guides.some((entry) => entry.id === guide.id);
      this.removeGuide(index);
      if (existedOnServer) {
        await this.saveGuides();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    isLookingUpDiveSite(siteId) {
      return this.diveSiteLookupId === siteId;
    },
    async searchDiveSiteLocation(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;

      const query = typeof site.location === "string" ? site.location.trim() : "";
      if (!query) {
        this.profileError = "Enter a location before searching for GPS coordinates.";
        this.profileStatus = "";
        return;
      }

      this.diveSiteLookupId = site.id;
      this.profileError = "";
      this.profileStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (!payload?.found || !payload?.result) {
          this.profileStatus = `No coordinates found for "${query}".`;
          return;
        }

        const nextDrafts = this.diveSiteDrafts.slice();
        nextDrafts[index] = {
          ...nextDrafts[index],
          country: typeof payload.result.country === "string" ? payload.result.country : nextDrafts[index].country,
          latitude: String(payload.result.latitude),
          longitude: String(payload.result.longitude)
        };
        this.diveSiteDrafts = nextDrafts;
        this.$nextTick(() => this.syncDiveSiteMapFromFields(site.id));
        this.profileStatus = `Coordinates found for "${query}".`;
      } catch (error) {
        this.profileError = error?.message || "Could not search for GPS coordinates.";
      } finally {
        this.diveSiteLookupId = null;
      }
    },
    searchDiveSiteLocationById(siteId) {
      const index = this.findCollectionIndexById(this.diveSiteDrafts, siteId);
      if (index !== -1) {
        return this.searchDiveSiteLocation(index);
      }
      return undefined;
    },
    async saveDiveSites() {
      return this.saveProfileCollection({
        collectionKey: "dive_sites",
        draftKey: "diveSiteDrafts",
        payloadMapper: editableDiveSitePayload,
        savingKey: "diveSitesSaving",
        editingKey: "areDiveSitesEditing",
        editingIdsKey: "editingDiveSiteIds",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        successMessage: "Dive sites updated.",
        errorMessage: "Could not save the dive site list.",
        afterSave: this.closeAllDiveSiteMaps
      });
    },
    async saveBuddies() {
      return this.saveProfileCollection({
        collectionKey: "buddies",
        draftKey: "buddyDrafts",
        payloadMapper: editableBuddyPayload,
        savingKey: "buddiesSaving",
        editingKey: "areBuddiesEditing",
        editingIdsKey: "editingBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        successMessage: "Buddies updated.",
        errorMessage: "Could not save the buddy list."
      });
    },
    async saveGuides() {
      return this.saveProfileCollection({
        collectionKey: "guides",
        draftKey: "guideDrafts",
        payloadMapper: editableGuidePayload,
        savingKey: "guidesSaving",
        editingKey: "areGuidesEditing",
        editingIdsKey: "editingGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        successMessage: "Guides updated.",
        errorMessage: "Could not save the guide list."
      });
    },
    isUploadingLicense(licenseId) {
      return this.licenseUploadingId === licenseId;
    },
    async handleLicenseSelection(event) {
      const file = event?.target?.files?.[0];
      const licenseId = this.pendingLicenseUploadId;
      event.target.value = "";
      this.pendingLicenseUploadId = null;
      if (!file || !licenseId) return;

      this.profileStatus = "";
      this.profileError = "";

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        this.profileError = "Choose a PDF file for your diving licenses.";
        return;
      }
      if (file.size > MAX_LICENSE_BYTES) {
        this.profileError = "License PDF must be 10 MB or smaller.";
        return;
      }

      this.licenseUploadingId = licenseId;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const response = await this.authenticatedFetch(`/api/profile/licenses/${licenseId}/pdf`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: "application/pdf",
            data_b64: bytesToBase64(bytes)
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.resetDraftsFromProfile();
        this.areLicensesEditing = true;
        this.profileStatus = `${file.name} uploaded for the selected license.`;
      } catch (error) {
        this.profileError = error?.message || "Could not upload the license PDF.";
      } finally {
        this.licenseUploadingId = null;
      }
    },
    viewLicensePdf(license) {
      if (!license?.pdf?.preview_url) {
        return;
      }
      this.activeLicenseDocument = license;
      this.profileError = "";
      this.profileStatus = "";
    },
    async approveDesktopSync() {
      if (!this.cliAuthCode) {
        return;
      }

      this.desktopSyncApproving = true;
      this.desktopSyncStatus = "";
      this.desktopSyncError = "";

      try {
        const token = await this.authGetToken({ skipCache: true });
        const response = await fetch("/api/cli-auth/approve", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ code: this.cliAuthCode })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.desktopSyncStatus = payload?.email
          ? `Desktop sync approved for ${payload.email}. Return to the Windows app to continue.`
          : "Desktop sync approved. Return to the Windows app to continue.";
      } catch (error) {
        this.desktopSyncError = error?.message || "Could not approve the desktop sync client.";
      } finally {
        this.desktopSyncApproving = false;
      }
    },
    openLicensePreview(page, license) {
      if (!page?.image) return;
      this.activeLicensePreview = {
        image: page.image,
        filename: license?.pdf?.filename || "License PDF",
        pageNumber: page.pageNumber || 1
      };
    },
    closeLicensePreview() {
      this.activeLicensePreview = null;
    },
    closeLicenseDocument() {
      this.activeLicenseDocument = null;
      this.activeLicensePreview = null;
    },
    openCreateDialog(type) {
      const draftByType = {
        license: emptyLicense,
        "dive-site": emptyDiveSite,
        buddy: emptyBuddy,
        guide: emptyGuide
      };
      const createDraft = draftByType[type];
      if (!createDraft) return;
      this.pendingCreation = {
        type,
        draft: createDraft()
      };
      this.pendingCreationError = "";
      this.pendingCreationSubmitting = false;
      this.pendingCreationLookupLoading = false;
    },
    closeCreateDialog() {
      if (this.pendingCreationSubmitting) return;
      this.pendingCreation = null;
      this.pendingCreationError = "";
      this.pendingCreationLookupLoading = false;
    },
    validatePendingCreation() {
      const draft = this.pendingCreationDraft;
      if (!draft) return "Nothing to save.";
      if (this.pendingCreationType === "license" && !draft.company.trim() && !draft.certification_name.trim()) {
        return "Add a company or certification name before saving the license.";
      }
      if (this.pendingCreationType === "dive-site" && !draft.name.trim()) {
        return "Enter a site name before saving the dive site.";
      }
      if (this.pendingCreationType === "buddy" && !draft.name.trim()) {
        return "Enter a buddy name before saving the buddy.";
      }
      if (this.pendingCreationType === "guide" && !draft.name.trim()) {
        return "Enter a guide name before saving the guide.";
      }
      return "";
    },
    async searchPendingDiveSiteLocation() {
      const site = this.pendingCreationDraft;
      if (!site || this.pendingCreationType !== "dive-site") return;

      const query = typeof site.location === "string" ? site.location.trim() : "";
      if (!query) {
        this.pendingCreationError = "Enter a location before searching for GPS coordinates.";
        return;
      }

      this.pendingCreationLookupLoading = true;
      this.pendingCreationError = "";
      this.profileStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (!payload?.found || !payload?.result) {
          this.pendingCreationError = `No coordinates found for "${query}".`;
          return;
        }

        this.pendingCreation = {
          ...this.pendingCreation,
          draft: {
            ...site,
            country: typeof payload.result.country === "string" ? payload.result.country : site.country,
            latitude: String(payload.result.latitude),
            longitude: String(payload.result.longitude)
          }
        };
      } catch (error) {
        this.pendingCreationError = error?.message || "Could not search for GPS coordinates.";
      } finally {
        this.pendingCreationLookupLoading = false;
      }
    },
    async confirmCreateDialog() {
      const validationError = this.validatePendingCreation();
      if (validationError) {
        this.pendingCreationError = validationError;
        return;
      }

      const draft = this.pendingCreationDraft;
      const type = this.pendingCreationType;
      if (!draft || !type) return;

      this.pendingCreationSubmitting = true;
      this.pendingCreationError = "";

      try {
        if (type === "license") {
          const previousDrafts = cloneLicenses(this.licenseDrafts);
          const previousEditingIds = [...this.editingLicenseIds];
          const wasEditing = this.areLicensesEditing;
          if (!this.areLicensesEditing) {
            this.beginLicensesEdit();
          }
          this.licenseDrafts = [draft, ...this.licenseDrafts];
          await this.saveLicenses();
          if (this.profileError) {
            this.licenseDrafts = previousDrafts;
            this.editingLicenseIds = previousEditingIds;
            this.areLicensesEditing = wasEditing;
          }
        } else if (type === "dive-site") {
          const previousDrafts = cloneDiveSites(this.diveSiteDrafts);
          const previousEditingIds = [...this.editingDiveSiteIds];
          const wasEditing = this.areDiveSitesEditing;
          if (!this.areDiveSitesEditing) {
            this.beginDiveSitesEdit();
          }
          this.diveSiteDrafts = [draft, ...this.diveSiteDrafts];
          await this.saveDiveSites();
          if (this.profileError) {
            this.diveSiteDrafts = previousDrafts;
            this.editingDiveSiteIds = previousEditingIds;
            this.areDiveSitesEditing = wasEditing;
          }
        } else if (type === "buddy") {
          const previousDrafts = cloneBuddies(this.buddyDrafts);
          const previousEditingIds = [...this.editingBuddyIds];
          const wasEditing = this.areBuddiesEditing;
          if (!this.areBuddiesEditing) {
            this.beginBuddiesEdit();
          }
          this.buddyDrafts = [draft, ...this.buddyDrafts];
          await this.saveBuddies();
          if (this.profileError) {
            this.buddyDrafts = previousDrafts;
            this.editingBuddyIds = previousEditingIds;
            this.areBuddiesEditing = wasEditing;
          }
        } else if (type === "guide") {
          const previousDrafts = cloneGuides(this.guideDrafts);
          const previousEditingIds = [...this.editingGuideIds];
          const wasEditing = this.areGuidesEditing;
          if (!this.areGuidesEditing) {
            this.beginGuidesEdit();
          }
          this.guideDrafts = [draft, ...this.guideDrafts];
          await this.saveGuides();
          if (this.profileError) {
            this.guideDrafts = previousDrafts;
            this.editingGuideIds = previousEditingIds;
            this.areGuidesEditing = wasEditing;
          }
        }

        if (!this.profileError) {
          this.pendingCreation = null;
        }
      } finally {
        this.pendingCreationSubmitting = false;
        this.pendingCreationLookupLoading = false;
      }
    },
    syncExpandedPanels() {
      const retainVisibleIds = (existingIds, items) => existingIds.filter((id) => items.some((item) => item.id === id));

      this.expandedLicenseIds = retainVisibleIds(this.expandedLicenseIds, this.settingsProfile.licenses);
      this.expandedDiveSiteIds = retainVisibleIds(this.expandedDiveSiteIds, this.settingsProfile.dive_sites);
      this.expandedBuddyIds = retainVisibleIds(this.expandedBuddyIds, this.settingsProfile.buddies);
      this.expandedGuideIds = retainVisibleIds(this.expandedGuideIds, this.settingsProfile.guides);
    },
    toggleExpandedItem(key, id) {
      const current = Array.isArray(this[key]) ? this[key] : [];
      this[key] = current.includes(id)
        ? current.filter((entryId) => entryId !== id)
        : [...current, id];
    },
    isExpandedItem(key, id) {
      return Array.isArray(this[key]) && this[key].includes(id);
    },
    toggleLicenseDetails(licenseId) {
      this.toggleExpandedItem("expandedLicenseIds", licenseId);
    },
    isLicenseEditing(licenseId) {
      return this.editingLicenseIds.includes(licenseId);
    },
    editLicenseItem(licenseId) {
      if (!this.areLicensesEditing) {
        this.beginLicensesEdit();
      }
      if (!this.isLicenseExpanded(licenseId)) {
        this.toggleLicenseDetails(licenseId);
      }
      this.editingLicenseIds = [licenseId];
    },
    isLicenseExpanded(licenseId) {
      return this.isExpandedItem("expandedLicenseIds", licenseId);
    },
    toggleDiveSiteDetails(siteId) {
      this.toggleExpandedItem("expandedDiveSiteIds", siteId);
    },
    isDiveSiteEditing(siteId) {
      return this.editingDiveSiteIds.includes(siteId);
    },
    editDiveSiteItem(siteId) {
      if (!this.areDiveSitesEditing) {
        this.beginDiveSitesEdit();
      }
      if (!this.isDiveSiteExpanded(siteId)) {
        this.toggleDiveSiteDetails(siteId);
      }
      this.editingDiveSiteIds = [siteId];
    },
    isDiveSiteExpanded(siteId) {
      return this.isExpandedItem("expandedDiveSiteIds", siteId);
    },
    editBuddyItem(buddyId) {
      if (!this.areBuddiesEditing) {
        this.beginBuddiesEdit();
      }
      if (!this.isBuddyExpanded(buddyId)) {
        this.toggleBuddyDetails(buddyId);
      }
      this.editingBuddyIds = [buddyId];
    },
    toggleBuddyDetails(buddyId) {
      this.toggleExpandedItem("expandedBuddyIds", buddyId);
    },
    isBuddyEditing(buddyId) {
      return this.editingBuddyIds.includes(buddyId);
    },
    isBuddyExpanded(buddyId) {
      return this.isExpandedItem("expandedBuddyIds", buddyId);
    },
    editGuideItem(guideId) {
      if (!this.areGuidesEditing) {
        this.beginGuidesEdit();
      }
      if (!this.isGuideExpanded(guideId)) {
        this.toggleGuideDetails(guideId);
      }
      this.editingGuideIds = [guideId];
    },
    toggleGuideDetails(guideId) {
      this.toggleExpandedItem("expandedGuideIds", guideId);
    },
    isGuideEditing(guideId) {
      return this.editingGuideIds.includes(guideId);
    },
    isGuideExpanded(guideId) {
      return this.isExpandedItem("expandedGuideIds", guideId);
    },
    diveSiteHasCoordinates(site) {
      return site?.latitude !== "" && site?.latitude !== null && site?.latitude !== undefined
        && site?.longitude !== "" && site?.longitude !== null && site?.longitude !== undefined;
    },
    formatBytes,
    formatDateTime
  },
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

      <div v-if="profileStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ profileStatus }}</div>
      <div v-if="profileError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">{{ profileError }}</div>

      <div class="settings-mobile-nav settings-panel flex gap-3 overflow-x-auto p-3 md:hidden">
        <UButton
          v-for="section in settingsSections"
          :key="section.id"
          @click="selectSettingsSection(section.id)"
          class="min-w-[14rem] shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors"
          :class="activeSettingsSection === section.id ? 'border-primary/30 bg-surface-container-high text-primary' : 'border-primary/10 bg-background/10 text-secondary'"
        >
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined mt-0.5 text-lg">{{ section.icon }}</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ section.label }}</p>
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
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Loading</p>
              <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Preparing Your Settings</h4>
              <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Fetching licenses, dive sites, buddies, guides, and saved profile details.</p>
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
        class="fixed inset-0 z-[55] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="settings-modal-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">New Entry</p>
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
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
              <UInput v-model="pendingCreationDraft.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
              <UInput v-model="pendingCreationDraft.certification_name" type="text" class="settings-input" placeholder="Advanced Open Water" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
              <UInput v-model="pendingCreationDraft.student_number" type="text" class="settings-input" placeholder="Student or certification number" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
              <UInput v-model="pendingCreationDraft.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
            </label>
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
              <UInput v-model="pendingCreationDraft.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
            </label>
            <div class="settings-side-panel md:col-span-2">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">PDF Upload</p>
              <p class="mt-2 text-sm text-secondary">Save the license first. You can attach or replace the PDF from the saved license card.</p>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'dive-site'" class="settings-modal-section mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
              <UInput v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
            </label>
            <div class="settings-side-panel settings-modal-subsection">
              <div class="settings-modal-section">
                <div class="settings-modal-header">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Lookup</p>
                    <p class="settings-modal-copy mt-2 text-sm text-secondary">Search from the location text, then adjust latitude and longitude if needed.</p>
                  </div>
                  <UButton
                    type="button"
                    @click="searchPendingDiveSiteLocation"
                    :disabled="pendingCreationLookupLoading"
                    class="settings-button settings-button-secondary settings-modal-lookup-button"
                  >
                    {{ pendingCreationLookupLoading ? 'Searching GPS' : 'Search GPS From Location' }}
                  </UButton>
                </div>
                <label class="space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                  <UInput v-model="pendingCreationDraft.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                </label>
                <div class="settings-modal-site-grid">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                    <UInput v-model="pendingCreationDraft.country" type="text" class="settings-input" placeholder="Egypt" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <UInput v-model="pendingCreationDraft.latitude" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <UInput v-model="pendingCreationDraft.longitude" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'buddy'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
              <UInput v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Sam Carter" />
            </label>
          </div>

          <div v-else-if="pendingCreationType === 'guide'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
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
              {{ pendingCreationSubmitting ? 'Saving...' : pendingCreationSubmitLabel }}
            </UButton>
          </div>
        </div>
      </div>

      <div
        v-if="activeLicenseDocument"
        @click.self="closeLicenseDocument"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6 py-8 backdrop-blur-sm"
      >
        <div class="relative max-h-full w-full max-w-5xl overflow-auto border border-primary/15 bg-surface-container-low p-4 shadow-panel">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License PDF</p>
              <p class="mt-1 text-sm text-secondary">{{ activeLicenseDocument.pdf?.filename || 'License PDF' }}</p>
            </div>
            <UButton
              type="button"
              @click="closeLicenseDocument"
              class="settings-button settings-button-secondary"
            >
              Close
            </UButton>
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
        class="fixed inset-0 z-[55] flex items-center justify-center bg-background/90 px-6 py-8 backdrop-blur-sm"
      >
        <div class="relative max-h-full w-full max-w-5xl overflow-auto border border-primary/15 bg-surface-container-low p-4 shadow-panel">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License Preview</p>
              <p class="mt-1 text-sm text-secondary">{{ activeLicensePreview.filename }} - Page {{ activeLicensePreview.pageNumber }}</p>
            </div>
            <UButton
              type="button"
              @click="closeLicensePreview"
              class="settings-button settings-button-secondary"
            >
              Close
            </UButton>
          </div>
          <img :src="activeLicensePreview.image" :alt="activeLicensePreview.filename" class="mx-auto max-h-[80vh] w-auto max-w-full bg-white" />
        </div>
      </div>

      <div
        v-if="pendingRemoval"
        @click.self="closeRemovalDialog"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="settings-confirm-dialog">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Confirm Removal</p>
            <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Remove {{ pendingRemoval.label }}?</h3>
            <p class="mt-3 text-sm text-secondary">This action cannot be undone.</p>
          </div>
          <div class="settings-confirm-actions">
            <UButton
              type="button"
              @click="closeRemovalDialog"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </UButton>
            <UButton
              type="button"
              @click="confirmPendingRemoval"
              class="settings-button settings-button-danger"
            >
              Remove
            </UButton>
          </div>
        </div>
      </div>
    </section>
</template>



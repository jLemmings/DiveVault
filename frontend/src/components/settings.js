import { useAuth, useUser } from "../auth.js";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_LICENSE_BYTES = 10 * 1024 * 1024;
const PDF_PREVIEW_SCALE = 1.35;

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function createLicenseId() {
  return `license-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDiveSiteId() {
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBuddyId() {
  return `buddy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createGuideId() {
  return `guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLicense() {
  return {
    id: createLicenseId(),
    company: "",
    certification_name: "",
    student_number: "",
    certification_date: "",
    instructor_number: "",
    pdf: null
  };
}

function emptyDiveSite() {
  return {
    id: createDiveSiteId(),
    name: "",
    location: "",
    country: "",
    latitude: "",
    longitude: ""
  };
}

function emptyBuddy() {
  return {
    id: createBuddyId(),
    name: ""
  };
}

function emptyGuide() {
  return {
    id: createGuideId(),
    name: ""
  };
}

function normalizeLicenses(licenses) {
  if (!Array.isArray(licenses)) return [];
  return licenses.map((license, index) => ({
    id: license?.id || `license-${index + 1}`,
    company: license?.company || "",
    certification_name: license?.certification_name || "",
    student_number: license?.student_number || "",
    certification_date: license?.certification_date || "",
    instructor_number: license?.instructor_number || "",
    pdf: license?.pdf || null
  }));
}

function normalizeDiveSites(diveSites) {
  if (!Array.isArray(diveSites)) return [];
  return diveSites
    .map((site, index) => ({
      id: site?.id || `site-${index + 1}`,
      name: typeof site?.name === "string" ? site.name : "",
      location: typeof site?.location === "string" ? site.location : "",
      country: typeof site?.country === "string" ? site.country : "",
      latitude: site?.latitude ?? site?.lat ?? "",
      longitude: site?.longitude ?? site?.lon ?? ""
    }))
    .filter((site) => site.name.trim());
}

function cloneLicenses(licenses) {
  return normalizeLicenses(licenses).map((license) => ({
    ...license,
    pdf: license.pdf ? { ...license.pdf } : null
  }));
}

function cloneDiveSites(diveSites) {
  return normalizeDiveSites(diveSites).map((site) => ({ ...site }));
}

function normalizeBuddies(buddies) {
  if (!Array.isArray(buddies)) return [];
  return buddies
    .map((buddy, index) => ({
      id: buddy?.id || `buddy-${index + 1}`,
      name: typeof buddy?.name === "string" ? buddy.name : ""
    }))
    .filter((buddy) => buddy.name.trim());
}

function cloneBuddies(buddies) {
  return normalizeBuddies(buddies).map((buddy) => ({ ...buddy }));
}

function normalizeGuides(guides) {
  if (!Array.isArray(guides)) return [];
  return guides
    .map((guide, index) => ({
      id: guide?.id || `guide-${index + 1}`,
      name: typeof guide?.name === "string" ? guide.name : ""
    }))
    .filter((guide) => guide.name.trim());
}

function cloneGuides(guides) {
  return normalizeGuides(guides).map((guide) => ({ ...guide }));
}

function emptyProfile() {
  return {
    name: "",
    email: "",
    public_dives_enabled: false,
    public_slug: "",
    licenses: [],
    dive_sites: [],
    buddies: [],
    guides: []
  };
}

function cloneProfile(profile = {}) {
  return {
    name: profile?.name || "",
    email: profile?.email || "",
    public_dives_enabled: Boolean(profile?.public_dives_enabled),
    public_slug: profile?.public_slug || "",
    licenses: cloneLicenses(profile?.licenses),
    dive_sites: cloneDiveSites(profile?.dive_sites),
    buddies: cloneBuddies(profile?.buddies),
    guides: cloneGuides(profile?.guides)
  };
}

function editableLicensePayload(license) {
  return {
    id: license.id,
    company: license.company,
    certification_name: license.certification_name,
    student_number: license.student_number,
    certification_date: license.certification_date,
    instructor_number: license.instructor_number
  };
}

function comparableLicenses(licenses) {
  return cloneLicenses(licenses).map(editableLicensePayload);
}

function editableDiveSitePayload(site) {
  return {
    id: site.id,
    name: site.name.trim(),
    location: site.location.trim(),
    country: site.country.trim(),
    latitude: site.latitude === "" ? null : Number.parseFloat(site.latitude),
    longitude: site.longitude === "" ? null : Number.parseFloat(site.longitude)
  };
}

function comparableDiveSites(diveSites) {
  return cloneDiveSites(diveSites).map((site) => ({
    id: site.id,
    name: site.name.trim(),
    location: site.location.trim(),
    country: site.country.trim(),
    latitude: site.latitude === "" ? "" : String(site.latitude).trim(),
    longitude: site.longitude === "" ? "" : String(site.longitude).trim()
  }));
}

function editableBuddyPayload(buddy) {
  return {
    id: buddy.id,
    name: buddy.name.trim()
  };
}

function comparableBuddies(buddies) {
  return cloneBuddies(buddies).map((buddy) => ({
    id: buddy.id,
    name: buddy.name.trim()
  }));
}

function editableGuidePayload(guide) {
  return {
    id: guide.id,
    name: guide.name.trim()
  };
}

function comparableGuides(guides) {
  return cloneGuides(guides).map((guide) => ({
    id: guide.id,
    name: guide.name.trim()
  }));
}

function normalizeSettingsText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareSettingsText(left, right) {
  return normalizeSettingsText(left).localeCompare(normalizeSettingsText(right), undefined, {
    sensitivity: "base",
    numeric: true
  });
}

export const SETTINGS_SECTIONS = [
  { id: "diver-details", label: "Diver Details", icon: "badge", description: "Profile and certifications" },
  { id: "dive-sites", label: "Dive Sites", icon: "pin_drop", description: "Locations and GPS coordinates" },
  { id: "buddies", label: "Buddies", icon: "groups", description: "Saved dive partners" },
  { id: "dive-guide", label: "Dive Guide", icon: "support_agent", description: "Guides and instructors" },
  { id: "data-management", label: "Data Management", icon: "database", description: "Exports and sync access" },
  { id: "backup", label: "Backup", icon: "archive", description: "Full backup import and export" }
];

const LicensePdfPreview = {
  name: "LicensePdfPreview",
  emits: ["open-preview"],
  props: {
    pdf: {
      type: Object,
      default: null
    },
    authenticatedFetch: {
      type: Function,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      error: "",
      pages: []
    };
  },
  watch: {
    "pdf.preview_url": {
      handler() {
        this.loadPreview();
      },
      immediate: true
    }
  },
  methods: {
    async loadPreview() {
      if (!this.pdf?.preview_url) {
        this.pages = [];
        this.error = "";
        this.loading = false;
        return;
      }

      this.loading = true;
      this.error = "";
      this.pages = [];

      try {
        const response = await this.authenticatedFetch(this.pdf.preview_url);
        if (!response.ok) {
          throw new Error(`Preview request failed with ${response.status}`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdfDocument = await getDocument({ data: bytes }).promise;
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas rendering is unavailable in this browser");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          pages.push({
            pageNumber,
            image: canvas.toDataURL("image/png")
          });
        }

        this.pages = pages;
      } catch (error) {
        this.error = error?.message || "Could not render the PDF preview.";
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
    <div>
      <div v-if="loading" class="rounded border border-primary/10 bg-surface-container-lowest px-4 py-4 text-sm text-secondary">
        Rendering PDF preview...
      </div>
      <div v-else-if="error" class="rounded border border-error/20 bg-error-container/20 px-4 py-4 text-sm text-on-error-container">
        {{ error }}
      </div>
      <div v-else class="space-y-3">
        <button
          v-for="page in pages"
          :key="page.pageNumber"
          type="button"
          @click="$emit('open-preview', page)"
          class="block w-full overflow-hidden border border-primary/10 bg-white transition-transform hover:scale-[1.01]"
        >
          <img
            :src="page.image"
            :alt="\`License PDF page \${page.pageNumber}\`"
            class="w-full cursor-zoom-in"
          />
        </button>
      </div>
    </div>
  `
};

export default {
  name: "SettingsView",
  components: {
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
    }
  },
  setup() {
    const { getToken } = useAuth();
    const { user } = useUser();

    return {
      clerkGetToken: getToken,
      clerkUser: user
    };
  },
  data() {
    return {
      settingsProfile: emptyProfile(),
      profileDraft: {
        name: "",
        email: ""
      },
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
      dataManagementError: "",
      dataManagementAction: "",
      desktopSyncStatus: "",
      desktopSyncError: "",
      desktopSyncApproving: false,
      profileStatusTimeoutId: null,
      pendingLicenseUploadId: null,
      activeLicensePreview: null,
      licenseFilter: "",
      diveSiteFilter: "",
      diveSitePage: 1,
      diveSitePageSize: 10,
      diveSitePageSizeOptions: [5, 10, 20, 50],
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
    currentUserEmail() {
      return this.clerkUser?.primaryEmailAddress?.emailAddress
        || this.clerkUser?.emailAddresses?.[0]?.emailAddress
        || "";
    },
    currentUserName() {
      const firstName = this.clerkUser?.firstName?.trim() || "";
      const lastName = this.clerkUser?.lastName?.trim() || "";
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
      return [
        { id: "licenses", label: "Licenses", value: this.licenses.length, icon: "workspace_premium" },
        { id: "sites", label: "Dive Sites", value: this.diveSites.length, icon: "pin_drop" },
        { id: "buddies", label: "Buddies", value: this.buddies.length, icon: "groups" },
        { id: "guides", label: "Guides", value: this.guides.length, icon: "support_agent" }
      ];
    },
    settingsSections() {
      return SETTINGS_SECTIONS;
    },
    activeSettingsSection() {
      return SETTINGS_SECTIONS.some((section) => section.id === this.activeSection)
        ? this.activeSection
        : (SETTINGS_SECTIONS[0]?.id || "diver-details");
    },
    isDataManagementBusy() {
      return Boolean(this.dataManagementAction);
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
    }
  },
  watch: {
    currentUserName: {
      handler() {
        this.syncClerkDefaults();
      },
      immediate: true
    },
    currentUserEmail: {
      handler() {
        this.syncClerkDefaults();
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
      this.diveSitePage = 1;
    },
    areDiveSitesEditing() {
      this.diveSitePage = 1;
    },
    visibleDiveSites() {
      if (this.diveSitePage > this.diveSitePageCount) {
        this.diveSitePage = this.diveSitePageCount;
      }
    },
    activeSettingsSection() {
      this.clearProfileStatusFeedback();
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
  },
  methods: {
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
    syncClerkDefaults() {
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
    resetDataManagementFeedback() {
      this.dataManagementStatus = "";
      this.dataManagementError = "";
    },
    displayValue(value, fallback = "Not provided") {
      return value ? value : fallback;
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
        this.diveSitePage += 1;
      }
    },
    previousDiveSitePage() {
      if (this.diveSitePage > 1) {
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
    normalizeFilterValue(value) {
      return normalizeSettingsText(value).toLocaleLowerCase();
    },
    sortAndFilterCollection(items, filterValue, getSortKey, getSearchValues, alwaysIncludeIds = []) {
      const filterTerm = this.normalizeFilterValue(filterValue);
      const includedIds = new Set(Array.isArray(alwaysIncludeIds) ? alwaysIncludeIds : []);
      return [...(Array.isArray(items) ? items : [])]
        .filter((item) => {
          if (includedIds.has(item?.id)) return true;
          if (!filterTerm) return true;
          return getSearchValues(item).some((value) => this.normalizeFilterValue(value).includes(filterTerm));
        })
        .sort((left, right) => {
          const primaryComparison = compareSettingsText(getSortKey(left), getSortKey(right));
          if (primaryComparison !== 0) return primaryComparison;
          return compareSettingsText(left?.id, right?.id);
        });
    },
    findCollectionIndexById(collection, itemId) {
      return Array.isArray(collection) ? collection.findIndex((entry) => entry?.id === itemId) : -1;
    },
    async authenticatedFetch(resource, options = {}) {
      const token = await this.clerkGetToken({ skipCache: true });
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
        this.syncClerkDefaults();
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
    exportBackup() {
      return this.exportDownload(
        "/api/backup/export",
        "divevault-backup.json",
        "Exporting Backup",
        "Full backup downloaded."
      );
    },
    triggerBackupImport() {
      this.resetDataManagementFeedback();
      this.$refs.backupImportInput?.click();
    },
    async handleBackupImportSelection(event) {
      const file = event?.target?.files?.[0];
      event.target.value = "";
      if (!file) return;

      this.dataManagementAction = "Importing Backup";
      this.resetDataManagementFeedback();
      try {
        const text = await file.text();
        let backupPayload = null;
        try {
          backupPayload = JSON.parse(text);
        } catch (_error) {
          throw new Error("Backup file must be valid JSON.");
        }

        const response = await this.authenticatedFetch("/api/backup/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(backupPayload)
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
      this.profileError = "";
      this.profileStatus = "";
      if (!this.areLicensesEditing) {
        this.licenseExpandedSnapshot = [...this.expandedLicenseIds];
      }
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.areLicensesEditing = true;
    },
    cancelLicensesEdit() {
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.pendingLicenseUploadId = null;
      this.editingLicenseIds = [];
      this.areLicensesEditing = false;
      this.expandedLicenseIds = Array.isArray(this.licenseExpandedSnapshot) ? [...this.licenseExpandedSnapshot] : [];
      this.licenseExpandedSnapshot = null;
    },
    beginDiveSitesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      if (!this.areDiveSitesEditing) {
        this.diveSiteExpandedSnapshot = [...this.expandedDiveSiteIds];
      }
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.areDiveSitesEditing = true;
    },
    cancelDiveSitesEdit() {
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.editingDiveSiteIds = [];
      this.areDiveSitesEditing = false;
      this.expandedDiveSiteIds = Array.isArray(this.diveSiteExpandedSnapshot) ? [...this.diveSiteExpandedSnapshot] : [];
      this.diveSiteExpandedSnapshot = null;
    },
    beginBuddiesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      if (!this.areBuddiesEditing) {
        this.buddyExpandedSnapshot = [...this.expandedBuddyIds];
      }
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.areBuddiesEditing = true;
    },
    cancelBuddiesEdit() {
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.editingBuddyIds = [];
      this.areBuddiesEditing = false;
      this.expandedBuddyIds = Array.isArray(this.buddyExpandedSnapshot) ? [...this.buddyExpandedSnapshot] : [];
      this.buddyExpandedSnapshot = null;
    },
    beginGuidesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      if (!this.areGuidesEditing) {
        this.guideExpandedSnapshot = [...this.expandedGuideIds];
      }
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
      this.areGuidesEditing = true;
    },
    cancelGuidesEdit() {
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
      this.editingGuideIds = [];
      this.areGuidesEditing = false;
      this.expandedGuideIds = Array.isArray(this.guideExpandedSnapshot) ? [...this.guideExpandedSnapshot] : [];
      this.guideExpandedSnapshot = null;
    },
    async saveLicenses() {
      this.licensesSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: this.settingsProfile.name,
            email: this.settingsProfile.email,
            licenses: this.licenseDrafts.map(editableLicensePayload),
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
        this.areLicensesEditing = false;
        this.editingLicenseIds = [];
        this.licenseExpandedSnapshot = null;
        this.profileStatus = "Licenses updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the license list.";
      } finally {
        this.licensesSaving = false;
      }
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
      const removedLicense = this.licenseDrafts[index];
      this.licenseDrafts = this.licenseDrafts.filter((_, entryIndex) => entryIndex !== index);
      if (removedLicense?.id) {
        this.editingLicenseIds = this.editingLicenseIds.filter((entryId) => entryId !== removedLicense.id);
        if (!this.editingLicenseIds.length) {
          this.areLicensesEditing = false;
        }
      }
    },
    removeDiveSite(index) {
      const removedSite = this.diveSiteDrafts[index];
      this.diveSiteDrafts = this.diveSiteDrafts.filter((_, entryIndex) => entryIndex !== index);
      if (removedSite?.id) {
        this.editingDiveSiteIds = this.editingDiveSiteIds.filter((entryId) => entryId !== removedSite.id);
      }
    },
    removeBuddy(index) {
      const removedBuddy = this.buddyDrafts[index];
      this.buddyDrafts = this.buddyDrafts.filter((_, entryIndex) => entryIndex !== index);
      if (removedBuddy?.id) {
        this.editingBuddyIds = this.editingBuddyIds.filter((entryId) => entryId !== removedBuddy.id);
      }
    },
    removeGuide(index) {
      const removedGuide = this.guideDrafts[index];
      this.guideDrafts = this.guideDrafts.filter((_, entryIndex) => entryIndex !== index);
      if (removedGuide?.id) {
        this.editingGuideIds = this.editingGuideIds.filter((entryId) => entryId !== removedGuide.id);
      }
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
      this.diveSitesSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: this.settingsProfile.name,
            email: this.settingsProfile.email,
            licenses: this.settingsProfile.licenses.map(editableLicensePayload),
            dive_sites: this.diveSiteDrafts.map(editableDiveSitePayload),
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
        this.areDiveSitesEditing = false;
        this.editingDiveSiteIds = [];
        this.diveSiteExpandedSnapshot = null;
        this.profileStatus = "Dive sites updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the dive site list.";
      } finally {
        this.diveSitesSaving = false;
      }
    },
    async saveBuddies() {
      this.buddiesSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: this.settingsProfile.name,
            email: this.settingsProfile.email,
            licenses: this.settingsProfile.licenses.map(editableLicensePayload),
            dive_sites: this.settingsProfile.dive_sites.map(editableDiveSitePayload),
            buddies: this.buddyDrafts.map(editableBuddyPayload),
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
        this.areBuddiesEditing = false;
        this.editingBuddyIds = [];
        this.buddyExpandedSnapshot = null;
        this.profileStatus = "Buddies updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the buddy list.";
      } finally {
        this.buddiesSaving = false;
      }
    },
    async saveGuides() {
      this.guidesSaving = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: this.settingsProfile.name,
            email: this.settingsProfile.email,
            licenses: this.settingsProfile.licenses.map(editableLicensePayload),
            dive_sites: this.settingsProfile.dive_sites.map(editableDiveSitePayload),
            buddies: this.settingsProfile.buddies.map(editableBuddyPayload),
            guides: this.guideDrafts.map(editableGuidePayload)
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.resetDraftsFromProfile();
        this.areGuidesEditing = false;
        this.editingGuideIds = [];
        this.guideExpandedSnapshot = null;
        this.profileStatus = "Guides updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the guide list.";
      } finally {
        this.guidesSaving = false;
      }
    },
    triggerLicensePicker(licenseId) {
      this.profileError = "";
      this.profileStatus = "";

      if (!this.areLicensesEditing) {
        this.profileError = "Open license editing before uploading a PDF.";
        return;
      }
      if (!this.licenseExistsOnServer(licenseId)) {
        this.profileError = "Save the license list before uploading a PDF for a new entry.";
        return;
      }
      if (this.hasUnsavedLicenseChanges()) {
        this.profileError = "Save license list changes before uploading a PDF.";
        return;
      }

      this.pendingLicenseUploadId = licenseId;
      this.$refs.licenseInput?.click();
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
    async approveDesktopSync() {
      if (!this.cliAuthCode) {
        return;
      }

      this.desktopSyncApproving = true;
      this.desktopSyncStatus = "";
      this.desktopSyncError = "";

      try {
        const token = await this.clerkGetToken({ skipCache: true });
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
  template: `
    <section class="space-y-8 text-on-surface">
      <header class="space-y-6">
        <div class="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div class="mb-2 flex items-center gap-3">
              <span class="h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_rgba(156,202,255,0.8)]"></span>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">System Configuration</span>
            </div>
            <h3 class="font-headline text-5xl font-bold tracking-tight">Settings</h3>
            <p class="mt-2 max-w-2xl text-sm text-on-surface-variant">Manage your diver identity, saved dive data, certification documents, exports, and desktop sync access without digging through long forms.</p>
          </div>
        </div>

        <div class="settings-stat-grid">
          <article v-for="stat in settingsOverviewStats" :key="stat.id" class="settings-stat-card">
            <div class="flex items-center justify-between gap-3">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ stat.label }}</p>
              <span class="material-symbols-outlined text-primary/80">{{ stat.icon }}</span>
            </div>
            <div v-if="profileLoading" class="settings-loading-bar settings-loading-bar-stat mt-4"></div>
            <p v-else class="mt-3 font-headline text-3xl font-bold text-on-surface">{{ stat.value }}</p>
          </article>
        </div>
      </header>

      <div v-if="profileStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ profileStatus }}</div>
      <div v-if="profileError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">{{ profileError }}</div>

      <div class="settings-panel flex gap-3 overflow-x-auto p-3 md:hidden">
        <button
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
        </button>
      </div>

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
          <div v-if="activeSettingsSection === 'diver-details'" class="settings-panel settings-card">
            <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
              <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div class="max-w-3xl">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Public Dive Profile</p>
                  <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Share Completed Dives And Dive Map</h4>
                  <p class="mt-3 text-sm leading-7 text-secondary">When enabled, the public page only exposes completed dive entries and their map positions. Licenses, saved buddies, guides, and the rest of your private settings stay hidden.</p>
                </div>
                <div class="settings-chip" :class="publicSharingDraft.public_dives_enabled ? 'is-accent' : ''">
                  {{ publicSharingDraft.public_dives_enabled ? 'Public' : 'Private' }}
                </div>
              </div>

              <div class="mt-6 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <label class="flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
                  <input v-model="publicSharingDraft.public_dives_enabled" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
                  <div>
                    <p class="text-sm font-semibold text-on-surface">Make My Completed Dives Public</p>
                    <p class="mt-1 text-sm leading-6 text-secondary">Imported drafts stay private until they are completed in the logbook.</p>
                  </div>
                </label>

                <div class="flex flex-wrap gap-3">
                  <button @click="savePublicSharing" :disabled="publicSharingSaving || (!hasUnsavedPublicSharingChanges && publicSharingDraft.public_dives_enabled === settingsProfile.public_dives_enabled)" class="settings-button settings-button-primary">
                    {{ publicSharingSaving ? 'Saving Share Settings' : 'Save Sharing' }}
                  </button>
                  <button v-if="settingsProfile.public_dives_enabled && publicProfileUrl" @click="copyPublicProfileUrl" class="settings-button settings-button-secondary">Copy Public Link</button>
                </div>
              </div>

              <div v-if="settingsProfile.public_dives_enabled && publicProfileUrl" class="mt-5 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Public URL</p>
                <a :href="publicProfileUrl" target="_blank" rel="noreferrer" class="mt-2 block break-all text-sm font-semibold text-primary hover:text-primary/80">{{ publicProfileUrl }}</a>
              </div>
            </div>

            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Diving Licenses</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Certifications And PDFs</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Certificates stay compact until opened, so the saved list is easier to scan and the attached PDFs are still one click away.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addLicenseEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add License</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="licenseFilter" type="text" class="settings-input" placeholder="Filter licenses" />
            </label>

            <div v-if="!areLicensesEditing && licenses.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Use Add License to create your first certification entry and attach its PDF.</p>
            </div>

            <div v-else-if="areLicensesEditing && licenseDrafts.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Add your first certification entry to build a reusable license list.</p>
            </div>

            <div v-else-if="visibleLicenses.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No matching licenses</p>
              <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your certification list.</p>
            </div>

            <div v-else class="space-y-4">
              <article v-for="(license, index) in visibleLicenses" :key="license.id" class="settings-item-card">
                <div class="settings-item-header">
                  <div class="min-w-0">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">License {{ index + 1 }}</p>
                    <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ licenseTitle(license, index) }}</h5>
                    <div class="settings-chip-row mt-3">
                      <span class="settings-chip">{{ displayValue(license.company, 'Company pending') }}</span>
                      <span class="settings-chip" :class="license.pdf ? 'is-accent' : ''">{{ license.pdf ? 'PDF attached' : 'No PDF' }}</span>
                    </div>
                  </div>

                  <div class="settings-toolbar">
                    <button
                      v-if="!isLicenseEditing(license.id)"
                      @click="editLicenseItem(license.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit License
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="confirmRemoveLicenseItem(license.id)"
                      class="settings-button settings-button-danger"
                    >
                      Remove
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="cancelLicensesEdit"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="saveLicenses"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-primary"
                    >
                      {{ licensesSaving ? 'Saving License' : 'Save License' }}
                    </button>
                  </div>
                </div>

                <div v-if="isLicenseEditing(license.id) || isLicenseExpanded(license.id)" class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div v-if="isLicenseEditing(license.id)" class="settings-form-grid">
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
                      <input v-model="license.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
                      <input v-model="license.certification_name" type="text" class="settings-input" placeholder="Advanced Open Water" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
                      <input v-model="license.student_number" type="text" class="settings-input" placeholder="Student or certification number" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
                      <input v-model="license.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
                    </label>
                    <label class="space-y-2 md:col-span-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
                      <input v-model="license.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
                    </label>
                  </div>

                  <div v-else class="settings-detail-grid">
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.company) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_name) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.student_number) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_date) }}</p>
                    </div>
                    <div class="settings-info-card md:col-span-2">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.instructor_number) }}</p>
                    </div>
                  </div>

                  <div class="settings-side-panel">
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License PDF</p>
                      <button
                        v-if="isLicenseEditing(license.id)"
                        @click="triggerLicensePicker(license.id)"
                        :disabled="isUploadingLicense(license.id)"
                        class="settings-button settings-button-secondary"
                      >
                        {{ isUploadingLicense(license.id) ? 'Uploading...' : (license.pdf ? 'Replace PDF' : 'Upload PDF') }}
                      </button>
                    </div>

                    <div v-if="license.pdf" class="space-y-3">
                      <div class="settings-file-meta">
                        <p class="font-semibold text-on-surface">{{ license.pdf.filename }}</p>
                        <p class="mt-1 text-sm text-secondary">{{ formatBytes(license.pdf.size_bytes) }} · Uploaded {{ formatDateTime(license.pdf.uploaded_at) }}</p>
                      </div>
                      <license-pdf-preview :pdf="license.pdf" :authenticated-fetch="authenticatedFetch" @open-preview="openLicensePreview($event, license)" />
                    </div>

                    <div v-else class="settings-empty-state">
                      <p class="font-headline text-base font-bold">No PDF attached</p>
                      <p class="mt-2 text-sm text-secondary">{{ isLicenseEditing(license.id) ? 'Upload the certification PDF for this specific license entry.' : 'Open the license and switch to edit mode to attach a PDF.' }}</p>
                    </div>

                    <p v-if="isLicenseEditing(license.id) && !licenseExistsOnServer(license.id)" class="text-[10px] uppercase tracking-[0.14em] text-secondary/70">
                      Save this new license before uploading its PDF.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <input ref="licenseInput" @change="handleLicenseSelection" type="file" accept="application/pdf,.pdf" class="hidden" />
          </div>

          <div v-if="activeSettingsSection === 'dive-sites'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Sites</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Reusable Site Directory</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Locations are summarized first, with GPS detail tucked underneath so the list feels more like a directory and less like a long form dump.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addDiveSiteEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Dive Site</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="diveSiteFilter" type="text" class="settings-input" placeholder="Filter dive sites" />
            </label>

            <div v-if="!areDiveSitesEditing && diveSites.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved dive sites</p>
              <p class="mt-2 text-sm text-secondary">Create sites here so logbook entries can reuse them and the dashboard map can plot your dives.</p>
            </div>

            <div v-else-if="areDiveSitesEditing && diveSiteDrafts.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved dive sites</p>
              <p class="mt-2 text-sm text-secondary">Add the first site in your logbook catalog.</p>
            </div>

            <div v-else-if="visibleDiveSites.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No matching dive sites</p>
              <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved site directory.</p>
            </div>

            <div v-else class="space-y-4">
              <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ diveSitePaginationLabel }}</p>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label class="flex items-center gap-3">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Sites Per Page</span>
                    <select v-model.number="diveSitePageSize" class="settings-input min-w-[5.5rem] py-2">
                      <option v-for="size in diveSitePageSizeOptions" :key="'settings-dive-site-page-size-' + size" :value="size">{{ size }}</option>
                    </select>
                  </label>
                  <div class="flex items-center gap-2">
                    <button @click="previousDiveSitePage" :disabled="diveSitePage === 1" class="settings-button settings-button-secondary" :class="diveSitePage === 1 ? 'opacity-50' : ''">Previous</button>
                    <span class="settings-chip">Page {{ diveSitePage }} / {{ diveSitePageCount }}</span>
                    <button @click="nextDiveSitePage" :disabled="diveSitePage >= diveSitePageCount" class="settings-button settings-button-secondary" :class="diveSitePage >= diveSitePageCount ? 'opacity-50' : ''">Next</button>
                  </div>
                </div>
              </div>

              <article v-for="(site, index) in pagedDiveSites" :key="site.id" class="settings-item-card">
                <div class="settings-item-header">
                  <div class="min-w-0">
                    <h5 class="font-headline text-2xl font-bold tracking-tight text-on-surface">{{ pagedDiveSiteTitle(site, index) }}</h5>
                    <div class="settings-chip-row mt-3">
                      <span class="settings-chip">
                        <span class="material-symbols-outlined text-[14px]">location_on</span>
                        {{ displayValue(site.location, 'Location pending') }}
                      </span>
                      <span class="settings-chip">
                        <span class="material-symbols-outlined text-[14px]">public</span>
                        {{ displayValue(site.country, 'Country pending') }}
                      </span>
                      <span class="settings-chip" :class="diveSiteHasCoordinates(site) ? 'is-accent' : ''">
                        <span class="material-symbols-outlined text-[14px]">{{ diveSiteHasCoordinates(site) ? 'my_location' : 'location_off' }}</span>
                        {{ diveSiteHasCoordinates(site) ? 'GPS ready' : 'No GPS' }}
                      </span>
                    </div>
                  </div>

                  <div class="settings-toolbar">
                    <button
                      v-if="!isDiveSiteEditing(site.id)"
                      @click="editDiveSiteItem(site.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit Site
                    </button>
                    <button
                      v-if="isDiveSiteEditing(site.id)"
                      @click="confirmRemoveDiveSiteItem(site.id)"
                      class="settings-button settings-button-danger"
                    >
                      Remove
                    </button>
                    <button
                      v-if="isDiveSiteEditing(site.id)"
                      @click="cancelDiveSitesEdit"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      v-if="isDiveSiteEditing(site.id)"
                      @click="saveDiveSites"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-primary"
                    >
                      {{ diveSitesSaving ? 'Saving Dive Site' : 'Save Dive Site' }}
                    </button>
                  </div>
                </div>

                <div v-if="isDiveSiteEditing(site.id) || isDiveSiteExpanded(site.id)" class="space-y-5">
                  <div v-if="isDiveSiteEditing(site.id)" class="space-y-5">
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
                      <input v-model="site.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
                    </label>
                    <div class="settings-side-panel mt-3">
                      <div class="flex flex-col gap-4">
                        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Lookup</p>
                            <p class="mt-2 text-sm text-secondary">Search from the location text, then fine-tune latitude and longitude manually if needed.</p>
                          </div>
                          <button
                            @click="searchDiveSiteLocationById(site.id)"
                            :disabled="isLookingUpDiveSite(site.id)"
                            class="settings-button settings-button-secondary"
                          >
                            {{ isLookingUpDiveSite(site.id) ? 'Searching GPS' : 'Search GPS From Location' }}
                          </button>
                        </div>
                        <div class="settings-form-grid settings-form-grid-wide">
                          <label class="space-y-2 md:col-span-2">
                            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                            <input v-model="site.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                          </label>
                          <label class="space-y-2">
                            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                            <input v-model="site.country" type="text" class="settings-input" placeholder="Egypt" />
                          </label>
                        </div>
                        <div class="settings-form-grid settings-form-grid-wide">
                          <label class="space-y-2">
                            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                            <input v-model="site.latitude" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                          </label>
                          <label class="space-y-2">
                            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                            <input v-model="site.longitude" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else class="settings-detail-grid">
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.name) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.country, 'Not set') }}</p>
                    </div>
                    <div class="settings-info-card md:col-span-2">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.location, 'Not set') }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.latitude, 'Not set') }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.longitude, 'Not set') }}</p>
                    </div>
                  </div>
                </div>
              </article>

              <div class="flex flex-col gap-4 border-t border-primary/10 pt-4 md:flex-row md:items-center md:justify-between">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ diveSitePaginationLabel }}</p>
                <div class="flex items-center gap-2">
                  <button @click="previousDiveSitePage" :disabled="diveSitePage === 1" class="settings-button settings-button-secondary" :class="diveSitePage === 1 ? 'opacity-50' : ''">Previous</button>
                  <span class="settings-chip">Page {{ diveSitePage }} / {{ diveSitePageCount }}</span>
                  <button @click="nextDiveSitePage" :disabled="diveSitePage >= diveSitePageCount" class="settings-button settings-button-secondary" :class="diveSitePage >= diveSitePageCount ? 'opacity-50' : ''">Next</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'buddies'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Buddies</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Saved Dive Buddy List</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Buddy names now scan as a compact grid instead of a long vertical stack.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addBuddyEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Buddy</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="buddyFilter" type="text" class="settings-input" placeholder="Filter buddies" />
            </label>

            <div v-if="!areBuddiesEditing && buddies.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved buddies</p>
              <p class="mt-2 text-sm text-secondary">Create a reusable buddy list here so dive logs can select names instead of retyping them.</p>
            </div>

            <div v-else-if="areBuddiesEditing && buddyDrafts.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved buddies</p>
              <p class="mt-2 text-sm text-secondary">Add the first diver you want available in your logbook forms.</p>
            </div>

            <div v-else-if="visibleBuddies.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No matching buddies</p>
              <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved buddy list.</p>
            </div>

            <div v-else class="settings-compact-grid">
              <article v-for="(buddy, index) in visibleBuddies" :key="buddy.id" class="settings-compact-card">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy {{ index + 1 }}</p>
                    <h5 class="mt-2 font-headline text-xl font-bold text-on-surface">{{ buddyTitle(buddy, index) }}</h5>
                  </div>
                  <div class="settings-toolbar">
                    <button
                      v-if="!isBuddyEditing(buddy.id)"
                      @click="editBuddyItem(buddy.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit Buddy
                    </button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="confirmRemoveBuddyItem(buddy.id)" class="settings-button settings-button-danger">Remove</button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="cancelBuddiesEdit" :disabled="isInteractionLocked" class="settings-button settings-button-ghost">Cancel</button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="saveBuddies" :disabled="isInteractionLocked" class="settings-button settings-button-primary">{{ buddiesSaving ? 'Saving Buddy' : 'Save Buddy' }}</button>
                  </div>
                </div>

                <div v-if="isBuddyEditing(buddy.id)" class="mt-5 space-y-3">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
                    <input v-model="buddy.name" type="text" class="settings-input" placeholder="Sam Carter" />
                  </label>
                </div>
              </article>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'dive-guide'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Guide</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Saved Guide List</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Guides and instructors now use the same denser layout as buddies, which makes longer lists much easier to browse.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addGuideEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Guide</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="guideFilter" type="text" class="settings-input" placeholder="Filter guides" />
            </label>

            <div v-if="!areGuidesEditing && guides.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved guides</p>
              <p class="mt-2 text-sm text-secondary">Create a reusable guide list here so dive logs can search and reuse names instead of retyping them.</p>
            </div>

            <div v-else-if="areGuidesEditing && guideDrafts.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved guides</p>
              <p class="mt-2 text-sm text-secondary">Add the first guide or instructor you want available in your logbook forms.</p>
            </div>

            <div v-else-if="visibleGuides.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No matching guides</p>
              <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved guide list.</p>
            </div>

            <div v-else class="settings-compact-grid">
              <article v-for="(guide, index) in visibleGuides" :key="guide.id" class="settings-compact-card">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide {{ index + 1 }}</p>
                    <h5 class="mt-2 font-headline text-xl font-bold text-on-surface">{{ guideTitle(guide, index) }}</h5>
                  </div>
                  <div class="settings-toolbar">
                    <button
                      v-if="!isGuideEditing(guide.id)"
                      @click="editGuideItem(guide.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit Guide
                    </button>
                    <button v-if="isGuideEditing(guide.id)" @click="confirmRemoveGuideItem(guide.id)" class="settings-button settings-button-danger">Remove</button>
                    <button v-if="isGuideEditing(guide.id)" @click="cancelGuidesEdit" :disabled="isInteractionLocked" class="settings-button settings-button-ghost">Cancel</button>
                    <button v-if="isGuideEditing(guide.id)" @click="saveGuides" :disabled="isInteractionLocked" class="settings-button settings-button-primary">{{ guidesSaving ? 'Saving Guide' : 'Save Guide' }}</button>
                  </div>
                </div>

                <div v-if="isGuideEditing(guide.id)" class="mt-5 space-y-3">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
                    <input v-model="guide.name" type="text" class="settings-input" placeholder="Kai Jensen" />
                  </label>
                </div>
              </article>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'data-management'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Exports And Desktop Sync</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">The actions below are organized as clear task cards instead of one long button list.</p>
              </div>
            </div>

            <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ dataManagementStatus }}</div>
            <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ dataManagementError }}</div>

            <div class="settings-action-grid">
              <button
                @click="exportDivePdf"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">picture_as_pdf</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting PDF' ? 'Exporting Dive PDF' : 'Export Logs (PDF)' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Generate a printable logbook export for review, sharing, or offline archiving.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">north_east</span>
              </button>

              <button
                @click="exportDiveCsv"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">table_chart</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting CSV' ? 'Exporting Telemetry CSV' : 'Raw Telemetry (CSV)' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Download the raw dive telemetry for spreadsheet analysis or external processing.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">north_east</span>
              </button>
            </div>

            <div class="settings-side-panel mt-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Desktop Sync Login</p>
                  <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-if="!hasCliAuthCode">Launch the Windows Dive Sync app and click Sign In. It will open this page with a one-time approval request so you can authorize the desktop sync session from your browser.</p>
                  <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-else>The Windows Dive Sync app is requesting access to your account. Approve it once, then return to the desktop app to start importing dives.</p>
                </div>
                <span class="settings-chip" :class="hasCliAuthCode ? 'is-accent' : ''">{{ hasCliAuthCode ? 'Approval waiting' : 'Idle' }}</span>
              </div>

              <button
                v-if="hasCliAuthCode"
                @click="approveDesktopSync"
                :disabled="desktopSyncApproving"
                class="settings-button settings-button-primary mt-5 w-full justify-between"
              >
                <span class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-sm">verified_user</span>
                  <span>{{ desktopSyncApproving ? 'Approving Desktop Sync' : 'Approve Desktop Sync' }}</span>
                </span>
                <span class="material-symbols-outlined text-sm">login</span>
              </button>
              <p v-if="desktopSyncStatus" class="mt-3 text-sm text-primary">{{ desktopSyncStatus }}</p>
              <p v-if="desktopSyncError" class="mt-3 text-sm text-error">{{ desktopSyncError }}</p>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'backup'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Backup</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Backup And Restore</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Backup tasks are separated from everyday exports so destructive restore actions feel more deliberate and easier to understand.</p>
              </div>
            </div>

            <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ dataManagementStatus }}</div>
            <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ dataManagementError }}</div>

            <div class="settings-action-grid">
              <button
                @click="exportBackup"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">archive</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting Backup' ? 'Building Full Backup' : 'Download Full Backup' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Save your account data, saved lists, PDFs, and imported dive state into one archive.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">download</span>
              </button>

              <button
                @click="triggerBackupImport"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">upload_file</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Importing Backup' ? 'Importing Backup' : 'Import From Backup' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Restore from a previously exported backup when moving systems or recovering state.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">upload</span>
              </button>
            </div>
            <input
              ref="backupImportInput"
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="handleBackupImportSelection"
            />
          </div>
          </template>
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
            <button
              type="button"
              @click="closeCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-ghost"
            >
              Close
            </button>
          </div>

          <div v-if="pendingCreationError" class="settings-feedback mt-5 border-error/20 bg-error-container/20 text-on-error-container">
            {{ pendingCreationError }}
          </div>

          <div v-if="pendingCreationType === 'license'" class="settings-modal-grid mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
              <input v-model="pendingCreationDraft.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
              <input v-model="pendingCreationDraft.certification_name" type="text" class="settings-input" placeholder="Advanced Open Water" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
              <input v-model="pendingCreationDraft.student_number" type="text" class="settings-input" placeholder="Student or certification number" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
              <input v-model="pendingCreationDraft.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
            </label>
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
              <input v-model="pendingCreationDraft.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
            </label>
            <div class="settings-side-panel md:col-span-2">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">PDF Upload</p>
              <p class="mt-2 text-sm text-secondary">Save the license first. You can attach or replace the PDF from the saved license card.</p>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'dive-site'" class="settings-modal-section mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
            </label>
            <div class="settings-side-panel settings-modal-subsection">
              <div class="settings-modal-section">
                <div class="settings-modal-header">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Lookup</p>
                    <p class="settings-modal-copy mt-2 text-sm text-secondary">Search from the location text, then adjust latitude and longitude if needed.</p>
                  </div>
                  <button
                    type="button"
                    @click="searchPendingDiveSiteLocation"
                    :disabled="pendingCreationLookupLoading"
                    class="settings-button settings-button-secondary settings-modal-lookup-button"
                  >
                    {{ pendingCreationLookupLoading ? 'Searching GPS' : 'Search GPS From Location' }}
                  </button>
                </div>
                <label class="space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                  <input v-model="pendingCreationDraft.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                </label>
                <div class="settings-modal-site-grid">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                    <input v-model="pendingCreationDraft.country" type="text" class="settings-input" placeholder="Egypt" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <input v-model="pendingCreationDraft.latitude" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <input v-model="pendingCreationDraft.longitude" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'buddy'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Sam Carter" />
            </label>
          </div>

          <div v-else-if="pendingCreationType === 'guide'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Kai Jensen" />
            </label>
          </div>

          <div class="settings-modal-actions">
            <button
              type="button"
              @click="closeCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-primary"
            >
              {{ pendingCreationSubmitting ? 'Saving...' : pendingCreationSubmitLabel }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="activeLicensePreview"
        @click.self="closeLicensePreview"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6 py-8 backdrop-blur-sm"
      >
        <div class="relative max-h-full w-full max-w-5xl overflow-auto border border-primary/15 bg-surface-container-low p-4 shadow-panel">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License Preview</p>
              <p class="mt-1 text-sm text-secondary">{{ activeLicensePreview.filename }} - Page {{ activeLicensePreview.pageNumber }}</p>
            </div>
            <button
              type="button"
              @click="closeLicensePreview"
              class="settings-button settings-button-secondary"
            >
              Close
            </button>
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
            <button
              type="button"
              @click="closeRemovalDialog"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmPendingRemoval"
              class="settings-button settings-button-danger"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </section>
  `
};

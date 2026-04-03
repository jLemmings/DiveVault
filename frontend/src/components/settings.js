import { useAuth, useUser } from "@clerk/vue";
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
    latitude: site.latitude === "" ? null : Number.parseFloat(site.latitude),
    longitude: site.longitude === "" ? null : Number.parseFloat(site.longitude)
  };
}

function comparableDiveSites(diveSites) {
  return cloneDiveSites(diveSites).map((site) => ({
    id: site.id,
    name: site.name.trim(),
    location: site.location.trim(),
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

const SETTINGS_SECTIONS = [
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
      activeSettingsSection: "diver-details",
      pendingLicenseUploadId: null,
      activeLicensePreview: null
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
    displayName() {
      return this.settingsProfile.name || this.currentUserName || "Diver";
    },
    displayEmail() {
      return this.settingsProfile.email || this.currentUserEmail || "No email available";
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
    settingsSections() {
      return SETTINGS_SECTIONS;
    },
    isDataManagementBusy() {
      return Boolean(this.dataManagementAction);
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
    }
  },
  mounted() {
    this.fetchProfile();
  },
  methods: {
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
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
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
    buddyTitle(buddy, index) {
      return buddy.name || `Buddy ${index + 1}`;
    },
    guideTitle(guide, index) {
      return guide.name || `Guide ${index + 1}`;
    },
    diveSiteCoordinateSummary(site) {
      const hasLatitude = site?.latitude !== "" && site?.latitude !== null && site?.latitude !== undefined;
      const hasLongitude = site?.longitude !== "" && site?.longitude !== null && site?.longitude !== undefined;
      if (!hasLatitude || !hasLongitude) return "No GPS coordinates saved";
      return `Lat ${site.latitude}, Lon ${site.longitude}`;
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
    beginLicensesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.areLicensesEditing = true;
    },
    cancelLicensesEdit() {
      this.licenseDrafts = cloneLicenses(this.settingsProfile.licenses);
      this.pendingLicenseUploadId = null;
      this.areLicensesEditing = false;
    },
    beginDiveSitesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.areDiveSitesEditing = true;
    },
    cancelDiveSitesEdit() {
      this.diveSiteDrafts = cloneDiveSites(this.settingsProfile.dive_sites);
      this.areDiveSitesEditing = false;
    },
    beginBuddiesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.areBuddiesEditing = true;
    },
    cancelBuddiesEdit() {
      this.buddyDrafts = cloneBuddies(this.settingsProfile.buddies);
      this.areBuddiesEditing = false;
    },
    beginGuidesEdit() {
      this.profileError = "";
      this.profileStatus = "";
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
      this.areGuidesEditing = true;
    },
    cancelGuidesEdit() {
      this.guideDrafts = cloneGuides(this.settingsProfile.guides);
      this.areGuidesEditing = false;
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
        this.profileStatus = "Licenses updated.";
      } catch (error) {
        this.profileError = error?.message || "Could not save the license list.";
      } finally {
        this.licensesSaving = false;
      }
    },
    addLicense() {
      this.licenseDrafts = [...this.licenseDrafts, emptyLicense()];
    },
    addDiveSite() {
      this.diveSiteDrafts = [...this.diveSiteDrafts, emptyDiveSite()];
    },
    addBuddy() {
      this.buddyDrafts = [...this.buddyDrafts, emptyBuddy()];
    },
    addGuide() {
      this.guideDrafts = [...this.guideDrafts, emptyGuide()];
    },
    removeLicense(index) {
      this.licenseDrafts = this.licenseDrafts.filter((_, entryIndex) => entryIndex !== index);
    },
    removeDiveSite(index) {
      this.diveSiteDrafts = this.diveSiteDrafts.filter((_, entryIndex) => entryIndex !== index);
    },
    removeBuddy(index) {
      this.buddyDrafts = this.buddyDrafts.filter((_, entryIndex) => entryIndex !== index);
    },
    removeGuide(index) {
      this.guideDrafts = this.guideDrafts.filter((_, entryIndex) => entryIndex !== index);
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
    selectSettingsSection(sectionId) {
      this.activeSettingsSection = sectionId;
    },
    formatBytes,
    formatDateTime
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <div class="max-w-5xl">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">System Configuration</p>
        <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight text-primary">Settings</h3>
        <p class="mt-3 max-w-3xl text-sm text-secondary">Manage your authenticated diver profile, saved dive sites, certification list, embedded license documents, and desktop sync access.</p>
      </div>

      <div v-if="profileStatus" class="max-w-4xl border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ profileStatus }}</div>
      <div v-if="profileError" class="max-w-4xl border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ profileError }}</div>

      <section class="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="h-fit bg-surface-container-low p-4 shadow-panel">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Settings Menu</p>
          <nav class="mt-4 flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            <button
              v-for="section in settingsSections"
              :key="section.id"
              @click="selectSettingsSection(section.id)"
              class="min-w-[12rem] border px-4 py-4 text-left transition-colors lg:min-w-0"
              :class="activeSettingsSection === section.id ? 'border-primary/30 bg-surface-container-high text-primary' : 'border-primary/10 bg-background/20 text-secondary hover:border-primary/20 hover:text-on-surface'"
            >
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-lg">{{ section.icon }}</span>
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ section.label }}</p>
                  <p class="mt-1 text-xs leading-5 opacity-80">{{ section.description }}</p>
                </div>
              </div>
            </button>
          </nav>
        </aside>

        <div class="flex flex-col gap-8">
          <div v-if="activeSettingsSection === 'diver-details'" class="group relative overflow-hidden bg-surface-container-low p-8">
            <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl"></div>
            <div class="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-start">
              <div class="flex h-24 w-24 items-center justify-center rounded-lg border border-primary/20 bg-surface-container-highest text-primary">
                <span class="material-symbols-outlined text-4xl">badge</span>
              </div>
              <div class="flex-1 space-y-5">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Operational Identity</h4>
                    <h3 class="mt-2 font-headline text-2xl font-bold">{{ displayName }}</h3>
                    <p class="mt-1 text-sm text-secondary">{{ displayEmail }}</p>
                  </div>
                  <div v-if="!profileLoading" class="flex gap-3">
                    <button
                      v-if="!isProfileEditing"
                      @click="beginProfileEdit"
                      :disabled="profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                      class="bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <template v-else>
                      <button
                        @click="cancelProfileEdit"
                        :disabled="profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                        class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        @click="saveProfile"
                        :disabled="profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                        class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {{ profileSaving ? 'Saving Profile' : 'Save Profile' }}
                      </button>
                    </template>
                  </div>
                </div>

                <div v-if="profileLoading" class="rounded border border-primary/10 bg-surface-container-highest/40 px-4 py-3 text-sm text-secondary">
                  Loading user profile...
                </div>

                <div v-else-if="isProfileEditing" class="grid gap-4 md:grid-cols-2">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</span>
                    <input v-model="profileDraft.name" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Diver name" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</span>
                    <input v-model="profileDraft.email" type="email" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="diver@example.com" />
                  </label>
                </div>

                <div v-else class="grid gap-4 md:grid-cols-2">
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(settingsProfile.name || currentUserName, 'Not provided') }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(settingsProfile.email || currentUserEmail, 'Not provided') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'diver-details'" class="bg-surface-container-high p-6">
            <div class="mb-6 flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-primary">workspace_premium</span>
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Diving Licenses</h4>
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  v-if="!areLicensesEditing"
                  @click="beginLicensesEdit"
                  :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                  class="bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit
                </button>
                <template v-else>
                  <button
                    @click="addLicense"
                    :disabled="licensesSaving || profileSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add License
                  </button>
                  <button
                    @click="cancelLicensesEdit"
                    :disabled="licensesSaving || profileSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    @click="saveLicenses"
                    :disabled="profileLoading || licensesSaving || profileSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{ licensesSaving ? 'Saving Licenses' : 'Save License List' }}
                  </button>
                </template>
              </div>
            </div>

            <div v-if="!areLicensesEditing && licenses.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Use Edit to add your first certification entry and attach its PDF.</p>
            </div>

            <div v-else-if="areLicensesEditing && licenseDrafts.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Add your first certification entry to build a reusable license list.</p>
            </div>

            <div v-else class="space-y-5">
              <article v-for="(license, index) in (areLicensesEditing ? licenseDrafts : licenses)" :key="license.id" class="border border-primary/10 bg-surface-container-lowest/35 p-5">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">License {{ index + 1 }}</p>
                    <p class="mt-1 text-sm text-on-surface-variant">{{ licenseTitle(license, index) }}</p>
                  </div>
                  <button v-if="areLicensesEditing" @click="removeLicense(index)" class="bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container">
                    Remove
                  </button>
                </div>

                <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div v-if="areLicensesEditing" class="grid gap-4 md:grid-cols-2">
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
                      <input v-model="license.company" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="PADI / SSI / NAUI" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
                      <input v-model="license.certification_name" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Advanced Open Water" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
                      <input v-model="license.student_number" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Student or certification number" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
                      <input v-model="license.certification_date" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="YYYY-MM-DD" />
                    </label>
                    <label class="space-y-2 md:col-span-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
                      <input v-model="license.instructor_number" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Instructor number" />
                    </label>
                  </div>

                  <div v-else class="grid gap-4 md:grid-cols-2">
                    <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.company) }}</p>
                    </div>
                    <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_name) }}</p>
                    </div>
                    <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.student_number) }}</p>
                    </div>
                    <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_date) }}</p>
                    </div>
                    <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4 md:col-span-2">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.instructor_number) }}</p>
                    </div>
                  </div>

                  <div class="space-y-3 border border-primary/10 bg-background/25 p-4">
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License PDF</p>
                      <button v-if="areLicensesEditing" @click="triggerLicensePicker(license.id)" :disabled="isUploadingLicense(license.id)" class="bg-surface-container-highest px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-60">
                        {{ isUploadingLicense(license.id) ? 'Uploading...' : (license.pdf ? 'Replace PDF' : 'Upload PDF') }}
                      </button>
                    </div>
                    <div v-if="license.pdf" class="space-y-3">
                      <div class="rounded border border-primary/10 bg-surface-container-highest/35 px-3 py-3 text-sm text-secondary">
                        <p class="font-semibold text-on-surface">{{ license.pdf.filename }}</p>
                        <p class="mt-1">{{ formatBytes(license.pdf.size_bytes) }} - Uploaded {{ formatDateTime(license.pdf.uploaded_at) }}</p>
                      </div>
                      <license-pdf-preview :pdf="license.pdf" :authenticated-fetch="authenticatedFetch" @open-preview="openLicensePreview($event, license)" />
                    </div>
                    <div v-else class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-4">
                      <p class="font-headline text-base font-bold">No PDF attached</p>
                      <p class="mt-2 text-sm text-secondary">{{ areLicensesEditing ? 'Upload the certification PDF for this specific license entry.' : 'Open Edit to attach a certification PDF to this license entry.' }}</p>
                    </div>
                    <p v-if="areLicensesEditing && !licenseExistsOnServer(license.id)" class="text-[10px] uppercase tracking-[0.14em] text-secondary/70">
                      Save this new license before uploading its PDF.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <input ref="licenseInput" @change="handleLicenseSelection" type="file" accept="application/pdf,.pdf" class="hidden" />
          </div>

          <div v-if="activeSettingsSection === 'dive-sites'" class="bg-surface-container-high p-6">
            <div class="mb-6 flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-primary">pin_drop</span>
                <div>
                  <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Sites</h4>
                  <p class="mt-2 max-w-2xl text-sm text-secondary">Build the reusable site list used by the logbook editors. Saved GPS coordinates also drive the dashboard map.</p>
                </div>
              </div>
              <div class="flex flex-wrap gap-3">
                <button
                  v-if="!areDiveSitesEditing"
                  @click="beginDiveSitesEdit"
                  :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                  class="bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit
                </button>
                <template v-else>
                  <button
                    @click="addDiveSite"
                    :disabled="diveSitesSaving || profileSaving || licensesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add Dive Site
                  </button>
                  <button
                    @click="cancelDiveSitesEdit"
                    :disabled="diveSitesSaving || profileSaving || licensesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    @click="saveDiveSites"
                    :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{ diveSitesSaving ? 'Saving Dive Sites' : 'Save Dive Sites' }}
                  </button>
                </template>
              </div>
            </div>

            <div v-if="!areDiveSitesEditing && diveSites.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved dive sites</p>
              <p class="mt-2 text-sm text-secondary">Create sites here so logbook entries can select them and the dashboard map can plot your dives.</p>
            </div>

            <div v-else-if="areDiveSitesEditing && diveSiteDrafts.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved dive sites</p>
              <p class="mt-2 text-sm text-secondary">Add the first site in your logbook catalog.</p>
            </div>

            <div v-else class="space-y-5">
              <article v-for="(site, index) in (areDiveSitesEditing ? diveSiteDrafts : diveSites)" :key="site.id" class="border border-primary/10 bg-surface-container-lowest/35 p-5">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site {{ index + 1 }}</p>
                    <p class="mt-1 text-sm text-on-surface-variant">{{ diveSiteTitle(site, index) }}</p>
                  </div>
                  <button v-if="areDiveSitesEditing" @click="removeDiveSite(index)" class="bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container">
                    Remove
                  </button>
                </div>

                <div v-if="areDiveSitesEditing" class="grid gap-4 md:grid-cols-3">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
                    <input v-model="site.name" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="North Wall / Training Reef" />
                  </label>
                  <label class="space-y-2 md:col-span-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                    <input v-model="site.location" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Blue Hole, Dahab, Egypt" />
                  </label>
                  <div class="md:col-span-3">
                    <button
                      @click="searchDiveSiteLocation(index)"
                      :disabled="isLookingUpDiveSite(site.id)"
                      class="bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {{ isLookingUpDiveSite(site.id) ? 'Searching GPS' : 'Search GPS From Location' }}
                    </button>
                  </div>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <input v-model="site.latitude" type="number" step="any" min="-90" max="90" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <input v-model="site.longitude" type="number" step="any" min="-180" max="180" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="-80.4567" />
                  </label>
                  <div class="border border-primary/10 bg-background/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Status</p>
                    <p class="mt-2 text-sm text-on-surface">{{ diveSiteCoordinateSummary(site) }}</p>
                  </div>
                </div>

                <div v-else class="grid gap-4 md:grid-cols-3">
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.name) }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4 md:col-span-2">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.location, 'Not set') }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.latitude, 'Not set') }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.longitude, 'Not set') }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Map</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ diveSiteCoordinateSummary(site) }}</p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'buddies'" class="bg-surface-container-high p-8 shadow-panel">
            <div class="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Buddies</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">Saved Dive Buddy List</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Add divers you regularly log dives with. Saved buddies appear as selectable values in the import queue and dive logbook editor.</p>
              </div>
              <div class="flex flex-wrap gap-3">
                <template v-if="!areBuddiesEditing">
                  <button
                    @click="beginBuddiesEdit"
                    :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Edit Buddies
                  </button>
                </template>
                <template v-else>
                  <button
                    @click="addBuddy"
                    :disabled="buddiesSaving || profileSaving || licensesSaving || diveSitesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add Buddy
                  </button>
                  <button
                    @click="cancelBuddiesEdit"
                    :disabled="buddiesSaving || profileSaving || licensesSaving || diveSitesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    @click="saveBuddies"
                    :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{ buddiesSaving ? 'Saving Buddies' : 'Save Buddies' }}
                  </button>
                </template>
              </div>
            </div>

            <div v-if="!areBuddiesEditing && buddies.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved buddies</p>
              <p class="mt-2 text-sm text-secondary">Create a reusable buddy list here so dive logs can select names instead of retyping them.</p>
            </div>

            <div v-else-if="areBuddiesEditing && buddyDrafts.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved buddies</p>
              <p class="mt-2 text-sm text-secondary">Add the first diver you want available in your logbook forms.</p>
            </div>

            <div v-else class="space-y-5">
              <article v-for="(buddy, index) in (areBuddiesEditing ? buddyDrafts : buddies)" :key="buddy.id" class="border border-primary/10 bg-surface-container-lowest/35 p-5">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy {{ index + 1 }}</p>
                    <p class="mt-1 text-sm text-on-surface-variant">{{ buddyTitle(buddy, index) }}</p>
                  </div>
                  <button v-if="areBuddiesEditing" @click="removeBuddy(index)" class="bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container">
                    Remove
                  </button>
                </div>

                <div v-if="areBuddiesEditing" class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
                    <input v-model="buddy.name" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Sam Carter" />
                  </label>
                  <div class="border border-primary/10 bg-background/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Usage</p>
                    <p class="mt-2 text-sm text-on-surface">Appears in dive log buddy pickers.</p>
                  </div>
                </div>

                <div v-else class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(buddy.name) }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Status</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">Available in logbook</p>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'dive-guide'" class="bg-surface-container-high p-8 shadow-panel">
            <div class="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Guide</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">Saved Dive Guide List</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Add guides and instructors you dive with regularly. Saved guide names appear as searchable suggestions in the import queue and logbook editor.</p>
              </div>
              <div class="flex flex-wrap gap-3">
                <template v-if="!areGuidesEditing">
                  <button
                    @click="beginGuidesEdit"
                    :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Edit Guides
                  </button>
                </template>
                <template v-else>
                  <button
                    @click="addGuide"
                    :disabled="guidesSaving || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add Guide
                  </button>
                  <button
                    @click="cancelGuidesEdit"
                    :disabled="guidesSaving || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || Boolean(licenseUploadingId)"
                    class="border border-primary/15 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    @click="saveGuides"
                    :disabled="profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                    class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {{ guidesSaving ? 'Saving Guides' : 'Save Guides' }}
                  </button>
                </template>
              </div>
            </div>

            <div v-if="!areGuidesEditing && guides.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved guides</p>
              <p class="mt-2 text-sm text-secondary">Create a reusable guide list here so dive logs can search and reuse names instead of retyping them.</p>
            </div>

            <div v-else-if="areGuidesEditing && guideDrafts.length === 0" class="rounded border border-dashed border-primary/20 bg-surface-container-lowest p-5">
              <p class="font-headline text-lg font-bold">No saved guides</p>
              <p class="mt-2 text-sm text-secondary">Add the first guide or instructor you want available in your logbook forms.</p>
            </div>

            <div v-else class="space-y-5">
              <article v-for="(guide, index) in (areGuidesEditing ? guideDrafts : guides)" :key="guide.id" class="border border-primary/10 bg-surface-container-lowest/35 p-5">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide {{ index + 1 }}</p>
                    <p class="mt-1 text-sm text-on-surface-variant">{{ guideTitle(guide, index) }}</p>
                  </div>
                  <button v-if="areGuidesEditing" @click="removeGuide(index)" class="bg-error-container/20 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-error-container">
                    Remove
                  </button>
                </div>

                <div v-if="areGuidesEditing" class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
                    <input v-model="guide.name" type="text" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" placeholder="Kai Jensen" />
                  </label>
                  <div class="border border-primary/10 bg-background/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Usage</p>
                    <p class="mt-2 text-sm text-on-surface">Appears in dive log guide pickers.</p>
                  </div>
                </div>

                <div v-else class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(guide.name) }}</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/25 px-4 py-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Status</p>
                    <p class="mt-2 text-base font-semibold text-on-surface">Available in logbook</p>
                  </div>
                </div>
              </article>
            </div>
          </div>

        <div v-if="activeSettingsSection === 'data-management'" class="flex flex-col gap-8">
          <div class="glass-panel bg-surface-container-high p-6 shadow-panel">
            <h4 class="mb-6 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</h4>
            <p class="max-w-3xl text-sm leading-7 text-secondary">Export your dive log as a printable PDF, download raw telemetry as CSV, and manage desktop sync access for the Windows importer.</p>
            <div v-if="dataManagementStatus" class="mt-5 border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {{ dataManagementStatus }}
            </div>
            <div v-if="dataManagementError" class="mt-5 border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-on-error-container">
              {{ dataManagementError }}
            </div>
            <div class="flex flex-col gap-4">
              <button
                @click="exportDivePdf"
                :disabled="isDataManagementBusy || profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">picture_as_pdf</span><span class="text-sm font-headline font-bold">{{ dataManagementAction === 'Exporting PDF' ? 'Exporting Dive PDF' : 'Export Logs (PDF)' }}</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button
                @click="exportDiveCsv"
                :disabled="isDataManagementBusy || profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">table_chart</span><span class="text-sm font-headline font-bold">{{ dataManagementAction === 'Exporting CSV' ? 'Exporting Telemetry CSV' : 'Raw Telemetry (CSV)' }}</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
            </div>
            <div class="mt-8 border-t border-outline-variant/10 pt-8">
              <h5 class="mb-3 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Desktop Sync Login</h5>
              <p class="text-sm leading-6 text-secondary" v-if="!hasCliAuthCode">Launch the Windows Dive Sync app and click Sign In. It will open this page with a one-time approval request so you can authorize the desktop sync session from your browser.</p>
              <p class="text-sm leading-6 text-secondary" v-else>The Windows Dive Sync app is requesting access to your account. Approve it once, then return to the desktop app to start importing dives.</p>
              <button
                v-if="hasCliAuthCode"
                @click="approveDesktopSync"
                :disabled="desktopSyncApproving"
                class="mt-4 flex w-full items-center justify-between rounded bg-primary px-4 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
        </div>

        <div v-if="activeSettingsSection === 'backup'" class="flex flex-col gap-8">
          <div class="glass-panel bg-surface-container-high p-6 shadow-panel">
            <h4 class="mb-6 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Backup</h4>
            <p class="max-w-3xl text-sm leading-7 text-secondary">Download a complete backup of your account data or restore from a previous backup. The backup includes profile data, saved lists, device sync state, license PDFs, and all imported dives.</p>
            <div v-if="dataManagementStatus" class="mt-5 border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
              {{ dataManagementStatus }}
            </div>
            <div v-if="dataManagementError" class="mt-5 border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-on-error-container">
              {{ dataManagementError }}
            </div>
            <div class="mt-6 flex flex-col gap-4">
              <button
                @click="exportBackup"
                :disabled="isDataManagementBusy || profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">archive</span><span class="text-sm font-headline font-bold">{{ dataManagementAction === 'Exporting Backup' ? 'Building Full Backup' : 'Download Full Backup' }}</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button
                @click="triggerBackupImport"
                :disabled="isDataManagementBusy || profileLoading || profileSaving || licensesSaving || diveSitesSaving || buddiesSaving || guidesSaving || Boolean(licenseUploadingId)"
                class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">upload_file</span><span class="text-sm font-headline font-bold">{{ dataManagementAction === 'Importing Backup' ? 'Importing Backup' : 'Import From Backup' }}</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
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
        </div>
        </div>
      </section>

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
              class="bg-surface-container-highest px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary"
            >
              Close
            </button>
          </div>
          <img :src="activeLicensePreview.image" :alt="activeLicensePreview.filename" class="mx-auto max-h-[80vh] w-auto max-w-full bg-white" />
        </div>
      </div>
    </section>
  `
};

import { normalizeRequiredLogbookFields } from "./core.js";

export const MAX_LICENSE_BYTES = 10 * 1024 * 1024;
export const PDF_PREVIEW_SCALE = 1.35;
export const THEME_OPTIONS = [
  { value: "system", label: "System Default", icon: "desktop_windows" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" }
];

export const LANGUAGE_LABELS = {
  en: "English",
  de: "Deutsch",
  fr: "Français"
};

export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSettingsDateTime(value) {
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

export function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

export function createLicenseId() {
  return `license-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDiveSiteId() {
  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBuddyId() {
  return `buddy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createGuideId() {
  return `guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyLicense() {
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

export function emptyDiveSite() {
  return {
    id: createDiveSiteId(),
    name: "",
    location: "",
    country: "",
    latitude: "",
    longitude: ""
  };
}

export function emptyBuddy() {
  return {
    id: createBuddyId(),
    name: ""
  };
}

export function emptyGuide() {
  return {
    id: createGuideId(),
    name: ""
  };
}

export function normalizeLicenses(licenses) {
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

export function normalizeDiveSites(diveSites) {
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

export function cloneLicenses(licenses) {
  return normalizeLicenses(licenses).map((license) => ({
    ...license,
    pdf: license.pdf ? { ...license.pdf } : null
  }));
}

export function cloneDiveSites(diveSites) {
  return normalizeDiveSites(diveSites).map((site) => ({ ...site }));
}

export function normalizeBuddies(buddies) {
  if (!Array.isArray(buddies)) return [];
  return buddies
    .map((buddy, index) => ({
      id: buddy?.id || `buddy-${index + 1}`,
      name: typeof buddy?.name === "string" ? buddy.name : ""
    }))
    .filter((buddy) => buddy.name.trim());
}

export function cloneBuddies(buddies) {
  return normalizeBuddies(buddies).map((buddy) => ({ ...buddy }));
}

export function normalizeGuides(guides) {
  if (!Array.isArray(guides)) return [];
  return guides
    .map((guide, index) => ({
      id: guide?.id || `guide-${index + 1}`,
      name: typeof guide?.name === "string" ? guide.name : ""
    }))
    .filter((guide) => guide.name.trim());
}

export function cloneGuides(guides) {
  return normalizeGuides(guides).map((guide) => ({ ...guide }));
}

export function emptyProfile() {
  return {
    name: "",
    email: "",
    public_dives_enabled: false,
    public_slug: "",
    logbook_display_fields: [],
    required_logbook_fields: ["site"],
    equipment_selection_enabled: true,
    licenses: [],
    dive_sites: [],
    buddies: [],
    guides: []
  };
}

export function cloneProfile(profile = {}) {
  return {
    name: profile?.name || "",
    email: profile?.email || "",
    public_dives_enabled: Boolean(profile?.public_dives_enabled),
    public_slug: profile?.public_slug || "",
    logbook_display_fields: Array.isArray(profile?.logbook_display_fields) ? [...profile.logbook_display_fields] : [],
    required_logbook_fields: normalizeRequiredLogbookFields(profile?.required_logbook_fields),
    equipment_selection_enabled: profile?.equipment_selection_enabled !== false,
    licenses: cloneLicenses(profile?.licenses),
    dive_sites: cloneDiveSites(profile?.dive_sites),
    buddies: cloneBuddies(profile?.buddies),
    guides: cloneGuides(profile?.guides)
  };
}

export function emptyInviteDraft() {
  return {
    email: "",
    first_name: "",
    last_name: "",
    role: "user",
    expires_in_days: 7
  };
}

export function editableLicensePayload(license) {
  return {
    id: license.id,
    company: license.company,
    certification_name: license.certification_name,
    student_number: license.student_number,
    certification_date: license.certification_date,
    instructor_number: license.instructor_number
  };
}

export function comparableLicenses(licenses) {
  return cloneLicenses(licenses).map(editableLicensePayload);
}

export function editableDiveSitePayload(site) {
  return {
    id: site.id,
    name: site.name.trim(),
    location: site.location.trim(),
    country: site.country.trim(),
    latitude: site.latitude === "" ? null : Number.parseFloat(site.latitude),
    longitude: site.longitude === "" ? null : Number.parseFloat(site.longitude)
  };
}

export function comparableDiveSites(diveSites) {
  return cloneDiveSites(diveSites).map((site) => ({
    id: site.id,
    name: site.name.trim(),
    location: site.location.trim(),
    country: site.country.trim(),
    latitude: site.latitude === "" ? "" : String(site.latitude).trim(),
    longitude: site.longitude === "" ? "" : String(site.longitude).trim()
  }));
}

export function editableBuddyPayload(buddy) {
  return {
    id: buddy.id,
    name: buddy.name.trim()
  };
}

export function comparableBuddies(buddies) {
  return cloneBuddies(buddies).map((buddy) => ({
    id: buddy.id,
    name: buddy.name.trim()
  }));
}

export function editableGuidePayload(guide) {
  return {
    id: guide.id,
    name: guide.name.trim()
  };
}

export function comparableGuides(guides) {
  return cloneGuides(guides).map((guide) => ({
    id: guide.id,
    name: guide.name.trim()
  }));
}

export function normalizeSettingsText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compareSettingsText(left, right) {
  return normalizeSettingsText(left).localeCompare(normalizeSettingsText(right), undefined, {
    sensitivity: "base",
    numeric: true
  });
}

export function duplicateImportWarning(payload, label) {
  const duplicates = Number(payload?.duplicates ?? 0);
  if (!Number.isFinite(duplicates) || duplicates <= 0) return "";
  const rows = Number(payload?.rows ?? 0);
  const inserted = Number(payload?.inserted ?? 0);
  if (inserted <= 0) {
    return `Warning: this ${label} appears to have already been imported. No new dives were added.`;
  }
  return `Warning: ${duplicates} of ${rows} ${rows === 1 ? 'dive was' : 'dives were'} already imported and skipped.`;
}



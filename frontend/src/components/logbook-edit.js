import { buildDiveSequenceMap, canCompleteImport, formatDate, formatDateTime, formatDepthNumber, formatTemperature, importTemperature, missingImportFields, paddedDiveIndex, durationShort, numberOrZero } from "../core.js";
import MetadataAutocompleteField from "./metadata-autocomplete.js";

function normalizeSiteName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeBuddyName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sortNamedCollection(collection) {
  if (!Array.isArray(collection)) return [];
  return [...collection]
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }));
}

export default {
  name: "LogbookEditorView",
  components: {
    MetadataAutocompleteField
  },
  props: [
    "dive",
    "allDives",
    "draft",
    "diveSites",
    "buddies",
    "guides",
    "savingImportId",
    "deletingDiveId",
    "statusMessage",
    "errorMessage",
    "updateDiveDraft",
    "saveDiveLogbook",
    "deleteDive",
    "createDiveSite",
    "closeEditor"
  ],
  data() {
    return {
      diveSiteCreatePending: false,
      diveSiteCreateError: "",
      diveSiteCreateStatus: ""
    };
  },
  computed: {
    tankVolumeOptions() {
      return [
        { label: "9L", value: "9" },
        { label: "12L", value: "12" },
        { label: "15L", value: "15" }
      ];
    },
    selectedDraft() {
      return this.draft || null;
    },
    missingFields() {
      return this.selectedDraft ? missingImportFields(this.selectedDraft) : [];
    },
    isSaving() {
      return String(this.savingImportId) === String(this.dive?.id);
    },
    isDeleting() {
      return String(this.deletingDiveId) === String(this.dive?.id);
    },
    canSaveRecord() {
      return this.selectedDraft ? canCompleteImport(this.selectedDraft) : false;
    },
    savedDiveSites() {
      return sortNamedCollection(this.diveSites);
    },
    savedBuddies() {
      return sortNamedCollection(this.buddies);
    },
    savedGuides() {
      return sortNamedCollection(this.guides);
    },
    selectedDiveSite() {
      const siteName = normalizeSiteName(this.selectedDraft?.site);
      if (!siteName) return null;
      return this.savedDiveSites.find((site) => normalizeSiteName(site.name) === siteName) || null;
    },
    selectedBuddy() {
      const buddyName = normalizeBuddyName(this.selectedDraft?.buddy);
      if (!buddyName) return null;
      return this.savedBuddies.find((buddy) => normalizeBuddyName(buddy.name) === buddyName) || null;
    },
    stats() {
      if (!this.dive) return [];
      return [
        { label: "Date", value: formatDate(this.dive.started_at) },
        { label: "Depth", value: `${formatDepthNumber(this.dive.max_depth_m)}m` },
        { label: "Duration", value: durationShort(this.dive.duration_seconds) },
        { label: "Temperature", value: formatTemperature(importTemperature(this.dive)) }
      ];
    },
    canCreateDiveSite() {
      const siteName = typeof this.selectedDraft?.site === "string" ? this.selectedDraft.site.trim() : "";
      return Boolean(siteName) && !this.selectedDiveSite;
    },
    diveSequenceMap() {
      return buildDiveSequenceMap(this.allDives);
    }
  },
  methods: {
    t(key, fallback = key, params = {}) {
      return typeof this.$t === "function" ? this.$t(key, fallback, params) : fallback;
    },
    formatDateTime,
    displayDiveIndex(dive) {
      return paddedDiveIndex(dive, this.diveSequenceMap);
    },
    updateField(key, value) {
      if (!this.dive) return;
      this.updateDiveDraft(this.dive.id, key, value);
      if (key === "site") {
        this.clearDiveSiteCreateFeedback();
      }
    },
    updateSite(value) {
      this.updateField("site", value);
    },
    updateBuddy(value) {
      this.updateField("buddy", value);
    },
    clearDiveSiteCreateFeedback() {
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
    },
    async saveCurrentDiveSite() {
      const siteName = typeof this.selectedDraft?.site === "string" ? this.selectedDraft.site.trim() : "";
      if (!siteName || typeof this.createDiveSite !== "function") return;

      this.diveSiteCreatePending = true;
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
      try {
        const savedSite = await this.createDiveSite({ name: siteName });
        if (savedSite?.name && savedSite.name !== this.selectedDraft?.site) {
          this.updateSite(savedSite.name);
        }
        this.diveSiteCreateStatus = `${savedSite?.name || siteName} added to your saved dive sites.`;
      } catch (error) {
        this.diveSiteCreateError = error?.message || "Could not save the dive site.";
      } finally {
        this.diveSiteCreatePending = false;
      }
    },
    saveChanges() {
      if (!this.dive) return;
      this.saveDiveLogbook(this.dive.id);
    },
    removeDive() {
      if (!this.dive) return;
      this.deleteDive(this.dive.id);
    },
    detailLine(label, value) {
      return { label, value: value || "Unavailable" };
    },
    siteCoordinateLabel(site) {
      if (!site) return "GPS coordinates unavailable";
      const latitude = site.latitude ?? site.lat;
      const longitude = site.longitude ?? site.lon;
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || latitude === "" || longitude === "") {
        return "GPS coordinates unavailable";
      }
      return `Lat ${latitude}, Lon ${longitude}`;
    },
    formatDiveSiteSuggestionDetail(site) {
      if (!site) return "";
      const parts = [];
      if (typeof site.location === "string" && site.location.trim()) {
        parts.push(site.location.trim());
      }
      if (typeof site.country === "string" && site.country.trim()) {
        parts.push(site.country.trim());
      }
      const latitude = site.latitude ?? site.lat;
      const longitude = site.longitude ?? site.lon;
      if (latitude !== null && latitude !== undefined && latitude !== "" && longitude !== null && longitude !== undefined && longitude !== "") {
        parts.push("GPS ready");
      }
      return parts.join(" / ");
    },
    durationMinutes(dive) {
      return Math.round(numberOrZero(dive?.duration_seconds) / 60);
    }
  },
  template: `
    <section v-if="dive && selectedDraft" class="space-y-8 text-on-surface">
      <header class="space-y-5">
        <button @click="closeEditor()" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
          <span class="material-symbols-outlined text-sm">arrow_back</span>
          Back To Dive Detail
        </button>
        <div>
          <section class="border border-primary/10 bg-surface-container-low p-8 shadow-panel">
            <div class="flex flex-wrap items-center gap-3">
              <span class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Logbook Entry</span>
              <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ displayDiveIndex(dive) }}</span>
            </div>
            <h3 class="mt-5 font-headline text-5xl font-bold tracking-tight">Edit Existing Dive</h3>
            <p class="mt-4 max-w-3xl text-sm leading-7 text-on-surface-variant">
              This view updates the permanent logbook metadata for an already saved dive.
              It does not use the import queue workflow and it does not affect other dives.
            </p>
            <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div v-for="card in stats" :key="card.label" class="border border-primary/10 bg-surface-container-high/40 p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ card.label }}</p>
                <p class="mt-2 font-headline text-2xl font-bold">{{ card.value }}</p>
              </div>
            </div>
          </section>
        </div>
        <div v-if="statusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ errorMessage }}</div>
      </header>

      <section class="space-y-8 border border-primary/10 bg-surface-container-low p-8 shadow-panel">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ t('Logbook Metadata', 'Logbook Metadata') }}</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ t('Dive Registry Fields', 'Dive Registry Fields') }}</h4>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.site"
              @update:model-value="updateSite"
              :options="savedDiveSites"
              placeholder="House Reef"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
              :option-detail="formatDiveSiteSuggestionDetail"
            />
            <p class="text-xs leading-5 text-on-surface-variant">
              {{ savedDiveSites.length ? 'Search saved dive sites from Settings or enter a custom value.' : 'No saved dive sites yet. Add them in Settings to reuse them here.' }}
            </p>
            <p v-if="selectedDiveSite" class="text-xs leading-5 text-primary">{{ siteCoordinateLabel(selectedDiveSite) }}</p>
            <div v-if="canCreateDiveSite || diveSiteCreateStatus || diveSiteCreateError" class="space-y-2">
              <button
                v-if="canCreateDiveSite"
                @click="saveCurrentDiveSite()"
                :disabled="diveSiteCreatePending"
                class="inline-flex items-center gap-2 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-50"
              >
                <span class="material-symbols-outlined text-sm">add_location_alt</span>
                {{ diveSiteCreatePending ? 'Saving Dive Site...' : 'Save As Reusable Dive Site' }}
              </button>
              <p v-if="diveSiteCreateStatus" class="text-xs leading-5 text-primary">{{ diveSiteCreateStatus }}</p>
              <p v-if="diveSiteCreateError" class="text-xs leading-5 text-on-error-container">{{ diveSiteCreateError }}</p>
            </div>
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.buddy"
              @update:model-value="updateBuddy"
              :options="savedBuddies"
              placeholder="Buddy name"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
            />
            <p class="text-xs leading-5 text-on-surface-variant">
              {{ savedBuddies.length ? 'Search saved buddies from Settings or enter a custom value.' : 'No saved buddies yet. Add them in Settings to reuse them here.' }}
            </p>
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.guide"
              @update:model-value="updateField('guide', $event)"
              :options="savedGuides"
              placeholder="Guide or instructor"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
            />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Tank Volume</span>
            <select :value="selectedDraft.tank_volume_l || ''" @change="updateField('tank_volume_l', $event.target.value)" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary">
              <option value="">Select tank volume</option>
              <option v-for="option in tankVolumeOptions" :key="'logbook-tank-' + option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Weather', 'Weather') }}</span>
            <input :value="selectedDraft.weather_description" @input="updateField('weather_description', $event.target.value)" type="text" :placeholder="t('logbookEdit.weather.placeholder', 'Sunny, overcast, surge on entry')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Visibility', 'Visibility') }}</span>
            <input :value="selectedDraft.visibility" @input="updateField('visibility', $event.target.value)" type="text" :placeholder="t('logbookEdit.visibility.placeholder', '15 m / moderate')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Wetsuit', 'Wetsuit') }}</span>
            <input :value="selectedDraft.wetsuit_description" @input="updateField('wetsuit_description', $event.target.value)" type="text" :placeholder="t('logbookEdit.wetsuit.placeholder', '7mm semi-dry')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>
        </div>

        <label class="space-y-2">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
          <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="14" placeholder="Conditions, wildlife, route, incidents, visibility, buoyancy notes..." class="min-h-[24rem] w-full resize-y border border-primary/10 bg-[linear-gradient(180deg,rgba(9,23,36,0.9),rgba(9,23,36,0.84))] px-5 py-4 text-sm leading-7 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></textarea>
        </label>

        <section class="border border-primary/10 bg-surface-container-high/30 p-5">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Record Summary', 'Record Summary') }}</p>
          <div class="mt-4 grid gap-4 text-sm text-on-surface-variant md:grid-cols-2 xl:grid-cols-4">
            <div class="space-y-1">
              <p>{{ t('Dive ID', 'Dive ID') }}</p>
              <p class="text-on-surface">{{ displayDiveIndex(dive) }}</p>
            </div>
            <div class="space-y-1">
              <p>{{ t('Started', 'Started') }}</p>
              <p class="text-on-surface">{{ formatDateTime(dive.started_at) }}</p>
            </div>
            <div class="space-y-1">
              <p>Imported</p>
              <p class="text-on-surface">{{ formatDateTime(dive.imported_at) }}</p>
            </div>
            <div class="space-y-1">
              <p>{{ t('Device', 'Device') }}</p>
              <p class="text-on-surface">{{ dive.vendor }} {{ dive.product }}</p>
            </div>
          </div>
        </section>

        <div class="flex flex-col gap-3 border-t border-primary/10 pt-6 sm:flex-row sm:justify-end">
          <button @click="closeEditor()" class="bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
            Cancel
          </button>
          <button @click="removeDive()" :disabled="isSaving || isDeleting" class="bg-error-container/20 px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
            {{ isDeleting ? 'Removing...' : 'Remove Dive' }}
          </button>
          <button @click="saveChanges()" :disabled="isSaving || isDeleting || !canSaveRecord" class="bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {{ isSaving ? 'Saving...' : 'Save Logbook Changes' }}
          </button>
        </div>
      </section>
    </section>
  `
};

import MetadataAutocompleteField from "./metadata-autocomplete.js";

function emptyDiveSiteDraft(name = "") {
  return {
    name,
    location: "",
    country: "",
    latitude: "",
    longitude: ""
  };
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sortNamedCollection(collection) {
  if (!Array.isArray(collection)) return [];
  return [...collection]
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }));
}

export default {
  name: "ManualDiveEntryView",
  components: {
    MetadataAutocompleteField
  },
  props: [
    "draft",
    "diveSites",
    "buddies",
    "guides",
    "creating",
    "errorMessage",
    "updateDraft",
    "createManualDive",
    "closeCreator",
    "createDiveSite",
    "searchDiveSiteLocation"
  ],
  data() {
    return {
      tankVolumeOptions: [
        { label: "9L", value: "9" },
        { label: "12L", value: "12" },
        { label: "15L", value: "15" }
      ],
      pendingDiveSiteDraft: null,
      pendingDiveSiteLookupLoading: false,
      pendingDiveSiteSubmitting: false,
      diveSiteCreateError: "",
      diveSiteCreateStatus: ""
    };
  },
  computed: {
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
      const siteName = normalizeName(this.draft?.site);
      if (!siteName) return null;
      return this.savedDiveSites.find((site) => normalizeName(site.name) === siteName) || null;
    },
    canCreateDiveSite() {
      const siteName = typeof this.draft?.site === "string" ? this.draft.site.trim() : "";
      return Boolean(siteName) && !this.selectedDiveSite;
    },
    pendingDiveSiteCreationOpen() {
      return Boolean(this.pendingDiveSiteDraft);
    },
    validationItems() {
      const issues = [];
      const durationMinutes = Number.parseFloat(this.draft?.durationMinutes);
      const maxDepthM = Number.parseFloat(this.draft?.maxDepthM);
      const temperatureValue = typeof this.draft?.temperatureC === "string" ? this.draft.temperatureC.trim() : "";
      const temperatureC = temperatureValue ? Number.parseFloat(temperatureValue) : null;
      const tankVolumeValue = typeof this.draft?.tankVolumeL === "string" ? this.draft.tankVolumeL.trim() : "";

      if (!String(this.draft?.date || "").trim()) issues.push("Start date is required.");
      if (!String(this.draft?.time || "").trim()) issues.push("Start time is required.");
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) issues.push("Duration must be greater than zero.");
      if (!Number.isFinite(maxDepthM) || maxDepthM < 0) issues.push("Max depth must be zero or greater.");
      if (temperatureValue && !Number.isFinite(temperatureC)) issues.push("Temperature must be a valid number.");
      if (tankVolumeValue && !this.tankVolumeOptions.some((option) => option.value === tankVolumeValue)) issues.push("Tank volume must be 9L, 12L, or 15L.");
      if (!String(this.draft?.site || "").trim()) issues.push("Dive site is required.");
      if (!String(this.draft?.buddy || "").trim()) issues.push("Buddy is required.");
      if (!String(this.draft?.guide || "").trim()) issues.push("Guide is required.");
      return issues;
    },
    canSubmit() {
      return this.validationItems.length === 0;
    }
  },
  methods: {
    updateField(key, value) {
      if (typeof this.updateDraft !== "function") return;
      this.updateDraft(key, value);
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
    updateGuide(value) {
      this.updateField("guide", value);
    },
    clearDiveSiteCreateFeedback() {
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
    },
    openDiveSiteCreateDialog() {
      const siteName = typeof this.draft?.site === "string" ? this.draft.site.trim() : "";
      if (!siteName) return;
      this.pendingDiveSiteDraft = emptyDiveSiteDraft(siteName);
      this.pendingDiveSiteLookupLoading = false;
      this.pendingDiveSiteSubmitting = false;
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
    },
    closeDiveSiteCreateDialog() {
      if (this.pendingDiveSiteSubmitting) return;
      this.pendingDiveSiteDraft = null;
      this.pendingDiveSiteLookupLoading = false;
      this.diveSiteCreateError = "";
    },
    validatePendingDiveSite() {
      const draft = this.pendingDiveSiteDraft;
      if (!draft) return "Nothing to save.";
      if (!String(draft.name || "").trim()) {
        return "Enter a site name before saving the dive site.";
      }
      return "";
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
    async searchPendingDiveSiteGps() {
      const draft = this.pendingDiveSiteDraft;
      if (!draft || typeof this.searchDiveSiteLocation !== "function") return;
      const query = typeof draft.location === "string" ? draft.location.trim() : "";
      if (!query) {
        this.diveSiteCreateError = "Enter a location before searching for GPS coordinates.";
        return;
      }

      this.pendingDiveSiteLookupLoading = true;
      this.diveSiteCreateError = "";
      try {
        const result = await this.searchDiveSiteLocation(query);
        if (!result) {
          this.diveSiteCreateError = `No coordinates found for "${query}".`;
          return;
        }

        this.pendingDiveSiteDraft = {
          ...draft,
          country: typeof result.country === "string" ? result.country : draft.country,
          latitude: String(result.latitude),
          longitude: String(result.longitude)
        };
      } catch (error) {
        this.diveSiteCreateError = error?.message || "Could not search for GPS coordinates.";
      } finally {
        this.pendingDiveSiteLookupLoading = false;
      }
    },
    async saveCurrentDiveSite() {
      if (!this.pendingDiveSiteDraft || typeof this.createDiveSite !== "function") return;

      const validationError = this.validatePendingDiveSite();
      if (validationError) {
        this.diveSiteCreateError = validationError;
        return;
      }

      this.pendingDiveSiteSubmitting = true;
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
      try {
        const savedSite = await this.createDiveSite({
          name: String(this.pendingDiveSiteDraft.name || "").trim(),
          location: String(this.pendingDiveSiteDraft.location || "").trim(),
          country: String(this.pendingDiveSiteDraft.country || "").trim(),
          latitude: this.pendingDiveSiteDraft.latitude === "" ? null : Number.parseFloat(this.pendingDiveSiteDraft.latitude),
          longitude: this.pendingDiveSiteDraft.longitude === "" ? null : Number.parseFloat(this.pendingDiveSiteDraft.longitude)
        });
        if (savedSite?.name && savedSite.name !== this.draft?.site) {
          this.updateSite(savedSite.name);
        }
        this.diveSiteCreateStatus = `${savedSite?.name || this.pendingDiveSiteDraft.name} added to your saved dive sites.`;
        this.pendingDiveSiteDraft = null;
      } catch (error) {
        this.diveSiteCreateError = error?.message || "Could not save the dive site.";
      } finally {
        this.pendingDiveSiteSubmitting = false;
      }
    },
    submitForm() {
      if (!this.canSubmit || this.creating || typeof this.createManualDive !== "function") {
        return;
      }
      this.createManualDive();
    }
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <header class="space-y-5">
        <button @click="closeCreator()" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
          <span class="material-symbols-outlined text-sm">arrow_back</span>
          Back To Logs
        </button>
        <section class="border border-primary/10 bg-surface-container-low p-8 shadow-panel">
          <div class="flex flex-wrap items-center gap-3">
            <span class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Manual Entry</span>
            <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">No Dive Computer Required</span>
          </div>
          <h3 class="mt-5 font-headline text-5xl font-bold tracking-tight">Manual Dive Entry</h3>
          <p class="mt-4 max-w-3xl text-sm leading-7 text-on-surface-variant">
            Create a dive log directly in DiveVault when no dive computer was used.
            The import queue remains reserved for dives brought in through the DiveVault importer tool.
          </p>
        </section>
        <div v-if="errorMessage" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ errorMessage }}</div>
      </header>

      <form @submit.prevent="submitForm" class="space-y-6">
        <section class="space-y-6 border border-primary/10 bg-surface-container-low p-8 shadow-panel">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Dive Basics</p>
            <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">Manual Log Details</h4>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Date</span>
              <input :value="draft.date" @input="updateField('date', $event.target.value)" type="date" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Start Time</span>
              <input :value="draft.time" @input="updateField('time', $event.target.value)" type="time" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Duration</span>
              <input :value="draft.durationMinutes" @input="updateField('durationMinutes', $event.target.value)" type="number" min="1" step="1" placeholder="45" class="ui-number-input w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Max Depth</span>
              <input :value="draft.maxDepthM" @input="updateField('maxDepthM', $event.target.value)" type="number" min="0" step="0.1" placeholder="18.0" class="ui-number-input w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Water Temperature</span>
              <input :value="draft.temperatureC" @input="updateField('temperatureC', $event.target.value)" type="number" step="0.1" placeholder="27" class="ui-number-input w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
          </div>

          <div class="grid gap-4 md:grid-cols-4">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
              <metadata-autocomplete-field
                :model-value="draft.site"
                @update:model-value="updateSite"
                :options="savedDiveSites"
                placeholder="House Reef"
                input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
                :option-detail="formatDiveSiteSuggestionDetail"
              />
              <p class="text-xs leading-5 text-on-surface-variant">
                {{ savedDiveSites.length ? 'Search saved dive sites from Settings or enter a custom value.' : 'No saved dive sites yet. Add them in Settings to reuse them here.' }}
              </p>
              <div v-if="canCreateDiveSite || diveSiteCreateStatus || diveSiteCreateError" class="space-y-2">
                <button
                  v-if="canCreateDiveSite"
                  type="button"
                  @click="openDiveSiteCreateDialog()"
                  class="inline-flex items-center gap-2 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-50"
                >
                  <span class="material-symbols-outlined text-sm">add_location_alt</span>
                  Save As Reusable Dive Site
                </button>
                <p v-if="diveSiteCreateStatus" class="text-xs leading-5 text-primary">{{ diveSiteCreateStatus }}</p>
                <p v-if="diveSiteCreateError" class="text-xs leading-5 text-on-error-container">{{ diveSiteCreateError }}</p>
              </div>
            </label>

            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
              <metadata-autocomplete-field
                :model-value="draft.buddy"
                @update:model-value="updateBuddy"
                :options="savedBuddies"
                placeholder="Diver name"
                input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
              />
            </label>

            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
              <metadata-autocomplete-field
                :model-value="draft.guide"
                @update:model-value="updateGuide"
                :options="savedGuides"
                placeholder="Guide or instructor"
                input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Notes</span>
              <textarea :value="draft.notes" @input="updateField('notes', $event.target.value)" rows="12" placeholder="Conditions, wildlife, route, entry, navigation, visibility..." class="min-h-[18rem] w-full resize-y border border-primary/10 bg-[linear-gradient(180deg,rgba(9,23,36,0.9),rgba(9,23,36,0.84))] px-5 py-4 text-sm leading-7 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></textarea>
            </label>

            <div class="space-y-4">
              <label class="space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Tank Volume</span>
                <select :value="draft.tankVolumeL" @change="updateField('tankVolumeL', $event.target.value)" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary">
                  <option value="">Select Tank Size</option>
                  <option v-for="option in tankVolumeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <div class="border border-primary/10 bg-background/35 p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Workflow</p>
                <p class="mt-3 text-sm leading-6 text-on-surface-variant">
                  Use this page for manually entered dives. Continue using the imported queue only for dives coming from the DiveVault importer tool.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-6 border border-primary/10 bg-surface-container-low p-6 shadow-panel">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Create Entry</p>
            <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">Ready To Save</h4>
            <p class="mt-3 text-sm leading-6 text-on-surface-variant">
              Saving creates a complete dive log entry immediately and skips the importer staging workflow.
            </p>
          </div>

          <div class="space-y-3">
            <div
              v-for="issue in validationItems"
              :key="issue"
              class="flex items-center gap-3 border border-error/20 bg-error-container/10 px-4 py-3"
            >
              <span class="material-symbols-outlined text-sm text-tertiary">warning</span>
              <span class="text-sm text-on-surface">{{ issue }}</span>
            </div>
            <div v-if="!validationItems.length" class="flex items-center gap-3 border border-primary/20 bg-primary/10 px-4 py-3">
              <span class="material-symbols-outlined text-sm text-primary">task_alt</span>
              <span class="text-sm text-on-surface">The manual dive can be created immediately.</span>
            </div>
          </div>

          <div class="space-y-3">
            <button type="submit" :disabled="creating || !canSubmit" class="w-full bg-primary px-5 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {{ creating ? 'Creating Dive Log...' : 'Create Dive Log' }}
            </button>
            <button type="button" @click="closeCreator()" :disabled="creating" class="w-full bg-surface-container-high px-5 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary disabled:opacity-50">
              Cancel
            </button>
          </div>
        </section>
      </form>

      <div
        v-if="pendingDiveSiteCreationOpen"
        @click.self="closeDiveSiteCreateDialog"
        class="fixed inset-0 z-[55] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="settings-modal-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">New Entry</p>
              <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Add Dive Site</h3>
              <p class="mt-3 text-sm text-secondary">This entry stays out of the list until you save it here.</p>
            </div>
            <button
              type="button"
              @click="closeDiveSiteCreateDialog"
              :disabled="pendingDiveSiteSubmitting"
              class="settings-button settings-button-ghost"
            >
              Close
            </button>
          </div>

          <div v-if="diveSiteCreateError" class="settings-feedback mt-5 border-error/20 bg-error-container/20 text-on-error-container">
            {{ diveSiteCreateError }}
          </div>

          <div class="settings-modal-section mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
              <input v-model="pendingDiveSiteDraft.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
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
                    @click="searchPendingDiveSiteGps"
                    :disabled="pendingDiveSiteLookupLoading || pendingDiveSiteSubmitting"
                    class="settings-button settings-button-secondary settings-modal-lookup-button"
                  >
                    {{ pendingDiveSiteLookupLoading ? 'Searching GPS' : 'Search GPS From Location' }}
                  </button>
                </div>
                <label class="space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                  <input v-model="pendingDiveSiteDraft.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                </label>
                <div class="settings-modal-site-grid">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                    <input v-model="pendingDiveSiteDraft.country" type="text" class="settings-input" placeholder="Egypt" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <input v-model="pendingDiveSiteDraft.latitude" type="number" step="any" min="-90" max="90" class="settings-input ui-number-input" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <input v-model="pendingDiveSiteDraft.longitude" type="number" step="any" min="-180" max="180" class="settings-input ui-number-input" placeholder="-80.4567" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-modal-actions">
            <button
              type="button"
              @click="closeDiveSiteCreateDialog"
              :disabled="pendingDiveSiteSubmitting"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="saveCurrentDiveSite"
              :disabled="pendingDiveSiteSubmitting"
              class="settings-button settings-button-primary"
            >
              {{ pendingDiveSiteSubmitting ? 'Saving...' : 'Save Dive Site' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  `
};

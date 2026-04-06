import { canCompleteImport, filledIconStyle, formatDate, formatDateTime, formatDepthNumber, formatTemperature, gasSummary, importCompletionPercent, importTemperature, isCommittedDive, missingImportFields, paddedDiveIndex, durationShort, numberOrZero } from "../core.js";
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
  name: "DiveImportEditorView",
  components: {
    MetadataAutocompleteField
  },
  props: [
    "dive",
    "draft",
    "diveSites",
    "buddies",
    "guides",
    "savingImportId",
    "bulkImportSavePending",
    "deletingDiveId",
    "importError",
    "importStatusMessage",
    "updateImportDraft",
    "saveImportDraft",
    "deleteDive",
    "applyBuddyGuideToPendingImports",
    "createDiveSite",
    "backToQueue"
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
    completionPercent() {
      return this.selectedDraft ? importCompletionPercent(this.selectedDraft) : 0;
    },
    isCommittedRecord() {
      return this.dive ? isCommittedDive(this.dive) : false;
    },
    missingFields() {
      return this.selectedDraft ? missingImportFields(this.selectedDraft) : [];
    },
    selectedGas() {
      return this.dive ? gasSummary(this.dive) : { label: "--", detail: "" };
    },
    saveLocked() {
      return this.bulkImportSavePending || this.isSaving || this.isDeleting;
    },
    isSaving() {
      return String(this.savingImportId) === String(this.dive?.id);
    },
    isDeleting() {
      return String(this.deletingDiveId) === String(this.dive?.id);
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
    filledIconStyle() {
      return filledIconStyle;
    },
    canCreateDiveSite() {
      const siteName = typeof this.selectedDraft?.site === "string" ? this.selectedDraft.site.trim() : "";
      return Boolean(siteName) && !this.selectedDiveSite;
    }
  },
  methods: {
    paddedDiveIndex,
    formatDate,
    formatDateTime,
    formatDepthNumber,
    formatDurationShort: durationShort,
    formatTemperature,
    importTemperature,
    canCompleteImport,
    updateField(key, value) {
      if (!this.dive) return;
      this.updateImportDraft(this.dive.id, key, value);
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
    saveDraft(commit = false) {
      if (!this.dive) return;
      this.saveImportDraft(this.dive.id, commit);
    },
    applyBuddyGuide() {
      if (!this.dive) return;
      this.applyBuddyGuideToPendingImports(this.dive.id);
    },
    removeDive() {
      if (!this.dive) return;
      this.deleteDive(this.dive.id);
    },
    requiredChecklist(logbook) {
      const draft = logbook || {};
      const missingKeys = new Set(missingImportFields(draft).map((field) => field.key));
      return [
        { key: "site", label: "Dive Site", value: draft.site || "Required before logbook entry", complete: !missingKeys.has("site"), icon: missingKeys.has("site") ? "location_off" : "task_alt" },
        { key: "buddy", label: "Buddy", value: draft.buddy || "Buddy name required", complete: !missingKeys.has("buddy"), icon: missingKeys.has("buddy") ? "person_off" : "task_alt" },
        { key: "guide", label: "Guide", value: draft.guide || "Guide or instructor required", complete: !missingKeys.has("guide"), icon: missingKeys.has("guide") ? "badge" : "task_alt" }
      ];
    },
    summaryCards(dive) {
      if (!dive) return [];
      return [
        { label: "Max Depth", value: `${this.formatDepthNumber(dive.max_depth_m)}m`, tone: "text-primary" },
        { label: "Duration", value: this.formatDurationShort(dive.duration_seconds), tone: "text-on-surface" },
        { label: "Min Temp", value: this.formatTemperature(this.importTemperature(dive)), tone: "text-secondary" },
        { label: "Gas Mix", value: this.selectedGas.label, tone: "text-tertiary" }
      ];
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
    <section class="space-y-8 text-on-surface">
      <section v-if="!dive || !selectedDraft" class="space-y-4 bg-surface-container-low p-8 shadow-panel">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Imported Dive Missing</p>
        <h3 class="font-headline text-3xl font-bold tracking-tight">This imported dive is no longer in the queue.</h3>
        <button @click="backToQueue()" class="w-fit bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">
          Return To Queue
        </button>
      </section>

      <template v-else>
        <section class="space-y-6 md:hidden">
          <div class="flex items-center justify-between gap-3">
            <button @click="backToQueue()" class="inline-flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface">
              <span class="material-symbols-outlined text-sm">chevron_left</span>
              Queue
            </button>
            <span class="rounded bg-tertiary-container px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-tertiary-container">{{ completionPercent }}% Ready</span>
          </div>

          <div v-if="importStatusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ importStatusMessage }}</div>
          <div v-if="importError" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ importError }}</div>

          <section class="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgba(19,44,64,0.98),rgba(8,30,46,0.92))] p-5 shadow-panel">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">Metadata Editor</p>
                <h3 class="mt-3 font-headline text-3xl font-bold tracking-tight">{{ paddedDiveIndex(dive) }}</h3>
                <p class="mt-2 text-sm text-on-surface-variant">{{ formatDateTime(dive.started_at) }}</p>
              </div>
              <span class="material-symbols-outlined text-primary" :style="filledIconStyle">edit_square</span>
            </div>
            <div class="mt-5 grid grid-cols-2 gap-3">
              <div v-for="card in summaryCards(dive)" :key="card.label" class="rounded-lg bg-background/25 p-3">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">{{ card.label }}</p>
                <p class="mt-2 font-headline text-xl font-bold" :class="card.tone">{{ card.value }}</p>
              </div>
            </div>
          </section>

          <section class="space-y-3 rounded-2xl bg-surface-container-low p-5 shadow-panel">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Required Metadata</p>
                <p class="mt-1 text-sm text-on-surface-variant">Finish the missing fields to commit this dive.</p>
              </div>
              <span class="font-headline text-2xl font-bold text-primary">{{ completionPercent }}%</span>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-surface-container-high">
              <div class="h-full bg-gradient-to-r from-primary to-tertiary" :style="{ width: completionPercent + '%' }"></div>
            </div>
            <div class="space-y-2">
              <div
                v-for="item in requiredChecklist(selectedDraft)"
                :key="item.key"
                class="flex items-center justify-between gap-3 rounded-lg bg-surface-container-high px-3 py-3"
              >
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-sm" :class="item.complete ? 'text-primary' : 'text-tertiary'">{{ item.icon }}</span>
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.label }}</p>
                    <p class="text-sm text-on-surface">{{ item.value }}</p>
                  </div>
                </div>
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.14em]" :class="item.complete ? 'text-primary' : 'text-tertiary'">{{ item.complete ? 'Ready' : 'Missing' }}</span>
              </div>
            </div>
          </section>

          <section class="space-y-4 rounded-2xl bg-surface-container-low p-5 shadow-panel">
            <label class="block space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
              <metadata-autocomplete-field
                :model-value="selectedDraft.site"
                @update:model-value="updateSite"
                :options="savedDiveSites"
                placeholder="Blue Hole / House Reef"
                input-class="w-full rounded-lg border-none bg-surface-container-high px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"
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
                  class="inline-flex items-center gap-2 rounded-lg bg-surface-container-highest px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-50"
                >
                  <span class="material-symbols-outlined text-sm">add_location_alt</span>
                  {{ diveSiteCreatePending ? 'Saving Dive Site...' : 'Save As Reusable Dive Site' }}
                </button>
                <p v-if="diveSiteCreateStatus" class="text-xs leading-5 text-primary">{{ diveSiteCreateStatus }}</p>
                <p v-if="diveSiteCreateError" class="text-xs leading-5 text-on-error-container">{{ diveSiteCreateError }}</p>
              </div>
            </label>
            <div class="grid grid-cols-1 gap-4">
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
                <metadata-autocomplete-field
                  :model-value="selectedDraft.buddy"
                  @update:model-value="updateBuddy"
                  :options="savedBuddies"
                  placeholder="Diver name"
                  input-class="w-full rounded-lg border-none bg-surface-container-high px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"
                />
                <p class="text-xs leading-5 text-on-surface-variant">
                  {{ savedBuddies.length ? 'Search saved buddies from Settings or enter a custom value.' : 'No saved buddies yet. Add them in Settings to reuse them here.' }}
                </p>
              </label>
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
                <metadata-autocomplete-field
                  :model-value="selectedDraft.guide"
                  @update:model-value="updateField('guide', $event)"
                  :options="savedGuides"
                  placeholder="Guide or instructor"
                  input-class="w-full rounded-lg border-none bg-surface-container-high px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"
                />
                <p class="text-xs leading-5 text-on-surface-variant">
                  {{ savedGuides.length ? 'Search saved guides from Settings or enter a custom value.' : 'No saved guides yet. Add them in Settings to reuse them here.' }}
                </p>
              </label>
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Tank Volume</span>
                <select :value="selectedDraft.tank_volume_l || ''" @change="updateField('tank_volume_l', $event.target.value)" class="w-full rounded-lg border-none bg-surface-container-high px-4 py-3 text-sm text-on-surface focus:ring-1 focus:ring-primary">
                  <option value="">Select tank volume</option>
                  <option v-for="option in tankVolumeOptions" :key="'mobile-tank-' + option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
                <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="5" placeholder="Visibility, current, wildlife, entry notes..." class="w-full resize-none rounded-lg border-none bg-surface-container-high px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"></textarea>
              </label>
            </div>
            <div class="space-y-3 rounded-lg border border-primary/10 bg-surface-container-high p-4">
              <div class="flex items-center justify-between gap-3">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Batch Update</p>
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">Buddy + Guide</span>
              </div>
              <p class="text-xs leading-5 text-on-surface-variant">Copy the current buddy and guide to every imported dive. Dive sites stay per-dive.</p>
              <button @click="applyBuddyGuide()" :disabled="bulkImportSavePending" class="w-full rounded-lg bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary disabled:opacity-50">
                {{ bulkImportSavePending ? 'Applying...' : 'Apply Buddy + Guide To Imported Dives' }}
              </button>
            </div>
            <div v-if="!isCommittedRecord" class="flex flex-col gap-3">
              <button @click="saveDraft(false)" :disabled="saveLocked" class="w-full rounded-lg bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface disabled:opacity-50">
                {{ bulkImportSavePending ? 'Applying...' : isSaving ? 'Saving...' : 'Save Draft' }}
              </button>
              <button @click="saveDraft(true)" :disabled="saveLocked || !canCompleteImport(selectedDraft)" class="w-full rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary disabled:opacity-50">
                {{ bulkImportSavePending ? 'Applying...' : isSaving ? 'Saving...' : 'Complete Record' }}
              </button>
              <button @click="removeDive()" :disabled="saveLocked" class="w-full rounded-lg bg-error-container/20 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-error-container disabled:opacity-50">
                {{ isDeleting ? 'Removing...' : 'Remove Imported Dive' }}
              </button>
            </div>
            <button v-else @click="saveDraft(true)" :disabled="saveLocked || !canCompleteImport(selectedDraft)" class="w-full rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary disabled:opacity-50">
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </section>
        </section>

        <section class="hidden space-y-8 md:block">
          <header class="space-y-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <button @click="backToQueue()" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
                  <span class="material-symbols-outlined text-sm">chevron_left</span>
                  Imported Queue
                </button>
                <div class="mt-4 flex items-center gap-2 text-primary/60">
                  <span class="material-symbols-outlined text-sm">edit_note</span>
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.28em]">Imported Dive / Metadata Editor</span>
                </div>
                <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight">Edit Imported Dive</h3>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div class="border border-primary/10 bg-surface-container-low px-5 py-4 text-center">
                  <p class="font-headline text-3xl font-bold text-primary">{{ completionPercent }}%</p>
                  <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Ready</p>
                </div>
                <div class="border border-primary/10 bg-surface-container-low px-5 py-4 text-center">
                  <p class="font-headline text-3xl font-bold text-secondary">{{ durationMinutes(dive) }}</p>
                  <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Minutes</p>
                </div>
                <div class="border border-tertiary/20 bg-surface-container-low px-5 py-4 text-center">
                  <p class="font-headline text-3xl font-bold text-tertiary">{{ missingFields.length }}</p>
                  <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Missing</p>
                </div>
              </div>
            </div>

            <div class="relative overflow-hidden border border-primary/10 bg-[linear-gradient(120deg,rgba(19,44,64,0.96),rgba(8,30,46,0.92))] p-8 shadow-panel">
              <div class="absolute right-0 top-0 h-48 w-48 bg-[radial-gradient(circle,rgba(156,202,255,0.14),transparent_68%)]"></div>
              <div class="absolute bottom-0 left-0 h-36 w-36 bg-[radial-gradient(circle,rgba(255,183,125,0.10),transparent_68%)]"></div>
              <div class="relative grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)] xl:items-end">
                <div>
                  <div class="flex flex-wrap items-center gap-3">
                  <span class="bg-tertiary/12 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ isCommittedRecord ? 'Logbook' : 'Imported' }}</span>
                    <span class="bg-background/35 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ paddedDiveIndex(dive) }}</span>
                  </div>
                  <h4 class="mt-4 font-headline text-4xl font-bold tracking-tight">{{ dive.vendor }} {{ dive.product }}</h4>
                  <p class="mt-3 max-w-2xl text-sm leading-7 text-on-surface-variant">
                    Telemetry was imported on {{ formatDateTime(dive.imported_at) }}. {{ isCommittedRecord ? 'Update the existing logbook metadata without changing the dive telemetry.' : 'Complete the required registry metadata here and commit the dive into the permanent logbook when the record is ready.' }}
                  </p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div v-for="card in summaryCards(dive)" :key="card.label" class="border border-primary/10 bg-background/35 p-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/70">{{ card.label }}</p>
                    <p class="mt-3 font-headline text-3xl font-bold leading-none" :class="card.tone">{{ card.value }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="importStatusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ importStatusMessage }}</div>
            <div v-if="importError" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ importError }}</div>
          </header>

          <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
            <section class="space-y-6 bg-surface-container-low p-8 shadow-panel">
              <div class="space-y-2">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Metadata Fields</p>
                <p class="text-sm leading-7 text-on-surface-variant">Save partial progress at any time. Commit becomes available once dive site, buddy, and guide are complete.</p>
              </div>

              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Site</span>
                <metadata-autocomplete-field
                  :model-value="selectedDraft.site"
                  @update:model-value="updateSite"
                  :options="savedDiveSites"
                  placeholder="Blue Hole / House Reef"
                  input-class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
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

              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Buddy</span>
                  <metadata-autocomplete-field
                    :model-value="selectedDraft.buddy"
                    @update:model-value="updateBuddy"
                    :options="savedBuddies"
                    placeholder="Diver name"
                    input-class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
                  />
                  <p class="text-xs leading-5 text-on-surface-variant">
                    {{ savedBuddies.length ? 'Search saved buddies from Settings or enter a custom value.' : 'No saved buddies yet. Add them in Settings to reuse them here.' }}
                  </p>
                </label>
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Guide</span>
                  <metadata-autocomplete-field
                    :model-value="selectedDraft.guide"
                    @update:model-value="updateField('guide', $event)"
                    :options="savedGuides"
                    placeholder="Guide or instructor"
                    input-class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
                  />
                  <p class="text-xs leading-5 text-on-surface-variant">
                    {{ savedGuides.length ? 'Search saved guides from Settings or enter a custom value.' : 'No saved guides yet. Add them in Settings to reuse them here.' }}
                  </p>
                </label>
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Tank Volume</span>
                  <select :value="selectedDraft.tank_volume_l || ''" @change="updateField('tank_volume_l', $event.target.value)" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary">
                    <option value="">Select tank volume</option>
                    <option v-for="option in tankVolumeOptions" :key="'desktop-tank-' + option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
              </div>

              <label class="block space-y-2">
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Notes</span>
                <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="7" placeholder="Visibility, current, wildlife, entry notes, incidents..." class="w-full resize-none border border-primary/10 bg-surface-container-high/35 px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></textarea>
              </label>

              <div v-if="!isCommittedRecord" class="space-y-3 border border-primary/10 bg-surface-container-high/18 p-5">
                <div class="flex items-center justify-between gap-4">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Batch Update</span>
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-tertiary">Buddy + Guide</span>
                </div>
                <p class="text-sm leading-6 text-on-surface-variant">Apply the current buddy and guide to every imported dive in the queue. Dive sites stay unique per record.</p>
                <button @click="applyBuddyGuide()" :disabled="bulkImportSavePending" class="w-full bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary transition-colors hover:bg-surface-container-highest disabled:opacity-50">
                  {{ bulkImportSavePending ? 'Applying...' : 'Apply Buddy + Guide To Imported Dives' }}
                </button>
              </div>

              <div v-if="!isCommittedRecord" class="grid grid-cols-2 gap-3">
                <button @click="saveDraft(false)" :disabled="saveLocked" class="bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary disabled:opacity-50">
                  {{ bulkImportSavePending ? 'Applying...' : isSaving ? 'Saving...' : 'Save Draft' }}
                </button>
                <button @click="saveDraft(true)" :disabled="saveLocked || !canCompleteImport(selectedDraft)" class="bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                  {{ bulkImportSavePending ? 'Applying...' : isSaving ? 'Saving...' : 'Complete Record' }}
                </button>
              </div>
              <button v-if="!isCommittedRecord" @click="removeDive()" :disabled="saveLocked" class="w-full bg-error-container/20 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
                {{ isDeleting ? 'Removing...' : 'Remove Imported Dive' }}
              </button>
              <button v-else @click="saveDraft(true)" :disabled="saveLocked || !canCompleteImport(selectedDraft)" class="w-full bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {{ isSaving ? 'Saving...' : 'Save Changes' }}
              </button>
            </section>

            <aside class="space-y-6">
              <section class="bg-surface-container-low p-6 shadow-panel">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Readiness</p>
                    <h4 class="mt-3 font-headline text-4xl font-bold">{{ completionPercent }}%</h4>
                  </div>
                  <span class="material-symbols-outlined text-2xl text-primary" :style="filledIconStyle">rule_settings</span>
                </div>
                <div class="mt-5 h-1 overflow-hidden bg-surface-container-high">
                  <div class="h-full bg-gradient-to-r from-primary to-tertiary" :style="{ width: completionPercent + '%' }"></div>
                </div>
                <p class="mt-3 text-sm leading-6 text-on-surface-variant">Missing fields block commit but do not block draft saves.</p>
              </section>

              <section class="bg-surface-container-low p-6 shadow-panel">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Required Checklist</p>
                <div class="mt-4 space-y-3">
                  <div
                    v-for="item in requiredChecklist(selectedDraft)"
                    :key="item.key"
                    class="flex items-center justify-between gap-3 border border-primary/10 bg-surface-container-high/30 px-4 py-3"
                  >
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-sm" :class="item.complete ? 'text-primary' : 'text-tertiary'">{{ item.icon }}</span>
                      <div>
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.label }}</p>
                        <p class="text-sm text-on-surface">{{ item.value }}</p>
                      </div>
                    </div>
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.14em]" :class="item.complete ? 'text-primary' : 'text-tertiary'">{{ item.complete ? 'Ready' : 'Missing' }}</span>
                  </div>
                </div>
              </section>

              <section class="bg-surface-container-low p-6 shadow-panel">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Imported Dive</p>
                <div class="mt-4 space-y-3 text-sm text-on-surface-variant">
                  <p><span class="text-on-surface">Dive ID:</span> {{ paddedDiveIndex(dive) }}</p>
                  <p><span class="text-on-surface">Started:</span> {{ formatDateTime(dive.started_at) }}</p>
                  <p><span class="text-on-surface">Imported:</span> {{ formatDateTime(dive.imported_at) }}</p>
                  <p><span class="text-on-surface">Device:</span> {{ dive.vendor }} {{ dive.product }}</p>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </template>
    </section>
  `
};

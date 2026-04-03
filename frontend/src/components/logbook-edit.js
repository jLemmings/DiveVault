import { canCompleteImport, formatDate, formatDateTime, formatDepthNumber, formatTemperature, importTemperature, missingImportFields, paddedDiveIndex, durationShort, numberOrZero } from "../core.js";

function normalizeSiteName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeBuddyName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export default {
  name: "LogbookEditorView",
  props: [
    "dive",
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
    "closeEditor"
  ],
  computed: {
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
      if (!Array.isArray(this.diveSites)) return [];
      return this.diveSites.filter((site) => typeof site?.name === "string" && site.name.trim());
    },
    savedBuddies() {
      if (!Array.isArray(this.buddies)) return [];
      return this.buddies.filter((buddy) => typeof buddy?.name === "string" && buddy.name.trim());
    },
    savedGuides() {
      if (!Array.isArray(this.guides)) return [];
      return this.guides.filter((guide) => typeof guide?.name === "string" && guide.name.trim());
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
    siteOptionsId() {
      return `logbook-site-options-${this.dive?.id || "draft"}`;
    },
    buddyOptionsId() {
      return `logbook-buddy-options-${this.dive?.id || "draft"}`;
    },
    guideOptionsId() {
      return `logbook-guide-options-${this.dive?.id || "draft"}`;
    }
  },
  methods: {
    paddedDiveIndex,
    formatDateTime,
    updateField(key, value) {
      if (!this.dive) return;
      this.updateDiveDraft(this.dive.id, key, value);
    },
    updateSite(value) {
      this.updateField("site", value);
    },
    updateBuddy(value) {
      this.updateField("buddy", value);
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
        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
          <section class="border border-primary/10 bg-surface-container-low p-8 shadow-panel">
            <div class="flex flex-wrap items-center gap-3">
              <span class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Logbook Entry</span>
              <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ paddedDiveIndex(dive) }}</span>
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
          <section class="border border-primary/10 bg-surface-container-low p-6 shadow-panel">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Validation</p>
            <p class="mt-3 font-headline text-3xl font-bold" :class="missingFields.length ? 'text-tertiary' : 'text-primary'">
              {{ missingFields.length ? missingFields.length + ' Missing' : 'Ready To Save' }}
            </p>
            <p class="mt-3 text-sm leading-6 text-on-surface-variant">
              Existing dives must keep dive site, buddy, and guide populated when you save changes.
            </p>
            <div class="mt-5 space-y-3">
              <div
                v-for="field in missingFields"
                :key="field.key"
                class="flex items-center gap-3 border border-error/20 bg-error-container/10 px-4 py-3"
              >
                <span class="material-symbols-outlined text-sm text-tertiary">{{ field.icon }}</span>
                <span class="text-sm text-on-surface">{{ field.label }} is still required</span>
              </div>
              <div v-if="!missingFields.length" class="flex items-center gap-3 border border-primary/20 bg-primary/10 px-4 py-3">
                <span class="material-symbols-outlined text-sm text-primary">task_alt</span>
                <span class="text-sm text-on-surface">All required logbook fields are present.</span>
              </div>
            </div>
          </section>
        </div>
        <div v-if="statusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ errorMessage }}</div>
      </header>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <section class="space-y-6 border border-primary/10 bg-surface-container-low p-8 shadow-panel">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Logbook Metadata</p>
            <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">Dive Registry Fields</h4>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
              <input :value="selectedDraft.site" @input="updateSite($event.target.value)" :list="savedDiveSites.length ? siteOptionsId : null" type="text" placeholder="House Reef" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
              <datalist v-if="savedDiveSites.length" :id="siteOptionsId">
                <option v-for="site in savedDiveSites" :key="site.id" :value="site.name"></option>
              </datalist>
              <p class="text-xs leading-5 text-on-surface-variant">
                {{ savedDiveSites.length ? 'Search saved dive sites from Settings or enter a custom value.' : 'No saved dive sites yet. Add them in Settings to reuse them here.' }}
              </p>
              <p v-if="selectedDiveSite" class="text-xs leading-5 text-primary">{{ siteCoordinateLabel(selectedDiveSite) }}</p>
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
              <input :value="selectedDraft.buddy" @input="updateBuddy($event.target.value)" :list="savedBuddies.length ? buddyOptionsId : null" type="text" placeholder="Buddy name" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
              <datalist v-if="savedBuddies.length" :id="buddyOptionsId">
                <option v-for="buddy in savedBuddies" :key="buddy.id" :value="buddy.name"></option>
              </datalist>
              <p class="text-xs leading-5 text-on-surface-variant">
                {{ savedBuddies.length ? 'Search saved buddies from Settings or enter a custom value.' : 'No saved buddies yet. Add them in Settings to reuse them here.' }}
              </p>
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
              <input :value="selectedDraft.guide" @input="updateField('guide', $event.target.value)" :list="savedGuides.length ? guideOptionsId : null" type="text" placeholder="Guide or instructor" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
              <datalist v-if="savedGuides.length" :id="guideOptionsId">
                <option v-for="guide in savedGuides" :key="guide.id" :value="guide.name"></option>
              </datalist>
              <p class="text-xs leading-5 text-on-surface-variant">
                {{ savedGuides.length ? 'Search saved guides from Settings or enter a custom value.' : 'No saved guides yet. Add them in Settings to reuse them here.' }}
              </p>
            </label>
          </div>

          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
              <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="14" placeholder="Conditions, wildlife, route, incidents, visibility, buoyancy notes..." class="min-h-[22rem] w-full resize-y border border-primary/10 bg-[linear-gradient(180deg,rgba(9,23,36,0.9),rgba(9,23,36,0.84))] px-5 py-4 text-sm leading-7 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></textarea>
            </label>

            <aside class="space-y-4">
              <section class="border border-primary/10 bg-surface-container-high/30 p-5">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Record Summary</p>
                <div class="mt-4 space-y-3 text-sm text-on-surface-variant">
                  <div class="flex items-start justify-between gap-3">
                    <span>Dive ID</span>
                    <span class="text-on-surface">{{ paddedDiveIndex(dive) }}</span>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <span>Started</span>
                    <span class="max-w-[12rem] text-right text-on-surface">{{ formatDateTime(dive.started_at) }}</span>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <span>Imported</span>
                    <span class="max-w-[12rem] text-right text-on-surface">{{ formatDateTime(dive.imported_at) }}</span>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <span>Device</span>
                    <span class="max-w-[12rem] text-right text-on-surface">{{ dive.vendor }} {{ dive.product }}</span>
                  </div>
                </div>
              </section>

              <section class="border border-primary/10 bg-surface-container-high/30 p-5">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Save Rules</p>
                <ul class="mt-4 space-y-3 text-sm leading-6 text-on-surface-variant">
                  <li>Dive site, buddy, and guide must remain filled in.</li>
                  <li>Notes can be changed freely without touching telemetry.</li>
                  <li>Saving here updates only this one logbook record.</li>
                </ul>
              </section>
            </aside>
          </div>
        </section>

        <aside class="space-y-6">
          <section class="border border-primary/10 bg-surface-container-low p-6 shadow-panel">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Actions</p>
            <div class="mt-5 space-y-3">
              <button @click="saveChanges()" :disabled="isSaving || isDeleting || !canSaveRecord" class="w-full bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {{ isSaving ? 'Saving...' : 'Save Logbook Changes' }}
              </button>
              <button @click="removeDive()" :disabled="isSaving || isDeleting" class="w-full bg-error-container/20 px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
                {{ isDeleting ? 'Removing...' : 'Remove Dive' }}
              </button>
              <button @click="closeEditor()" class="w-full bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
                Cancel
              </button>
            </div>
          </section>

          <section class="border border-primary/10 bg-surface-container-low p-6 shadow-panel">
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Current Values</p>
            <div class="mt-4 space-y-4">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary/70">Dive Site</p>
                <p class="mt-1 text-sm text-on-surface">{{ selectedDraft.site || 'Missing' }}</p>
                <p v-if="selectedDiveSite" class="mt-1 text-xs text-primary">{{ siteCoordinateLabel(selectedDiveSite) }}</p>
              </div>
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary/70">Buddy</p>
                <p class="mt-1 text-sm text-on-surface">{{ selectedDraft.buddy || 'Missing' }}</p>
              </div>
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary/70">Guide</p>
                <p class="mt-1 text-sm text-on-surface">{{ selectedDraft.guide || 'Missing' }}</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  `
};

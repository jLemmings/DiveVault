import { isImportComplete, effectiveImportDraft, gasSummary, averageImportCompletion, missingImportFields, filledIconStyle, compactDateStamp, paddedDiveIndex, formatDate, formatTime, formatDepthNumber, durationShort, formatTemperature, importTemperature, isNightDive, canCompleteImport, importCompletionPercent, numberOrZero } from "../core.js";

export default {
  name: "DiveImportView",
  props: [
    "dives",
    "importDrafts",
    "selectedImportId",
    "selectImportDive",
    "updateImportDraft",
    "saveImportDraft",
    "applyBuddyGuideToPendingImports",
    "savingImportId",
    "bulkImportSavePending",
    "importError",
    "importStatusMessage",
    "openDive",
    "setView",
    "fetchDives"
  ],
  computed: {
    pendingDives() {
      return this.dives.filter((dive) => !isImportComplete(effectiveImportDraft(dive, this.importDrafts[String(dive.id)])));
    },
    selectedDive() {
      return this.pendingDives.find((dive) => String(dive.id) === String(this.selectedImportId)) || this.pendingDives[0] || null;
    },
    selectedDraft() {
      return this.selectedDive ? effectiveImportDraft(this.selectedDive, this.importDrafts[String(this.selectedDive.id)]) : null;
    },
    selectedGas() {
      return this.selectedDive ? gasSummary(this.selectedDive) : { label: "--", detail: "" };
    },
    averageCompletion() {
      return averageImportCompletion(this.pendingDives, this.importDrafts);
    },
    selectedMissingFields() {
      return this.selectedDraft ? missingImportFields(this.selectedDraft) : [];
    },
    selectedMissingCount() {
      return this.selectedMissingFields.length;
    },
    nextStepLabel() {
      if (!this.selectedDraft) return "Refresh queue";
      const [nextMissing] = this.selectedMissingFields;
      return nextMissing ? `Tag ${nextMissing.label}` : "Commit record";
    },
    filledIconStyle() {
      return filledIconStyle;
    }
  },
  methods: {
    compactDateStamp,
    paddedDiveIndex,
    formatDate,
    formatTime,
    formatDepthNumber,
    formatDurationShort: durationShort,
    formatTemperature,
    importTemperature,
    gasSummary,
    isNightDive,
    canCompleteImport,
    importCompletionPercent,
    missingImportFields,
    missingCount(dive) {
      return this.missingFields(dive).length;
    },
    missingFields(dive) {
      return missingImportFields(effectiveImportDraft(dive, this.importDrafts[String(dive.id)]));
    },
    completionForDive(dive) {
      return importCompletionPercent(effectiveImportDraft(dive, this.importDrafts[String(dive.id)]));
    },
    durationMinutes(dive) {
      return Math.round(numberOrZero(dive?.duration_seconds) / 60);
    },
    isSaving(diveId) {
      return String(this.savingImportId) === String(diveId);
    },
    isSaveLocked(diveId) {
      return this.bulkImportSavePending || this.isSaving(diveId);
    },
    requiredChecklist(logbook) {
      const draft = logbook || {};
      const missingKeys = new Set(missingImportFields(draft).map((field) => field.key));
      return [
        { key: "site", label: "Dive Site", value: draft.site || "Required before logbook entry", complete: !missingKeys.has("site"), icon: missingKeys.has("site") ? "location_off" : "task_alt" },
        { key: "buddy", label: "Buddy", value: draft.buddy || "Buddy name required", complete: !missingKeys.has("buddy"), icon: missingKeys.has("buddy") ? "person_off" : "task_alt" },
        { key: "guide", label: "Guide", value: draft.guide || "Guide or instructor required", complete: !missingKeys.has("guide"), icon: missingKeys.has("guide") ? "badge" : "task_alt" },
      ];
    },
    updateField(key, value) {
      if (!this.selectedDive) return;
      this.updateImportDraft(this.selectedDive.id, key, value);
    },
    saveSelectedDraft(commit = false) {
      if (!this.selectedDive) return;
      this.saveImportDraft(this.selectedDive.id, commit);
    },
    applySelectedBuddyGuide() {
      if (!this.selectedDive) return;
      this.applyBuddyGuideToPendingImports(this.selectedDive.id);
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div class="flex items-end justify-between">
          <div>
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Queue Status</span>
            <h3 class="mt-1 font-headline text-3xl font-bold tracking-tight text-primary">IMPORTED_DIVES</h3>
          </div>
          <span class="rounded bg-tertiary-container px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-tertiary-container">{{ pendingDives.length }} Imported</span>
        </div>

        <div v-if="importStatusMessage" class="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{{ importStatusMessage }}</div>
        <div v-if="importError" class="rounded-xl bg-error-container/20 px-4 py-3 text-sm text-on-error-container">{{ importError }}</div>

        <div v-if="pendingDives.length" class="space-y-6">
          <article v-for="dive in pendingDives" :key="'mobile-import-' + dive.id" @click="selectImportDive(dive.id)" class="cursor-pointer overflow-hidden rounded-xl bg-surface-container-low shadow-panel">
            <div class="h-1 w-full overflow-hidden bg-primary/20">
              <div class="h-full bg-primary" :style="{ width: completionForDive(dive) + '%' }"></div>
            </div>
            <div class="space-y-5 p-5">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-label text-xs font-bold uppercase tracking-[0.12em] text-on-surface-variant opacity-70">IMPORT_ID: {{ paddedDiveIndex(dive) }}</p>
                  <div class="mt-2 space-y-1.5">
                    <h3 class="font-headline text-[1.7rem] font-bold tracking-tight text-primary tabular-nums">{{ formatDate(dive.started_at) }}</h3>
                    <div class="inline-flex items-center gap-2 text-sm text-secondary/80">
                      <span class="material-symbols-outlined text-base text-primary/80">schedule</span>
                      <span class="font-semibold tabular-nums">{{ formatTime(dive.started_at) }}</span>
                    </div>
                  </div>
                </div>
                <span class="material-symbols-outlined text-primary" :style="filledIconStyle">sailing</span>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg border-l-2 border-primary bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Depth</p>
                  <p class="font-headline text-2xl font-bold text-primary">{{ formatDepthNumber(dive.max_depth_m) }}<span class="ml-1 text-xs font-normal opacity-60">M</span></p>
                </div>
                <div class="rounded-lg border-l-2 border-secondary bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Time</p>
                  <p class="font-headline text-2xl font-bold text-secondary">{{ durationMinutes(dive) }}<span class="ml-1 text-xs font-normal opacity-60">MIN</span></p>
                </div>
                <div class="rounded-lg bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Temp</p>
                  <p class="font-headline text-lg font-bold">{{ formatTemperature(importTemperature(dive)) }}</p>
                </div>
                <div class="rounded-lg bg-surface-container-high p-3">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">Gas</p>
                  <p class="font-headline text-lg font-bold">{{ gasSummary(dive).label }}</p>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <span v-for="field in missingFields(dive)" :key="'chip-' + dive.id + '-' + field.key" class="inline-flex items-center gap-1 rounded bg-tertiary-container/40 px-2 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em]" :class="field.key === 'site' ? 'text-tertiary' : 'bg-surface-container-highest text-on-surface-variant'">
                  <span class="material-symbols-outlined text-sm">{{ field.icon }}</span>
                  {{ field.missingLabel }}
                </span>
              </div>

              <section v-if="selectedDive && selectedDive.id === dive.id" class="space-y-4 rounded-xl bg-surface-container-high p-4">
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
                  <input :value="selectedDraft.site" @input="updateField('site', $event.target.value)" type="text" placeholder="Blue Hole / House Reef" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                </label>
                <div class="grid grid-cols-1 gap-4">
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
                    <input :value="selectedDraft.buddy" @input="updateField('buddy', $event.target.value)" type="text" placeholder="Diver name" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                  </label>
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
                    <input :value="selectedDraft.guide" @input="updateField('guide', $event.target.value)" type="text" placeholder="Guide or instructor" class="w-full rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary" />
                  </label>
                </div>
                <div class="space-y-3 rounded-lg border border-primary/10 bg-surface-container-highest/40 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Batch Update</p>
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">Buddy + Guide</span>
                  </div>
                  <p class="text-xs leading-5 text-on-surface-variant">Copy the current buddy and guide to every imported dive. Dive sites stay per-dive.</p>
                  <button @click="applySelectedBuddyGuide" :disabled="bulkImportSavePending" class="w-full rounded-lg bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary disabled:opacity-50">
                    {{ bulkImportSavePending ? 'Applying...' : 'Apply Buddy + Guide To Imported Dives' }}
                  </button>
                </div>
                <label class="block space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
                  <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="4" placeholder="Visibility, current, wildlife, entry notes..." class="w-full resize-none rounded-lg border-none bg-surface-container-highest/70 px-4 py-3 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:ring-1 focus:ring-primary"></textarea>
                </label>
                <div class="flex flex-col gap-3">
                  <button @click="saveSelectedDraft(false)" :disabled="isSaveLocked(dive.id)" class="w-full rounded-lg bg-surface-container-highest px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface disabled:opacity-50">
                    {{ bulkImportSavePending ? 'Applying...' : isSaving(dive.id) ? 'Saving...' : 'Save Draft' }}
                  </button>
                  <button @click="saveSelectedDraft(true)" :disabled="isSaveLocked(dive.id) || !canCompleteImport(selectedDraft)" class="w-full rounded-lg bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary disabled:opacity-50">
                    {{ bulkImportSavePending ? 'Applying...' : isSaving(dive.id) ? 'Saving...' : 'Complete Record' }}
                  </button>
                </div>
              </section>
            </div>
          </article>

          <div class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant/30 p-8 text-center opacity-60">
            <span class="material-symbols-outlined mb-3 text-4xl">settings_input_component</span>
            <p class="font-headline text-lg font-bold">SCAN_FOR_COMPUTER</p>
            <p class="text-xs text-on-surface-variant">Ready to import new data via Bluetooth LE</p>
          </div>
        </div>

        <section v-else class="space-y-4 rounded-xl bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Import Queue Clear</p>
          <p class="font-headline text-2xl font-bold">All imported dives have been committed.</p>
          <button @click="fetchDives" class="rounded-lg bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Refresh Queue</button>
        </section>
      </section>

      <section class="hidden space-y-10 md:block">
      <header class="space-y-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div class="mb-2 flex items-center gap-2 text-primary/60">
              <span class="material-symbols-outlined text-sm">file_download</span>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.28em]">Synchronization Module / Queued Data</span>
            </div>
            <h3 class="font-headline text-5xl font-bold tracking-tight">Imported Dives</h3>
          </div>
          <button @click="fetchDives" class="inline-flex items-center gap-2 bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary transition-colors hover:bg-surface-container-highest">
            <span class="material-symbols-outlined text-sm">sync</span>
            Refresh Queue
          </button>
        </div>
        <div class="relative overflow-hidden border border-primary/10 bg-[linear-gradient(120deg,rgba(19,44,64,0.96),rgba(8,30,46,0.92))] p-6 shadow-panel md:p-8">
          <div class="absolute right-0 top-0 h-40 w-40 bg-[radial-gradient(circle,rgba(156,202,255,0.16),transparent_68%)]"></div>
          <div class="absolute bottom-0 left-0 h-32 w-32 bg-[radial-gradient(circle,rgba(255,183,125,0.10),transparent_68%)]"></div>
          <div class="relative grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.82fr)] xl:items-end">
            <div class="space-y-5">
              <p class="max-w-3xl text-sm leading-7 text-on-surface-variant">
                Imported dives stay in the staging queue until the diver completes the required registry metadata.
                Add the dive site, buddy, and guide to promote each record into the permanent logbook.
              </p>
              <p class="max-w-3xl text-xs leading-6 text-secondary/80">
                Buddy and guide can be copied across the entire import queue from the selected record. Dive sites remain unchanged.
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <span class="inline-flex items-center gap-2 bg-background/40 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  <span class="material-symbols-outlined text-sm">workspace_premium</span>
                  Metadata Workflow Active
                </span>
                <span v-if="selectedDive" class="inline-flex items-center gap-2 bg-tertiary/10 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">
                  <span class="material-symbols-outlined text-sm">assignment_turned_in</span>
                  {{ nextStepLabel }}
                </span>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="border border-primary/10 bg-background/35 px-4 py-4 text-center">
                <p class="font-headline text-3xl font-bold text-primary">{{ pendingDives.length }}</p>
                <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Imported</p>
              </div>
              <div class="border border-primary/10 bg-background/35 px-4 py-4 text-center">
                <p class="font-headline text-3xl font-bold text-secondary">{{ dives.length }}</p>
                <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Total Logs</p>
              </div>
              <div class="border border-tertiary/20 bg-background/35 px-4 py-4 text-center">
                <p class="font-headline text-3xl font-bold text-tertiary">{{ averageCompletion }}%</p>
                <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.22em] text-secondary">Completion</p>
              </div>
            </div>
          </div>
        </div>
        <div v-if="importStatusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ importStatusMessage }}</div>
        <div v-if="importError" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ importError }}</div>
      </header>

      <div v-if="pendingDives.length" class="space-y-4">
        <section class="space-y-4">
          <article
            v-for="dive in pendingDives"
            :key="dive.id"
            @click="selectImportDive(dive.id)"
            class="group relative overflow-hidden border transition-all duration-300"
            :class="selectedDive && selectedDive.id === dive.id ? 'cursor-pointer border-primary/30 bg-surface-container shadow-[0_0_0_1px_rgba(156,202,255,0.16),0_20px_45px_-28px_rgba(0,0,0,0.7)]' : 'cursor-pointer border-primary/10 bg-surface-container-low hover:border-primary/20 hover:bg-surface-container-high/70'"
          >
            <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-300" :class="selectedDive && selectedDive.id === dive.id ? 'opacity-100' : 'group-hover:opacity-60'"></div>
            <div class="grid gap-0 2xl:grid-cols-[212px_minmax(0,1fr)_220px]">
              <div class="border-b border-primary/10 bg-surface-container-highest/20 p-6 2xl:border-b-0 2xl:border-r">
                <div class="flex items-start justify-between gap-3 2xl:block">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Date</p>
                    <p class="mt-2 whitespace-nowrap font-headline text-[1.7rem] font-bold tracking-tight text-primary tabular-nums">{{ compactDateStamp(dive.started_at) }}</p>
                    <div class="mt-3 inline-flex items-center gap-2 text-sm text-secondary/80">
                      <span class="material-symbols-outlined text-base text-primary/80">schedule</span>
                      <span class="font-semibold tabular-nums">{{ formatTime(dive.started_at) }}</span>
                    </div>
                  </div>
                  <div class="text-right 2xl:mt-8 2xl:text-left">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Index</p>
                    <p class="mt-2 font-headline text-2xl font-bold">{{ paddedDiveIndex(dive) }}</p>
                  </div>
                </div>
              </div>
              <div class="min-w-0 space-y-6 p-6 lg:p-8">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="bg-tertiary/12 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Imported</span>
                      <span v-if="isNightDive(dive)" class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Night Dive</span>
                      <span class="bg-background/35 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ missingCount(dive) }} Missing</span>
                    </div>
                    <h4 class="mt-4 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ dive.vendor }} {{ dive.product }}</h4>
                    <p class="mt-2 text-sm text-on-surface-variant">{{ formatDate(dive.started_at) }} telemetry import awaiting registry metadata.</p>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="border border-primary/10 bg-surface-container-high/35 p-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Max Depth</p>
                    <p class="mt-3 font-headline text-3xl font-bold leading-none text-primary">{{ formatDepthNumber(dive.max_depth_m) }}<span class="ml-1 text-xs font-normal text-secondary">M</span></p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/35 p-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Duration</p>
                    <p class="mt-3 font-headline text-3xl font-bold leading-none">{{ formatDurationShort(dive.duration_seconds) }}</p>
                    <p class="mt-1 text-xs text-secondary">Per dive</p>
                  </div>
                  <div class="border border-primary/10 bg-surface-container-high/35 p-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Min Temp</p>
                    <p class="mt-3 font-headline text-3xl font-bold leading-none">{{ formatTemperature(importTemperature(dive)) }}</p>
                  </div>
                <div class="border border-primary/10 bg-surface-container-high/35 p-4">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/50">Gas Mix</p>
                  <p class="mt-3 font-headline text-3xl font-bold leading-none">{{ gasSummary(dive).label }}</p>
                </div>
                </div>
                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Missing Metadata</p>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ completionForDive(dive) }}% Ready</p>
                  </div>
                  <div class="h-1 overflow-hidden bg-surface-container-highest">
                    <div class="h-full bg-gradient-to-r from-primary to-tertiary transition-all duration-300" :style="{ width: completionForDive(dive) + '%' }"></div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="field in missingFields(dive)"
                      :key="field.key"
                      class="inline-flex items-center gap-2 border border-error/15 bg-background/45 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-error"
                    >
                      <span class="material-symbols-outlined text-[12px]">{{ field.icon }}</span>
                      {{ field.missingLabel }}
                    </span>
                    <span v-if="!missingFields(dive).length" class="inline-flex items-center gap-2 border border-primary/20 bg-primary/10 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                      <span class="material-symbols-outlined text-[12px]">task_alt</span>
                      Ready To Commit
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex flex-col justify-between gap-5 border-t border-primary/10 bg-surface-container-high/18 p-6 lg:p-8 2xl:border-l 2xl:border-t-0">
                <div class="space-y-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Queue Status</p>
                      <p class="mt-2 font-headline text-2xl font-bold">{{ completionForDive(dive) }}%</p>
                    </div>
                    <span class="material-symbols-outlined text-2xl text-primary" :style="filledIconStyle">deployed_code</span>
                  </div>
                  <p class="text-sm leading-6 text-on-surface-variant">Click this record to complete the required metadata and commit it into the main logbook.</p>
                </div>
                <div class="space-y-4">
                  <div class="rounded border border-primary/10 bg-background/35 p-4">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Next Required Step</p>
                    <p class="mt-2 text-sm font-semibold text-tertiary">{{ missingCount(dive) ? missingFields(dive)[0].label : 'Ready To Commit' }}</p>
                  </div>
                </div>
              </div>
            </div>
            <section v-if="selectedDive && selectedDive.id === dive.id" class="border-t border-primary/10 bg-[linear-gradient(180deg,rgba(8,30,46,0.92),rgba(7,28,42,0.88))] p-5 lg:p-6">
              <div class="space-y-4">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Metadata Editor</p>
                  <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ paddedDiveIndex(selectedDive) }}</h4>
                  <p class="mt-2 text-sm text-on-surface-variant">{{ formatDate(selectedDive.started_at) }} | {{ selectedDive.vendor }} {{ selectedDive.product }}</p>
                </div>
                <div class="space-y-3">
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Site</span>
                    <input :value="selectedDraft.site" @input="updateField('site', $event.target.value)" type="text" placeholder="Blue Hole / House Reef" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-2.5 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
                  </label>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label class="block space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Buddy</span>
                      <input :value="selectedDraft.buddy" @input="updateField('buddy', $event.target.value)" type="text" placeholder="Diver name" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-2.5 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
                    </label>
                    <label class="block space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Guide</span>
                      <input :value="selectedDraft.guide" @input="updateField('guide', $event.target.value)" type="text" placeholder="Guide or instructor" class="w-full border border-primary/10 bg-surface-container-high/35 px-4 py-2.5 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
                    </label>
                  </div>
                  <div class="space-y-3 border border-primary/10 bg-surface-container-high/18 p-4">
                    <div class="flex items-center justify-between gap-4">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Batch Update</span>
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-tertiary">Buddy + Guide</span>
                    </div>
                    <p class="text-sm leading-6 text-on-surface-variant">Apply the current buddy and guide to every imported dive in the queue. Dive sites stay unique per record.</p>
                    <button @click="applySelectedBuddyGuide" :disabled="bulkImportSavePending" class="w-full bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary transition-colors hover:bg-surface-container-highest disabled:opacity-50">
                      {{ bulkImportSavePending ? 'Applying...' : 'Apply Buddy + Guide To Imported Dives' }}
                    </button>
                  </div>
                  <label class="block space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Dive Notes</span>
                    <textarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="4" placeholder="Visibility, current, wildlife, entry notes, incidents..." class="w-full resize-none border border-primary/10 bg-surface-container-high/35 px-4 py-2.5 text-sm leading-6 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></textarea>
                  </label>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <button @click="saveSelectedDraft(false)" :disabled="isSaveLocked(selectedDive.id)" class="bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary disabled:opacity-50">
                    {{ bulkImportSavePending ? 'Applying...' : isSaving(selectedDive.id) ? 'Saving...' : 'Save Draft' }}
                  </button>
                  <button @click="saveSelectedDraft(true)" :disabled="isSaveLocked(selectedDive.id) || !canCompleteImport(selectedDraft)" class="bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                    {{ bulkImportSavePending ? 'Applying...' : isSaving(selectedDive.id) ? 'Saving...' : 'Complete Record' }}
                  </button>
                </div>
              </div>
            </section>
          </article>
        </section>
      </div>

      <section v-else class="space-y-6 bg-surface-container-low p-10 shadow-panel">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Import Queue Clear</p>
        <h4 class="font-headline text-4xl font-bold tracking-tight">All imported dives have been committed.</h4>
        <p class="max-w-2xl text-sm leading-7 text-on-surface-variant">The imported queue is empty. Continue with the dive log or inspect the most recent telemetry detail.</p>
        <div class="flex flex-wrap gap-3">
          <button @click="setView('logs')" class="bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Return To Logs</button>
          <button @click="fetchDives" class="bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Refresh Queue</button>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div class="border border-primary/10 bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Device Sync</h4>
          <div class="mt-6 flex items-center justify-between gap-3">
            <span class="text-sm font-semibold">{{ dives[0] ? dives[0].vendor + ' ' + dives[0].product : 'No device synced' }}</span>
            <span class="bg-primary/10 px-2 py-1 font-label text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Connected</span>
          </div>
          <div class="mt-4 h-1 bg-surface-container-highest"><div class="h-full bg-primary" :style="{ width: Math.min(100, dives.length * 12) + '%' }"></div></div>
          <p class="mt-2 text-[10px] text-secondary/60">Imported depth: {{ dives.length }} logs cached locally</p>
        </div>
        <div class="border border-primary/10 bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Incomplete Logs</h4>
          <div class="mt-6 flex items-end gap-3">
            <span class="font-headline text-4xl font-bold">{{ pendingDives.length }}</span>
            <span class="pb-1 text-xs text-secondary/60">logs remaining</span>
          </div>
          <p class="mt-2 text-[10px] text-secondary/60">Average data completion: {{ averageCompletion }}%</p>
        </div>
        <div class="border border-primary/10 bg-surface-container-low p-8">
          <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Next Step</h4>
          <div class="mt-6 flex items-center gap-4">
            <div class="flex h-11 w-11 items-center justify-center bg-surface-container-highest text-primary">
              <span class="material-symbols-outlined">map</span>
            </div>
            <div>
              <p class="text-sm font-bold">{{ nextStepLabel }}</p>
              <p class="text-[10px] text-secondary/60">Geo-tagging and buddy validation recommended</p>
            </div>
          </div>
        </div>
      </section>
      </section>
    </section>
  `
};

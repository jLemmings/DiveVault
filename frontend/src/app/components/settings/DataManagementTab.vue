<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "DataManagementTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "dataManagementAction",
      "dataManagementError",
      "dataManagementStatus",
      "dataManagementWarning",
      "desktopSyncApproving",
      "desktopSyncError",
      "desktopSyncStatus",
      "hasCliAuthCode",
      "importReadyForReview",
      "isDataManagementBusy",
      "isInteractionLocked",
      "subsurfacePreview"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "approveDesktopSync",
      "cancelSubsurfaceImportPreview",
      "confirmSubsurfaceImport",
      "exportDiveCsv",
      "exportDivePdf",
      "handleCsvImportSelection",
      "handleSubsurfaceImportSelection",
      "resetDataManagementFeedback",
      "reviewCsvImportQueue"
    ]),
    triggerCsvImport() {
      this.resetDataManagementFeedback();
      this.$refs.csvImportInput?.click();
    },
    triggerSubsurfaceImport() {
      this.resetDataManagementFeedback();
      this.$refs.subsurfaceImportInput?.click();
    }
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Exports And Desktop Sync</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">The actions below are organized as clear task cards instead of one long button list.</p>
      </div>
    </div>

    <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <span>{{ dataManagementStatus }}</span>
        <button
          v-if="importReadyForReview"
          type="button"
          @click="reviewCsvImportQueue"
          class="settings-button settings-button-primary shrink-0"
        >
          Review Imported Dives
        </button>
      </div>
    </div>
    <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ dataManagementError }}</div>
    <div v-if="dataManagementWarning" class="settings-feedback border-tertiary/30 bg-tertiary/10 text-tertiary">
      <div class="flex items-start gap-3">
        <span class="material-symbols-outlined text-base">warning</span>
        <span>{{ dataManagementWarning }}</span>
      </div>
    </div>

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

      <button
        @click="triggerCsvImport"
        :disabled="isDataManagementBusy || isInteractionLocked"
        class="settings-action-card"
      >
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">upload_file</span>
            <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Importing CSV' ? 'Importing Dive CSV' : 'Import Dives (CSV)' }}</p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">Load spreadsheet dive rows into the imported dive queue for review before they enter the logbook.</p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">upload</span>
      </button>

      <button
        @click="triggerSubsurfaceImport"
        :disabled="isDataManagementBusy || isInteractionLocked"
        class="settings-action-card"
      >
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">backup_table</span>
            <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Previewing Subsurface' ? 'Reading Subsurface Export' : dataManagementAction === 'Importing Subsurface' ? 'Importing Subsurface Export' : 'Import Subsurface Export' }}</p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">Preview a Subsurface XML or archive export, then confirm before adding the dives to the review queue.</p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">upload</span>
      </button>
    </div>
    <input
      ref="csvImportInput"
      type="file"
      accept=".csv,text/csv"
      class="hidden"
      @change="handleCsvImportSelection"
    />
    <input
      ref="subsurfaceImportInput"
      type="file"
      accept=".xml,.ssrf,application/xml,text/xml,application/zip,application/gzip"
      class="hidden"
      @change="handleSubsurfaceImportSelection"
    />

    <div v-if="subsurfacePreview" class="settings-side-panel mt-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Subsurface Preview</p>
          <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ subsurfacePreview.rows }} dives ready to import</h5>
          <p class="mt-3 text-sm leading-7 text-secondary">Confirming will add these dives to the imported-dive queue. They will not enter the main logbook until you review and complete them.</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            @click="confirmSubsurfaceImport"
            :disabled="isDataManagementBusy || isInteractionLocked"
            class="settings-button settings-button-primary"
          >
            Confirm Import
          </button>
          <button
            type="button"
            @click="cancelSubsurfaceImportPreview"
            :disabled="isDataManagementBusy"
            class="settings-button settings-button-ghost"
          >
            Cancel
          </button>
        </div>
      </div>
      <div class="mt-5 grid gap-3 md:grid-cols-2">
        <div v-for="dive in subsurfacePreview.dives" :key="dive.dive_uid" class="settings-info-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ dive.started_at }}</p>
          <p class="mt-2 text-base font-semibold text-on-surface">{{ dive.site || 'Unassigned site' }}</p>
          <p class="mt-1 text-sm text-secondary">{{ Math.round((dive.duration_seconds || 0) / 60) }} min / {{ dive.max_depth_m || 0 }} m / {{ dive.sample_count || 0 }} samples</p>
        </div>
      </div>
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
</template>

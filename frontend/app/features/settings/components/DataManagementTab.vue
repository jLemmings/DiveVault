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
      "canConfirmImportPreview",
      "importPreview",
      "importReadyForReview",
      "isDataManagementBusy",
      "isInteractionLocked"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "approveDesktopSync",
      "cancelImportPreview",
      "confirmImportPreview",
      "exportDiveCsv",
      "exportDivePdf",
      "handleCsvImportSelection",
      "handleSubsurfaceImportSelection",
      "importPreviewStatusClass",
      "importPreviewStatusLabel",
      "resetDataManagementFeedback",
      "reviewImportQueue"
    ]),
    triggerCsvImport() {
      this.resetDataManagementFeedback();
      this.$refs.csvImportInput?.inputRef?.click();
    },
    triggerSubsurfaceImport() {
      this.resetDataManagementFeedback();
      this.$refs.subsurfaceImportInput?.inputRef?.click();
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
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">
          The actions below are organized as clear task cards instead of one long button list.
        </p>
      </div>
    </div>

    <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <span>{{ dataManagementStatus }}</span>
        <UButton
          v-if="importReadyForReview"
          type="button"
          @click="reviewImportQueue"
          class="settings-button settings-button-primary shrink-0"
        >
          Review Imported Dives
        </UButton>
      </div>
    </div>
    <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">
      {{ dataManagementError }}
    </div>
    <div v-if="dataManagementWarning" class="settings-feedback border-tertiary/30 bg-tertiary/10 text-tertiary">
      <div class="flex items-start gap-3">
        <span class="material-symbols-outlined text-base">warning</span>
        <span>{{ dataManagementWarning }}</span>
      </div>
    </div>

    <div class="settings-action-grid">
      <UButton @click="exportDivePdf" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">picture_as_pdf</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{ dataManagementAction === "Exporting PDF" ? "Exporting Dive PDF" : "Export Logs (PDF)" }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Generate a printable logbook export for review, sharing, or offline archiving.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">north_east</span>
      </UButton>

      <UButton @click="exportDiveCsv" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">table_chart</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{ dataManagementAction === "Exporting CSV" ? "Exporting Telemetry CSV" : "Raw Telemetry (CSV)" }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Download the raw dive telemetry for spreadsheet analysis or external processing.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">north_east</span>
      </UButton>

      <UButton @click="triggerCsvImport" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">upload_file</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{ dataManagementAction === "Importing CSV" ? "Importing Dive CSV" : "Import Dives (CSV)" }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Load spreadsheet dive rows into the imported dive queue for review before they enter the logbook.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">upload</span>
      </UButton>

      <UButton @click="triggerSubsurfaceImport" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">backup_table</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{
                dataManagementAction === "Previewing Subsurface"
                  ? "Reading Subsurface Export"
                  : dataManagementAction === "Importing Subsurface"
                    ? "Importing Subsurface Export"
                    : "Import Subsurface Export"
              }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Preview a Subsurface XML or archive export, then confirm before adding the dives to the review queue.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">upload</span>
      </UButton>
    </div>
    <UInput ref="csvImportInput" type="file" accept=".csv,text/csv" class="hidden" @change="handleCsvImportSelection" />
    <UInput
      ref="subsurfaceImportInput"
      type="file"
      accept=".xml,.ssrf,application/xml,text/xml,application/zip,application/gzip"
      class="hidden"
      @change="handleSubsurfaceImportSelection"
    />

    <div v-if="importPreview" class="settings-side-panel mt-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Import Preview</p>
          <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ importPreview.label }} review</h5>
          <p class="mt-3 text-sm leading-7 text-secondary">
            {{ importPreview.fileName || "Selected file" }} has {{ importPreview.rows }} row{{
              importPreview.rows === 1 ? "" : "s"
            }}
            checked: {{ importPreview.ready_rows }} ready, {{ importPreview.duplicates }} duplicate,
            {{ importPreview.invalid_rows }} invalid.
          </p>
          <p v-if="importPreview.invalid_rows" class="mt-2 text-sm text-error">Fix invalid rows in the source file before importing.</p>
          <p v-else-if="!importPreview.ready_rows" class="mt-2 text-sm text-tertiary">
            All valid rows are duplicates, so there are no new dives to import.
          </p>
          <p v-else class="mt-2 text-sm text-secondary">
            Confirming adds ready rows to the imported-dive queue. Duplicates are skipped and finished logs still require queue review.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <UButton
            type="button"
            @click="confirmImportPreview"
            :disabled="isDataManagementBusy || isInteractionLocked || !canConfirmImportPreview"
            class="settings-button settings-button-primary"
          >
            Confirm Import
          </UButton>
          <UButton
            type="button"
            @click="cancelImportPreview"
            :disabled="isDataManagementBusy"
            class="settings-button settings-button-ghost"
          >
            Cancel
          </UButton>
        </div>
      </div>
      <div class="mt-5 overflow-x-auto rounded-2xl border border-primary/10">
        <table class="min-w-full divide-y divide-primary/10 text-left text-sm">
          <thead class="bg-surface-container-high/60 text-secondary">
            <tr>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Row</th>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Status</th>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Started</th>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Site</th>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Profile</th>
              <th class="px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em]">Validation</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-primary/10">
            <tr
              v-for="row in importPreview.dives"
              :key="`${row.row_number}-${row.dive_uid || row.source_id || 'invalid'}`"
              class="bg-surface-container-low/45"
            >
              <td class="whitespace-nowrap px-4 py-3 text-secondary">{{ row.row_number || row.source_id || "-" }}</td>
              <td class="whitespace-nowrap px-4 py-3">
                <span
                  class="inline-flex rounded-full border px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em]"
                  :class="importPreviewStatusClass(row)"
                >
                  {{ importPreviewStatusLabel(row) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-on-surface">{{ row.started_at || "-" }}</td>
              <td class="min-w-[12rem] px-4 py-3 text-on-surface">{{ row.site || "Unassigned site" }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-secondary">
                {{ Math.round((row.duration_seconds || 0) / 60) }} min / {{ row.max_depth_m || 0 }} m / {{ row.sample_count || 0 }} samples
              </td>
              <td class="min-w-[16rem] px-4 py-3 text-secondary">
                <span v-if="row.errors?.length" class="text-error">{{ row.errors.join("; ") }}</span>
                <span v-else-if="row.duplicate" class="text-tertiary">Already present or repeated in this file.</span>
                <span v-else>Ready for import.</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="settings-side-panel mt-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Desktop Sync Login</p>
          <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-if="!hasCliAuthCode">
            Launch the Windows Dive Sync app and click Sign In. It will open this page with a one-time approval request so you can authorize
            the desktop sync session from your browser.
          </p>
          <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-else>
            The Windows Dive Sync app is requesting access to your account. Approve it once, then return to the desktop app to start
            importing dives.
          </p>
        </div>
        <span class="settings-chip" :class="hasCliAuthCode ? 'is-accent' : ''">{{ hasCliAuthCode ? "Approval waiting" : "Idle" }}</span>
      </div>

      <UButton
        v-if="hasCliAuthCode"
        @click="approveDesktopSync"
        :disabled="desktopSyncApproving"
        class="settings-button settings-button-primary mt-5 w-full justify-between"
      >
        <span class="flex items-center gap-3">
          <span class="material-symbols-outlined text-sm">verified_user</span>
          <span>{{ desktopSyncApproving ? "Approving Desktop Sync" : "Approve Desktop Sync" }}</span>
        </span>
        <span class="material-symbols-outlined text-sm">login</span>
      </UButton>
      <p v-if="desktopSyncStatus" class="mt-3 text-sm text-primary">{{ desktopSyncStatus }}</p>
      <p v-if="desktopSyncError" class="mt-3 text-sm text-error">{{ desktopSyncError }}</p>
    </div>
  </div>
</template>

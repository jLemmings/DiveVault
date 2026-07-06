<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "BackupTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "dataManagementAction",
      "dataManagementError",
      "dataManagementStatus",
      "isDataManagementBusy",
      "isInteractionLocked"
    ])
  },
  methods: {
    ...settingsContextMethods(["exportBackup", "handleBackupImportSelection", "resetDataManagementFeedback"]),
    triggerBackupImport() {
      this.resetDataManagementFeedback();
      this.$refs.backupImportInput?.inputRef?.click();
    }
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Backup</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Backup And Restore</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">
          Backup tasks are separated from everyday exports so destructive restore actions feel more deliberate and easier to understand.
        </p>
      </div>
    </div>

    <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ dataManagementStatus }}</div>
    <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">
      {{ dataManagementError }}
    </div>

    <div class="settings-action-grid">
      <UButton @click="exportBackup" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">archive</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{ dataManagementAction === "Exporting Backup" ? "Building Full Backup" : "Download Full Backup" }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Save your account data, saved lists, PDFs, and imported dive state into one ZIP archive.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">download</span>
      </UButton>

      <UButton @click="triggerBackupImport" :disabled="isDataManagementBusy || isInteractionLocked" class="settings-action-card">
        <div>
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-primary">upload_file</span>
            <p class="font-headline text-xl font-bold text-on-surface">
              {{ dataManagementAction === "Importing Backup" ? "Importing Backup" : "Import From Backup" }}
            </p>
          </div>
          <p class="mt-3 text-sm leading-6 text-secondary">
            Restore from a previously exported ZIP backup when moving systems or recovering state.
          </p>
        </div>
        <span class="material-symbols-outlined text-secondary/60">upload</span>
      </UButton>
    </div>
    <UInput
      ref="backupImportInput"
      type="file"
      accept=".zip,application/zip,application/x-zip-compressed,.json,application/json"
      class="hidden"
      @change="handleBackupImportSelection"
    />
  </div>
</template>

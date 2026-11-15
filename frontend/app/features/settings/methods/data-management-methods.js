import { duplicateImportWarning } from "~/shared/utils/settings-profile.js";

// Exports, CSV/Subsurface import previews, backups and desktop sync approval.
export function createDataManagementMethods() {
  return {
    resetDataManagementFeedback() {
      this.dataManagementStatus = "";
      this.dataManagementWarning = "";
      this.dataManagementError = "";
      this.importReadyForReview = false;
    },
    duplicateImportWarning,
    importKindLabel(kind) {
      return kind === "subsurface" ? "Subsurface export" : "CSV file";
    },
    normalizedImportPreview(payload, kind, file) {
      const summary = payload?.summary || payload || {};
      const rows = Array.isArray(summary.dives) ? summary.dives : [];
      return {
        ...summary,
        kind,
        label: this.importKindLabel(kind),
        fileName: file?.name || "",
        rows: Number(summary.rows || rows.length || 0),
        valid_rows: Number(summary.valid_rows || 0),
        invalid_rows: Number(summary.invalid_rows || 0),
        ready_rows: Number(summary.ready_rows || 0),
        duplicates: Number(summary.duplicates || 0),
        dives: rows
      };
    },
    importPreviewStatusLabel(row) {
      if (!row?.valid) return "Invalid";
      if (row?.status === "inserted") return "Imported";
      if (row?.duplicate) return "Duplicate";
      return "Ready";
    },
    importPreviewStatusClass(row) {
      if (!row?.valid) return "border-error/25 bg-error-container/20 text-on-error-container";
      if (row?.duplicate) return "border-tertiary/30 bg-tertiary/10 text-tertiary";
      return "border-primary/25 bg-primary/10 text-primary";
    },
    importResultStatus(payload, label) {
      const inserted = Number(payload?.inserted ?? 0);
      const rows = Number(payload?.rows ?? 0);
      const duplicates = Number(payload?.duplicates ?? 0);
      if (inserted <= 0 && duplicates > 0) {
        return `No new dives were added from this ${label}.`;
      }
      return `${label} import complete. ${inserted} new dives added from ${rows} dive${rows === 1 ? "" : "s"}; ${duplicates} duplicate dive${duplicates === 1 ? "" : "s"} skipped. Next step: review the imported dives and complete their logbook fields.`;
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
        } catch {
          return utf8Match[1];
        }
      }
      const plainMatch = value.match(/filename="?([^";]+)"?/i);
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
        const filename = this.filenameFromDisposition(response.headers.get("Content-Disposition"), fallbackFilename);
        this.downloadBlob(blob, filename);
        this.dataManagementStatus = successMessage;
      } catch (error) {
        this.dataManagementError = error?.message || `Could not ${actionLabel.toLowerCase()}.`;
      } finally {
        this.dataManagementAction = "";
      }
    },
    exportDivePdf() {
      return this.exportDownload("/api/exports/dives.pdf", "divevault-dives.pdf", "Exporting PDF", "Dive log PDF downloaded.");
    },
    exportDiveCsv() {
      return this.exportDownload("/api/exports/dives.csv", "divevault-dives.csv", "Exporting CSV", "Dive CSV downloaded.");
    },
    async handleCsvImportSelection(event) {
      const file = event?.target?.files?.[0];
      if (event?.target) {
        event.target.value = "";
      }
      if (!file || typeof this.uploadCsvImport !== "function") return;

      this.dataManagementAction = "Previewing CSV";
      this.resetDataManagementFeedback();
      this.pendingImportFile = file;
      this.pendingImportKind = "csv";
      this.importPreview = null;
      try {
        const payload = await this.uploadCsvImport(file, {
          dryRun: true,
          navigateToQueue: false,
          setImportFeedback: false,
          refreshDives: false
        });
        this.importPreview = this.normalizedImportPreview(payload, "csv", file);
        const rows = Number(this.importPreview.rows || 0);
        this.dataManagementStatus = `CSV preview ready: ${rows} row${rows === 1 ? "" : "s"} checked. Review the table before importing.`;
      } catch (error) {
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
        this.dataManagementError = error?.message || "Could not import the CSV file.";
      } finally {
        this.dataManagementAction = "";
      }
    },
    async handleSubsurfaceImportSelection(event) {
      const file = event?.target?.files?.[0];
      if (event?.target) {
        event.target.value = "";
      }
      if (!file || typeof this.uploadSubsurfaceImport !== "function") return;

      this.dataManagementAction = "Previewing Subsurface";
      this.resetDataManagementFeedback();
      this.pendingImportFile = file;
      this.pendingImportKind = "subsurface";
      this.importPreview = null;
      try {
        const payload = await this.uploadSubsurfaceImport(file, { dryRun: true });
        this.importPreview = this.normalizedImportPreview(payload, "subsurface", file);
        const rows = Number(this.importPreview.rows || 0);
        this.dataManagementStatus = `Subsurface export preview ready: ${rows} dive${rows === 1 ? "" : "s"} checked. Review the table before importing.`;
      } catch (error) {
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
        this.dataManagementError = error?.message || "Could not preview the Subsurface export.";
      } finally {
        this.dataManagementAction = "";
      }
    },
    async confirmImportPreview() {
      if (!this.pendingImportFile || !this.pendingImportKind || !this.canConfirmImportPreview) return;
      const kind = this.pendingImportKind;
      const file = this.pendingImportFile;
      const label = this.importKindLabel(kind);
      const upload = kind === "subsurface" ? this.uploadSubsurfaceImport : this.uploadCsvImport;
      if (typeof upload !== "function") return;

      this.dataManagementAction = kind === "subsurface" ? "Importing Subsurface" : "Importing CSV";
      this.dataManagementError = "";
      try {
        const payload = await upload(file, {
          dryRun: false,
          navigateToQueue: false,
          setImportFeedback: false,
          refreshDives: false
        });
        this.dataManagementStatus = this.importResultStatus(payload, label);
        this.dataManagementWarning = this.duplicateImportWarning(payload, label);
        this.importReadyForReview = Number(payload?.inserted ?? 0) > 0;
        this.pendingImportFile = null;
        this.pendingImportKind = "";
        this.importPreview = null;
      } catch (error) {
        this.dataManagementError = error?.message || `Could not import the ${label}.`;
      } finally {
        this.dataManagementAction = "";
      }
    },
    cancelImportPreview() {
      this.pendingImportFile = null;
      this.pendingImportKind = "";
      this.importPreview = null;
      this.resetDataManagementFeedback();
    },
    reviewImportQueue() {
      if (typeof this.openImportQueue === "function") {
        this.openImportQueue();
      }
    },
    exportBackup() {
      return this.exportDownload("/api/backup/export", "divevault-backup.zip", "Exporting backup", "Full backup downloaded.");
    },
    async handleBackupImportSelection(event) {
      const file = event?.target?.files?.[0];
      event.target.value = "";
      if (!file) return;

      this.dataManagementAction = "Importing backup";
      this.resetDataManagementFeedback();
      try {
        const response = await this.authenticatedFetch("/api/backup/import", {
          method: "POST",
          headers: {
            "Content-Type": file.type || (file.name.toLowerCase().endsWith(".zip") ? "application/zip" : "application/json")
          },
          body: file
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
    async approveDesktopSync() {
      if (!this.cliAuthCode) {
        return;
      }

      this.desktopSyncApproving = true;
      this.desktopSyncStatus = "";
      this.desktopSyncError = "";

      try {
        const token = await this.authGetToken({ skipCache: true });
        const response = await fetch("/api/cli-auth/approve", {
          method: "POST",
          credentials: "omit",
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
    }
  };
}

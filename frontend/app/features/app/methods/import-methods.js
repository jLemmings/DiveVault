import {
  importDraftSeed,
  isImportComplete,
  effectiveImportDraft,
  missingImportFields,
  paddedDiveIndex,
  isCommittedDive
} from "~/shared/utils/core.js";
import { encodePathSegment } from "~/routing/routes.js";
import { updateDiveLogbook } from "~/shared/api/dives.js";
import { uploadCsv, uploadSubsurface } from "~/shared/api/imports.js";

// Import queue: draft handling, CSV/Subsurface uploads and committing imported dives.
export function createImportMethods() {
  return {
    syncImportDrafts() {
      const nextDrafts = {};
      this.dives.forEach((dive) => {
        const diveId = String(dive.id);
        nextDrafts[diveId] = importDraftSeed(dive);
      });
      this.importDrafts = nextDrafts;
    },
    resolvePendingImportId(dives = this.dives, drafts = this.importDrafts, preferredId = null) {
      const pending = dives.filter((dive) => !isImportComplete(effectiveImportDraft(dive, drafts[String(dive.id)])));
      if (preferredId && pending.some((dive) => String(dive.id) === String(preferredId))) {
        return preferredId;
      }
      return pending[0]?.id || null;
    },
    isPendingImportId(diveId, dives = this.dives, drafts = this.importDrafts) {
      return dives.some(
        (dive) => String(dive.id) === String(diveId) && !isImportComplete(effectiveImportDraft(dive, drafts[String(dive.id)]))
      );
    },
    async openImportQueue(diveId = null) {
      this.closeMobileAccountMenu();
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
      this.importError = "";
      this.importStatusMessage = "";
      if (this.isAuthenticated) {
        await this.fetchDives();
      }
      this.selectedImportId = diveId ? this.resolvePendingImportId(this.dives, this.importDrafts, diveId) : null;
      await this.navigateToAppRoute(this.selectedImportId ? `/imports/${encodePathSegment(this.selectedImportId)}` : "/imports");
    },
    async selectImportDive(diveId) {
      this.closeMobileAccountMenu();
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedEditDiveId = null;
      this.selectedImportId = this.resolvePendingImportId(this.dives, this.importDrafts, diveId);
      this.importError = "";
      this.importStatusMessage = "";
      await this.navigateToAppRoute(this.selectedImportId ? `/imports/${encodePathSegment(this.selectedImportId)}` : "/imports");
    },
    async backToImportQueue() {
      this.closeMobileAccountMenu();
      this.activeView = "imports";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = null;
      await this.navigateToAppRoute("/imports");
    },
    async openDiveEditor(diveId) {
      this.closeMobileAccountMenu();
      this.activeView = "edit";
      this.selectedDiveId = null;
      this.selectedImportId = null;
      this.selectedEditDiveId = diveId;
      this.importError = "";
      this.importStatusMessage = "";
      if (this.isAuthenticated) {
        await this.fetchDives();
      }
      if (!this.selectedEditDive) {
        this.selectedEditDiveId = null;
        await this.navigateToAppRoute("/logs");
        return;
      }
      await this.navigateToAppRoute(`/logs/${encodePathSegment(diveId)}/edit`);
    },
    async closeDiveEditor() {
      this.closeMobileAccountMenu();
      if (!this.selectedEditDiveId) {
        this.activeView = "logs";
        await this.navigateToAppRoute("/logs");
        return;
      }
      this.activeView = "logs";
      this.selectedDiveId = this.selectedEditDiveId;
      this.selectedEditDiveId = null;
      await this.navigateToAppRoute(`/logs/${encodePathSegment(this.selectedDiveId)}`);
    },
    updateImportDraft(diveId, key, value) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      const currentDraft = effectiveImportDraft(dive, this.importDrafts[id]);
      this.importDrafts = {
        ...this.importDrafts,
        [id]: {
          ...currentDraft,
          [key]: value,
          status: "imported"
        }
      };
      this.importStatusMessage = "";
      this.importError = "";
    },
    async uploadCsvImport(file, options = {}) {
      if (!file) return false;
      const dryRun = options.dryRun === true;
      const navigateToQueue = options.navigateToQueue !== false;
      const setImportFeedback = options.setImportFeedback !== false;
      if (setImportFeedback) {
        this.importError = "";
        this.importStatusMessage = "";
      }
      const refreshAfterImport = options.refreshDives !== false;
      try {
        const csvText = await file.text();
        const response = await uploadCsv(this.apiClient(), new Blob([csvText], { type: "text/csv; charset=utf-8" }), {
          dryRun,
          timeoutMs: 30000
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (!dryRun && refreshAfterImport) {
          await this.fetchDives();
        }
        if (!dryRun && setImportFeedback) {
          this.importStatusMessage = `CSV import processed ${payload.rows || 0} row(s): ${payload.inserted || 0} new, ${payload.duplicates || 0} duplicate.`;
        }
        if (!dryRun && navigateToQueue) {
          this.activeView = "imports";
          this.selectedImportId = this.resolvePendingImportId(this.dives, this.importDrafts, null);
          await this.navigateToAppRoute(this.selectedImportId ? `/imports/${encodePathSegment(this.selectedImportId)}` : "/imports");
        }
        return payload;
      } catch (error) {
        if (setImportFeedback) {
          this.importError = error?.message || "Unable to import CSV file.";
        }
        throw error;
      }
    },
    async uploadSubsurfaceImport(file, options = {}) {
      if (!file) return false;
      const dryRun = options.dryRun === true;
      const refreshAfterImport = options.refreshDives !== false;
      const response = await uploadSubsurface(this.apiClient(), file, { dryRun, timeoutMs: 30000 });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      if (!dryRun && refreshAfterImport) {
        await this.fetchDives();
      }
      return payload;
    },
    async persistImportDraft(diveId, draft, commit = false) {
      const beginPressureInput = String(draft.begin_pressure_bar || "").trim();
      const endPressureInput = String(draft.end_pressure_bar || "").trim();
      const beginPressure = beginPressureInput === "" ? null : Number.parseFloat(beginPressureInput);
      const endPressure = endPressureInput === "" ? null : Number.parseFloat(endPressureInput);
      if (beginPressureInput && (!Number.isFinite(beginPressure) || beginPressure < 0 || beginPressure > 400)) {
        throw new Error("Entry tank pressure must be between 0 and 400 bar.");
      }
      if (endPressureInput && (!Number.isFinite(endPressure) || endPressure < 0 || endPressure > 400)) {
        throw new Error("Exit tank pressure must be between 0 and 400 bar.");
      }
      if (beginPressure !== null && endPressure !== null && endPressure > beginPressure) {
        throw new Error("Exit tank pressure cannot be higher than entry tank pressure.");
      }

      const response = await updateDiveLogbook(this.apiClient(), diveId, {
        commit,
        tank_volume_l: draft.tank_volume_l || null,
        begin_pressure_bar: draft.begin_pressure_bar || null,
        end_pressure_bar: draft.end_pressure_bar || null,
        logbook: {
          site: draft.site,
          buddy: draft.buddy,
          guide: draft.guide,
          weather_description: draft.weather_description,
          visibility: draft.visibility,
          wetsuit_description: draft.wetsuit_description,
          weight_description: draft.weight_description,
          notes: draft.notes,
          equipment_ids: Array.isArray(draft.equipment_ids) ? draft.equipment_ids : [],
          status: commit ? "complete" : "imported"
        }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      return payload;
    },
    async saveImportDraft(diveId, commit = false) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.importError = "Dive could not be found for metadata update.";
        return false;
      }

      const wasCommitted = isCommittedDive(dive);
      const draft = effectiveImportDraft(dive, this.importDrafts[id]);
      const missing = missingImportFields(draft, this.profileRequiredLogbookFields);
      if ((commit || wasCommitted) && missing.length) {
        this.importError = `${missing[0].label} is required before completing this record.`;
        return false;
      }

      this.savingImportId = id;
      this.importError = "";
      this.importStatusMessage = "";
      try {
        const shouldCommit = commit || wasCommitted;
        const updatedDive = await this.persistImportDraft(diveId, draft, shouldCommit);
        const nextDives = this.dives.map((entry) => (String(entry.id) === id ? updatedDive : entry));
        const nextDrafts = {
          ...this.importDrafts,
          [id]: importDraftSeed(updatedDive)
        };

        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.importStatusMessage =
          shouldCommit && !wasCommitted
            ? `${paddedDiveIndex(updatedDive, nextDives)} committed to the registry.`
            : wasCommitted
              ? `${paddedDiveIndex(updatedDive, nextDives)} metadata updated.`
              : `Draft saved for ${paddedDiveIndex(updatedDive)}.`;

        if (shouldCommit && !wasCommitted) {
          this.selectedImportId = this.resolvePendingImportId(nextDives, nextDrafts, null);
          await this.navigateToAppRoute(this.selectedImportId ? `/imports/${encodePathSegment(this.selectedImportId)}` : "/imports");
        }
        return true;
      } catch (error) {
        this.importError = error.message || "Unable to save import metadata.";
        return false;
      } finally {
        this.savingImportId = null;
      }
    },
    async applyBuddyGuideToPendingImports(diveId) {
      const id = String(diveId);
      const sourceDive = this.dives.find((entry) => String(entry.id) === id);
      if (!sourceDive) {
        this.importError = "Dive could not be found for bulk metadata update.";
        return false;
      }

      const sourceDraft = effectiveImportDraft(sourceDive, this.importDrafts[id]);
      const updates = {};
      if (typeof sourceDraft.buddy === "string" && sourceDraft.buddy.trim()) {
        updates.buddy = sourceDraft.buddy;
      }
      if (typeof sourceDraft.guide === "string" && sourceDraft.guide.trim()) {
        updates.guide = sourceDraft.guide;
      }

      const updateKeys = Object.keys(updates);
      if (!updateKeys.length) {
        this.importError = "Enter a buddy or guide before applying the values across imported dives.";
        this.importStatusMessage = "";
        return false;
      }

      const pendingDives = this.dives.filter(
        (entry) => !isImportComplete(effectiveImportDraft(entry, this.importDrafts[String(entry.id)]))
      );
      if (!pendingDives.length) {
        this.importError = "There are no imported dives to review.";
        this.importStatusMessage = "";
        return false;
      }

      this.bulkImportSavePending = true;
      this.importError = "";
      this.importStatusMessage = "";

      let nextDives = this.dives.slice();
      let nextDrafts = { ...this.importDrafts };
      let updatedCount = 0;

      try {
        for (const pendingDive of pendingDives) {
          const pendingId = String(pendingDive.id);
          const currentDraft = effectiveImportDraft(pendingDive, nextDrafts[pendingId]);
          const updatedDive = await this.persistImportDraft(
            pendingDive.id,
            {
              ...currentDraft,
              ...updates,
              status: "imported"
            },
            false
          );

          nextDives = nextDives.map((entry) => (String(entry.id) === pendingId ? updatedDive : entry));
          nextDrafts = {
            ...nextDrafts,
            [pendingId]: importDraftSeed(updatedDive)
          };
          updatedCount += 1;
        }

        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.selectedImportId = this.resolvePendingImportId(nextDives, nextDrafts, id);

        const appliedLabel = updateKeys.length === 2 ? "buddy and guide" : updateKeys[0];
        this.importStatusMessage = `Applied ${appliedLabel} to ${updatedCount} imported ${updatedCount === 1 ? "dive" : "dives"}. Dive sites were left unchanged.`;
        return true;
      } catch (error) {
        this.dives = nextDives;
        this.importDrafts = nextDrafts;
        this.importError = error.message || "Unable to apply buddy and guide across imported dives.";
        return false;
      } finally {
        this.bulkImportSavePending = false;
      }
    }
  };
}

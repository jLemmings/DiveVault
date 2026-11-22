import { importDraftSeed, isCommittedDive, missingImportFields } from "~/shared/utils/core.js";
import { updateDiveLogbook } from "~/shared/api/dives.js";
import { waiting } from "~/shared/utils/logbook.js";
import { importPath } from "~/routing/routes.js";

const LOGBOOK_KEYS = ["site", "buddy", "guide", "weather_description", "visibility", "wetsuit_description", "weight_description", "notes"];

// Drafts of imported and logged dives: only unsaved edits are held here, on top of what the server has.
export function createImportMethods() {
  return {
    draftFor(dive) {
      if (!dive) return null;
      const seed = importDraftSeed(dive);
      const neverChosen = !isCommittedDive(dive) && !Array.isArray(dive.fields?.logbook?.equipment_ids);
      if (neverChosen && this.profileEquipmentSelectionEnabled) seed.equipment_ids = this.defaultEquipmentIds;
      return { ...seed, ...this.draftEdits[String(dive.id)] };
    },
    updateDraft(diveId, key, value) {
      const id = String(diveId);
      this.draftEdits = { ...this.draftEdits, [id]: { ...this.draftEdits[id], [key]: value } };
      this.clearNotices();
    },
    discardDraft(diveId) {
      const remaining = { ...this.draftEdits };
      delete remaining[String(diveId)];
      this.draftEdits = remaining;
    },
    async persistDraft(diveId, draft, commit) {
      // The backend replaces the logbook and never edits tanks, so only logbook fields are sent.
      const response = await updateDiveLogbook(this.apiClient(), diveId, {
        commit,
        logbook: {
          ...Object.fromEntries(LOGBOOK_KEYS.map((key) => [key, draft[key]])),
          ...(commit ? { completed_at: draft.completed_at || new Date().toISOString() } : {}),
          equipment_ids: draft.equipment_ids,
          status: commit ? "complete" : "imported"
        }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      return payload;
    },
    async saveDraft(diveId, commit = false) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.noticeError = "That dive could not be found.";
        return false;
      }
      const wasCommitted = isCommittedDive(dive);
      const shouldCommit = commit || wasCommitted;
      const draft = this.draftFor(dive);
      const missing = missingImportFields(draft, this.profileRequiredLogbookFields);
      if (shouldCommit && missing.length) {
        this.noticeError = this.$tx("{field} is required before this dive can go in the logbook.", { field: this.$tx(missing[0].label) });
        return false;
      }

      this.clearNotices();
      this.savingDiveId = id;
      try {
        const queue = waiting(this.dives).map((entry) => String(entry.id));
        const updated = await this.persistDraft(diveId, draft, shouldCommit);
        this.discardDraft(id);
        this.dives = this.dives.map((entry) => (String(entry.id) === id ? updated : entry));
        const site = updated?.fields?.logbook?.site || this.$tx("The dive");
        if (wasCommitted) {
          this.notice = "Logbook updated.";
        } else if (shouldCommit) {
          this.notice = this.$tx("{site} is in your logbook.", { site });
          const following = queue[queue.indexOf(id) + 1] ?? queue.find((entry) => entry !== id);
          await this.navigate(importPath(following), { keepNotice: true, replace: true });
        } else {
          this.notice = "Draft saved.";
        }
        return true;
      } catch (error) {
        this.noticeError = error.message || "Could not save the dive.";
        return false;
      } finally {
        this.savingDiveId = null;
      }
    },
    async applyPeopleToWaiting({ buddy = "", guide = "" }) {
      const updates = {};
      if (buddy.trim()) updates.buddy = buddy.trim();
      if (guide.trim()) updates.guide = guide.trim();
      if (!Object.keys(updates).length) {
        this.noticeError = "Enter a buddy or guide first.";
        return false;
      }

      this.clearNotices();
      this.bulkSaving = true;
      let count = 0;
      try {
        for (const dive of waiting(this.dives)) {
          const updated = await this.persistDraft(dive.id, { ...this.draftFor(dive), ...updates }, false);
          this.dives = this.dives.map((entry) => (String(entry.id) === String(dive.id) ? updated : entry));
          this.discardDraft(dive.id);
          count += 1;
        }
        this.notice = this.$tn(
          count,
          "Saved on {count} dive. Sites were left as they were.",
          "Saved on {count} dives. Sites were left as they were."
        );
        return true;
      } catch (error) {
        this.noticeError = error.message || "Could not save the buddy and guide.";
        return false;
      } finally {
        this.bulkSaving = false;
      }
    }
  };
}

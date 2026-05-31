import {
  compareSettingsText,
  editableBuddyPayload,
  editableDiveSitePayload,
  editableGuidePayload,
  editableLicensePayload,
  normalizeSettingsText
} from "../utils/settings-profile.js";

export function createSettingsCollectionOptions() {
  return {
    normalizeFilterValue(value) {
      return normalizeSettingsText(value).toLocaleLowerCase();
    },
    sortAndFilterCollection(items, filterValue, getSortKey, getSearchValues, alwaysIncludeIds = []) {
      const filterTerm = this.normalizeFilterValue(filterValue);
      const includedIds = new Set(Array.isArray(alwaysIncludeIds) ? alwaysIncludeIds : []);
      return [...(Array.isArray(items) ? items : [])]
        .filter((item) => {
          if (includedIds.has(item?.id)) return true;
          if (!filterTerm) return true;
          return getSearchValues(item).some((value) => this.normalizeFilterValue(value).includes(filterTerm));
        })
        .sort((left, right) => {
          const primaryComparison = compareSettingsText(getSortKey(left), getSortKey(right));
          if (primaryComparison !== 0) return primaryComparison;
          return compareSettingsText(left?.id, right?.id);
        });
    },
    findCollectionIndexById(collection, itemId) {
      return Array.isArray(collection) ? collection.findIndex((entry) => entry?.id === itemId) : -1;
    },
    beginCollectionEdit({ draftKey, sourceItems, editingKey, expandedKey, snapshotKey, cloneItems }) {
      this.profileError = "";
      this.profileStatus = "";
      if (!this[editingKey] && expandedKey && snapshotKey) {
        this[snapshotKey] = [...this[expandedKey]];
      }
      this[draftKey] = cloneItems(sourceItems);
      this[editingKey] = true;
    },
    cancelCollectionEdit({
      draftKey,
      sourceItems,
      editingKey,
      editingIdsKey,
      expandedKey,
      snapshotKey,
      cloneItems,
      afterCancel
    }) {
      this[draftKey] = cloneItems(sourceItems);
      this[editingIdsKey] = [];
      this[editingKey] = false;
      if (expandedKey && snapshotKey) {
        this[expandedKey] = Array.isArray(this[snapshotKey]) ? [...this[snapshotKey]] : [];
        this[snapshotKey] = null;
      }
      if (typeof afterCancel === "function") {
        afterCancel.call(this);
      }
    },
    removeDraftEntry({ draftKey, editingIdsKey, editingKey, closeEditingWhenEmpty = false }, index) {
      const removedItem = this[draftKey][index];
      this[draftKey] = this[draftKey].filter((_, entryIndex) => entryIndex !== index);
      if (removedItem?.id) {
        this[editingIdsKey] = this[editingIdsKey].filter((entryId) => entryId !== removedItem.id);
        if (closeEditingWhenEmpty && !this[editingIdsKey].length) {
          this[editingKey] = false;
        }
      }
    },
    profilePayloadWithCollection(collectionKey, collectionPayload) {
      return {
        name: this.settingsProfile.name,
        email: this.settingsProfile.email,
        licenses: this.settingsProfile.licenses.map(editableLicensePayload),
        dive_sites: this.settingsProfile.dive_sites.map(editableDiveSitePayload),
        buddies: this.settingsProfile.buddies.map(editableBuddyPayload),
        guides: this.settingsProfile.guides.map(editableGuidePayload),
        [collectionKey]: collectionPayload
      };
    },
    async saveProfileCollection({
      collectionKey,
      draftKey,
      payloadMapper,
      savingKey,
      editingKey,
      editingIdsKey,
      expandedKey,
      snapshotKey,
      successMessage,
      errorMessage,
      afterSave
    }) {
      this[savingKey] = true;
      this.profileStatus = "";
      this.profileError = "";
      try {
        const response = await this.authenticatedFetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(this.profilePayloadWithCollection(
            collectionKey,
            this[draftKey].map(payloadMapper)
          ))
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        if (typeof afterSave === "function") {
          afterSave.call(this);
        }
        this.resetDraftsFromProfile();
        this[editingKey] = false;
        this[editingIdsKey] = [];
        if (expandedKey) {
          this[expandedKey] = [];
        }
        if (snapshotKey) {
          this[snapshotKey] = null;
        }
        this.profileStatus = successMessage;
      } catch (error) {
        this.profileError = error?.message || errorMessage;
      } finally {
        this[savingKey] = false;
      }
    }
  };
}

import {
  MAX_LICENSE_BYTES,
  bytesToBase64,
  emptyLicense,
  emptyDiveSite,
  emptyBuddy,
  emptyGuide,
  cloneBuddies,
  cloneDiveSites,
  cloneGuides,
  cloneLicenses,
  editableLicensePayload,
  editableDiveSitePayload,
  editableBuddyPayload,
  editableGuidePayload
} from "~/shared/utils/settings-profile.js";

// Editing licenses, dive sites, buddies and guides: drafts, dialogs, uploads and persistence.
export function createProfileCollectionMethods() {
  return {
    beginLicensesEdit() {
      this.beginCollectionEdit({
        draftKey: "licenseDrafts",
        sourceItems: this.settingsProfile.licenses,
        editingKey: "areLicensesEditing",
        expandedKey: "expandedLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        cloneItems: cloneLicenses
      });
    },
    cancelLicensesEdit() {
      this.pendingLicenseUploadId = null;
      this.cancelCollectionEdit({
        draftKey: "licenseDrafts",
        sourceItems: this.settingsProfile.licenses,
        editingKey: "areLicensesEditing",
        editingIdsKey: "editingLicenseIds",
        expandedKey: "expandedLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        cloneItems: cloneLicenses
      });
    },
    beginDiveSitesEdit() {
      this.beginCollectionEdit({
        draftKey: "diveSiteDrafts",
        sourceItems: this.settingsProfile.dive_sites,
        editingKey: "areDiveSitesEditing",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        cloneItems: cloneDiveSites
      });
    },
    cancelDiveSitesEdit() {
      this.cancelCollectionEdit({
        draftKey: "diveSiteDrafts",
        sourceItems: this.settingsProfile.dive_sites,
        editingKey: "areDiveSitesEditing",
        editingIdsKey: "editingDiveSiteIds",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        cloneItems: cloneDiveSites,
        afterCancel: this.closeAllDiveSiteMaps
      });
    },
    beginBuddiesEdit() {
      this.beginCollectionEdit({
        draftKey: "buddyDrafts",
        sourceItems: this.settingsProfile.buddies,
        editingKey: "areBuddiesEditing",
        expandedKey: "expandedBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        cloneItems: cloneBuddies
      });
    },
    cancelBuddiesEdit() {
      this.cancelCollectionEdit({
        draftKey: "buddyDrafts",
        sourceItems: this.settingsProfile.buddies,
        editingKey: "areBuddiesEditing",
        editingIdsKey: "editingBuddyIds",
        expandedKey: "expandedBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        cloneItems: cloneBuddies
      });
    },
    beginGuidesEdit() {
      this.beginCollectionEdit({
        draftKey: "guideDrafts",
        sourceItems: this.settingsProfile.guides,
        editingKey: "areGuidesEditing",
        expandedKey: "expandedGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        cloneItems: cloneGuides
      });
    },
    cancelGuidesEdit() {
      this.cancelCollectionEdit({
        draftKey: "guideDrafts",
        sourceItems: this.settingsProfile.guides,
        editingKey: "areGuidesEditing",
        editingIdsKey: "editingGuideIds",
        expandedKey: "expandedGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        cloneItems: cloneGuides
      });
    },
    async saveLicenses() {
      return this.saveProfileCollection({
        collectionKey: "licenses",
        draftKey: "licenseDrafts",
        payloadMapper: editableLicensePayload,
        savingKey: "licensesSaving",
        editingKey: "areLicensesEditing",
        editingIdsKey: "editingLicenseIds",
        snapshotKey: "licenseExpandedSnapshot",
        successMessage: "Licenses updated.",
        errorMessage: "Could not save the license list."
      });
    },
    addLicense() {
      this.licenseDrafts = [emptyLicense(), ...this.licenseDrafts];
    },
    addLicenseEntry() {
      this.openCreateDialog("license");
    },
    addDiveSite() {
      this.diveSiteDrafts = [emptyDiveSite(), ...this.diveSiteDrafts];
    },
    addDiveSiteEntry() {
      this.openCreateDialog("dive-site");
    },
    addBuddy() {
      this.buddyDrafts = [emptyBuddy(), ...this.buddyDrafts];
    },
    addBuddyEntry() {
      this.openCreateDialog("buddy");
    },
    addGuide() {
      this.guideDrafts = [emptyGuide(), ...this.guideDrafts];
    },
    addGuideEntry() {
      this.openCreateDialog("guide");
    },
    removeLicense(index) {
      this.removeDraftEntry(
        {
          draftKey: "licenseDrafts",
          editingIdsKey: "editingLicenseIds",
          editingKey: "areLicensesEditing",
          closeEditingWhenEmpty: true
        },
        index
      );
    },
    removeDiveSite(index) {
      this.removeDraftEntry(
        {
          draftKey: "diveSiteDrafts",
          editingIdsKey: "editingDiveSiteIds",
          editingKey: "areDiveSitesEditing"
        },
        index
      );
    },
    removeBuddy(index) {
      this.removeDraftEntry(
        {
          draftKey: "buddyDrafts",
          editingIdsKey: "editingBuddyIds",
          editingKey: "areBuddiesEditing"
        },
        index
      );
    },
    removeGuide(index) {
      this.removeDraftEntry(
        {
          draftKey: "guideDrafts",
          editingIdsKey: "editingGuideIds",
          editingKey: "areGuidesEditing"
        },
        index
      );
    },
    openRemovalDialog(type, itemId, label, kindLabel) {
      this.pendingRemoval = {
        type,
        itemId,
        label: label || kindLabel,
        kindLabel
      };
    },
    closeRemovalDialog() {
      this.pendingRemoval = null;
    },
    async confirmPendingRemoval() {
      const pending = this.pendingRemoval;
      if (!pending) return;

      const collectionByType = {
        license: this.licenseDrafts,
        "dive-site": this.diveSiteDrafts,
        buddy: this.buddyDrafts,
        guide: this.guideDrafts
      };
      const currentCollection = collectionByType[pending.type] || [];
      const index = currentCollection.findIndex((entry) => entry?.id === pending.itemId);
      if (index === -1) {
        this.closeRemovalDialog();
        return;
      }

      this.closeRemovalDialog();
      if (pending.type === "license") {
        await this.removeLicenseConfirmed(index);
        return;
      }
      if (pending.type === "dive-site") {
        await this.removeDiveSiteConfirmed(index);
        return;
      }
      if (pending.type === "buddy") {
        await this.removeBuddyConfirmed(index);
        return;
      }
      if (pending.type === "guide") {
        await this.removeGuideConfirmed(index);
      }
    },
    confirmRemoveLicense(index) {
      const license = this.licenseDrafts[index];
      if (!license) return;
      const label = this.licenseTitle(license, index);
      this.openRemovalDialog("license", license.id, label, "this license");
    },
    confirmRemoveLicenseItem(licenseId) {
      const index = this.findCollectionIndexById(this.licenseDrafts, licenseId);
      if (index !== -1) {
        this.confirmRemoveLicense(index);
      }
    },
    async removeLicenseConfirmed(index) {
      const license = this.licenseDrafts[index];
      if (!license) return;
      const label = this.licenseTitle(license, index);
      const existedOnServer = this.licenseExistsOnServer(license.id);
      this.removeLicense(index);
      if (existedOnServer) {
        await this.saveLicenses();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveDiveSite(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;
      const label = this.diveSiteTitle(site, index);
      this.openRemovalDialog("dive-site", site.id, label, "this dive site");
    },
    confirmRemoveDiveSiteItem(siteId) {
      const index = this.findCollectionIndexById(this.diveSiteDrafts, siteId);
      if (index !== -1) {
        this.confirmRemoveDiveSite(index);
      }
    },
    async removeDiveSiteConfirmed(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;
      const label = this.diveSiteTitle(site, index);
      const existedOnServer = this.settingsProfile.dive_sites.some((entry) => entry.id === site.id);
      this.removeDiveSite(index);
      if (existedOnServer) {
        await this.saveDiveSites();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveBuddy(index) {
      const buddy = this.buddyDrafts[index];
      if (!buddy) return;
      const label = this.buddyTitle(buddy, index);
      this.openRemovalDialog("buddy", buddy.id, label, "this buddy");
    },
    confirmRemoveBuddyItem(buddyId) {
      const index = this.findCollectionIndexById(this.buddyDrafts, buddyId);
      if (index !== -1) {
        this.confirmRemoveBuddy(index);
      }
    },
    async removeBuddyConfirmed(index) {
      const buddy = this.buddyDrafts[index];
      if (!buddy) return;
      const label = this.buddyTitle(buddy, index);
      const existedOnServer = this.settingsProfile.buddies.some((entry) => entry.id === buddy.id);
      this.removeBuddy(index);
      if (existedOnServer) {
        await this.saveBuddies();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    confirmRemoveGuide(index) {
      const guide = this.guideDrafts[index];
      if (!guide) return;
      const label = this.guideTitle(guide, index);
      this.openRemovalDialog("guide", guide.id, label, "this guide");
    },
    confirmRemoveGuideItem(guideId) {
      const index = this.findCollectionIndexById(this.guideDrafts, guideId);
      if (index !== -1) {
        this.confirmRemoveGuide(index);
      }
    },
    async removeGuideConfirmed(index) {
      const guide = this.guideDrafts[index];
      if (!guide) return;
      const label = this.guideTitle(guide, index);
      const existedOnServer = this.settingsProfile.guides.some((entry) => entry.id === guide.id);
      this.removeGuide(index);
      if (existedOnServer) {
        await this.saveGuides();
      } else {
        this.profileStatus = `${label} removed.`;
      }
    },
    isLookingUpDiveSite(siteId) {
      return this.diveSiteLookupId === siteId;
    },
    async searchDiveSiteLocation(index) {
      const site = this.diveSiteDrafts[index];
      if (!site) return;

      const query = typeof site.location === "string" ? site.location.trim() : "";
      if (!query) {
        this.profileError = "Enter a location before searching for GPS coordinates.";
        this.profileStatus = "";
        return;
      }

      this.diveSiteLookupId = site.id;
      this.profileError = "";
      this.profileStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (!payload?.found || !payload?.result) {
          this.profileStatus = `No coordinates found for "${query}".`;
          return;
        }

        const nextDrafts = this.diveSiteDrafts.slice();
        nextDrafts[index] = {
          ...nextDrafts[index],
          country: typeof payload.result.country === "string" ? payload.result.country : nextDrafts[index].country,
          latitude: String(payload.result.latitude),
          longitude: String(payload.result.longitude)
        };
        this.diveSiteDrafts = nextDrafts;
        this.$nextTick(() => this.syncDiveSiteMapFromFields(site.id));
        this.profileStatus = `Coordinates found for "${query}".`;
      } catch (error) {
        this.profileError = error?.message || "Could not search for GPS coordinates.";
      } finally {
        this.diveSiteLookupId = null;
      }
    },
    searchDiveSiteLocationById(siteId) {
      const index = this.findCollectionIndexById(this.diveSiteDrafts, siteId);
      if (index !== -1) {
        return this.searchDiveSiteLocation(index);
      }
      return undefined;
    },
    async saveDiveSites() {
      return this.saveProfileCollection({
        collectionKey: "dive_sites",
        draftKey: "diveSiteDrafts",
        payloadMapper: editableDiveSitePayload,
        savingKey: "diveSitesSaving",
        editingKey: "areDiveSitesEditing",
        editingIdsKey: "editingDiveSiteIds",
        expandedKey: "expandedDiveSiteIds",
        snapshotKey: "diveSiteExpandedSnapshot",
        successMessage: "Dive sites updated.",
        errorMessage: "Could not save the dive site list.",
        afterSave: this.closeAllDiveSiteMaps
      });
    },
    async saveBuddies() {
      return this.saveProfileCollection({
        collectionKey: "buddies",
        draftKey: "buddyDrafts",
        payloadMapper: editableBuddyPayload,
        savingKey: "buddiesSaving",
        editingKey: "areBuddiesEditing",
        editingIdsKey: "editingBuddyIds",
        snapshotKey: "buddyExpandedSnapshot",
        successMessage: "Buddies updated.",
        errorMessage: "Could not save the buddy list."
      });
    },
    async saveGuides() {
      return this.saveProfileCollection({
        collectionKey: "guides",
        draftKey: "guideDrafts",
        payloadMapper: editableGuidePayload,
        savingKey: "guidesSaving",
        editingKey: "areGuidesEditing",
        editingIdsKey: "editingGuideIds",
        snapshotKey: "guideExpandedSnapshot",
        successMessage: "Guides updated.",
        errorMessage: "Could not save the guide list."
      });
    },
    isUploadingLicense(licenseId) {
      return this.licenseUploadingId === licenseId;
    },
    async handleLicenseSelection(event) {
      const file = event?.target?.files?.[0];
      const licenseId = this.pendingLicenseUploadId;
      event.target.value = "";
      this.pendingLicenseUploadId = null;
      if (!file || !licenseId) return;

      this.profileStatus = "";
      this.profileError = "";

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        this.profileError = "Choose a PDF file for your diving licenses.";
        return;
      }
      if (file.size > MAX_LICENSE_BYTES) {
        this.profileError = "License PDF must be 10 MB or smaller.";
        return;
      }

      this.licenseUploadingId = licenseId;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const response = await this.authenticatedFetch(`/api/profile/licenses/${licenseId}/pdf`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            filename: file.name,
            content_type: "application/pdf",
            data_b64: bytesToBase64(bytes)
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.settingsProfile = this.hydrateProfile(payload);
        this.notifyProfileUpdated(this.settingsProfile);
        this.resetDraftsFromProfile();
        this.areLicensesEditing = true;
        this.profileStatus = `${file.name} uploaded for the selected license.`;
      } catch (error) {
        this.profileError = error?.message || "Could not upload the license PDF.";
      } finally {
        this.licenseUploadingId = null;
      }
    },
    viewLicensePdf(license) {
      if (!license?.pdf?.preview_url) {
        return;
      }
      this.activeLicenseDocument = license;
      this.profileError = "";
      this.profileStatus = "";
    },
    openLicensePreview(page, license) {
      if (!page?.image) return;
      this.activeLicensePreview = {
        image: page.image,
        filename: license?.pdf?.filename || "License PDF",
        pageNumber: page.pageNumber || 1
      };
    },
    closeLicensePreview() {
      this.activeLicensePreview = null;
    },
    closeLicenseDocument() {
      this.activeLicenseDocument = null;
      this.activeLicensePreview = null;
    },
    openCreateDialog(type) {
      const draftByType = {
        license: emptyLicense,
        "dive-site": emptyDiveSite,
        buddy: emptyBuddy,
        guide: emptyGuide
      };
      const createDraft = draftByType[type];
      if (!createDraft) return;
      this.pendingCreation = {
        type,
        draft: createDraft()
      };
      this.pendingCreationError = "";
      this.pendingCreationSubmitting = false;
      this.pendingCreationLookupLoading = false;
    },
    closeCreateDialog() {
      if (this.pendingCreationSubmitting) return;
      this.pendingCreation = null;
      this.pendingCreationError = "";
      this.pendingCreationLookupLoading = false;
    },
    validatePendingCreation() {
      const draft = this.pendingCreationDraft;
      if (!draft) return "Nothing to save.";
      if (this.pendingCreationType === "license" && !draft.company.trim() && !draft.certification_name.trim()) {
        return "Add a company or certification name before saving the license.";
      }
      if (this.pendingCreationType === "dive-site" && !draft.name.trim()) {
        return "Enter a site name before saving the dive site.";
      }
      if (this.pendingCreationType === "buddy" && !draft.name.trim()) {
        return "Enter a buddy name before saving the buddy.";
      }
      if (this.pendingCreationType === "guide" && !draft.name.trim()) {
        return "Enter a guide name before saving the guide.";
      }
      return "";
    },
    async searchPendingDiveSiteLocation() {
      const site = this.pendingCreationDraft;
      if (!site || this.pendingCreationType !== "dive-site") return;

      const query = typeof site.location === "string" ? site.location.trim() : "";
      if (!query) {
        this.pendingCreationError = "Enter a location before searching for GPS coordinates.";
        return;
      }

      this.pendingCreationLookupLoading = true;
      this.pendingCreationError = "";
      this.profileStatus = "";
      try {
        const response = await this.authenticatedFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        if (!payload?.found || !payload?.result) {
          this.pendingCreationError = `No coordinates found for "${query}".`;
          return;
        }

        this.pendingCreation = {
          ...this.pendingCreation,
          draft: {
            ...site,
            country: typeof payload.result.country === "string" ? payload.result.country : site.country,
            latitude: String(payload.result.latitude),
            longitude: String(payload.result.longitude)
          }
        };
      } catch (error) {
        this.pendingCreationError = error?.message || "Could not search for GPS coordinates.";
      } finally {
        this.pendingCreationLookupLoading = false;
      }
    },
    async confirmCreateDialog() {
      const validationError = this.validatePendingCreation();
      if (validationError) {
        this.pendingCreationError = validationError;
        return;
      }

      const draft = this.pendingCreationDraft;
      const type = this.pendingCreationType;
      if (!draft || !type) return;

      this.pendingCreationSubmitting = true;
      this.pendingCreationError = "";

      try {
        if (type === "license") {
          const previousDrafts = cloneLicenses(this.licenseDrafts);
          const previousEditingIds = [...this.editingLicenseIds];
          const wasEditing = this.areLicensesEditing;
          if (!this.areLicensesEditing) {
            this.beginLicensesEdit();
          }
          this.licenseDrafts = [draft, ...this.licenseDrafts];
          await this.saveLicenses();
          if (this.profileError) {
            this.licenseDrafts = previousDrafts;
            this.editingLicenseIds = previousEditingIds;
            this.areLicensesEditing = wasEditing;
          }
        } else if (type === "dive-site") {
          const previousDrafts = cloneDiveSites(this.diveSiteDrafts);
          const previousEditingIds = [...this.editingDiveSiteIds];
          const wasEditing = this.areDiveSitesEditing;
          if (!this.areDiveSitesEditing) {
            this.beginDiveSitesEdit();
          }
          this.diveSiteDrafts = [draft, ...this.diveSiteDrafts];
          await this.saveDiveSites();
          if (this.profileError) {
            this.diveSiteDrafts = previousDrafts;
            this.editingDiveSiteIds = previousEditingIds;
            this.areDiveSitesEditing = wasEditing;
          }
        } else if (type === "buddy") {
          const previousDrafts = cloneBuddies(this.buddyDrafts);
          const previousEditingIds = [...this.editingBuddyIds];
          const wasEditing = this.areBuddiesEditing;
          if (!this.areBuddiesEditing) {
            this.beginBuddiesEdit();
          }
          this.buddyDrafts = [draft, ...this.buddyDrafts];
          await this.saveBuddies();
          if (this.profileError) {
            this.buddyDrafts = previousDrafts;
            this.editingBuddyIds = previousEditingIds;
            this.areBuddiesEditing = wasEditing;
          }
        } else if (type === "guide") {
          const previousDrafts = cloneGuides(this.guideDrafts);
          const previousEditingIds = [...this.editingGuideIds];
          const wasEditing = this.areGuidesEditing;
          if (!this.areGuidesEditing) {
            this.beginGuidesEdit();
          }
          this.guideDrafts = [draft, ...this.guideDrafts];
          await this.saveGuides();
          if (this.profileError) {
            this.guideDrafts = previousDrafts;
            this.editingGuideIds = previousEditingIds;
            this.areGuidesEditing = wasEditing;
          }
        }

        if (!this.profileError) {
          this.pendingCreation = null;
        }
      } finally {
        this.pendingCreationSubmitting = false;
        this.pendingCreationLookupLoading = false;
      }
    },
    syncExpandedPanels() {
      const retainVisibleIds = (existingIds, items) => existingIds.filter((id) => items.some((item) => item.id === id));

      this.expandedLicenseIds = retainVisibleIds(this.expandedLicenseIds, this.settingsProfile.licenses);
      this.expandedDiveSiteIds = retainVisibleIds(this.expandedDiveSiteIds, this.settingsProfile.dive_sites);
      this.expandedBuddyIds = retainVisibleIds(this.expandedBuddyIds, this.settingsProfile.buddies);
      this.expandedGuideIds = retainVisibleIds(this.expandedGuideIds, this.settingsProfile.guides);
    },
    toggleExpandedItem(key, id) {
      const current = Array.isArray(this[key]) ? this[key] : [];
      this[key] = current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id];
    },
    isExpandedItem(key, id) {
      return Array.isArray(this[key]) && this[key].includes(id);
    },
    toggleLicenseDetails(licenseId) {
      this.toggleExpandedItem("expandedLicenseIds", licenseId);
    },
    isLicenseEditing(licenseId) {
      return this.editingLicenseIds.includes(licenseId);
    },
    editLicenseItem(licenseId) {
      if (!this.areLicensesEditing) {
        this.beginLicensesEdit();
      }
      if (!this.isLicenseExpanded(licenseId)) {
        this.toggleLicenseDetails(licenseId);
      }
      this.editingLicenseIds = [licenseId];
    },
    isLicenseExpanded(licenseId) {
      return this.isExpandedItem("expandedLicenseIds", licenseId);
    },
    toggleDiveSiteDetails(siteId) {
      this.toggleExpandedItem("expandedDiveSiteIds", siteId);
    },
    isDiveSiteEditing(siteId) {
      return this.editingDiveSiteIds.includes(siteId);
    },
    editDiveSiteItem(siteId) {
      if (!this.areDiveSitesEditing) {
        this.beginDiveSitesEdit();
      }
      if (!this.isDiveSiteExpanded(siteId)) {
        this.toggleDiveSiteDetails(siteId);
      }
      this.editingDiveSiteIds = [siteId];
    },
    isDiveSiteExpanded(siteId) {
      return this.isExpandedItem("expandedDiveSiteIds", siteId);
    },
    editBuddyItem(buddyId) {
      if (!this.areBuddiesEditing) {
        this.beginBuddiesEdit();
      }
      if (!this.isBuddyExpanded(buddyId)) {
        this.toggleBuddyDetails(buddyId);
      }
      this.editingBuddyIds = [buddyId];
    },
    toggleBuddyDetails(buddyId) {
      this.toggleExpandedItem("expandedBuddyIds", buddyId);
    },
    isBuddyEditing(buddyId) {
      return this.editingBuddyIds.includes(buddyId);
    },
    isBuddyExpanded(buddyId) {
      return this.isExpandedItem("expandedBuddyIds", buddyId);
    },
    editGuideItem(guideId) {
      if (!this.areGuidesEditing) {
        this.beginGuidesEdit();
      }
      if (!this.isGuideExpanded(guideId)) {
        this.toggleGuideDetails(guideId);
      }
      this.editingGuideIds = [guideId];
    },
    toggleGuideDetails(guideId) {
      this.toggleExpandedItem("expandedGuideIds", guideId);
    },
    isGuideEditing(guideId) {
      return this.editingGuideIds.includes(guideId);
    },
    isGuideExpanded(guideId) {
      return this.isExpandedItem("expandedGuideIds", guideId);
    }
  };
}

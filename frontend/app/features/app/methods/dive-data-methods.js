import { missingImportFields, normalizeRequiredLogbookFields, paddedDiveIndex, isCommittedDive } from "~/shared/utils/core.js";
import { requireJson } from "~/shared/api/client.js";
import { createDive, deleteDive as deleteDiveRequest, fetchDives as fetchDivesRequest } from "~/shared/api/dives.js";
import {
  fetchEquipment as fetchEquipmentRequest,
  markEquipmentServiced as markEquipmentServicedRequest,
  saveEquipment as saveEquipmentRequest
} from "~/shared/api/equipment.js";
import { fetchHealth, fetchProfile, searchGeocode, updateProfile } from "~/shared/api/profile.js";
import { createManualDiveDraft } from "~/shared/utils/dive-drafts.js";

// Loading and mutating dives, dive sites, profile and equipment data.
export function createDiveDataMethods() {
  return {
    manualDiveStartedAt() {
      const date = String(this.manualDiveDraft.date || "").trim();
      const time = String(this.manualDiveDraft.time || "").trim();
      if (!date || !time) {
        throw new Error("Manual dives require a valid local start date and time.");
      }
      const startedAt = new Date(`${date}T${time}`);
      if (Number.isNaN(startedAt.getTime())) {
        throw new Error("Manual dives require a valid local start date and time.");
      }
      return startedAt.toISOString();
    },
    async createManualDive() {
      const site = String(this.manualDiveDraft.site || "").trim();
      const buddy = String(this.manualDiveDraft.buddy || "").trim();
      const guide = String(this.manualDiveDraft.guide || "").trim();
      const weatherDescription = String(this.manualDiveDraft.weatherDescription || "").trim();
      const visibility = String(this.manualDiveDraft.visibility || "").trim();
      const wetsuitDescription = String(this.manualDiveDraft.wetsuitDescription || "").trim();
      const weightDescription = String(this.manualDiveDraft.weightDescription || "").trim();
      const notes = String(this.manualDiveDraft.notes || "").trim();
      const selectedEquipmentIds = Array.isArray(this.manualDiveDraft.equipment_ids) ? this.manualDiveDraft.equipment_ids.map(String) : [];
      const equipmentIds = this.profileEquipmentSelectionEnabled ? selectedEquipmentIds : [];
      const durationMinutes = Number.parseFloat(this.manualDiveDraft.durationMinutes);
      const maxDepthM = Number.parseFloat(this.manualDiveDraft.maxDepthM);
      const temperatureInput = String(this.manualDiveDraft.temperatureC || "").trim();
      const tankVolumeInput = String(this.manualDiveDraft.tankVolumeL || "").trim();
      const beginPressureInput = String(this.manualDiveDraft.beginPressureBar || "").trim();
      const endPressureInput = String(this.manualDiveDraft.endPressureBar || "").trim();
      const temperatureC = temperatureInput === "" ? null : Number.parseFloat(temperatureInput);
      const tankVolume = tankVolumeInput === "" ? null : Number.parseFloat(tankVolumeInput);
      const beginPressure = beginPressureInput === "" ? null : Number.parseFloat(beginPressureInput);
      const endPressure = endPressureInput === "" ? null : Number.parseFloat(endPressureInput);

      const missingRequired = missingImportFields(
        {
          site,
          buddy,
          guide,
          weather_description: weatherDescription,
          visibility,
          wetsuit_description: wetsuitDescription,
          weight_description: weightDescription,
          notes
        },
        this.profileRequiredLogbookFields
      );
      if (missingRequired.length) {
        this.manualDiveError = `${missingRequired[0].label} is required for manual entries.`;
        return;
      }
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        this.manualDiveError = "Duration must be greater than zero.";
        return;
      }
      if (!Number.isFinite(maxDepthM) || maxDepthM < 0) {
        this.manualDiveError = "Max depth must be zero or greater.";
        return;
      }
      if (temperatureInput && !Number.isFinite(temperatureC)) {
        this.manualDiveError = "Temperature must be a valid number.";
        return;
      }
      if (tankVolumeInput && (!Number.isFinite(tankVolume) || tankVolume <= 0)) {
        this.manualDiveError = "Tank volume must be greater than zero.";
        return;
      }
      if (beginPressureInput && (!Number.isFinite(beginPressure) || beginPressure < 0 || beginPressure > 400)) {
        this.manualDiveError = "Entry tank pressure must be between 0 and 400 bar.";
        return;
      }
      if (endPressureInput && (!Number.isFinite(endPressure) || endPressure < 0 || endPressure > 400)) {
        this.manualDiveError = "Exit tank pressure must be between 0 and 400 bar.";
        return;
      }
      if (beginPressure !== null && endPressure !== null && endPressure > beginPressure) {
        this.manualDiveError = "Exit tank pressure cannot be higher than entry tank pressure.";
        return;
      }

      const startedAt = this.manualDiveStartedAt();
      const completedAt = new Date().toISOString();
      const rawSource = JSON.stringify({
        source: "manual",
        created_at: completedAt,
        started_at: startedAt,
        duration_seconds: Math.round(durationMinutes * 60),
        max_depth_m: maxDepthM,
        site,
        buddy,
        guide
      });

      const rawDataB64 = this.encodeBase64Utf8(rawSource);
      const rawSha256 = await this.sha256Hex(rawSource);
      const fields = {
        manual_entry: true,
        source: "manual",
        logbook: {
          site,
          buddy,
          guide,
          weather_description: weatherDescription,
          visibility,
          wetsuit_description: wetsuitDescription,
          weight_description: weightDescription,
          notes,
          equipment_ids: equipmentIds,
          status: "complete",
          completed_at: completedAt
        }
      };

      if (Number.isFinite(temperatureC)) {
        fields.temperature_surface_c = temperatureC;
        fields.temperature_minimum_c = temperatureC;
        fields.temperature_maximum_c = temperatureC;
      }

      if (Number.isFinite(tankVolume) || Number.isFinite(beginPressure) || Number.isFinite(endPressure)) {
        const tank = {};
        if (Number.isFinite(tankVolume)) tank.volume = tankVolume;
        if (Number.isFinite(beginPressure)) tank.beginpressure_bar = Math.round(beginPressure);
        if (Number.isFinite(endPressure)) tank.endpressure_bar = Math.round(endPressure);
        fields.tanks = [tank];
      }

      this.manualDiveCreating = true;
      this.manualDiveError = "";
      try {
        const response = await createDive(this.apiClient(), {
          vendor: "Manual",
          product: "Entry",
          dive_uid: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          raw_sha256: rawSha256,
          raw_data_b64: rawDataB64,
          started_at: startedAt,
          duration_seconds: Math.round(durationMinutes * 60),
          max_depth_m: maxDepthM,
          avg_depth_m: null,
          fields,
          samples: []
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        await this.fetchDives();
        this.manualDiveDraft = createManualDiveDraft();
        this.importStatusMessage = "Manual dive created.";
        if (payload?.id) {
          this.openDive(payload.id);
        } else {
          await this.setView("logs");
        }
      } catch (error) {
        this.manualDiveError = error?.message || "Unable to create manual dive.";
      } finally {
        this.manualDiveCreating = false;
      }
    },
    async saveExistingDiveLogbook(diveId) {
      return this.saveImportDraft(diveId, true);
    },
    async createDiveSite(sitePayload) {
      const name = typeof sitePayload?.name === "string" ? sitePayload.name.trim() : "";
      if (!name) {
        throw new Error("Enter a dive site name before saving it.");
      }

      const existingSite = this.profileDiveSites.find(
        (site) => typeof site?.name === "string" && site.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (existingSite) {
        return existingSite;
      }

      const response = await updateProfile(this.apiClient(), {
        dive_sites: [
          ...this.profileDiveSites,
          {
            name,
            location: typeof sitePayload?.location === "string" ? sitePayload.location.trim() : "",
            country: typeof sitePayload?.country === "string" ? sitePayload.country.trim() : "",
            latitude: sitePayload?.latitude ?? null,
            longitude: sitePayload?.longitude ?? null
          }
        ]
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }

      this.handleProfileUpdated(payload);
      return (
        this.profileDiveSites.find((site) => typeof site?.name === "string" && site.name.trim().toLowerCase() === name.toLowerCase()) || {
          name
        }
      );
    },
    async searchDiveSiteLocation(query) {
      const normalizedQuery = typeof query === "string" ? query.trim() : "";
      if (!normalizedQuery) {
        throw new Error("Enter a location before searching for GPS coordinates.");
      }

      const response = await searchGeocode(this.apiClient(), normalizedQuery);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `API returned ${response.status}`);
      }
      if (!payload?.found || !payload?.result) {
        return null;
      }
      return payload.result;
    },
    async deleteDive(diveId) {
      const id = String(diveId);
      const dive = this.dives.find((entry) => String(entry.id) === id);
      if (!dive) {
        this.importError = "Dive could not be found for deletion.";
        this.importStatusMessage = "";
        return false;
      }

      const importedRecord = !isCommittedDive(dive);
      const confirmed = window.confirm(
        importedRecord
          ? `Delete ${paddedDiveIndex(dive)} from the import queue? This cannot be undone.`
          : `Delete ${paddedDiveIndex(dive, this.dives)} from the dive log? This cannot be undone.`
      );
      if (!confirmed) {
        return false;
      }

      this.deletingDiveId = id;
      this.importError = "";
      this.importStatusMessage = "";

      try {
        const response = await deleteDiveRequest(this.apiClient(), diveId);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        if (String(this.selectedDiveId) === id) {
          this.selectedDiveId = null;
        }
        if (String(this.selectedImportId) === id) {
          this.selectedImportId = null;
        }
        if (String(this.selectedEditDiveId) === id) {
          this.selectedEditDiveId = null;
        }

        if (importedRecord) {
          this.activeView = "imports";
          await this.navigateToAppRoute("/imports");
        } else {
          this.activeView = "logs";
          await this.navigateToAppRoute("/logs");
        }

        await this.fetchDives();
        this.importStatusMessage = `${paddedDiveIndex(dive, this.dives)} removed from the ${importedRecord ? "import queue" : "dive log"}.`;
        return true;
      } catch (error) {
        this.importError = error.message || "Unable to delete the dive.";
        return false;
      } finally {
        this.deletingDiveId = null;
      }
    },
    async fetchDives() {
      this.loading = true;
      this.error = "";
      try {
        const healthResponse = await fetchHealth(this.apiClient());
        this.backendHealthy = healthResponse.ok;
        const diveResponse = await fetchDivesRequest(this.apiClient());
        if (!diveResponse.ok) {
          const payload = await diveResponse.json().catch(() => null);
          throw new Error(payload?.error || `API returned ${diveResponse.status}`);
        }
        const payload = await diveResponse.json();
        this.dives = Array.isArray(payload.dives) ? payload.dives : [];
        this.dashboardStats =
          payload?.stats && typeof payload.stats === "object"
            ? { ...this.dashboardStats, ...payload.stats }
            : { ...this.dashboardStats, totalDives: this.dives.length };
        this.syncImportDrafts();
        if (this.selectedImportId && !this.isPendingImportId(this.selectedImportId, this.dives, this.importDrafts)) {
          this.selectedImportId = null;
          if (this.activeView === "imports") {
            await this.navigateToAppRoute("/imports", { replace: true });
          }
        }
        if (
          this.selectedEditDiveId &&
          !this.dives.some((dive) => String(dive.id) === String(this.selectedEditDiveId) && isCommittedDive(dive))
        ) {
          this.selectedEditDiveId = null;
          if (this.activeView === "edit") {
            await this.navigateToAppRoute("/logs", { replace: true });
          }
        }
      } catch (error) {
        this.error = error.message || "Unknown frontend error";
      } finally {
        this.loading = false;
      }
    },
    async fetchProfileData() {
      try {
        const response = await fetchProfile(this.apiClient());
        const payload = await requireJson(response);
        this.handleProfileUpdated(payload);
      } catch {
        this.profileDiveSites = [];
        this.profileBuddies = [];
        this.profileGuides = [];
        this.profileLogbookDisplayFields = [];
        this.profileEquipmentSelectionEnabled = true;
      }
    },
    async fetchEquipment() {
      try {
        const response = await fetchEquipmentRequest(this.apiClient());
        const payload = await requireJson(response);
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
      } catch (error) {
        this.equipment = [];
        this.equipmentError = error?.message || "Unable to load equipment.";
      }
    },
    async saveEquipment(equipment) {
      this.equipmentSaving = true;
      this.equipmentError = "";
      this.equipmentStatusMessage = "";
      try {
        const response = await saveEquipmentRequest(this.apiClient(), equipment);
        const payload = await requireJson(response);
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
        this.equipmentStatusMessage = "Equipment inventory saved.";
        return this.equipment;
      } catch (error) {
        this.equipmentError = error?.message || "Unable to save equipment.";
        return false;
      } finally {
        this.equipmentSaving = false;
      }
    },
    async markEquipmentServiced(equipmentId) {
      this.equipmentServicingId = String(equipmentId);
      this.equipmentError = "";
      this.equipmentStatusMessage = "";
      try {
        const response = await markEquipmentServicedRequest(this.apiClient(), equipmentId);
        const payload = await requireJson(response);
        const updated = payload?.equipment;
        if (updated?.id) {
          this.equipment = this.equipment.map((item) => (String(item.id) === String(updated.id) ? updated : item));
        } else {
          await this.fetchEquipment();
        }
        this.equipmentStatusMessage = "Equipment marked as serviced.";
        return true;
      } catch (error) {
        this.equipmentError = error?.message || "Unable to mark equipment as serviced.";
        return false;
      } finally {
        this.equipmentServicingId = null;
      }
    },
    handleProfileUpdated(payload) {
      this.profileDiveSites = Array.isArray(payload?.dive_sites) ? payload.dive_sites : [];
      this.profileBuddies = Array.isArray(payload?.buddies) ? payload.buddies : [];
      this.profileGuides = Array.isArray(payload?.guides) ? payload.guides : [];
      this.profileLogbookDisplayFields = Array.isArray(payload?.logbook_display_fields) ? payload.logbook_display_fields : [];
      this.profileRequiredLogbookFields = normalizeRequiredLogbookFields(payload?.required_logbook_fields);
      this.profileEquipmentSelectionEnabled = payload?.equipment_selection_enabled !== false;
    }
  };
}

import { missingImportFields, normalizeRequiredLogbookFields, isCommittedDive } from "~/shared/utils/core.js";
import { requireJson } from "~/shared/api/client.js";
import { createDive, deleteDive as deleteDiveRequest, fetchDives as fetchDivesRequest } from "~/shared/api/dives.js";
import {
  fetchEquipment as fetchEquipmentRequest,
  markEquipmentServiced as markEquipmentServicedRequest,
  saveEquipment as saveEquipmentRequest
} from "~/shared/api/equipment.js";
import { fetchProfile, searchGeocode, updateProfile } from "~/shared/api/profile.js";
import { createManualDiveDraft } from "~/shared/utils/dive-drafts.js";
import { PATHS, divePath } from "~/routing/routes.js";
import { siteOf } from "~/shared/utils/logbook.js";
import { dayMonth } from "~/shared/utils/format.js";

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
      const selectedEquipmentIds = this.manualDraft.equipment_ids.map(String);
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
        this.manualDiveError = this.$tx("{field} is required before this dive can go in the logbook.", {
          field: this.$tx(missingRequired[0].label)
        });
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

        await this.fetchDives({ quiet: true });
        this.manualDiveDraft = createManualDiveDraft();
        this.notice = "Dive added to your logbook.";
        await this.navigate(payload?.id ? divePath(payload.id) : PATHS.logbook, { keepNotice: true });
      } catch (error) {
        this.manualDiveError = error?.message || "Unable to create manual dive.";
      } finally {
        this.manualDiveCreating = false;
      }
    },
    async createDiveSite(sitePayload) {
      const name = typeof sitePayload?.name === "string" ? sitePayload.name.trim() : "";
      if (!name) {
        throw new Error("Enter a dive site name before saving it.");
      }

      if (!this.profileLoaded) {
        throw new Error("Your saved lists have not loaded. Reload before changing them.");
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
        this.noticeError = "That dive could not be found.";
        return false;
      }

      const importedRecord = !isCommittedDive(dive);
      const subject = { site: siteOf(dive) || this.$tx("this dive"), date: dayMonth(dive.started_at) };
      const confirmed = window.confirm(
        importedRecord
          ? this.$tx("Delete the import from {date}? This cannot be undone.", subject)
          : this.$tx("Delete {site} on {date} from your logbook? This cannot be undone.", subject)
      );
      if (!confirmed) return false;

      this.deletingDiveId = id;
      this.clearNotices();
      try {
        const response = await deleteDiveRequest(this.apiClient(), diveId);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }
        this.notice = importedRecord ? "Import deleted." : "Dive deleted.";
        await this.navigate(importedRecord ? PATHS.imports : PATHS.logbook, { keepNotice: true, replace: true });
        this.dives = this.dives.filter((entry) => String(entry.id) !== id);
        this.discardDraft(id);
        return true;
      } catch (error) {
        this.noticeError = error.message || "Unable to delete the dive.";
        return false;
      } finally {
        this.deletingDiveId = null;
      }
    },
    // A quiet refresh keeps the page on screen, for example to pick up dives Dive Sync has just sent.
    async fetchDives({ quiet = false } = {}) {
      if (!quiet) {
        this.loading = true;
        this.error = "";
      }
      try {
        const response = await fetchDivesRequest(this.apiClient());
        const payload = await requireJson(response);
        this.dives = Array.isArray(payload?.dives) ? payload.dives : [];
        this.diveTotal = Number(payload?.total) || this.dives.length;
        this.error = "";
      } catch (error) {
        const message = error.message || "Something went wrong";
        if (quiet) this.noticeError = message;
        else this.error = message;
      } finally {
        this.loading = false;
      }
    },
    async fetchProfileData() {
      this.profileError = "";
      try {
        const response = await fetchProfile(this.apiClient());
        this.handleProfileUpdated(await requireJson(response));
      } catch (error) {
        // Lists are saved whole, so a failed read must never be treated as empty lists.
        this.profileLoaded = false;
        this.profileError = error?.message || "Could not load your profile.";
      }
    },
    async saveProfile(changes) {
      if (!this.profileLoaded) {
        throw new Error("Your saved lists have not loaded. Reload before changing them.");
      }
      const response = await updateProfile(this.apiClient(), changes);
      this.handleProfileUpdated(await requireJson(response));
      return this.profile;
    },
    async fetchEquipment() {
      this.equipmentError = "";
      try {
        const response = await fetchEquipmentRequest(this.apiClient());
        const payload = await requireJson(response);
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
        this.equipmentLoaded = true;
      } catch (error) {
        this.equipmentLoaded = false;
        this.equipmentError = error?.message || "Unable to load equipment.";
      }
    },
    async saveEquipment(equipment) {
      if (!this.equipmentLoaded) {
        this.equipmentError = "Your gear has not loaded. Reload before changing it.";
        return false;
      }
      this.equipmentSaving = true;
      this.equipmentError = "";
      this.equipmentStatusMessage = "";
      try {
        const response = await saveEquipmentRequest(this.apiClient(), equipment);
        const payload = await requireJson(response);
        this.equipment = Array.isArray(payload?.equipment) ? payload.equipment : [];
        this.equipmentStatusMessage = "Gear saved.";
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
        this.equipmentStatusMessage = "Marked as serviced.";
        return true;
      } catch (error) {
        this.equipmentError = error?.message || "Unable to mark equipment as serviced.";
        return false;
      } finally {
        this.equipmentServicingId = null;
      }
    },
    handleProfileUpdated(payload) {
      this.profile = payload || {};
      this.profileLoaded = true;
      this.profileDiveSites = Array.isArray(payload?.dive_sites) ? payload.dive_sites : [];
      this.profileBuddies = Array.isArray(payload?.buddies) ? payload.buddies : [];
      this.profileGuides = Array.isArray(payload?.guides) ? payload.guides : [];
      this.profileLogbookDisplayFields = Array.isArray(payload?.logbook_display_fields) ? payload.logbook_display_fields : [];
      this.profileRequiredLogbookFields = normalizeRequiredLogbookFields(payload?.required_logbook_fields);
      this.profileEquipmentSelectionEnabled = payload?.equipment_selection_enabled !== false;
    }
  };
}

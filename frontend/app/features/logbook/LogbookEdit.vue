<script>
import { buildDiveSequenceMap, canCompleteImport, diveDeviceLabel, formatDate, formatDateTime, formatDepthNumber, formatTemperature, hasRecordedPressureSamples, importTemperature, missingImportFields, paddedDiveIndex, durationShort, numberOrZero } from "~/shared/utils/core.js";
import MetadataAutocompleteField from "~/shared/components/MetadataAutocomplete.vue";
import { equipmentTitle, normalizeName as normalizeBuddyName, normalizeName as normalizeSiteName, serviceStatusForDive, sortNamedCollection } from "~/shared/utils/equipment-dive.js";

export default {
  name: "LogbookEditorView",
  components: {
    MetadataAutocompleteField
  },
  props: [
    "dive",
    "allDives",
    "draft",
    "requiredLogbookFields",
    "diveSites",
    "buddies",
    "guides",
    "equipment",
    "defaultEquipmentIds",
    "equipmentSelectionEnabled",
    "savingImportId",
    "deletingDiveId",
    "statusMessage",
    "errorMessage",
    "updateDiveDraft",
    "saveDiveLogbook",
    "deleteDive",
    "createDiveSite",
    "closeEditor"
  ],
  data() {
    return {
      diveSiteCreatePending: false,
      diveSiteCreateError: "",
      diveSiteCreateStatus: ""
    };
  },
  computed: {
    tankVolumeOptions() {
      return [
        { label: "9L", value: "9" },
        { label: "12L", value: "12" },
        { label: "15L", value: "15" }
      ];
    },
    selectedDraft() {
      return this.draft || null;
    },
    missingFields() {
      return this.selectedDraft ? missingImportFields(this.selectedDraft, this.requiredLogbookFields) : [];
    },
    isSaving() {
      return String(this.savingImportId) === String(this.dive?.id);
    },
    isDeleting() {
      return String(this.deletingDiveId) === String(this.dive?.id);
    },
    canSaveRecord() {
      return this.selectedDraft ? canCompleteImport(this.selectedDraft, this.requiredLogbookFields) : false;
    },
    canEditTankPressure() {
      return this.dive ? !hasRecordedPressureSamples(this.dive) : false;
    },
    savedDiveSites() {
      return sortNamedCollection(this.diveSites);
    },
    savedBuddies() {
      return sortNamedCollection(this.buddies);
    },
    savedGuides() {
      return sortNamedCollection(this.guides);
    },
    selectedEquipmentIds() {
      return Array.isArray(this.selectedDraft?.equipment_ids) ? this.selectedDraft.equipment_ids.map(String) : [];
    },
    equipmentGroups() {
      const groups = new Map();
      for (const item of Array.isArray(this.equipment) ? this.equipment : []) {
        const category = item?.category || item?.type || "Other";
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
      }
      return [...groups.entries()].map(([category, items]) => ({
        category,
        items: items.sort((left, right) => equipmentTitle(left).localeCompare(equipmentTitle(right), undefined, { sensitivity: "base" }))
      }));
    },
    selectedEquipmentStatus() {
      const lookup = new Map((Array.isArray(this.equipment) ? this.equipment : []).map((item) => [String(item.id), item]));
      return this.selectedEquipmentIds.map((id) => {
        const item = lookup.get(id);
        const service = serviceStatusForDive(item, this.dive?.started_at);
        return { id, item, name: equipmentTitle(item || { name: id }), ...service };
      });
    },
    invalidSelectedEquipment() {
      return this.selectedEquipmentStatus.filter((item) => item.status === "unknown" || item.status === "overdue");
    },
    selectedDiveSite() {
      const siteName = normalizeSiteName(this.selectedDraft?.site);
      if (!siteName) return null;
      return this.savedDiveSites.find((site) => normalizeSiteName(site.name) === siteName) || null;
    },
    selectedBuddy() {
      const buddyName = normalizeBuddyName(this.selectedDraft?.buddy);
      if (!buddyName) return null;
      return this.savedBuddies.find((buddy) => normalizeBuddyName(buddy.name) === buddyName) || null;
    },
    stats() {
      if (!this.dive) return [];
      return [
        { label: "Date", value: formatDate(this.dive.started_at) },
        { label: "Depth", value: `${formatDepthNumber(this.dive.max_depth_m)}m` },
        { label: "Duration", value: durationShort(this.dive.duration_seconds) },
        { label: "Temperature", value: formatTemperature(importTemperature(this.dive)) }
      ];
    },
    canCreateDiveSite() {
      const siteName = typeof this.selectedDraft?.site === "string" ? this.selectedDraft.site.trim() : "";
      return Boolean(siteName) && !this.selectedDiveSite;
    },
    diveSequenceMap() {
      return buildDiveSequenceMap(this.allDives);
    }
  },
  methods: {
    t(key, fallback = key, params = {}) {
      return typeof this.$t === "function" ? this.$t(key, fallback, params) : fallback;
    },
    formatDateTime,
    diveDeviceLabel,
    displayDiveIndex(dive) {
      return paddedDiveIndex(dive, this.diveSequenceMap);
    },
    updateField(key, value) {
      if (!this.dive) return;
      this.updateDiveDraft(this.dive.id, key, value);
      if (key === "site") {
        this.clearDiveSiteCreateFeedback();
      }
    },
    updateSite(value) {
      this.updateField("site", value);
    },
    updateBuddy(value) {
      this.updateField("buddy", value);
    },
    equipmentTitle,
    serviceStatusForDive,
    equipmentChecked(equipmentId) {
      return this.selectedEquipmentIds.includes(String(equipmentId));
    },
    equipmentWarning(item) {
      return ["unknown", "overdue"].includes(serviceStatusForDive(item, this.dive?.started_at).status);
    },
    toggleEquipment(equipmentId) {
      const id = String(equipmentId);
      const nextIds = this.equipmentChecked(id)
        ? this.selectedEquipmentIds.filter((entry) => entry !== id)
        : [...this.selectedEquipmentIds, id];
      this.updateField("equipment_ids", nextIds);
    },
    useDefaultEquipment() {
      this.updateField("equipment_ids", Array.isArray(this.defaultEquipmentIds) ? [...this.defaultEquipmentIds] : []);
    },
    clearEquipment() {
      this.updateField("equipment_ids", []);
    },
    clearDiveSiteCreateFeedback() {
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
    },
    async saveCurrentDiveSite() {
      const siteName = typeof this.selectedDraft?.site === "string" ? this.selectedDraft.site.trim() : "";
      if (!siteName || typeof this.createDiveSite !== "function") return;

      this.diveSiteCreatePending = true;
      this.diveSiteCreateError = "";
      this.diveSiteCreateStatus = "";
      try {
        const savedSite = await this.createDiveSite({ name: siteName });
        if (savedSite?.name && savedSite.name !== this.selectedDraft?.site) {
          this.updateSite(savedSite.name);
        }
        this.diveSiteCreateStatus = `${savedSite?.name || siteName} added to your saved dive sites.`;
      } catch (error) {
        this.diveSiteCreateError = error?.message || "Could not save the dive site.";
      } finally {
        this.diveSiteCreatePending = false;
      }
    },
    saveChanges() {
      if (!this.dive) return;
      this.saveDiveLogbook(this.dive.id);
    },
    removeDive() {
      if (!this.dive) return;
      this.deleteDive(this.dive.id);
    },
    detailLine(label, value) {
      return { label, value: value || "Unavailable" };
    },
    siteCoordinateLabel(site) {
      if (!site) return "GPS coordinates unavailable";
      const latitude = site.latitude ?? site.lat;
      const longitude = site.longitude ?? site.lon;
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined || latitude === "" || longitude === "") {
        return "GPS coordinates unavailable";
      }
      return `Lat ${latitude}, Lon ${longitude}`;
    },
    formatDiveSiteSuggestionDetail(site) {
      if (!site) return "";
      const parts = [];
      if (typeof site.location === "string" && site.location.trim()) {
        parts.push(site.location.trim());
      }
      if (typeof site.country === "string" && site.country.trim()) {
        parts.push(site.country.trim());
      }
      const latitude = site.latitude ?? site.lat;
      const longitude = site.longitude ?? site.lon;
      if (latitude !== null && latitude !== undefined && latitude !== "" && longitude !== null && longitude !== undefined && longitude !== "") {
        parts.push("GPS ready");
      }
      return parts.join(" / ");
    },
    durationMinutes(dive) {
      return Math.round(numberOrZero(dive?.duration_seconds) / 60);
    }
  },
}
</script>

<template>
    <section v-if="dive && selectedDraft" class="space-y-8 text-on-surface">
      <header class="space-y-5">
        <UButton @click="closeEditor()" class="inline-flex items-center gap-2 bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
          <span class="material-symbols-outlined text-sm">arrow_back</span>
          Back To Dive Detail
        </UButton>
        <div>
          <section class="border border-primary/10 bg-surface-container-low p-8 shadow-panel">
            <div class="flex flex-wrap items-center gap-3">
              <span class="bg-primary/10 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Logbook Entry</span>
              <span class="bg-surface-container-high px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ displayDiveIndex(dive) }}</span>
            </div>
            <h3 class="mt-5 font-headline text-5xl font-bold tracking-tight">Edit Existing Dive</h3>
            <p class="mt-4 max-w-3xl text-sm leading-7 text-on-surface-variant">
              This view updates the permanent logbook metadata for an already saved dive.
              It does not use the import queue workflow and it does not affect other dives.
            </p>
            <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div v-for="card in stats" :key="card.label" class="border border-primary/10 bg-surface-container-high/40 p-4">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ card.label }}</p>
                <p class="mt-2 font-headline text-2xl font-bold">{{ card.value }}</p>
              </div>
            </div>
          </section>
        </div>
        <div v-if="statusMessage" class="border border-primary/20 bg-primary/10 px-5 py-4 text-sm text-primary shadow-panel">{{ statusMessage }}</div>
        <div v-if="errorMessage" class="border border-error/20 bg-error-container/20 px-5 py-4 text-sm text-on-error-container shadow-panel">{{ errorMessage }}</div>
      </header>

      <section class="space-y-8 border border-primary/10 bg-surface-container-low p-8 shadow-panel">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ t('Logbook Metadata', 'Logbook Metadata') }}</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ t('Dive Registry Fields', 'Dive Registry Fields') }}</h4>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Site</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.site"
              @update:model-value="updateSite"
              :options="savedDiveSites"
              placeholder="House Reef"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
              :option-detail="formatDiveSiteSuggestionDetail"
            />
            <p class="text-xs leading-5 text-on-surface-variant">
              {{ savedDiveSites.length ? 'Search saved dive sites from Settings or enter a custom value.' : 'No saved dive sites yet. Add them in Settings to reuse them here.' }}
            </p>
            <p v-if="selectedDiveSite" class="text-xs leading-5 text-primary">{{ siteCoordinateLabel(selectedDiveSite) }}</p>
            <div v-if="canCreateDiveSite || diveSiteCreateStatus || diveSiteCreateError" class="space-y-2">
              <UButton
                v-if="canCreateDiveSite"
                @click="saveCurrentDiveSite()"
                :disabled="diveSiteCreatePending"
                class="inline-flex items-center gap-2 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary disabled:opacity-50"
              >
                <span class="material-symbols-outlined text-sm">add_location_alt</span>
                {{ diveSiteCreatePending ? 'Saving Dive Site...' : 'Save As Reusable Dive Site' }}
              </UButton>
              <p v-if="diveSiteCreateStatus" class="text-xs leading-5 text-primary">{{ diveSiteCreateStatus }}</p>
              <p v-if="diveSiteCreateError" class="text-xs leading-5 text-on-error-container">{{ diveSiteCreateError }}</p>
            </div>
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.buddy"
              @update:model-value="updateBuddy"
              :options="savedBuddies"
              placeholder="Buddy name"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
            />
            <p class="text-xs leading-5 text-on-surface-variant">
              {{ savedBuddies.length ? 'Search saved buddies from Settings or enter a custom value.' : 'No saved buddies yet. Add them in Settings to reuse them here.' }}
            </p>
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide</span>
            <metadata-autocomplete-field
              :model-value="selectedDraft.guide"
              @update:model-value="updateField('guide', $event)"
              :options="savedGuides"
              placeholder="Guide or instructor"
              input-class="w-full border border-primary/10 bg-background/35 px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"
            />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Tank Volume</span>
            <USelect :model-value="selectedDraft.tank_volume_l || ''" :items="[{ label: 'Select tank volume', value: '' }, ...tankVolumeOptions]" @update:model-value="updateField('tank_volume_l', $event)" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <template v-if="canEditTankPressure">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Entry Pressure</span>
              <UInput :value="selectedDraft.begin_pressure_bar || ''" @input="updateField('begin_pressure_bar', $event.target.value)" type="number" min="0" max="400" step="1" placeholder="200" class="ui-number-input w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>

            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Exit Pressure</span>
              <UInput :value="selectedDraft.end_pressure_bar || ''" @input="updateField('end_pressure_bar', $event.target.value)" type="number" min="0" max="400" step="1" placeholder="70" class="ui-number-input w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
            </label>
          </template>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Weather', 'Weather') }}</span>
            <UInput :value="selectedDraft.weather_description" @input="updateField('weather_description', $event.target.value)" type="text" :placeholder="t('logbookEdit.weather.placeholder', 'Sunny, overcast, surge on entry')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Visibility', 'Visibility') }}</span>
            <UInput :value="selectedDraft.visibility" @input="updateField('visibility', $event.target.value)" type="text" :placeholder="t('logbookEdit.visibility.placeholder', '15 m / moderate')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Wetsuit', 'Wetsuit') }}</span>
            <UInput :value="selectedDraft.wetsuit_description" @input="updateField('wetsuit_description', $event.target.value)" type="text" :placeholder="t('logbookEdit.wetsuit.placeholder', '7mm semi-dry')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>

          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Weights', 'Weights') }}</span>
            <UInput :value="selectedDraft.weight_description" @input="updateField('weight_description', $event.target.value)" type="text" :placeholder="t('logbookEdit.weights.placeholder', '8 kg integrated + 1 kg trim')" class="w-full border border-primary/10 bg-background/35 px-4 py-3 text-sm text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary" />
          </label>
        </div>

        <section v-if="equipmentSelectionEnabled" class="space-y-4 border border-primary/10 bg-surface-container-high/18 p-5">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Equipment Used</p>
              <p class="mt-2 text-sm leading-6" :class="invalidSelectedEquipment.length ? 'text-tertiary' : 'text-primary'">
                {{ invalidSelectedEquipment.length ? 'Selected gear has service warnings, but this dive can still be saved.' : selectedEquipmentIds.length ? 'Selected gear will be attached to this dive.' : 'No equipment selected for this dive.' }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton @click="useDefaultEquipment()" type="button" class="bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Use Defaults</UButton>
              <UButton @click="clearEquipment()" type="button" class="bg-background/30 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Clear</UButton>
            </div>
          </div>
          <div v-if="equipmentGroups.length" class="grid gap-4 lg:grid-cols-2">
            <div v-for="group in equipmentGroups" :key="'logbook-equipment-' + group.category" class="space-y-2">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ group.category }}</p>
              <UButton
                v-for="item in group.items"
                :key="'logbook-equipment-item-' + item.id"
                type="button"
                @click="toggleEquipment(item.id)"
                class="flex w-full items-center justify-between gap-3 border px-4 py-3 text-left transition-colors"
                :class="equipmentChecked(item.id) ? (equipmentWarning(item) ? 'border-tertiary/45 bg-tertiary/10 text-on-surface' : 'border-primary/35 bg-primary/10 text-on-surface') : 'border-primary/10 bg-background/20 text-secondary hover:border-primary/25'"
              >
                <span>
                  <span class="block text-sm font-semibold">{{ equipmentTitle(item) }}</span>
                  <span class="mt-1 block text-xs" :class="equipmentWarning(item) ? 'text-tertiary' : 'text-primary'">{{ serviceStatusForDive(item, dive.started_at).label }}</span>
                </span>
                <span class="material-symbols-outlined text-base">{{ equipmentChecked(item.id) ? 'check_circle' : 'radio_button_unchecked' }}</span>
              </UButton>
            </div>
          </div>
          <p v-else class="text-sm leading-6 text-on-surface-variant">Add equipment in the Equipment section to reuse it here.</p>
          <div v-if="invalidSelectedEquipment.length" class="space-y-1 border border-tertiary/30 bg-tertiary/10 px-4 py-3 text-sm text-tertiary">
            <p v-for="item in invalidSelectedEquipment" :key="'logbook-invalid-equipment-' + item.id">{{ item.name }}: {{ item.label }}</p>
          </div>
        </section>

        <label class="space-y-2">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Notes</span>
          <UTextarea :value="selectedDraft.notes" @input="updateField('notes', $event.target.value)" rows="14" placeholder="Conditions, wildlife, route, incidents, visibility, buoyancy notes..." class="min-h-[24rem] w-full resize-y border border-primary/10 bg-surface-container-high/35 px-5 py-4 text-sm leading-7 text-on-surface placeholder:text-secondary/50 focus:border-primary/30 focus:ring-1 focus:ring-primary"></UTextarea>
        </label>

        <section class="border border-primary/10 bg-surface-container-high/30 p-5">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ t('Record Summary', 'Record Summary') }}</p>
          <div class="mt-4 grid gap-4 text-sm text-on-surface-variant md:grid-cols-2 xl:grid-cols-4">
            <div class="space-y-1">
              <p>{{ t('Dive ID', 'Dive ID') }}</p>
              <p class="text-on-surface">{{ displayDiveIndex(dive) }}</p>
            </div>
            <div class="space-y-1">
              <p>{{ t('Started', 'Started') }}</p>
              <p class="text-on-surface">{{ formatDateTime(dive.started_at) }}</p>
            </div>
            <div class="space-y-1">
              <p>Imported</p>
              <p class="text-on-surface">{{ formatDateTime(dive.imported_at) }}</p>
            </div>
            <div class="space-y-1">
              <p>{{ t('Device', 'Device') }}</p>
              <p class="text-on-surface">{{ diveDeviceLabel(dive) }}</p>
            </div>
          </div>
        </section>

        <div class="flex flex-col gap-3 border-t border-primary/10 pt-6 sm:flex-row sm:justify-end">
          <UButton @click="closeEditor()" class="bg-surface-container-high px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface transition-colors hover:text-primary">
            Cancel
          </UButton>
          <UButton @click="removeDive()" :disabled="isSaving || isDeleting" aria-label="Remove dive" title="Remove dive" class="inline-flex h-11 w-11 items-center justify-center bg-surface-container-high text-on-error-container transition-colors hover:bg-error-container/30 disabled:opacity-50">
            <span class="material-symbols-outlined text-[21px] leading-none">delete</span>
          </UButton>
          <UButton @click="saveChanges()" :disabled="isSaving || isDeleting || !canSaveRecord" class="bg-primary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {{ isSaving ? 'Saving...' : 'Save Logbook Changes' }}
          </UButton>
        </div>
      </section>
    </section>
</template>



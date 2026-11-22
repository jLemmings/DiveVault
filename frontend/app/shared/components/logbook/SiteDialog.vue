<script>
import { numericCoordinate, validCoordinates } from "~/shared/utils/dive-map.js";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

export default {
  name: "SiteDialog",
  components: { ChartDialog, ChartNote },
  props: {
    name: { type: String, default: "" },
    save: { type: Function, required: true },
    searchLocation: { type: Function, required: true }
  },
  emits: ["close", "saved"],
  data() {
    return {
      draft: { name: this.name, location: "", country: "", latitude: "", longitude: "" },
      searching: false,
      saving: false,
      error: ""
    };
  },
  methods: {
    async find() {
      const query = this.draft.location.trim();
      if (!query) {
        this.error = "Enter a location to search for.";
        return;
      }
      this.searching = true;
      this.error = "";
      try {
        const result = await this.searchLocation(query);
        if (!result) {
          this.error = this.$tx("Nothing found for {place}.", { place: query });
          return;
        }
        if (typeof result.country === "string") this.draft.country = result.country;
        this.draft.latitude = String(result.latitude);
        this.draft.longitude = String(result.longitude);
      } catch (error) {
        this.error = error?.message || "Could not search for that location.";
      } finally {
        this.searching = false;
      }
    },
    async submit() {
      const { name, location, country, latitude, longitude } = this.draft;
      const blank = String(latitude) === "" && String(longitude) === "";
      const lat = numericCoordinate(latitude);
      const lon = numericCoordinate(longitude);
      if (!name.trim()) {
        this.error = "Enter a name for the site.";
        return;
      }
      if (!blank && !validCoordinates(lat, lon)) {
        this.error = "Enter both latitude and longitude, or neither.";
        return;
      }
      this.saving = true;
      this.error = "";
      try {
        const site = await this.save({
          name: name.trim(),
          location: location.trim(),
          country: country.trim(),
          latitude: blank ? null : lat,
          longitude: blank ? null : lon
        });
        this.$emit("saved", site?.name || name.trim());
      } catch (error) {
        this.error = error?.message || "Could not save the site.";
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<template>
  <chart-dialog
    :title="$tx('Add a site')"
    :intro="$tx('Saved sites are offered when you log, and shown on the chart.')"
    :busy="saving"
    @close="$emit('close')"
  >
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ $tx("Site name") }}<input v-model="draft.name" /></label>
      <div class="form">
        <label class="field">{{ $tx("Location") }}<input v-model="draft.location" :placeholder="$tx('A town, bay or reef')" /></label>
        <label class="field">{{ $tx("Country") }}<input v-model="draft.country" /></label>
        <label class="field">{{ $tx("Latitude") }}<input v-model="draft.latitude" inputmode="decimal" /></label>
        <label class="field">{{ $tx("Longitude") }}<input v-model="draft.longitude" inputmode="decimal" /></label>
      </div>
      <chart-note :error="error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save site") }}</button>
        <button type="button" class="link" :disabled="searching" @click="find">
          {{ searching ? $tx("Searching…") : $tx("Find by location") }}
        </button>
      </div>
    </form>
  </chart-dialog>
</template>

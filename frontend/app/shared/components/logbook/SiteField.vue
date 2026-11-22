<script>
import { normalizeName, sortNamedCollection } from "~/shared/utils/equipment-dive.js";
import { newestFirst, siteOf } from "~/shared/utils/logbook.js";
import SuggestField from "./SuggestField.vue";
import SiteDialog from "./SiteDialog.vue";

export default {
  name: "SiteField",
  components: { SuggestField, SiteDialog },
  props: {
    modelValue: { type: String, default: "" },
    label: { type: String, required: true },
    placeholder: { type: String, default: "" },
    sites: { type: Array, default: () => [] },
    // Pass completed dives to offer the last few sites as one-tap answers.
    recentFrom: { type: Array, default: () => [] },
    createSite: { type: Function, required: true },
    searchLocation: { type: Function, required: true }
  },
  emits: ["update:modelValue"],
  data() {
    return { adding: false, added: "" };
  },
  computed: {
    options() {
      return sortNamedCollection(this.sites);
    },
    recent() {
      return [...new Set(newestFirst(this.recentFrom).map(siteOf).filter(Boolean))].slice(0, 3);
    },
    unsaved() {
      const name = normalizeName(this.modelValue);
      return Boolean(name) && !this.options.some((site) => normalizeName(site.name) === name);
    },
    showRow() {
      return Boolean(this.recent.length || this.unsaved || this.added);
    }
  },
  methods: {
    describe(site) {
      return [site.location, site.country].filter(Boolean).join(", ");
    },
    update(value) {
      this.added = "";
      this.$emit("update:modelValue", value);
    },
    saved(name) {
      this.adding = false;
      if (name !== this.modelValue) this.$emit("update:modelValue", name);
      this.added = name;
    }
  }
};
</script>

<template>
  <div>
    <suggest-field
      :model-value="modelValue"
      :label="label"
      :placeholder="placeholder"
      :options="options"
      :detail="describe"
      :need="!modelValue.trim()"
      @update:model-value="update"
    />
    <div v-if="showRow" class="row site-answers">
      <span v-if="recent.length" class="soft">{{ $tx("Dived recently:") }}</span>
      <button v-for="site in recent" :key="site" type="button" class="link site" @click="update(site)">{{ site }}</button>
      <button v-if="unsaved" type="button" class="link" @click="adding = true">{{ $tx("Save as a new site") }}</button>
      <p v-if="added" role="status">{{ $tx("{site} added to your sites.", { site: added }) }}</p>
    </div>
    <site-dialog
      v-if="adding"
      :name="modelValue"
      :save="createSite"
      :search-location="searchLocation"
      @close="adding = false"
      @saved="saved"
    />
  </div>
</template>

<style>
.site-answers {
  gap: 0 24px;
  padding-top: 4px;
}
</style>

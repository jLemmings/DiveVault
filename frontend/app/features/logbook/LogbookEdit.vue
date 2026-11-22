<script>
import { diveSequenceNumber } from "~/shared/utils/core.js";
import { clockTime, metres, minutes, weekdayDate } from "~/shared/utils/format.js";
import { maxDepthOf, recorderOf, siteOf } from "~/shared/utils/logbook.js";
import { divePath } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import DepthProfile from "~/shared/components/chart/DepthProfile.vue";
import ChartLink from "~/shared/components/ChartLink.vue";
import SiteField from "~/shared/components/logbook/SiteField.vue";
import DiveFields from "~/shared/components/logbook/DiveFields.vue";
import KitField from "~/shared/components/logbook/KitField.vue";

export default {
  name: "LogbookEditorView",
  components: { TideLine, ChartNote, DepthProfile, ChartLink, SiteField, DiveFields, KitField },
  props: {
    dive: { type: Object, required: true },
    allDives: { type: Array, required: true },
    draft: { type: Object, required: true },
    requiredFields: { type: Array, required: true },
    diveSites: { type: Array, required: true },
    buddies: { type: Array, required: true },
    guides: { type: Array, required: true },
    equipment: { type: Array, required: true },
    defaultEquipmentIds: { type: Array, required: true },
    equipmentEnabled: Boolean,
    saving: Boolean,
    createDiveSite: { type: Function, required: true },
    searchLocation: { type: Function, required: true },
    status: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  emits: ["change", "save", "discard", "delete"],
  computed: {
    back() {
      return divePath(this.dive.id);
    },
    title() {
      return siteOf(this.dive) || this.$tx("No site");
    },
    subtitle() {
      return this.$tx("Dive {number}, {date} at {time}", {
        number: diveSequenceNumber(this.dive, this.allDives) || "",
        date: weekdayDate(this.dive.started_at, { year: true }),
        time: clockTime(this.dive.started_at)
      });
    },
    recorded() {
      return [metres(maxDepthOf(this.dive)), minutes(this.dive.duration_seconds), recorderOf(this.dive)].filter(Boolean).join(", ");
    },
    notesNeeded() {
      return this.requiredFields.includes("notes") && !this.draft.notes.trim();
    }
  }
};
</script>

<template>
  <section class="page">
    <header class="land spread phone-only">
      <chart-link class="link" :to="back" @click="$emit('discard')">{{ $tx("Cancel") }}</chart-link>
    </header>
    <div class="topside">
      <div>
        <h1 class="h1">
          {{ $tx("Edit logbook") }}: <span class="site">{{ title }}</span>
        </h1>
        <p class="soft big">{{ subtitle }}</p>
      </div>
      <p class="soft desk-only">{{ recorded }}</p>
    </div>
    <tide-line />
    <chart-note :status="status" :error="error" />
    <depth-profile :dive="dive" compact />
    <form class="cols pad logbook-edit" @submit.prevent="$emit('save')">
      <section class="main stack">
        <site-field
          :model-value="draft.site"
          :label="$tx('Dive site, required')"
          :sites="diveSites"
          :create-site="createDiveSite"
          :search-location="searchLocation"
          @update:model-value="$emit('change', 'site', $event)"
        />
        <dive-fields
          :draft="draft"
          :required="requiredFields"
          :buddies="buddies"
          :guides="guides"
          @change="(key, value) => $emit('change', key, value)"
        />
        <label class="field" :class="{ need: notesNeeded }">
          {{ notesNeeded ? $tx("Notes, required") : $tx("Notes") }}
          <textarea
            rows="6"
            :value="draft.notes"
            :placeholder="$tx('What did you see?')"
            @input="$emit('change', 'notes', $event.target.value)"
          ></textarea>
        </label>
      </section>
      <section class="side stack edit-side">
        <kit-field
          v-if="equipmentEnabled"
          :equipment="equipment"
          :selected="draft.equipment_ids"
          :usual="defaultEquipmentIds"
          :date="dive.started_at || ''"
          @change="$emit('change', 'equipment_ids', $event)"
        />
        <p class="soft small">{{ $tx("Depth, time and gas stay as they were recorded.") }}</p>
        <div class="row">
          <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save changes") }}</button>
          <chart-link class="link" :to="back" @click="$emit('discard')">{{ $tx("Cancel") }}</chart-link>
          <button type="button" class="link" :disabled="saving" @click="$emit('delete')">{{ $tx("Delete dive") }}</button>
        </div>
      </section>
    </form>
  </section>
</template>

<style>
.logbook-edit {
  gap: 22px 56px;
}

.edit-side {
  flex-basis: 260px;
}
</style>

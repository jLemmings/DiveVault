<script>
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import { GEAR_DRAWING_OPTIONS } from "./gear-drawings.js";

function newId() {
  return `equipment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftOf(item) {
  const text = (key) => (item?.[key] === null || item?.[key] === undefined ? "" : String(item[key]));
  return {
    id: item ? item.id : newId(),
    name: text("name"),
    category: item ? text("category") || text("type") : "Regulator",
    icon: text("icon") || "scuba_diving",
    brand: text("brand"),
    model: text("model"),
    serial: text("serial"),
    vendor: text("vendor"),
    year_bought: text("year_bought"),
    warranty: text("warranty"),
    service_tag: text("service_tag"),
    last_service_date: text("last_service_date") || text("last_serviced_at").slice(0, 10),
    next_service_due: text("next_service_due").slice(0, 10),
    service_interval_months: item ? text("service_interval_months") : "12",
    max_dives_before_service: text("max_dives_before_service"),
    track_service: item?.track_service !== false,
    is_default: Boolean(item?.is_default || item?.is_standard)
  };
}

export default {
  name: "GearDialog",
  components: { ChartDialog, ChartNote },
  props: {
    item: { type: Object, default: null },
    saving: Boolean,
    error: { type: String, default: "" }
  },
  emits: ["close", "save", "remove"],
  data() {
    return { draft: draftOf(this.item), drawings: GEAR_DRAWING_OPTIONS };
  },
  methods: {
    submit() {
      const draft = { ...this.draft };
      for (const key of ["name", "category", "brand", "model", "serial", "vendor", "warranty", "service_tag"])
        draft[key] = draft[key].trim();
      if (!draft.name) draft.name = [draft.brand, draft.vendor, draft.model, draft.category].filter(Boolean).join(" ");
      this.$emit("save", {
        ...this.item,
        ...draft,
        type: draft.category,
        // "Usual kit" has two spellings in stored records, and both follow the tick.
        is_standard: draft.is_default,
        year_bought: Number.parseInt(draft.year_bought, 10) || null,
        service_interval_months: Number.parseInt(draft.service_interval_months, 10) || null,
        max_dives_before_service: Number.parseInt(draft.max_dives_before_service, 10) || null
      });
    }
  }
};
</script>

<template>
  <chart-dialog :title="item ? $tx('Edit gear') : $tx('Add gear')" :busy="saving" @close="$emit('close')">
    <form class="stack" @submit.prevent="submit">
      <div class="form">
        <label class="field">{{ $tx("Name") }}<input v-model="draft.name" /></label>
        <label class="field">{{ $tx("Kind") }}<input v-model="draft.category" /></label>
        <label class="field">{{ $tx("Brand") }}<input v-model="draft.brand" /></label>
        <label class="field">{{ $tx("Model") }}<input v-model="draft.model" /></label>
        <label class="field">{{ $tx("Serial") }}<input v-model="draft.serial" /></label>
        <label class="field">
          {{ $tx("Drawn as") }}
          <select v-model="draft.icon">
            <option v-for="option in drawings" :key="option.icon" :value="option.icon">{{ $tx(option.label) }}</option>
          </select>
        </label>
      </div>
      <h3 class="h3">{{ $tx("Service") }}</h3>
      <label class="check"><input v-model="draft.track_service" type="checkbox" />{{ $tx("Track its service") }}</label>
      <div v-if="draft.track_service" class="form">
        <label class="field">{{ $tx("Last service") }}<input v-model="draft.last_service_date" type="date" /></label>
        <label class="field">{{ $tx("Next service, if booked") }}<input v-model="draft.next_service_due" type="date" /></label>
        <label class="field">{{ $tx("Every, months") }}<input v-model="draft.service_interval_months" inputmode="numeric" /></label>
        <label class="field">{{ $tx("Every, dives") }}<input v-model="draft.max_dives_before_service" inputmode="numeric" /></label>
      </div>
      <h3 class="h3">{{ $tx("Where it came from") }}</h3>
      <div class="form">
        <label class="field">{{ $tx("Bought from") }}<input v-model="draft.vendor" /></label>
        <label class="field">{{ $tx("Year bought") }}<input v-model="draft.year_bought" inputmode="numeric" /></label>
        <label class="field">{{ $tx("Warranty") }}<input v-model="draft.warranty" /></label>
        <label class="field">{{ $tx("Tag") }}<input v-model="draft.service_tag" /></label>
      </div>
      <label class="check"><input v-model="draft.is_default" type="checkbox" />{{ $tx("On every dive, as part of my usual kit") }}</label>
      <chart-note :error="error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save gear") }}</button>
        <button v-if="item" type="button" class="link" :disabled="saving" @click="$emit('remove', item)">{{ $tx("Remove") }}</button>
      </div>
    </form>
  </chart-dialog>
</template>

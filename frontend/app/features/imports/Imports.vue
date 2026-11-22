<script>
import { importDraftSeed, isNightDive, missingImportFields, pressureRange } from "~/shared/utils/core.js";
import { sortNamedCollection } from "~/shared/utils/equipment-dive.js";
import { clockTime, degrees, formatNumber, metres, minutes, weekdayDate } from "~/shared/utils/format.js";
import { maxDepthOf, recorderOf, waterTemperature } from "~/shared/utils/logbook.js";
import { PATHS, importPath } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import DepthProfile from "~/shared/components/chart/DepthProfile.vue";
import ProfileThumb from "~/shared/components/chart/ProfileThumb.vue";
import ChartLink from "~/shared/components/ChartLink.vue";
import SuggestField from "~/shared/components/logbook/SuggestField.vue";
import SiteField from "~/shared/components/logbook/SiteField.vue";
import DiveFields from "~/shared/components/logbook/DiveFields.vue";
import KitField from "~/shared/components/logbook/KitField.vue";

// A queue beside the dive being finished.
export default {
  name: "DiveImportQueueView",
  components: { TideLine, ChartNote, DepthProfile, ProfileThumb, ChartLink, SuggestField, SiteField, DiveFields, KitField },
  props: {
    queue: { type: Array, required: true },
    dives: { type: Array, required: true },
    selectedId: { type: String, default: "" },
    draftFor: { type: Function, required: true },
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
  emits: ["change", "save", "delete", "apply-people", "refresh"],
  data() {
    return { paths: PATHS, sharedBuddy: "", sharedGuide: "" };
  },
  computed: {
    picked() {
      return this.queue.find((dive) => String(dive.id) === this.selectedId) || null;
    },
    dive() {
      return this.picked || this.queue[0] || null;
    },
    draft() {
      return this.draftFor(this.dive);
    },
    notesNeeded() {
      return this.requiredFields.includes("notes") && !this.draft.notes.trim();
    },
    siteIsTheOnlyNeed() {
      return this.requiredFields.every((field) => field === "site");
    },
    figures() {
      const { begin, end } = pressureRange(this.dive);
      const figures = [minutes(this.dive.duration_seconds)];
      const water = waterTemperature(this.dive);
      if (water !== null) figures.push(degrees(water));
      if (typeof begin === "number" && typeof end === "number") {
        figures.push(this.$tx("{from} to {to} bar", { from: formatNumber(begin), to: formatNumber(end) }));
      }
      if (recorderOf(this.dive)) figures.push(recorderOf(this.dive));
      if (isNightDive(this.dive)) figures.push(this.$tx("night dive"));
      return figures.join(", ");
    },
    buddyOptions() {
      return sortNamedCollection(this.buddies);
    },
    guideOptions() {
      return sortNamedCollection(this.guides);
    }
  },
  methods: {
    importPath,
    heading(dive) {
      return weekdayDate(dive.started_at);
    },
    time(dive) {
      return clockTime(dive.started_at);
    },
    line(dive) {
      return [clockTime(dive.started_at), metres(maxDepthOf(dive)), minutes(dive.duration_seconds)].join(", ");
    },
    state(dive) {
      const saved = importDraftSeed(dive);
      const missing = missingImportFields(this.draftFor(dive), this.requiredFields);
      const started = ["buddy", "guide", "notes", "weather_description"].some((key) => saved[key].trim());
      if (!missing.length) return { text: this.$tx("Ready for the logbook"), urgent: false };
      if (missing[0].key === "site") {
        return { text: started ? this.$tx("Draft saved, needs a dive site") : this.$tx("Needs a dive site"), urgent: !started };
      }
      return { text: this.$tx("Needs: {fields}", { fields: missing.map((field) => this.$tx(field.label)).join(", ") }), urgent: true };
    },
    change(key, value) {
      this.$emit("change", this.dive.id, key, value);
    }
  }
};
</script>

<template>
  <section class="page imports" :class="{ picked }">
    <div class="topside">
      <div>
        <h1 class="h1">
          {{
            queue.length
              ? $tn(queue.length, "{count} dive waiting to surface", "{count} dives waiting to surface")
              : $tx("Every dive has surfaced")
          }}
        </h1>
        <p class="soft big">
          <template v-if="!queue.length">{{ $tx("New dives from your computer or a file will wait here.") }}</template>
          <template v-else-if="siteIsTheOnlyNeed">{{ $tx("Name the site and each one moves into your logbook.") }}</template>
          <template v-else>{{ $tx("Fill in what's required and each one moves into your logbook.") }}</template>
        </p>
      </div>
      <div class="row">
        <button type="button" class="link" @click="$emit('refresh')">{{ $tx("Check for new dives") }}</button>
        <chart-link class="btn line" :to="paths.importFile">{{ $tx("Import a file") }}</chart-link>
      </div>
    </div>
    <tide-line />
    <chart-note :status="status" :error="error" />

    <template v-if="!dive">
      <div class="shoal pad row imports-empty">
        <chart-link class="btn" :to="paths.logbook">{{ $tx("Open the logbook") }}</chart-link>
        <chart-link class="btn line" :to="paths.importFile">{{ $tx("Import a file") }}</chart-link>
      </div>
      <div class="mid imports-empty"></div>
      <div class="shelf imports-empty"></div>
    </template>
    <div v-else class="cols fill">
      <aside class="side shelf pad stack import-queue">
        <ul class="list">
          <li v-for="entry in queue" :key="entry.id">
            <chart-link class="row queue-dive" :to="importPath(entry.id)" :aria-current="entry === dive ? 'true' : undefined">
              <profile-thumb :dive="entry" :now="entry === dive" />
              <span class="grow">
                <span class="h3 queue-day" :class="{ act: entry === dive }">{{ heading(entry) }}</span>
                {{ line(entry) }}
                <span class="queue-state" :class="state(entry).urgent ? 'warn' : 'soft'">{{ state(entry).text }}</span>
              </span>
            </chart-link>
          </li>
        </ul>
        <form
          v-if="queue.length > 1"
          class="stack same-people"
          @submit.prevent="$emit('apply-people', { buddy: sharedBuddy, guide: sharedGuide })"
        >
          <h2 class="h2">
            {{ queue.length === 3 ? $tx("Same people on all three?") : $tx("Same people on all {count}?", { count: queue.length }) }}
          </h2>
          <div class="form pair">
            <suggest-field v-model="sharedBuddy" :label="$tx('Buddy')" :options="buddyOptions" />
            <suggest-field v-model="sharedGuide" :label="$tx('Guide')" :options="guideOptions" />
          </div>
          <button class="btn line" type="submit" :disabled="saving || !(sharedBuddy.trim() || sharedGuide.trim())">
            {{ $tx("Use for all {count} dives", { count: queue.length }) }}
          </button>
        </form>
      </aside>

      <section class="main import-dive">
        <chart-link class="link import-back" :to="paths.imports">{{ $tx("All imports") }}</chart-link>
        <depth-profile :key="dive.id" :dive="dive" compact />
        <form class="pad stack" @submit.prevent="$emit('save', dive.id, true)">
          <div class="row between">
            <h2 class="h2">{{ heading(dive) }}, {{ time(dive) }}</h2>
            <p class="soft">{{ figures }}</p>
          </div>
          <site-field
            :key="`site-${dive.id}`"
            :model-value="draft.site"
            :label="$tx('Where was it? Required')"
            :placeholder="$tx('Start typing a site')"
            :sites="diveSites"
            :recent-from="dives"
            :create-site="createDiveSite"
            :search-location="searchLocation"
            @update:model-value="change('site', $event)"
          />
          <dive-fields :draft="draft" :required="requiredFields" :buddies="buddies" :guides="guides" @change="change">
            <template #after>
              <kit-field
                v-if="equipmentEnabled"
                :key="`kit-${dive.id}`"
                class="span-two"
                :equipment="equipment"
                :selected="draft.equipment_ids"
                :usual="defaultEquipmentIds"
                :date="dive.started_at || ''"
                @change="change('equipment_ids', $event)"
              />
            </template>
          </dive-fields>
          <label class="field" :class="{ need: notesNeeded }">
            {{ notesNeeded ? $tx("Notes, required") : $tx("Notes") }}
            <textarea rows="2" :value="draft.notes" @input="change('notes', $event.target.value)"></textarea>
          </label>
          <div class="row">
            <button class="btn" type="submit" :disabled="saving">
              <template v-if="saving">{{ $tx("Saving…") }}</template>
              <template v-else-if="queue.length > 1">{{ $tx("Add to logbook, open next") }}</template>
              <template v-else>{{ $tx("Add to logbook") }}</template>
            </button>
            <button type="button" class="btn line" :disabled="saving" @click="$emit('save', dive.id, false)">
              {{ $tx("Save draft") }}
            </button>
            <button type="button" class="link" :disabled="saving" @click="$emit('delete', dive.id)">{{ $tx("Delete this import") }}</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>

<style>
.import-queue {
  flex-basis: 380px;
}

.queue-dive {
  flex-wrap: nowrap;
}

.queue-dive .thumb {
  flex: none;
}

.queue-day,
.queue-state {
  display: block;
}

.same-people > .btn {
  align-self: stretch;
}

.same-people {
  padding-top: 22px;
}

.imports-empty {
  min-height: 120px;
}

.import-back {
  display: none !important;
}

@media (max-width: 700px) {
  .imports:not(.picked) .import-dive,
  .imports.picked .import-queue {
    display: none;
  }

  .imports.picked > .topside {
    display: none;
  }

  .imports.picked .import-back {
    display: flex !important;
    padding: 4px var(--gutter);
    background: var(--shoal);
  }
}
</style>

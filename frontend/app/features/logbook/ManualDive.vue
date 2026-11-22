<script>
import { logbookRequirementFieldOptions, missingImportFields } from "~/shared/utils/core.js";
import { phoneScreen } from "~/shared/composables/phone-screen.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import SiteField from "~/shared/components/logbook/SiteField.vue";
import DiveFields from "~/shared/components/logbook/DiveFields.vue";
import KitList from "~/shared/components/logbook/KitList.vue";

const TANK_SIZES = ["9", "12", "15"];
const WATER_ISSUE_FIELDS = new Set(["date", "time", "depth", "duration", "water", "pressure", "site"]);

function optionalNumber(value) {
  const text = String(value ?? "").trim();
  return text ? Number.parseFloat(text) : null;
}

// Laid out in the order it was dived: going in, at the bottom, coming up.
export default {
  name: "ManualDiveEntryView",
  components: { TideLine, ChartNote, SiteField, DiveFields, KitList },
  mixins: [phoneScreen],
  props: {
    draft: { type: Object, required: true },
    requiredFields: { type: Array, required: true },
    diveSites: { type: Array, required: true },
    buddies: { type: Array, required: true },
    guides: { type: Array, required: true },
    equipment: { type: Array, required: true },
    equipmentEnabled: Boolean,
    creating: Boolean,
    createDiveSite: { type: Function, required: true },
    searchLocation: { type: Function, required: true },
    error: { type: String, default: "" }
  },
  emits: ["change", "create", "cancel"],
  data() {
    return { tankSizes: TANK_SIZES, step: 1, attempted: false };
  },
  computed: {
    issues() {
      const { draft } = this;
      const issues = [];
      const add = (key, text) => issues.push({ key, text });
      const duration = Number.parseFloat(draft.durationMinutes);
      const depth = Number.parseFloat(draft.maxDepthM);
      const water = optionalNumber(draft.temperatureC);
      const begin = optionalNumber(draft.beginPressureBar);
      const end = optionalNumber(draft.endPressureBar);
      const badPressure = (value) => value !== null && !(value >= 0 && value <= 400);
      if (!draft.date) add("date", this.$tx("Enter the date."));
      if (!draft.time) add("time", this.$tx("Enter the start time."));
      if (!(duration > 0)) add("duration", this.$tx("Enter the minutes underwater."));
      if (!(depth >= 0)) add("depth", this.$tx("Enter the max depth."));
      if (water !== null && !Number.isFinite(water)) add("water", this.$tx("Enter the water temperature as a number."));
      if (badPressure(begin) || badPressure(end)) add("pressure", this.$tx("Pressures must be between 0 and 400 bar."));
      else if (begin !== null && end !== null && end > begin) add("pressure", this.$tx("Pressure out can't be higher than pressure in."));
      const logbook = {
        site: draft.site,
        buddy: draft.buddy,
        guide: draft.guide,
        weather_description: draft.weatherDescription,
        visibility: draft.visibility,
        wetsuit_description: draft.wetsuitDescription,
        weight_description: draft.weightDescription,
        notes: draft.notes
      };
      for (const field of missingImportFields(logbook, this.requiredFields)) {
        const option = logbookRequirementFieldOptions.find((entry) => entry.key === field.key) || field;
        add(field.key, this.$tx("{field} is required.", { field: this.$tx(option.label) }));
      }
      return issues;
    },
    // The first phone screen is the dive itself; people and notes come after.
    stepIssues() {
      return this.isPhone && this.step === 1 ? this.issues.filter((issue) => WATER_ISSUE_FIELDS.has(issue.key)) : this.issues;
    },
    startedAt() {
      return this.draft.date ? `${this.draft.date}T${this.draft.time || "00:00"}` : "";
    },
    notesNeeded() {
      return this.requiredFields.includes("notes") && !this.draft.notes.trim();
    }
  },
  methods: {
    change(key, value) {
      this.$emit("change", key, value);
    },
    submit() {
      this.attempted = true;
      if (this.stepIssues.length || this.creating) return;
      if (this.isPhone && this.step === 1) {
        this.step = 2;
        this.attempted = false;
        window.scrollTo(0, 0);
        return;
      }
      this.$emit("create");
    }
  }
};
</script>

<template>
  <form class="page manual" :class="`step-${step}`" novalidate @submit.prevent="submit">
    <header class="land spread phone-only">
      <h1 class="h1">{{ $tx("Log a dive") }}</h1>
      <button type="button" class="link" @click="$emit('cancel')">{{ $tx("Cancel") }}</button>
    </header>
    <div class="topside manual-top">
      <div class="desk-only">
        <div>
          <h1 class="h1">{{ $tx("Log a dive") }}</h1>
          <p class="soft big">{{ $tx("Fill it in the way you dived it: in, down, and up.") }}</p>
        </div>
      </div>
      <site-field
        v-if="isPhone && step === 1"
        class="manual-site"
        :model-value="draft.site"
        :label="$tx('Dive site, required')"
        :placeholder="$tx('Choose or type a site')"
        :sites="diveSites"
        :create-site="createDiveSite"
        :search-location="searchLocation"
        @update:model-value="change('site', $event)"
      />
      <div class="manual-when">
        <label class="field">{{ $tx("Date") }}<input type="date" :value="draft.date" @input="change('date', $event.target.value)" /></label>
        <label class="field"
          >{{ $tx("Start time") }}<input type="time" :value="draft.time" @input="change('time', $event.target.value)"
        /></label>
      </div>
      <button v-if="isPhone && step === 2" type="button" class="link" @click="step = 1">{{ $tx("Back to the dive") }}</button>
    </div>
    <tide-line />
    <chart-note :error="error" />

    <div class="descent">
      <svg class="descent-water" viewBox="0 0 1280 380" preserveAspectRatio="none" aria-hidden="true">
        <rect class="b1" width="1280" height="64" />
        <rect class="b2" y="64" width="1280" height="150" />
        <rect class="b3" y="214" width="1280" height="166" />
        <path class="trace now dash" vector-effect="non-scaling-stroke" d="M290 0C310 170 380 278 486 286M794 286C900 278 970 170 990 0" />
      </svg>
      <fieldset class="leg leg-in">
        <legend class="h2">{{ $tx("Going in") }}</legend>
        <div class="leg-fields">
          <label class="field">
            {{ isPhone ? $tx("Tank, litres") : $tx("Tank size, litres") }}
            <select :value="draft.tankVolumeL" @change="change('tankVolumeL', $event.target.value)">
              <option value="">{{ $tx("Not noted") }}</option>
              <option v-for="size in tankSizes" :key="size" :value="size">{{ size }}</option>
            </select>
          </label>
          <label class="field">
            {{ isPhone ? $tx("Pressure, bar") : $tx("Pressure in, bar") }}
            <input
              type="number"
              min="0"
              max="400"
              placeholder="200"
              :value="draft.beginPressureBar"
              @input="change('beginPressureBar', $event.target.value)"
            />
          </label>
        </div>
      </fieldset>
      <fieldset class="leg leg-bottom">
        <legend class="h2">{{ $tx("At the bottom") }}</legend>
        <div class="leg-fields">
          <label class="field">
            {{ isPhone ? $tx("Max depth, m") : $tx("Max depth, metres") }}
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="18.0"
              :value="draft.maxDepthM"
              @input="change('maxDepthM', $event.target.value)"
            />
          </label>
          <label class="field">
            {{ $tx("Water, °C") }}
            <input
              type="number"
              step="any"
              placeholder="26"
              :value="draft.temperatureC"
              @input="change('temperatureC', $event.target.value)"
            />
          </label>
        </div>
      </fieldset>
      <fieldset class="leg leg-up">
        <legend class="h2">{{ $tx("Coming up") }}</legend>
        <div class="leg-fields">
          <label class="field">
            {{ isPhone ? $tx("Minutes") : $tx("Time underwater, minutes") }}
            <input
              type="number"
              min="1"
              step="any"
              placeholder="45"
              :value="draft.durationMinutes"
              @input="change('durationMinutes', $event.target.value)"
            />
          </label>
          <label class="field">
            {{ isPhone ? $tx("Pressure, bar") : $tx("Pressure out, bar") }}
            <input
              type="number"
              min="0"
              max="400"
              placeholder="70"
              :value="draft.endPressureBar"
              @input="change('endPressureBar', $event.target.value)"
            />
          </label>
        </div>
      </fieldset>
    </div>

    <div class="cols pad manual-words">
      <section class="main stack manual-about">
        <h2 class="h2">{{ $tx("About the dive") }}</h2>
        <dive-fields :draft="draft" manual :required="requiredFields" :buddies="buddies" :guides="guides" @change="change">
          <template #before>
            <site-field
              v-if="!isPhone"
              class="span-two"
              :model-value="draft.site"
              :label="$tx('Dive site, required')"
              :placeholder="$tx('Choose a saved site or type a new one')"
              :sites="diveSites"
              :create-site="createDiveSite"
              :search-location="searchLocation"
              @update:model-value="change('site', $event)"
            />
          </template>
        </dive-fields>
        <label class="field" :class="{ need: notesNeeded }">
          {{ notesNeeded ? $tx("Notes, required") : $tx("Notes") }}
          <textarea
            rows="3"
            :value="draft.notes"
            :placeholder="$tx('What did you see?')"
            @input="change('notes', $event.target.value)"
          ></textarea>
        </label>
      </section>
      <section class="side stack manual-end">
        <template v-if="equipmentEnabled && (!isPhone || step === 2)">
          <h2 class="h2">{{ $tx("Your usual kit") }}</h2>
          <kit-list :equipment="equipment" :selected="draft.equipment_ids" :date="startedAt" @change="change('equipment_ids', $event)" />
        </template>
        <ul v-if="attempted && stepIssues.length" class="warn" role="alert">
          <li v-for="issue in stepIssues" :key="issue.text">{{ issue.text }}</li>
        </ul>
        <div class="row">
          <button class="btn" type="submit" :disabled="creating">
            <template v-if="creating">{{ $tx("Saving…") }}</template>
            <template v-else-if="isPhone && step === 1">{{ $tx("Next: people and notes") }}</template>
            <template v-else>{{ $tx("Add to logbook") }}</template>
          </button>
          <button type="button" class="link desk-only" @click="$emit('cancel')">{{ $tx("Cancel") }}</button>
        </div>
      </section>
    </div>
  </form>
</template>

<style>
.manual-when {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 132px);
  gap: 14px 24px;
}

.descent {
  position: relative;
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px 24px;
  min-height: 380px;
  padding: 20px var(--gutter) 26px;
  overflow: hidden;
}

.app .descent-water {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: none;
  height: 100%;
}

.leg {
  position: relative;
  flex: 0 1 220px;
}

.leg legend {
  padding: 0 0 2px;
}

.leg-fields {
  display: grid;
  gap: 14px 18px;
}

.leg-bottom {
  flex-basis: 280px;
  margin-top: 170px !important;
}

.leg-bottom .leg-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
}

.manual-words {
  gap: 22px 56px;
}

.manual-end {
  flex-basis: 260px;
}

@media (max-width: 1000px) {
  .descent-water path {
    display: none;
  }
}

@media (max-width: 700px) {
  .manual-top {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .manual-when {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
  }

  .descent {
    display: block;
    min-height: 0;
    padding: 0;
  }

  .descent-water {
    display: none;
  }

  .leg {
    display: flow-root;
    width: 100%;
    margin-top: 0 !important;
    padding: 16px var(--gutter) 18px !important;
  }

  .leg legend {
    float: left;
    width: 100%;
    padding-bottom: 6px;
    font-size: 19px;
    font-weight: 700;
  }

  .leg-fields {
    clear: both;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
  }

  .leg-in {
    background: var(--shoal);
  }

  .leg-bottom {
    background: var(--mid);
  }

  .leg-up {
    background: var(--shelf);
  }

  .step-1 .manual-about,
  .step-2 .descent,
  .step-2 .manual-when {
    display: none;
  }

  .manual-end .btn {
    flex: 1;
  }

  .step-1 .manual-words {
    margin-top: auto;
    padding-top: 12px;
    padding-bottom: 12px;
  }
}
</style>

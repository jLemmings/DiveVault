<script>
import { averageDepthValue, diveSequenceNumber, importDraftSeed, isManualDive, pressureRange, primaryTank } from "~/shared/utils/core.js";
import { diveCoordinates, normalizeSiteName, savedSiteCoordinates } from "~/shared/utils/dive-map.js";
import { equipmentTitle, serviceWarning } from "~/shared/utils/equipment-dive.js";
import { bar, clockTime, dayMonthLong, degrees, formatNumber, metres, minutes, weekdayDate } from "~/shared/utils/format.js";
import { airUseOf, barUsed, gasOf, maxDepthOf, recorderOf, siteOf, waterTemperature } from "~/shared/utils/logbook.js";
import { PATHS, diveEditPath } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import DepthProfile from "~/shared/components/chart/DepthProfile.vue";
import ChartLink from "~/shared/components/ChartLink.vue";

// Computer dive-mode codes other than open circuit.
const DIVE_MODES = { 1: "Freedive", 2: "Gauge", 3: "CCR", 4: "SCR" };
const WEATHER_WORDS = {
  sun: "Sunny",
  sunny: "Sunny",
  clouds: "Cloudy",
  cloudy: "Cloudy",
  rain: "Rain",
  rainy: "Rain",
  wind: "Windy",
  windy: "Windy"
};

export default {
  name: "DiveDetailView",
  components: { TideLine, ChartNote, DepthProfile, ChartLink },
  props: {
    dive: { type: Object, required: true },
    allDives: { type: Array, default: () => [] },
    diveSites: { type: Array, default: () => [] },
    equipment: { type: Array, default: () => [] },
    deleting: Boolean,
    publicView: Boolean,
    status: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  emits: ["delete", "close"],
  data() {
    return { paths: PATHS };
  },
  computed: {
    draft() {
      return importDraftSeed(this.dive);
    },
    title() {
      return siteOf(this.dive) || this.$tx("No site");
    },
    number() {
      return diveSequenceNumber(this.dive, this.allDives) || "";
    },
    subtitle() {
      const base = { number: this.number, date: weekdayDate(this.dive.started_at, { year: true }), time: clockTime(this.dive.started_at) };
      if (isManualDive(this.dive)) return this.$tx("Dive {number}, {date} at {time}, logged by hand", base);
      const recorder = recorderOf(this.dive);
      if (!recorder) return this.$tx("Dive {number}, {date} at {time}", base);
      return /^[AEIO]/i.test(recorder)
        ? this.$tx("Dive {number}, {date} at {time}, from an {recorder}", { ...base, recorder })
        : this.$tx("Dive {number}, {date} at {time}, from a {recorder}", { ...base, recorder });
    },
    shortSubtitle() {
      return this.$tx("Dive {number}, {date} at {time}", {
        number: this.number,
        date: dayMonthLong(this.dive.started_at),
        time: clockTime(this.dive.started_at)
      });
    },
    readings() {
      const average = averageDepthValue(this.dive);
      const water = waterTemperature(this.dive);
      const readings = [{ value: metres(maxDepthOf(this.dive)), label: "deepest" }];
      if (average !== null) readings.push({ value: metres(average), label: "average" });
      readings.push({ value: minutes(this.dive.duration_seconds), label: "underwater" });
      if (water !== null) readings.push({ value: degrees(water), label: "water" });
      return readings;
    },
    phoneReadings() {
      const readings = this.readings.filter((reading) => ["underwater", "water"].includes(reading.label));
      const used = barUsed(this.dive);
      if (used !== null) readings.push({ value: bar(used), label: "used" });
      else readings.unshift(this.readings[0]);
      return readings;
    },
    weather() {
      const value = this.draft.weather_description.trim();
      const known = WEATHER_WORDS[value.toLowerCase()];
      return known ? this.$tx(known) : value;
    },
    coordinates() {
      const name = normalizeSiteName(siteOf(this.dive));
      const saved = name ? this.diveSites.find((site) => normalizeSiteName(site?.name) === name) : null;
      return savedSiteCoordinates(saved) || diveCoordinates(this.dive);
    },
    locationLabel() {
      if (!this.coordinates) return "";
      const { lat, lon } = this.coordinates;
      return `${formatNumber(Math.abs(lat), 2)} ${lat >= 0 ? "N" : "S"}, ${formatNumber(Math.abs(lon), 2)} ${lon >= 0 ? "E" : "W"}`;
    },
    logbookLines() {
      const { buddy, guide, visibility, wetsuit_description: suit, weight_description: weights } = this.draft;
      return [
        { label: "Buddy", value: buddy },
        { label: "Guide", value: guide },
        { label: "Weather", value: this.weather },
        { label: "Visibility", value: visibility },
        { label: "Suit", value: suit },
        { label: "Weights", value: weights }
      ].filter((line) => line.value.trim());
    },
    gasLines() {
      const lines = [];
      const gas = gasOf(this.dive);
      const tank = primaryTank(this.dive);
      const { begin, end } = pressureRange(this.dive);
      const rate = airUseOf(this.dive);
      const mode = isManualDive(this.dive) ? "" : DIVE_MODES[this.dive.fields?.dive_mode_code];
      if (mode) lines.push({ key: "mode", label: "Mode", value: this.$tx(mode) });
      if (gas) lines.push({ key: "gas", label: "Gas", value: `${this.$tx(gas.name)}${gas.mix}` });
      if (tank?.volume > 0)
        lines.push({ key: "tank", label: "Tank", value: `${formatNumber(tank.volume, Number.isInteger(tank.volume) ? 0 : 1)} L` });
      if (typeof begin === "number" && typeof end === "number") {
        lines.push({
          key: "pressure",
          label: "Pressure",
          value: this.$tx("{from} to {to} bar", { from: formatNumber(begin), to: formatNumber(end) })
        });
      }
      if (rate !== null) lines.push({ key: "air", label: "Air use", value: `${formatNumber(rate, 1)} L/min SAC` });
      return lines;
    },
    gearLines() {
      if (this.publicView) return [];
      const byId = new Map(this.equipment.map((item) => [String(item.id), item]));
      const used = this.draft.equipment_ids.map((id) => byId.get(id)).filter(Boolean);
      // Backups from older versions can carry a snapshot instead of ids.
      const items = used.length ? used : this.draft.equipment_snapshot;
      return items.map((item, index) => ({
        key: item.id || index,
        label: item.category || item.type || "Gear",
        value: equipmentTitle(item),
        warning: used.length ? serviceWarning(item, this.dive.started_at) : ""
      }));
    }
  },
  methods: {
    editPath() {
      return diveEditPath(this.dive.id);
    }
  }
};
</script>

<template>
  <article class="page dive">
    <header v-if="!publicView" class="land spread phone-only">
      <chart-link class="link" :to="paths.logbook">{{ $tx("Logbook") }}</chart-link>
      <chart-link class="link" :to="editPath()">{{ $tx("Edit") }}</chart-link>
    </header>
    <header class="topside dive-head">
      <div>
        <button v-if="publicView" type="button" class="link" @click="$emit('close')">{{ $tx("All dives") }}</button>
        <h1 class="h1 site display">{{ title }}</h1>
        <p class="soft big desk-only">{{ subtitle }}</p>
        <p class="soft phone-only">{{ shortSubtitle }}</p>
      </div>
      <div class="readings desk-only">
        <p v-for="reading in readings" :key="reading.label">
          <strong>{{ reading.value }}</strong><span>{{ $tx(reading.label) }}</span>
        </p>
      </div>
    </header>
    <tide-line />
    <chart-note :status="status" :error="error" />

    <depth-profile :dive="dive" />

    <div class="cols pad dive-words">
      <div class="readings phone-only">
        <p v-for="reading in phoneReadings" :key="reading.label">
          <strong>{{ reading.value }}</strong><span>{{ $tx(reading.label) }}</span>
        </p>
      </div>
      <section class="stack dive-notes">
        <h2 class="h2 desk-only">{{ $tx("Notes") }}</h2>
        <p v-if="draft.notes.trim()" class="dive-note">{{ draft.notes }}</p>
        <p v-else class="soft dive-note">{{ $tx("Nothing written for this dive.") }}</p>
        <div v-if="!publicView" class="row desk-only">
          <chart-link class="btn" :to="editPath()">{{ $tx("Edit logbook") }}</chart-link>
          <button type="button" class="link" :disabled="deleting" @click="$emit('delete')">{{ $tx("Delete dive") }}</button>
        </div>
      </section>
      <section v-if="logbookLines.length || coordinates" class="stack dive-facts">
        <h2 class="h2 desk-only">{{ $tx("Logbook") }}</h2>
        <dl class="kv">
          <template v-for="line in logbookLines" :key="line.label">
            <dt>{{ $tx(line.label) }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
          <template v-if="coordinates">
            <dt>{{ $tx("Location") }}</dt>
            <dd>
              <template v-if="publicView">{{ locationLabel }}</template>
              <chart-link v-else class="act" :to="paths.sites">{{ locationLabel }}</chart-link>
            </dd>
          </template>
        </dl>
      </section>
      <section v-if="gasLines.length || gearLines.length" class="stack dive-facts">
        <h2 class="h2">{{ $tx("Gas and gear") }}</h2>
        <dl class="kv">
          <template v-for="line in gasLines" :key="line.key">
            <dt>{{ $tx(line.label) }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
          <template v-for="line in gearLines" :key="line.key">
            <dt>{{ $tx(line.label) }}</dt>
            <dd>
              {{ line.value }}
              <span v-if="line.warning" class="warn gear-warning">{{ $tx(line.warning) }}</span>
            </dd>
          </template>
        </dl>
      </section>
      <button v-if="!publicView" type="button" class="link phone-only" :disabled="deleting" @click="$emit('delete')">
        {{ $tx("Delete dive") }}
      </button>
    </div>
  </article>
</template>

<style>
.dive-words {
  gap: 28px 56px;
}

.dive-notes {
  flex: 2 1 340px;
  min-width: 0;
}

.dive-facts {
  flex: 1 1 270px;
  min-width: 0;
}

.dive-note {
  max-width: 65ch;
  font-size: 22px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.gear-warning {
  display: block;
}

@media (max-width: 700px) {
  .dive-head {
    padding-top: 0;
    padding-bottom: 4px;
  }

  .dive-words {
    gap: 14px;
  }

  .dive-notes,
  .dive-facts {
    flex-basis: 100%;
  }

  .dive-note {
    font-size: 21px;
    line-height: 1.35;
  }

  .dive .kv {
    grid-template-columns: minmax(90px, max-content) minmax(0, 1fr);
    gap: 5px 12px;
  }
}
</style>

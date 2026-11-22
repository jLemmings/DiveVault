<script>
import { i18n } from "~/i18n/index.js";
import { equipmentTitle, gearService } from "~/shared/utils/equipment-dive.js";
import { shortDate } from "~/shared/utils/format.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import GearDepths from "./GearDepths.vue";
import GearDialog from "./GearDialog.vue";

const ORDER = { overdue: 0, due_soon: 1, serviced: 1, unknown: 2, untracked: 3 };

export default {
  name: "EquipmentView",
  components: { TideLine, ChartNote, GearDepths, GearDialog },
  props: {
    equipment: { type: Array, required: true },
    dives: { type: Array, required: true },
    loaded: Boolean,
    saving: Boolean,
    servicingId: { type: String, default: null },
    saveEquipment: { type: Function, required: true },
    markServiced: { type: Function, required: true },
    status: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  emits: ["retry"],
  data() {
    return { query: "", editing: null };
  },
  computed: {
    rows() {
      return this.equipment
        .map((item) => {
          const service = gearService(item, this.dives);
          const title = equipmentTitle(item) || this.$tx("Unnamed gear");
          const kind = item.category || item.type || "";
          return {
            id: String(item.id),
            item,
            service,
            title,
            kind,
            // Category names are the short form; a name is used where there is none.
            short: kind ? this.$tx(kind) : title,
            note: this.noteFor(service),
            overdue: service.status === "overdue",
            usual: Boolean(item.is_default || item.is_standard)
          };
        })
        .sort(
          (left, right) =>
            ORDER[left.service.status] - ORDER[right.service.status] ||
            right.service.urgency - left.service.urgency ||
            left.title.localeCompare(right.title)
        );
    },
    visible() {
      const query = this.query.trim().toLowerCase();
      if (!query) return this.rows;
      return this.rows.filter((row) =>
        [row.title, row.kind, row.item.brand, row.item.model, row.item.serial, row.item.service_tag].join(" ").toLowerCase().includes(query)
      );
    },
    heading() {
      if (!this.loaded) return this.$tx("Gear");
      if (!this.rows.length) return this.$tx("Hang up your gear");
      const overdue = this.rows.filter((row) => row.overdue);
      if (overdue.length > 1) return this.$tx("{count} pieces of gear are due for service", { count: overdue.length });
      if (overdue.length) {
        let gear = overdue[0].short;
        // English reads "your regulator" but keeps "your BCD"; German nouns keep their capital.
        if (i18n.locale === "en" && /^[A-Z][a-z]/.test(gear)) gear = gear[0].toLowerCase() + gear.slice(1);
        return this.$tx("Your {gear} is due for service", { gear });
      }
      if (this.rows.some((row) => row.usual && row.service.status === "unknown"))
        return this.$tx("Your usual kit is missing service dates");
      return this.$tx("Your gear is ready to dive");
    }
  },
  methods: {
    noteFor({ status, limitedBy, days, divesLeft }) {
      if (status === "untracked") return this.$tx("not tracked");
      if (status === "unknown") return this.$tx("no service date");
      if (limitedBy === "dives") {
        if (divesLeft === 0) return this.$tx("due now");
        if (divesLeft < 0) return this.$tn(-divesLeft, "{count} dive overdue", "{count} dives overdue");
        return this.$tn(divesLeft, "{count} dive left", "{count} dives left");
      }
      if (days === 0) return this.$tx("due today");
      const months = Math.round(Math.abs(days) / 30.44);
      if (days < 0) {
        return Math.abs(days) < 61
          ? this.$tn(-days, "{count} day overdue", "{count} days overdue")
          : this.$tn(months, "{count} month overdue", "{count} months overdue");
      }
      return days < 61
        ? this.$tn(days, "{count} day left", "{count} days left")
        : this.$tn(months, "{count} month left", "{count} months left");
    },
    lastLabel({ service }) {
      if (service.status === "untracked") return this.$tx("Not tracked");
      return service.last ? shortDate(service.last.toISOString()) : this.$tx("None");
    },
    everyLabel({ item, service }) {
      if (service.status === "untracked") return this.$tx("Not tracked");
      const months = Number(item.service_interval_months);
      const dives = Number(item.max_dives_before_service);
      const parts = [];
      if (months > 0) parts.push(this.$tn(months, "{count} month", "{count} months"));
      if (dives > 0) parts.push(this.$tn(dives, "{count} dive", "{count} dives"));
      if (!parts.length) return this.$tx("None");
      return parts.length === 2 ? this.$tx("{time} or {dives}", { time: parts[0], dives: parts[1] }) : parts[0];
    },
    openById(id) {
      const row = this.rows.find((entry) => entry.id === id);
      if (row) this.editing = { item: row.item };
    },
    async save(next) {
      const exists = this.equipment.some((item) => String(item.id) === String(next.id));
      const list = exists ? this.equipment.map((item) => (String(item.id) === String(next.id) ? next : item)) : [next, ...this.equipment];
      if (await this.saveEquipment(list)) this.editing = null;
    },
    async remove(item) {
      if (!window.confirm(this.$tx("Remove {gear}? This cannot be undone.", { gear: equipmentTitle(item) }))) return;
      if (await this.saveEquipment(this.equipment.filter((entry) => String(entry.id) !== String(item.id)))) this.editing = null;
    }
  }
};
</script>

<template>
  <section class="page">
    <div class="topside">
      <div>
        <h1 class="h1">{{ heading }}</h1>
        <p class="soft big">{{ $tx("Gear sinks as its service gets closer. Below the line, it is overdue.") }}</p>
      </div>
      <button type="button" class="btn line" :disabled="!loaded" @click="editing = { item: null }">{{ $tx("Add gear") }}</button>
    </div>
    <tide-line />
    <chart-note :status="status" :error="error" />
    <div v-if="!loaded" class="shoal pad stack fill">
      <button v-if="error" type="button" class="btn line" @click="$emit('retry')">{{ $tx("Try again") }}</button>
      <p v-else>{{ $tx("Loading your gear…") }}</p>
    </div>
    <template v-else>
      <gear-depths :rows="rows" @open="openById" />
      <div v-if="!rows.length" class="pad stack">
        <p class="big">{{ $tx("Add a regulator, computer or anything else you service, and tick what comes on every dive.") }}</p>
      </div>
      <section v-else class="pad stack kit-section">
        <div class="row end">
          <h2 class="h2 grow">{{ $tx("Kit list") }}</h2>
          <label class="field kit-search">
            {{ $tx("Find gear") }}<input v-model="query" type="search" :placeholder="$tx('Name, brand or serial')" />
          </label>
        </div>
        <p v-if="!visible.length" class="big">{{ $tx("No gear matches that.") }}</p>
        <div v-else class="scroll">
          <table class="log folds">
            <thead>
              <tr>
                <th>{{ $tx("Item") }}</th>
                <th>{{ $tx("Kind") }}</th>
                <th>{{ $tx("Serial") }}</th>
                <th>{{ $tx("Last service") }}</th>
                <th>{{ $tx("Every") }}</th>
                <th>{{ $tx("On every dive") }}</th>
                <th>
                  <span class="sr-only">{{ $tx("Actions") }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visible" :key="row.id" :class="{ sel: row.overdue }">
                <td class="free lead">
                  <strong>{{ row.title }}</strong>
                  <span v-if="row.item.service_tag" class="soft small gear-tag">{{ row.item.service_tag }}</span>
                </td>
                <td :data-label="$tx('Kind')">{{ row.kind ? $tx(row.kind) : $tx("None") }}</td>
                <td :data-label="$tx('Serial')" :class="{ soft: !row.item.serial }">{{ row.item.serial || $tx("None") }}</td>
                <td :data-label="$tx('Last service')" :class="row.overdue ? 'warn' : row.service.last ? '' : 'soft'">
                  {{ lastLabel(row) }}
                </td>
                <td :data-label="$tx('Every')" :class="{ soft: row.service.status === 'untracked' }">{{ everyLabel(row) }}</td>
                <td :data-label="$tx('On every dive')">{{ row.usual ? $tx("Yes") : $tx("No") }}</td>
                <td class="line-actions">
                  <button
                    v-if="row.service.status !== 'untracked'"
                    type="button"
                    class="link"
                    :disabled="saving || servicingId !== null"
                    @click="markServiced(row.id)"
                  >
                    {{ servicingId === row.id ? $tx("Saving…") : $tx("Mark serviced") }}
                  </button>
                  <button type="button" class="link" :disabled="saving" @click="editing = { item: row.item }">{{ $tx("Edit") }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <gear-dialog
      v-if="editing"
      :item="editing.item"
      :saving="saving"
      :error="error"
      @close="editing = null"
      @save="save"
      @remove="remove"
    />
  </section>
</template>

<style>
.kit-section {
  padding-top: 14px;
}

.kit-search {
  width: 280px;
}

.gear-tag {
  display: block;
}

@media (max-width: 700px) {
  .kit-search {
    width: 100%;
  }
}
</style>

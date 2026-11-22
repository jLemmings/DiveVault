<script>
import { buildDiveSequenceMap, importDraftSeed, numberOrZero, parseDate } from "~/shared/utils/core.js";
import { bar, dayMonth, dayMonthTime, degrees, formatNumber, metres, minutes, shortDate } from "~/shared/utils/format.js";
import { barUsed, logbookTotals, maxDepthOf, recorderOf, siteOf, waterTemperature } from "~/shared/utils/logbook.js";
import { PATHS, divePath } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import HangingDives from "~/shared/components/chart/HangingDives.vue";
import ChartLink from "~/shared/components/ChartLink.vue";
import FilterMenu from "./FilterMenu.vue";

const OPTIONAL_COLUMNS = [
  { key: "weather_description", label: "Weather" },
  { key: "visibility", label: "Visibility" },
  { key: "wetsuit_description", label: "Suit" },
  { key: "weight_description", label: "Weights" }
];
const NUMERIC_FIRST = ["number", "date", "depth", "time", "water", "used"];
const NEXT_PAGE_LABEL = { date: ["Newer dives", "Older dives"], other: ["Previous", "Next"] };

export default {
  name: "LogbookView",
  components: { TideLine, ChartNote, HangingDives, ChartLink, FilterMenu },
  props: {
    dives: { type: Array, required: true },
    waitingCount: { type: Number, default: 0 },
    truncated: Boolean,
    displayFields: { type: Array, default: () => [] },
    search: { type: String, default: "" },
    status: { type: String, default: "" },
    error: { type: String, default: "" }
  },
  emits: ["update:search"],
  data() {
    return {
      paths: PATHS,
      sortKey: "date",
      descending: true,
      siteFilters: [],
      buddyFilters: [],
      guideFilters: [],
      page: 0,
      pageSize: 10,
      pageSizes: [5, 10, 20, 50]
    };
  },
  computed: {
    totals() {
      return logbookTotals(this.dives);
    },
    hours() {
      return Math.round(this.totals.seconds / 3600);
    },
    headline() {
      const { count, seconds } = this.totals;
      if (this.truncated) return this.$tx("Your latest {count} dives", { count: formatNumber(count) });
      if (seconds < 5400) {
        return this.$tn(count, "{count} dive, {minutes} minutes underwater", "{count} dives, {minutes} minutes underwater", {
          minutes: Math.round(seconds / 60)
        });
      }
      return this.$tx("{count} dives, {hours} hours underwater", { count: formatNumber(count), hours: formatNumber(this.hours) });
    },
    // Translated whole, so each language puts the site where its grammar wants it; the site is set in italic.
    deepestWords() {
      const mark = "\u0001";
      const depth = metres(this.totals.deepest);
      if (!this.totals.deepestSite) return [this.$tx("Deepest {depth}.", { depth }), ""];
      return this.$tx("Deepest {depth} at {site}.", { depth, site: mark }).split(mark);
    },
    shortHeadline() {
      return this.$tn(this.totals.count, "{count} dive", "{count} dives");
    },
    shortSummary() {
      const underwater =
        this.totals.seconds < 5400 ? minutes(this.totals.seconds) : this.$tx("{hours} hours", { hours: formatNumber(this.hours) });
      return this.$tx("{underwater}, deepest {depth}", { underwater, depth: metres(this.totals.deepest) });
    },
    rows() {
      const numbers = buildDiveSequenceMap(this.dives);
      return this.dives.map((dive) => {
        const draft = importDraftSeed(dive);
        return {
          id: dive.id,
          number: numbers.get(String(dive.id)) || 0,
          started: parseDate(dive.started_at)?.getTime() || 0,
          startedAt: dive.started_at,
          site: siteOf(dive),
          buddy: draft.buddy.trim(),
          guide: draft.guide.trim(),
          depth: maxDepthOf(dive),
          seconds: numberOrZero(dive.duration_seconds),
          water: waterTemperature(dive),
          used: barUsed(dive),
          recorder: recorderOf(dive),
          vendor: dive.vendor || "",
          draft
        };
      });
    },
    filtered() {
      const query = this.search.trim().toLowerCase();
      const rows = this.rows.filter((row) => {
        if (this.siteFilters.length && !this.siteFilters.includes(row.site)) return false;
        if (this.buddyFilters.length && !this.buddyFilters.includes(row.buddy)) return false;
        if (this.guideFilters.length && !this.guideFilters.includes(row.guide)) return false;
        if (!query) return true;
        const recorder = row.recorder || this.$tx("By hand");
        return [row.site, row.buddy, row.guide, recorder, row.vendor, dayMonth(row.startedAt), shortDate(row.startedAt)]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
      const direction = this.descending ? -1 : 1;
      return rows.sort((left, right) => (this.compare(left, right) || numberOrZero(left.id) - numberOrZero(right.id)) * direction);
    },
    pageCount() {
      return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    },
    currentPage() {
      return Math.min(this.page, this.pageCount - 1);
    },
    shown() {
      const from = this.currentPage * this.pageSize;
      return this.filtered.slice(from, from + this.pageSize);
    },
    range() {
      const total = this.filtered.length;
      return this.$tx("Showing {from} to {to} of {total}", {
        from: total ? this.currentPage * this.pageSize + 1 : 0,
        to: Math.min((this.currentPage + 1) * this.pageSize, total),
        total
      });
    },
    pagerLabels() {
      const [back, forward] = NEXT_PAGE_LABEL[this.sortKey === "date" && this.descending ? "date" : "other"];
      return { back, forward };
    },
    columns() {
      return [
        { key: "number", label: "No." },
        { key: "date", label: "Date" },
        { key: "site", label: "Site" },
        { key: "buddy", label: "Buddy" },
        { key: "guide", label: "Guide" },
        { key: "depth", label: "Max depth", numeric: true },
        { key: "time", label: "Time", numeric: true },
        { key: "water", label: "Water", numeric: true },
        { key: "used", label: "Used", numeric: true },
        { key: "recorder", label: "Recorded by" }
      ];
    },
    optionalColumns() {
      return OPTIONAL_COLUMNS.filter((column) => this.displayFields.includes(column.key));
    },
    siteOptions() {
      return this.namesOf("site");
    },
    buddyOptions() {
      return this.namesOf("buddy");
    },
    guideOptions() {
      return this.namesOf("guide");
    }
  },
  watch: {
    search() {
      this.page = 0;
    },
    siteFilters() {
      this.page = 0;
    },
    buddyFilters() {
      this.page = 0;
    },
    guideFilters() {
      this.page = 0;
    },
    pageSize() {
      this.page = 0;
    }
  },
  methods: {
    bar,
    dayMonth,
    dayMonthTime,
    degrees,
    metres,
    minutes,
    divePath,
    compare(left, right) {
      const key = { date: "started", time: "seconds" }[this.sortKey] || this.sortKey;
      const first = left[key];
      const second = right[key];
      if (["site", "buddy", "guide", "recorder"].includes(key))
        return String(first).localeCompare(String(second), undefined, { sensitivity: "base" });
      return (first ?? -1) - (second ?? -1);
    },
    sortBy(key) {
      this.descending = this.sortKey === key ? !this.descending : NUMERIC_FIRST.includes(key);
      this.sortKey = key;
      this.page = 0;
    },
    heading(column) {
      const label = this.$tx(column.label);
      if (column.key !== this.sortKey || column.key !== "date") return label;
      return this.descending ? this.$tx("Date, newest first") : this.$tx("Date, oldest first");
    },
    namesOf(key) {
      return [...new Set(this.rows.map((row) => row[key]).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })
      );
    },
    open(id) {
      this.$router.push(divePath(id));
    },
    openRow(event, id) {
      if (event.target.closest("a") || window.getSelection()?.toString()) return;
      this.open(id);
    }
  }
};
</script>

<template>
  <section class="page logbook">
    <div v-if="!dives.length" class="topside">
      <div>
        <h1 class="h1">{{ $tx("Your logbook starts at the surface") }}</h1>
        <p class="soft big">{{ $tx("Log a dive by hand, or bring dives from your computer.") }}</p>
      </div>
      <chart-link v-if="waitingCount" class="link big" :to="paths.imports">
        {{ $tn(waitingCount, "Finish {count} imported dive", "Finish {count} imported dives") }}
      </chart-link>
    </div>
    <div v-else class="topside logbook-head">
      <div>
        <h1 class="h1">
          <span class="desk-only">{{ headline }}</span><span class="phone-only">{{ shortHeadline }}</span>
        </h1>
        <p class="soft big desk-only">
          <template v-if="totals.deepest !== null">
            {{ deepestWords[0] }}<span class="site">{{ totals.deepestSite }}</span
            >{{ deepestWords[1] }}
          </template>
          <template v-if="totals.bar">{{ ` ${$tx("{pressure} breathed.", { pressure: bar(totals.bar) })}` }}</template>
        </p>
        <p class="soft phone-only">{{ shortSummary }}</p>
      </div>
      <chart-link v-if="waitingCount" class="link big desk-only" :to="paths.imports">
        {{ $tn(waitingCount, "Finish {count} imported dive", "Finish {count} imported dives") }}
      </chart-link>
    </div>
    <tide-line />
    <chart-note :status="status" :error="error" />

    <template v-if="!dives.length">
      <div class="shoal pad row empty-band">
        <chart-link class="btn" :to="paths.create">{{ $tx("Log your first dive") }}</chart-link>
        <chart-link class="btn line" :to="paths.importFile">{{ $tx("Import a file") }}</chart-link>
      </div>
      <div class="mid empty-band"></div>
      <div class="shelf empty-band"></div>
    </template>
    <template v-else>
      <hanging-dives :dives="dives" @open="open" />

      <div class="pad stack every-dive">
        <div class="row end logbook-tools">
          <h2 class="h2 grow">{{ $tx("Every dive") }}</h2>
          <label class="field logbook-search">
            {{ $tx("Search") }}
            <input
              type="search"
              :value="search"
              :placeholder="$tx('Site, buddy or guide')"
              @input="$emit('update:search', $event.target.value)"
            />
          </label>
          <filter-menu v-model="siteFilters" :label="$tx('Site')" :all="$tx('All sites')" :options="siteOptions" />
          <filter-menu v-model="buddyFilters" :label="$tx('Buddy')" :all="$tx('All buddies')" :options="buddyOptions" />
          <filter-menu v-model="guideFilters" :label="$tx('Guide')" :all="$tx('All guides')" :options="guideOptions" />
          <label class="field phone-only">
            {{ $tx("Sort by") }}
            <select :value="sortKey" @change="sortBy($event.target.value)">
              <option v-for="column in columns" :key="column.key" :value="column.key">{{ $tx(column.label) }}</option>
            </select>
          </label>
          <button type="button" class="link phone-only" @click="sortBy(sortKey)">
            {{ descending ? $tx("Highest or newest first") : $tx("Lowest or oldest first") }}
          </button>
        </div>

        <p v-if="!filtered.length" class="big">{{ $tx("No dives match. Clear the search or a filter to see more.") }}</p>
        <template v-else>
          <div class="scroll desk-only">
            <table class="log">
              <thead>
                <tr>
                  <th
                    v-for="column in columns"
                    :key="column.key"
                    :class="{ n: column.numeric }"
                    :aria-sort="sortKey === column.key ? (descending ? 'descending' : 'ascending') : undefined"
                  >
                    <button type="button" @click="sortBy(column.key)">{{ heading(column) }}</button>
                  </th>
                  <th v-for="column in optionalColumns" :key="column.key">{{ $tx(column.label) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, index) in shown"
                  :key="row.id"
                  class="open"
                  :class="{ sel: index === 0 && currentPage === 0 && sortKey === 'date' && descending }"
                  @click="openRow($event, row.id)"
                >
                  <td>{{ row.number }}</td>
                  <td>{{ dayMonthTime(row.startedAt) }}</td>
                  <td class="site">
                    <chart-link :to="divePath(row.id)">{{ row.site || $tx("No site") }}</chart-link>
                  </td>
                  <td>{{ row.buddy }}</td>
                  <td>{{ row.guide }}</td>
                  <td class="n">{{ metres(row.depth) }}</td>
                  <td class="n">{{ minutes(row.seconds) }}</td>
                  <td class="n">{{ degrees(row.water) }}</td>
                  <td class="n">{{ bar(row.used) }}</td>
                  <td>{{ row.recorder || $tx("By hand") }}</td>
                  <td v-for="column in optionalColumns" :key="column.key" class="free">{{ row.draft[column.key] }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul class="list phone-only dive-lines">
            <li v-for="row in shown" :key="row.id">
              <chart-link class="dive-line" :to="divePath(row.id)">
                <span class="site big">{{ row.site || $tx("No site") }}</span>
                <span>{{ metres(row.depth) }}, {{ minutes(row.seconds) }}</span>
                <span class="soft"
                  >{{ dayMonth(row.startedAt) }}<template v-if="row.buddy">, {{ row.buddy }}</template></span
                >
                <span v-for="column in optionalColumns" v-show="row.draft[column.key]" :key="column.key" class="soft extra">
                  {{ $tx(column.label) }}: {{ row.draft[column.key] }}
                </span>
              </chart-link>
            </li>
          </ul>

          <div class="row between">
            <span class="soft">{{ range }}</span>
            <div class="row">
              <label class="rows-per-page soft">
                {{ $tx("Dives per page") }}
                <select v-model.number="pageSize">
                  <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
                </select>
              </label>
              <button v-if="currentPage > 0" type="button" class="link" @click="page = currentPage - 1">{{ $tx(pagerLabels.back) }}</button>
              <button v-if="currentPage < pageCount - 1" type="button" class="link" @click="page = currentPage + 1">
                {{ $tx(pagerLabels.forward) }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style>
.logbook-head {
  align-items: center;
  padding-top: 16px;
  padding-bottom: 10px;
}

.every-dive {
  padding-top: 8px;
}

.logbook-search {
  width: 250px;
}

.logbook-tools .filter {
  width: 150px;
}

.rows-per-page {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rows-per-page select {
  min-height: 44px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-weight: 700;
}

.empty-band {
  min-height: 110px;
}

.dive-lines {
  flex-direction: column;
}

.dive-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0 12px;
  overflow-wrap: anywhere;
}

.dive-line .extra {
  grid-column: 1 / -1;
}

@media (max-width: 1024px) {
  .logbook-tools > .h2 {
    flex-basis: 100%;
  }

  .logbook-tools > .logbook-search {
    flex: 2 1 180px;
  }

  .logbook-tools > .filter {
    flex: 1 1 120px;
  }
}

@media (max-width: 700px) {
  .logbook-head {
    padding-top: 8px;
    padding-bottom: 4px;
  }

  .every-dive {
    padding-top: 16px;
  }

  .logbook-tools {
    gap: 10px 14px;
  }

  .logbook-tools > * {
    flex: 1 1 140px;
    min-width: 0;
  }

  .logbook-tools > .h2,
  .logbook-tools > .logbook-search {
    flex-basis: 100%;
  }
}
</style>

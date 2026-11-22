<script>
import { DiveDetailView } from "~/features/logbook/index.js";
import { parseJson, apiError } from "~/shared/api/client.js";
import { publicDiverUrl } from "~/shared/api/endpoints.js";
import { isCommittedDive } from "~/shared/utils/core.js";
import { diveCoordinates } from "~/shared/utils/dive-map.js";
import { formatNumber, longDate, metres, minutes } from "~/shared/utils/format.js";
import { logbookTotals, maxDepthOf, newestFirst, siteOf } from "~/shared/utils/logbook.js";
import { buildSites } from "~/shared/utils/sites.js";
import { PATHS } from "~/routing/routes.js";
import BrandMark from "~/shared/components/chart/BrandMark.vue";
import TideLine from "~/shared/components/chart/TideLine.vue";
import SeaSwell from "~/shared/components/chart/SeaSwell.vue";
import HangingDives from "~/shared/components/chart/HangingDives.vue";
import SiteChart from "~/shared/components/chart/SiteChart.vue";
import ChartLink from "~/shared/components/ChartLink.vue";

const FIRST_LINES = 20;

export default {
  name: "PublicProfileView",
  components: { DiveDetailView, BrandMark, TideLine, SeaSwell, HangingDives, SiteChart, ChartLink },
  props: { slug: { type: String, default: "" } },
  data() {
    return {
      paths: PATHS,
      loading: true,
      error: "",
      diver: null,
      dives: [],
      selectedId: null,
      selectedSite: "",
      chartShown: false,
      allShown: false
    };
  },
  computed: {
    selectedDive() {
      return this.dives.find((dive) => String(dive.id) === String(this.selectedId)) || null;
    },
    title() {
      return this.diver?.name ? this.$tx("{name}'s dives", { name: this.diver.name }) : this.$tx("A diver's logbook");
    },
    totals() {
      return logbookTotals(this.dives);
    },
    timeUnderwater() {
      const { seconds } = this.totals;
      return seconds < 5400 ? minutes(seconds) : `${formatNumber(Math.round(seconds / 3600))} h`;
    },
    lines() {
      return this.allShown ? this.dives : this.dives.slice(0, FIRST_LINES);
    },
    sites() {
      return buildSites([], this.dives);
    },
    hasPositions() {
      return this.dives.some((dive) => diveCoordinates(dive));
    }
  },
  watch: {
    slug: { immediate: true, handler: "load" }
  },
  methods: {
    longDate,
    metres,
    minutes,
    maxDepthOf,
    siteOf,
    // Saved locations aren't published, so there is only what the dive itself says.
    place(dive) {
      const location = dive.fields?.location;
      if (typeof location === "string") return location;
      if (location?.name) return location.name;
      const position = diveCoordinates(dive);
      if (!position) return "";
      const { lat, lon } = position;
      return `${formatNumber(Math.abs(lat), 2)} ${lat >= 0 ? "N" : "S"}, ${formatNumber(Math.abs(lon), 2)} ${lon >= 0 ? "E" : "W"}`;
    },
    async load() {
      this.loading = true;
      this.error = "";
      this.selectedId = null;
      try {
        const response = await fetch(publicDiverUrl(this.slug), { credentials: "omit" });
        const payload = await parseJson(response);
        if (!response.ok) throw apiError(payload, response);
        this.diver = payload?.diver || null;
        // Only finished dives are drawn: imports that are still waiting are not for showing.
        this.dives = newestFirst((Array.isArray(payload?.dives) ? payload.dives : []).filter(isCommittedDive));
      } catch (error) {
        this.error = error?.message || "Could not load the public logbook.";
        this.dives = [];
      } finally {
        this.loading = false;
      }
    },
    open(id) {
      this.selectedId = id;
      window.scrollTo(0, 0);
    },
    openRow(event, id) {
      if (!event.target.closest("button")) this.open(id);
    }
  }
};
</script>

<template>
  <div class="app public">
    <sea-swell />
    <header class="land spread public-top">
      <chart-link class="brand" :to="paths.logbook"><brand-mark />DiveVault</chart-link>
      <chart-link class="link" :to="paths.logbook">{{ $tx("Sign in") }}</chart-link>
    </header>
    <main>
      <template v-if="loading || error">
        <div class="topside">
          <h1 class="h1">{{ error ? $tx("This logbook isn't public") : $tx("Reading the logbook…") }}</h1>
        </div>
        <tide-line />
        <p v-if="error" class="pad big" role="alert">{{ $tx(error) }}</p>
      </template>
      <dive-detail-view v-else-if="selectedDive" :dive="selectedDive" :all-dives="dives" public-view @close="selectedId = null" />
      <template v-else>
        <div class="topside public-head">
          <h1 class="h1 display">{{ title }}</h1>
          <div class="readings">
            <p>
              <strong>{{ totals.count }}</strong><span>{{ totals.count === 1 ? $tx("dive") : $tx("dives") }}</span>
            </p>
            <p>
              <strong>{{ timeUnderwater }}</strong><span>{{ $tx("underwater") }}</span>
            </p>
            <p v-if="totals.deepest !== null">
              <strong>{{ metres(totals.deepest) }}</strong><span>{{ $tx("deepest") }}</span>
            </p>
          </div>
        </div>
        <tide-line />
        <p v-if="!dives.length" class="pad big">{{ $tx("No finished dives to show yet.") }}</p>
        <template v-else>
          <hanging-dives :dives="dives" plumb @open="open" />
          <section class="pad stack public-log">
            <div class="row between">
              <h2 class="h2">{{ $tx("Logbook") }}</h2>
              <button v-if="hasPositions" type="button" class="link" :aria-expanded="chartShown" @click="chartShown = !chartShown">
                {{ chartShown ? $tx("Hide the chart of sites") : $tx("Show the chart of sites") }}
              </button>
            </div>
            <site-chart v-if="chartShown" :sites="sites" :selected-key="selectedSite" @select="selectedSite = $event" />
            <div class="scroll">
              <table class="log folds">
                <thead>
                  <tr>
                    <th>{{ $tx("Date") }}</th>
                    <th>{{ $tx("Site") }}</th>
                    <th>{{ $tx("Location") }}</th>
                    <th class="n">{{ $tx("Max depth") }}</th>
                    <th class="n">{{ $tx("Time") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="dive in lines" :key="dive.id" class="open" @click="openRow($event, dive.id)">
                    <td>{{ longDate(dive.started_at) }}</td>
                    <td class="site">
                      <button type="button" class="public-site" @click="open(dive.id)">{{ siteOf(dive) || $tx("No site") }}</button>
                    </td>
                    <td :data-label="place(dive) ? $tx('Location') : undefined">{{ place(dive) }}</td>
                    <td class="n" :data-label="$tx('Max depth')">{{ metres(maxDepthOf(dive)) }}</td>
                    <td class="n" :data-label="$tx('Time')">{{ minutes(dive.duration_seconds) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="lines.length < dives.length" type="button" class="link" @click="allShown = true">
              {{ $tx("Show all {count} dives", { count: dives.length }) }}
            </button>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>

<style>
.public-head {
  padding-top: 24px;
  padding-bottom: 12px;
}

.public-log {
  padding-top: 8px;
  padding-bottom: 100px;
}

.public-log .site-chart {
  min-height: 480px;
}

.public-site {
  padding: 0;
  border: 0;
  background: none;
  font-style: italic;
}

@media (max-width: 700px) {
  .public-log .n {
    text-align: left;
  }
}
</style>

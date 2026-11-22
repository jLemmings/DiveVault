<script>
import { numericCoordinate, normalizeSiteName, validCoordinates } from "~/shared/utils/dive-map.js";
import { dayMonthLong } from "~/shared/utils/format.js";
import { buildSites } from "~/shared/utils/sites.js";
import { divePath } from "~/routing/routes.js";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import SiteChart from "~/shared/components/chart/SiteChart.vue";
import ChartLink from "~/shared/components/ChartLink.vue";
import SiteDialog from "~/shared/components/logbook/SiteDialog.vue";

const LIST_LENGTH = 6;

function sitePayload(site) {
  return {
    id: site.id,
    name: site.name,
    location: site.location || "",
    country: site.country || "",
    latitude: site.latitude ?? null,
    longitude: site.longitude ?? null
  };
}

function draftOf(site) {
  return {
    name: site?.name || "",
    location: site?.saved?.location || "",
    country: site?.saved?.country || "",
    latitude: site?.coordinates ? String(Number(site.coordinates.lat.toFixed(6))) : "",
    longitude: site?.coordinates ? String(Number(site.coordinates.lon.toFixed(6))) : ""
  };
}

export default {
  name: "SitesView",
  components: { TideLine, ChartNote, SiteChart, ChartLink, SiteDialog },
  props: {
    dives: { type: Array, required: true },
    savedSites: { type: Array, required: true },
    loaded: Boolean,
    loadError: { type: String, default: "" },
    saveProfile: { type: Function, required: true },
    searchLocation: { type: Function, required: true }
  },
  emits: ["retry", "show-dives"],
  data() {
    return {
      pickedKey: "",
      draft: draftOf(null),
      query: "",
      showAll: false,
      adding: false,
      renaming: false,
      saving: false,
      searching: false,
      status: "",
      error: ""
    };
  },
  computed: {
    sites() {
      return buildSites(this.savedSites, this.dives);
    },
    selected() {
      return this.sites.find((site) => site.key === this.pickedKey) || this.sites.find((site) => site.name) || this.sites[0] || null;
    },
    selectedKey() {
      return this.selected?.key || "";
    },
    changed() {
      return Boolean(this.selected) && JSON.stringify(this.draft) !== JSON.stringify(draftOf(this.selected));
    },
    chartDraft() {
      if (!this.selected?.name || !this.loaded) return null;
      const lat = numericCoordinate(this.draft.latitude);
      const lon = numericCoordinate(this.draft.longitude);
      return { key: this.selectedKey, name: this.draft.name, coordinates: validCoordinates(lat, lon) ? { lat, lon } : null };
    },
    summary() {
      const { count, last } = this.selected;
      if (!count) return this.$tx("No dives here yet.");
      if (!last) return this.$tn(count, "{count} dive.", "{count} dives.");
      return this.$tn(count, "{count} dive, on {date}.", "{count} dives, last on {date}.", { date: dayMonthLong(last) });
    },
    matches() {
      const query = this.query.trim().toLowerCase();
      return this.sites.filter((site) => {
        if (site.key === this.selectedKey && !query) return false;
        return !query || [site.name, site.saved?.location, site.saved?.country].join(" ").toLowerCase().includes(query);
      });
    },
    listed() {
      return this.showAll || this.query ? this.matches : this.matches.slice(0, LIST_LENGTH);
    }
  },
  watch: {
    selectedKey: {
      immediate: true,
      handler() {
        this.draft = draftOf(this.selected);
        this.renaming = false;
      }
    },
    savedSites() {
      this.draft = draftOf(this.selected);
    }
  },
  methods: {
    divePath,
    pick(key) {
      if (key === this.selectedKey) return;
      if (this.changed && !window.confirm(this.$tx("Leave this site without saving your changes?"))) return;
      this.pickedKey = key;
      this.status = "";
      this.error = "";
    },
    place({ lat, lon }) {
      this.draft = { ...this.draft, latitude: String(lat), longitude: String(lon) };
    },
    async write(list, message) {
      await this.saveProfile({ dive_sites: list.map(sitePayload) });
      this.status = message;
    },
    async add(site) {
      if (this.savedSites.some((entry) => normalizeSiteName(entry.name) === normalizeSiteName(site.name))) {
        throw new Error("A site with that name is already saved.");
      }
      const id = `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await this.write([...this.savedSites, { id, ...site }], "Site saved.");
      return site;
    },
    added(name) {
      this.adding = false;
      this.pickedKey = normalizeSiteName(name);
    },
    async save() {
      const { saved } = this.selected;
      const name = this.draft.name.trim();
      const key = normalizeSiteName(name);
      const blank = !String(this.draft.latitude).trim() && !String(this.draft.longitude).trim();
      const latitude = numericCoordinate(this.draft.latitude);
      const longitude = numericCoordinate(this.draft.longitude);
      this.status = "";
      this.error = "";
      if (!name) {
        this.error = "Enter a name for the site.";
        return;
      }
      if (!blank && !validCoordinates(latitude, longitude)) {
        this.error = "Enter both latitude and longitude, or neither.";
        return;
      }
      if (this.savedSites.some((entry) => entry !== saved && normalizeSiteName(entry.name) === key)) {
        this.error = "A site with that name is already saved.";
        return;
      }
      const next = {
        id: saved?.id || `site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        location: this.draft.location.trim(),
        country: this.draft.country.trim(),
        latitude: blank ? null : latitude,
        longitude: blank ? null : longitude
      };
      this.saving = true;
      try {
        const list = saved ? this.savedSites.map((entry) => (entry === saved ? next : entry)) : [...this.savedSites, next];
        this.pickedKey = key;
        await this.write(list, "Site saved.");
      } catch (error) {
        this.error = error?.message || "Could not save the site.";
      } finally {
        this.saving = false;
      }
    },
    async remove() {
      const { saved, name } = this.selected;
      if (!window.confirm(this.$tx("Remove {site} from your saved sites? Dives there keep the name.", { site: name }))) return;
      this.saving = true;
      this.error = "";
      try {
        await this.write(
          this.savedSites.filter((entry) => entry !== saved),
          "Site removed."
        );
      } catch (error) {
        this.error = error?.message || "Could not remove the site.";
      } finally {
        this.saving = false;
      }
    },
    async find() {
      const query = [this.draft.location, this.draft.country]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
      this.status = "";
      this.error = "";
      if (!query) {
        this.error = "Enter a location to search for.";
        return;
      }
      this.searching = true;
      try {
        const result = await this.searchLocation(query);
        if (!result) {
          this.error = this.$tx("Nothing found for {place}.", { place: query });
          return;
        }
        this.draft = {
          ...this.draft,
          country: typeof result.country === "string" && result.country ? result.country : this.draft.country,
          latitude: String(result.latitude),
          longitude: String(result.longitude)
        };
        this.status = "Found it. Save the site to keep the position.";
      } catch (error) {
        this.error = error?.message || "Could not search for that location.";
      } finally {
        this.searching = false;
      }
    }
  }
};
</script>

<template>
  <section class="page">
    <tide-line />
    <chart-note :status="status" :error="error" />
    <div v-if="!loaded && loadError" class="note bad" role="alert">
      <p>{{ $tx(loadError) }}</p>
      <button type="button" class="link" @click="$emit('retry')">{{ $tx("Try again") }}</button>
    </div>
    <div class="cols fill sites-layout">
      <site-chart class="main" :sites="sites" :selected-key="selectedKey" :draft="chartDraft" @select="pick" @move="place" />
      <aside class="side pad stack sites-side">
        <div class="row between">
          <h1 class="h1">{{ $tx("Sites") }}</h1>
          <button type="button" class="btn line" :disabled="!loaded" @click="adding = true">{{ $tx("Add a site") }}</button>
        </div>

        <p v-if="!selected" class="big">{{ $tx("No sites yet. Add one, or name the site when you log a dive.") }}</p>
        <form v-else class="stack" @submit.prevent="save">
          <div class="row between site-name">
            <h2 class="h2 site act wrap-anywhere-text">{{ selected.name || $tx("No site") }}</h2>
            <button v-if="loaded && selected.saved && !renaming" type="button" class="link" @click="renaming = true">
              {{ $tx("Rename") }}
            </button>
          </div>
          <p>
            {{ summary }}
            <chart-link v-if="!selected.name && selected.lastId" class="link inline" :to="divePath(selected.lastId)">{{
              $tx("Open the dive")
            }}</chart-link>
            <button v-else-if="selected.count" type="button" class="link inline" @click="$emit('show-dives', selected.name)">
              {{ $tx("Show them") }}
            </button>
          </p>
          <template v-if="selected.name && loaded">
            <label v-if="renaming" class="field">{{ $tx("Site name") }}<input v-model="draft.name" /></label>
            <div class="form pair">
              <label class="field">{{ $tx("Location") }}<input v-model="draft.location" /></label>
              <label class="field">{{ $tx("Country") }}<input v-model="draft.country" /></label>
              <label class="field">{{ $tx("Latitude") }}<input v-model="draft.latitude" inputmode="decimal" /></label>
              <label class="field">{{ $tx("Longitude") }}<input v-model="draft.longitude" inputmode="decimal" /></label>
            </div>
            <div class="row site-actions">
              <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save site") }}</button>
              <button type="button" class="link" :disabled="searching" @click="find">
                {{ searching ? $tx("Searching…") : $tx("Find by location") }}
              </button>
              <button v-if="selected.saved" type="button" class="link" :disabled="saving" @click="remove">{{ $tx("Remove") }}</button>
            </div>
            <p class="soft small">
              {{
                chartDraft?.coordinates
                  ? $tx("You can also drag the marker on the chart.")
                  : $tx("You can also click the chart to place it.")
              }}
            </p>
          </template>
        </form>

        <template v-if="sites.length">
          <label class="field">
            {{ $tx("Find a saved site") }}
            <input v-model="query" type="search" :placeholder="$tx('Name, location or country')" />
          </label>
          <ul class="list">
            <li v-for="site in listed" :key="site.key">
              <button type="button" class="site-line" @click="pick(site.key)">
                <span class="site big" :class="{ act: site.key === selectedKey }">{{ site.name || $tx("No site") }}</span>
                <span :class="site.coordinates ? 'soft' : 'warn'">
                  {{
                    site.coordinates
                      ? $tn(site.count, "{count} dive", "{count} dives")
                      : $tn(site.count, "{count} dive, not on the chart yet", "{count} dives, not on the chart yet")
                  }}
                </span>
              </button>
            </li>
          </ul>
          <p v-if="query && !matches.length" class="soft">{{ $tx("No site matches that.") }}</p>
          <button v-if="!query && !showAll && matches.length > listed.length" type="button" class="link" @click="showAll = true">
            {{ $tx("Show all {count} sites", { count: sites.length }) }}
          </button>
        </template>
      </aside>
    </div>

    <site-dialog v-if="adding" :save="add" :search-location="searchLocation" @close="adding = false" @saved="added" />
  </section>
</template>

<style>
.sites-side {
  flex-basis: 420px;
}

.sites-layout {
  min-height: calc(100vh - 110px);
}

.sites-layout > .site-chart {
  min-height: 480px;
}

.site-name {
  margin-bottom: -8px;
}

.site-actions {
  gap: 4px 20px;
}

.site-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0 24px;
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
}

.site-line .site {
  overflow-wrap: anywhere;
}

.site-line:hover .site {
  text-decoration: underline;
  text-underline-offset: 4px;
}

@media (max-width: 700px) {
  .sites-layout {
    display: block;
  }

  .sites-layout > .site-chart {
    min-height: 340px;
  }
}
</style>

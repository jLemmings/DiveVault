<script>
import { loadLeaflet } from "~/shared/utils/leaflet-loader.js";
import { PLACE_LABELS_URL, createChartLayer } from "~/shared/utils/chart-tiles.js";
import { escapeHtml } from "~/shared/utils/dive-map.js";

const LABEL_GAP = 9;

function overlaps(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

// Sites drawn as soundings: the deepest dive at each, with the decimal dropped as on a nautical chart.
export default {
  name: "SiteChart",
  props: {
    sites: { type: Array, required: true },
    selectedKey: { type: String, default: "" },
    // The site being edited: its marker can be dragged, or clicked into place if it has none.
    draft: { type: Object, default: null }
  },
  emits: ["select", "move"],
  data() {
    return { failed: false };
  },
  computed: {
    plotted() {
      const placed = this.sites.filter((site) => site.coordinates).map((site) => ({ ...site }));
      if (!this.draft) return placed;
      const editing = placed.find((site) => site.key === this.draft.key);
      if (editing && this.draft.coordinates) editing.coordinates = this.draft.coordinates;
      else if (!editing && this.draft.coordinates) {
        placed.push({ key: this.draft.key, name: this.draft.name, deepest: null, count: 0, coordinates: this.draft.coordinates });
      }
      return placed;
    }
  },
  watch: {
    plotted() {
      this.drawSites();
    },
    selectedKey() {
      this.drawSites();
      this.reveal();
    }
  },
  async mounted() {
    try {
      this.L = await loadLeaflet();
      if (!this.$refs.canvas) return;
      this.createMap();
    } catch {
      this.failed = true;
    }
  },
  beforeUnmount() {
    this.themeObserver?.disconnect();
    this.sizeObserver?.disconnect();
    this.map?.remove();
    this.map = null;
  },
  methods: {
    createMap() {
      const { L } = this;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.map = L.map(this.$refs.canvas, {
        zoomControl: false,
        zoomSnap: 0.5,
        minZoom: 2,
        maxZoom: 16,
        worldCopyJump: true,
        zoomAnimation: !reduced,
        fadeAnimation: !reduced,
        markerZoomAnimation: !reduced
      });
      this.map.attributionControl.setPrefix(false);
      L.control.zoom({ position: "topright", zoomInTitle: this.$tx("Zoom in"), zoomOutTitle: this.$tx("Zoom out") }).addTo(this.map);
      this.water = createChartLayer(L).addTo(this.map);
      L.tileLayer(PLACE_LABELS_URL, {
        maxNativeZoom: 16,
        maxZoom: 16,
        className: "site-chart-places",
        referrerPolicy: "origin",
        attribution: "Esri, HERE, Garmin, OpenStreetMap"
      }).addTo(this.map);
      this.markers = L.layerGroup().addTo(this.map);
      this.map.on("click", (event) => {
        // A click only places a site that has no position yet; after that it takes a deliberate drag.
        if (this.draft && !this.draft.coordinates) this.move(event.latlng);
      });
      this.map.on("zoomend", () => this.placeLabels());
      this.map.setView([20, 10], 2.5);
      this.frame();
      this.drawSites();
      this.themeObserver = new MutationObserver(() => this.water.redraw());
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      this.sizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize({ pan: false });
        if (!this.framed) this.frame();
      });
      this.sizeObserver.observe(this.$refs.canvas);
    },
    // Open on the waters dived most: one far-off trip should not shrink the chart to the whole world.
    frame() {
      const { L, map } = this;
      if (!map || !this.plotted.length || !map.getSize().y) return;
      const focus = this.plotted.find((site) => site.key === this.selectedKey) || this.plotted[0];
      const nearby = this.plotted.filter(
        (site) => Math.abs(site.coordinates.lat - focus.coordinates.lat) < 12 && Math.abs(site.coordinates.lon - focus.coordinates.lon) < 14
      );
      const bounds = L.latLngBounds(nearby.map((site) => [site.coordinates.lat, site.coordinates.lon]));
      map.fitBounds(bounds, { padding: [70, 70], maxZoom: 10, animate: false });
      this.framed = true;
    },
    reveal() {
      const site = this.plotted.find((entry) => entry.key === this.selectedKey);
      if (!this.map || !site) return;
      const position = [site.coordinates.lat, site.coordinates.lon];
      if (!this.map.getBounds().pad(-0.06).contains(position)) this.map.setView(position, Math.max(7, this.map.getZoom()));
    },
    markerHtml(site, selected) {
      let sounding = "";
      if (typeof site.deepest === "number") {
        const [whole, part] = site.deepest.toFixed(1).split(".");
        sounding = `<b>${whole}<sub>${part}</sub></b>`;
      }
      const words = `<span class="sounding-words"><i>${escapeHtml(site.name || this.$tx("No site"))}</i>${sounding}</span>`;
      return `<span class="sounding${selected ? " chosen" : ""}"><span class="sounding-dot"></span>${words}</span>`;
    },
    drawSites() {
      if (!this.map) return;
      if (!this.framed) this.frame();
      this.markers.clearLayers();
      this.drawn = this.plotted.map((site) => {
        const selected = site.key === this.selectedKey;
        const editable = selected && Boolean(this.draft);
        const marker = this.L.marker([site.coordinates.lat, site.coordinates.lon], {
          icon: this.L.divIcon({
            className: "sounding-icon",
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            html: this.markerHtml(site, selected)
          }),
          alt: site.name,
          title: site.name,
          draggable: editable,
          zIndexOffset: selected ? 1000 : 0
        });
        marker.on("click", () => this.$emit("select", site.key));
        marker.on("keypress", (event) => {
          if (event.originalEvent.key === "Enter") this.$emit("select", site.key);
        });
        if (editable) marker.on("dragend", () => this.move(marker.getLatLng()));
        marker.addTo(this.markers);
        return { site, marker, selected };
      });
      this.placeLabels();
    },
    // Names give way to each other; the chosen site and the most dived sites keep theirs.
    placeLabels() {
      if (!this.map || !this.drawn) return;
      const points = this.drawn.map(({ site }) => this.map.latLngToContainerPoint([site.coordinates.lat, site.coordinates.lon]));
      const taken = points.map((point, index) => {
        const radius = this.drawn[index].selected ? 15 : 6;
        return { left: point.x - radius, right: point.x + radius, top: point.y - radius, bottom: point.y + radius };
      });
      const order = this.drawn
        .map((entry, index) => ({ ...entry, index }))
        .sort((a, b) => b.selected - a.selected || b.site.count - a.site.count);
      for (const { marker, selected, index } of order) {
        const words = marker.getElement()?.querySelector(".sounding-words");
        if (!words) continue;
        const { x, y } = points[index];
        const width = words.offsetWidth || 110;
        const height = words.offsetHeight || 42;
        const gap = selected ? 15 : LABEL_GAP;
        const places = [
          { side: "east", left: x + gap, top: y - 14 },
          { side: "west", left: x - gap - width, top: y - 14 },
          { side: "southeast", left: x + 4, top: y + LABEL_GAP },
          { side: "northeast", left: x + 4, top: y - LABEL_GAP - height },
          { side: "south", left: x - width / 2, top: y + LABEL_GAP },
          { side: "north", left: x - width / 2, top: y - LABEL_GAP - height }
        ].map((place) => ({ ...place, right: place.left + width, bottom: place.top + height }));
        const free = places.find((place) => !taken.some((box, other) => other !== index && overlaps(place, box)));
        const chosen = free || (selected ? places[0] : null);
        words.dataset.side = chosen?.side || "none";
        if (chosen) taken.push(chosen);
      }
    },
    move(position) {
      if (!this.draft) return;
      const wrapped = position.wrap();
      this.$emit("move", { lat: Number(wrapped.lat.toFixed(6)), lon: Number(wrapped.lng.toFixed(6)) });
    }
  }
};
</script>

<template>
  <figure class="site-chart" :aria-label="$tx('Chart of your dive sites')">
    <div ref="canvas" class="site-chart-sea"></div>
    <p v-if="failed" class="note bad" role="alert">{{ $tx("The chart could not be loaded.") }}</p>
    <figcaption>{{ $tx("Soundings are your deepest dive at each site, in metres.") }}</figcaption>
  </figure>
</template>

<style>
.site-chart {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.site-chart-sea {
  flex: 1;
  min-height: 480px;
}

.app .site-chart-sea.leaflet-container {
  background: var(--deep);
  color: var(--ink);
  font-family: "Alegreya Sans", sans-serif;
}

.app .site-chart-sea svg,
.app .site-chart-sea img,
.app .site-chart-sea canvas {
  max-width: none;
}

.site-chart figcaption {
  position: absolute;
  z-index: 800;
  bottom: 22px;
  left: 16px;
  max-width: calc(100% - 32px);
  padding: 2px 6px;
  background: var(--deep);
  color: var(--soft);
  font-size: 15px;
  pointer-events: none;
}

.site-chart-places {
  filter: grayscale(1);
  opacity: 0.8;
}

:root[data-theme="dark"] .site-chart-places {
  filter: grayscale(1) invert(1);
  opacity: 0.65;
}

.sounding-icon {
  border: 0;
  background: none;
}

.sounding {
  position: relative;
  display: block;
  width: 32px;
  height: 32px;
  color: var(--ink);
}

.sounding-dot {
  position: absolute;
  top: 11px;
  left: 11px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
}

.sounding.chosen {
  border: 3px solid var(--act);
  border-radius: 50%;
  color: var(--act);
}

.sounding.chosen .sounding-dot {
  top: 7px;
  left: 7px;
  width: 12px;
  height: 12px;
}

.sounding-words {
  position: absolute;
  top: 2px;
  left: 25px;
  display: flex;
  flex-direction: column;
  width: max-content;
  max-width: 180px;
  line-height: 1.05;
  font-size: 17px;
}

.sounding.chosen .sounding-words {
  left: 31px;
  font-size: 21px;
}

.sounding-words i {
  font-weight: 700;
}

.sounding-words b {
  font-size: 17px;
  font-weight: 800;
}

.sounding-words sub {
  position: relative;
  bottom: -4px;
  font-size: 12px;
  vertical-align: baseline;
}

.sounding .sounding-words[data-side="west"] {
  right: 25px;
  left: auto;
  align-items: flex-end;
}

.sounding .sounding-words[data-side="southeast"] {
  top: 25px;
  left: 20px;
}

.sounding .sounding-words[data-side="northeast"] {
  top: auto;
  bottom: 25px;
  left: 20px;
}

.sounding .sounding-words[data-side="south"] {
  top: 25px;
  left: 50%;
  align-items: center;
  transform: translateX(-50%);
}

.sounding .sounding-words[data-side="north"] {
  top: auto;
  bottom: 25px;
  left: 50%;
  align-items: center;
  transform: translateX(-50%);
}

.sounding .sounding-words[data-side="none"] {
  visibility: hidden;
}

.app .site-chart .leaflet-bar a {
  width: 44px;
  height: 44px;
  border-color: var(--rule);
  background: var(--deep);
  color: var(--act);
  line-height: 44px;
}

.app .site-chart .leaflet-control-attribution {
  background: var(--deep);
  color: var(--soft);
  font-size: 11px;
}

@media (max-width: 700px) {
  .site-chart-sea {
    min-height: 340px;
  }
}
</style>

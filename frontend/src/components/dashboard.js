import L from "leaflet";
import { dayOfMonth, monthShort, formatDate, diveTitle, diveSubtitle, formatDepth, formatDepthNumber, formatDateTime, durationShort, formatTemperature, surfaceTemperature, profileBars, diveModeLabel, pressureUsedLabel, decoStatusLabel, formatAccumulatedDuration, formatBarTotal, filledIconStyle, numberOrZero, oxygenToxicityPercent, parseDate } from "../core.js";

function numericCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validCoordinates(lat, lon) {
  return typeof lat === "number"
    && Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && typeof lon === "number"
    && Number.isFinite(lon)
    && lon >= -180
    && lon <= 180;
}

function extractCoordinates(source) {
  if (!source || typeof source !== "object") return null;
  const lat = numericCoordinate(source.lat ?? source.latitude);
  const lon = numericCoordinate(source.lon ?? source.lng ?? source.long ?? source.longitude);
  return validCoordinates(lat, lon) ? { lat, lon } : null;
}

function diveCoordinates(dive) {
  const candidates = [
    dive?.fields?.location,
    dive?.fields?.gps,
    dive?.fields?.position,
    dive?.fields?.coordinates,
    dive?.location,
    dive?.gps
  ];
  return candidates.map(extractCoordinates).find(Boolean) || null;
}

function markerDiameter(count) {
  return 14 + Math.min(count - 1, 6) * 4;
}

function coordinateLabel(value, positive, negative) {
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(value).toFixed(2)}${direction}`;
}

function normalizeSiteName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function savedSiteCoordinates(dive, diveSites) {
  const siteName = normalizeSiteName(dive?.fields?.logbook?.site);
  if (!siteName || !Array.isArray(diveSites)) return null;

  const matchingSite = diveSites.find((site) => normalizeSiteName(site?.name) === siteName);
  if (!matchingSite) return null;

  return extractCoordinates({
    lat: matchingSite.latitude ?? matchingSite.lat,
    lon: matchingSite.longitude ?? matchingSite.lon
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export default {
  name: "DashboardView",
  props: ["dives", "allDives", "diveSites", "stats", "setView", "backendHealthy", "openDive", "currentUserName", "importedDiveCount", "openImportQueue"],
  data() {
    return {
      diveMap: null,
      diveTileLayer: null,
      diveMarkerLayer: null
    };
  },
  mounted() {
    this.$nextTick(() => {
      this.initializeDiveMap();
      this.syncDiveMap();
    });
    window.addEventListener("resize", this.handleMapResize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleMapResize);
    if (this.diveMap) {
      this.diveMap.remove();
      this.diveMap = null;
      this.diveTileLayer = null;
      this.diveMarkerLayer = null;
    }
  },
  watch: {
    diveMapMarkers: {
      handler() {
        this.$nextTick(() => this.syncDiveMap());
      },
      deep: true
    }
  },
  methods: {
    dayOfMonth,
    monthShort,
    formatDate,
    diveTitle,
    diveSubtitle,
    formatDepth,
    formatDepthNumber,
    formatDateTime,
    formatDurationShort: durationShort,
    formatTemperature,
    surfaceTemperature,
    profileBars,
    diveModeLabel,
    pressureUsedLabel,
    decoStatusLabel,
    formatAccumulatedDuration,
    formatBarTotal,
    coordinateLabel,
    handleMapResize() {
      if (!this.diveMap) return;
      this.diveMap.invalidateSize(false);
    },
    initializeDiveMap() {
      if (this.diveMap || !this.$refs.diveMapCanvas) return;

      const map = L.map(this.$refs.diveMapCanvas, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 1.5,
        maxZoom: 12,
        worldCopyJump: true
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

      this.diveTileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "dive-theme-map-tiles",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);
      this.diveMarkerLayer = L.layerGroup().addTo(map);
      this.diveMap = map;
    },
    diveMarkerIcon(marker) {
      const size = markerDiameter(marker.count) + 10;
      const countLabel = marker.count > 1
        ? `<span class="dive-map-marker-count">${marker.count}</span>`
        : '<span class="dive-map-marker-ping"></span>';

      return L.divIcon({
        className: "dive-map-marker-shell",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -Math.round(size / 2)],
        html: `
          <span class="dive-map-marker-ring" style="width:${size}px;height:${size}px;">
            <span class="dive-map-marker-core">${countLabel}</span>
          </span>
        `
      });
    },
    diveMarkerPopup(marker) {
      const diveLabel = marker.count === 1 ? "1 dive" : `${marker.count} dives`;
      return `
        <div class="dive-map-popup-card">
          <p class="dive-map-popup-eyebrow">Logged Location</p>
          <h5 class="dive-map-popup-title">${escapeHtml(marker.label)}</h5>
          <p class="dive-map-popup-meta">${escapeHtml(diveLabel)} | ${escapeHtml(this.coordinateLabel(marker.latitude, "N", "S"))} / ${escapeHtml(this.coordinateLabel(marker.longitude, "E", "W"))}</p>
        </div>
      `;
    },
    syncDiveMap() {
      if (!this.$refs.diveMapCanvas) return;
      this.initializeDiveMap();
      if (!this.diveMap || !this.diveMarkerLayer) return;

      this.diveMarkerLayer.clearLayers();

      if (!this.diveMapMarkers.length) {
        this.diveMap.setView([18, 8], 1.75);
        this.handleMapResize();
        return;
      }

      const bounds = [];
      this.diveMapMarkers.forEach((marker) => {
        const position = L.latLng(marker.latitude, marker.longitude);
        bounds.push(position);

        const leafletMarker = L.marker(position, {
          icon: this.diveMarkerIcon(marker),
          title: `${marker.label} | ${marker.count} dive${marker.count === 1 ? "" : "s"}`
        });
        leafletMarker.bindPopup(this.diveMarkerPopup(marker), {
          className: "dive-map-popup",
          closeButton: false,
          autoPanPadding: [24, 24],
          offset: [0, -8]
        });
        leafletMarker.on("click", () => {
          leafletMarker.openPopup();
          this.openDive(marker.representativeId);
        });
        leafletMarker.addTo(this.diveMarkerLayer);
      });

      if (bounds.length === 1) {
        this.diveMap.setView(bounds[0], 4.25);
      } else {
        this.diveMap.fitBounds(L.latLngBounds(bounds), {
          paddingTopLeft: [36, 72],
          paddingBottomRight: [36, 112],
          maxZoom: 5.5
        });
      }

      this.handleMapResize();
    }
  },
  computed: {
    recentDives() {
      return this.dives.slice(0, 5);
    },
    mapSourceDives() {
      return Array.isArray(this.allDives) && this.allDives.length ? this.allDives : this.dives;
    },
    featuredDive() {
      return this.recentDives[0] || null;
    },
    dashboardStatus() {
      if (!this.featuredDive) return "Nominal";
      return this.decoStatusLabel(this.featuredDive) === "Deco Active" ? "Decompression" : "Nominal";
    },
    filledIconStyle() {
      return filledIconStyle;
    },
    surfaceWindowLabel() {
      if (!this.featuredDive) return "Surface 00:00h";
      const hours = Math.max(2, Math.round(numberOrZero(this.featuredDive.duration_seconds) / 1200));
      return `Surface 0${hours}:45h`;
    },
    mobileOxygenLabel() {
      const value = oxygenToxicityPercent(this.featuredDive);
      return typeof value === "number" ? `${value.toFixed(0)}%` : "94%";
    },
    mobileBars() {
      return profileBars(this.featuredDive || {}).slice(0, 10);
    },
    dashboardUserName() {
      return this.currentUserName || "Diver";
    },
    hasImportedDives() {
      return Number(this.importedDiveCount || 0) > 0;
    },
    importedDiveLabel() {
      const count = Number(this.importedDiveCount || 0);
      return `${count} imported ${count === 1 ? "dive" : "dives"} awaiting completion`;
    },
    diveMapMarkers() {
      const markers = new Map();

      this.mapSourceDives.forEach((dive) => {
        const coordinates = diveCoordinates(dive) || savedSiteCoordinates(dive, this.diveSites);
        if (!coordinates) return;

        const key = `${coordinates.lat.toFixed(2)}:${coordinates.lon.toFixed(2)}`;
        const existing = markers.get(key);
        const diveDate = parseDate(dive?.started_at);
        const siteLabel = dive?.fields?.logbook?.site?.trim() || diveTitle(dive);

        if (existing) {
          existing.count += 1;
          if (diveDate && (!existing.latestDiveDate || diveDate > existing.latestDiveDate)) {
            existing.latestDiveDate = diveDate;
            existing.representativeId = dive.id;
            existing.label = siteLabel;
          }
          return;
        }

        markers.set(key, {
          key,
          count: 1,
          label: siteLabel,
          representativeId: dive.id,
          latestDiveDate: diveDate,
          latitude: coordinates.lat,
          longitude: coordinates.lon
        });
      });

      return Array.from(markers.values()).sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        return (right.latestDiveDate?.getTime() || 0) - (left.latestDiveDate?.getTime() || 0);
      });
    },
    hasDiveMapMarkers() {
      return this.diveMapMarkers.length > 0;
    },
    mappedDiveCount() {
      return this.diveMapMarkers.reduce((sum, marker) => sum + marker.count, 0);
    },
    mappedSiteCount() {
      return this.diveMapMarkers.length;
    },
    unmappedDiveCount() {
      return Math.max(this.mapSourceDives.length - this.mappedDiveCount, 0);
    },
    mapCoverageLabel() {
      if (!this.mapSourceDives.length) return "No dives loaded";
      if (!this.hasDiveMapMarkers) return "No coordinates found in imported logs";
      if (!this.unmappedDiveCount) return "Geotag coverage complete";
      return `${this.unmappedDiveCount} ${this.unmappedDiveCount === 1 ? "dive is" : "dives are"} missing coordinates`;
    },
    mapTopSites() {
      return this.diveMapMarkers.slice(0, 4);
    },
    mapFooterNote() {
      if (!this.hasDiveMapMarkers) return "Import coordinates into the dive payload or saved dive sites to populate the live map.";
      return "Searchable dive metadata now drives a live charted map. Select a marker to open the most recent dive from that location.";
    },
    mapTelemetryLabel() {
      if (!this.hasDiveMapMarkers) return "Awaiting usable GPS telemetry";
      return `${this.mappedDiveCount} ${this.mappedDiveCount === 1 ? "dive" : "dives"} plotted across ${this.mappedSiteCount} ${this.mappedSiteCount === 1 ? "site" : "sites"}`;
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="space-y-6 md:hidden">
        <div class="space-y-4">
          <div class="flex items-end justify-between">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">Current Status</p>
              <h3 class="mt-1 font-headline text-3xl font-bold uppercase tracking-tight text-primary">{{ dashboardStatus }}</h3>
            </div>
            <span class="inline-flex items-center rounded-full bg-tertiary-container/40 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ surfaceWindowLabel }}</span>
          </div>
          <div class="h-1 overflow-hidden rounded-full bg-surface-container-highest">
            <div class="h-full bg-primary shadow-[0_0_8px_rgba(156,202,255,0.5)]" :style="{ width: stats.bottomTimeProgress + '%' }"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2 rounded-xl border-l-2 border-primary/30 bg-surface-container-low p-4">
            <div class="flex items-start justify-between">
              <span class="material-symbols-outlined text-xl text-primary">scuba_diving</span>
              <span class="font-label text-[10px] text-on-surface-variant">LOGGED</span>
            </div>
            <div class="pt-2">
              <div class="font-headline text-3xl font-bold">{{ stats.totalDives }}</div>
              <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Total Dives</div>
            </div>
          </div>
          <div class="space-y-2 rounded-xl border-l-2 border-tertiary/30 bg-surface-container-low p-4">
            <div class="flex items-start justify-between">
              <span class="material-symbols-outlined text-xl text-tertiary">straighten</span>
              <span class="font-label text-[10px] text-on-surface-variant">RECORD</span>
            </div>
            <div class="pt-2">
              <div class="font-headline text-3xl font-bold">{{ formatDepthNumber(stats.maxDepth) }}<span class="ml-1 text-sm text-on-surface-variant">M</span></div>
              <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Max Depth</div>
            </div>
          </div>
          <div class="col-span-2 flex items-center justify-between rounded-xl bg-surface-container-high p-4">
            <div class="flex items-center gap-4">
              <div class="rounded-lg bg-primary-container p-3 text-primary">
                <span class="material-symbols-outlined" :style="filledIconStyle">schedule</span>
              </div>
              <div>
                <div class="font-headline text-2xl font-bold">{{ formatAccumulatedDuration(stats.totalSeconds) }}</div>
                <div class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Accumulated Bottom Time</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
          </div>
        </div>

        <section v-if="hasImportedDives" class="rounded-xl border border-tertiary/30 bg-[linear-gradient(135deg,rgba(255,183,125,0.16),rgba(19,44,64,0.92))] p-4 shadow-panel">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">Import Queue</p>
              <p class="mt-2 font-headline text-xl font-bold text-on-surface">{{ importedDiveLabel }}</p>
              <p class="mt-2 text-sm text-on-surface-variant">Add dive site, buddy, and guide details before these dives enter the logbook.</p>
            </div>
            <span class="material-symbols-outlined text-2xl text-tertiary">warning</span>
          </div>
          <button @click="openImportQueue()" class="mt-4 w-full bg-tertiary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-background">
            Review Imported Dives
          </button>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-headline text-lg font-bold uppercase tracking-tight text-primary-fixed-dim">Recent Expeditions</h4>
            <button @click="setView('logs')" class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">View All</button>
          </div>
          <div class="space-y-3">
            <article
              v-for="dive in recentDives.slice(0, 3)"
              :key="'mobile-' + dive.id"
              @click="openDive(dive.id)"
              @keyup.enter="openDive(dive.id)"
              tabindex="0"
              role="button"
              class="glass-panel flex cursor-pointer items-center gap-4 rounded-xl p-4 transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
            >
              <div class="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border border-outline-variant/20 bg-[radial-gradient(circle_at_30%_30%,rgba(156,202,255,0.35),transparent_35%),linear-gradient(180deg,#132c40,#000f1d)]">
                <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest to-transparent"></div>
              </div>
              <div class="min-w-0 flex-1">
                <h5 class="truncate font-headline text-sm font-bold tracking-tight">{{ diveTitle(dive) }}</h5>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDate(dive.started_at) }} | {{ diveModeLabel(dive) }}</p>
              </div>
              <div class="text-right">
                <div class="font-headline text-sm font-bold text-tertiary">{{ formatDepth(dive.max_depth_m) }}</div>
                <div class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">{{ formatDurationShort(dive.duration_seconds).replace(/m/g, 'min') }}</div>
              </div>
            </article>
          </div>
        </section>

        <section class="space-y-4">
          <h4 class="font-headline text-lg font-bold uppercase tracking-tight text-primary-fixed-dim">Oxygen Saturation</h4>
          <div class="relative h-32 overflow-hidden rounded-xl border-l-2 border-primary/20 bg-surface-container-low p-4">
            <div class="absolute inset-x-2 bottom-2 top-8 flex items-end gap-1">
              <div v-for="(bar, index) in mobileBars" :key="'bar-' + index" class="w-full rounded-sm bg-primary/20" :style="{ height: Math.max(20, bar) + '%' }"></div>
            </div>
            <div class="relative z-10 flex justify-between">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">Avg {{ mobileOxygenLabel }}</span>
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">{{ backendHealthy ? 'Backend Synced' : 'Backend Pending' }}</span>
            </div>
          </div>
        </section>
      </section>

      <section class="hidden space-y-10 md:block">
        <header>
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">Dive Overview</p>
            <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight">Diver: <span class="text-primary">{{ dashboardUserName }}</span></h3>
          </div>
        </header>
        <section v-if="hasImportedDives" class="border-l-4 border-tertiary bg-[linear-gradient(135deg,rgba(255,183,125,0.12),rgba(6,33,53,0.96))] p-6 shadow-panel">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div class="max-w-3xl">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Attention Required</p>
              <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ importedDiveLabel }}</h4>
              <p class="mt-3 text-sm leading-7 text-on-surface-variant">Imported dives do not appear in the dive logbook until the missing registry metadata has been completed.</p>
            </div>
            <div class="flex items-center gap-4">
              <div class="min-w-[110px] bg-background/35 px-5 py-4 text-center">
                <p class="font-headline text-4xl font-bold text-tertiary">{{ importedDiveCount }}</p>
                <p class="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Imported</p>
              </div>
              <button @click="openImportQueue()" class="bg-tertiary px-6 py-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-background">
                Review Imported Dives
              </button>
            </div>
          </div>
        </section>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">database</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Dive Count</p>
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ stats.totalDives }}</p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">timer</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Bottom Time</p>
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ formatAccumulatedDuration(stats.totalSeconds) }}</p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-tertiary/50">straighten</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Max Depth</p>
              <p class="mt-2 font-headline text-4xl font-bold text-tertiary">{{ formatDepthNumber(stats.maxDepth) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">m</span></p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between border-l-2 border-primary/20 bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">water_drop</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Consumption</p>
              <p class="mt-2 font-headline text-4xl font-bold">{{ formatBarTotal(stats.totalBarConsumed) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">bar</span></p>
            </div>
          </div>
        </div>
        <section class="space-y-6">
          <div class="space-y-6">
            <div class="relative h-[400px] overflow-hidden bg-surface-container-low">
              <div ref="diveMapCanvas" class="dive-theme-map absolute inset-0"></div>
              <div class="pointer-events-none absolute inset-0 opacity-25 mix-blend-screen bg-[radial-gradient(circle_at_24%_32%,rgba(156,202,255,0.24),transparent_16rem),radial-gradient(circle_at_78%_68%,rgba(255,183,125,0.16),transparent_14rem),linear-gradient(180deg,#07253a,#00111e)]"></div>
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-dim/85 via-transparent to-transparent"></div>
              <div class="pointer-events-none absolute inset-y-0 left-0 w-56 bg-[linear-gradient(90deg,rgba(0,15,29,0.34),transparent)]"></div>
              <div class="absolute left-6 top-6 z-[500]">
                <h4 class="font-headline text-xl font-bold tracking-tight">DIVE MAP: <span class="text-primary">GLOBAL LOGBOOK</span></h4>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">{{ mapTelemetryLabel }}</p>
              </div>
              <div class="absolute bottom-6 left-6 right-6 z-[500] flex items-end justify-between gap-6">
                <div class="max-w-2xl space-y-3">
                  <div class="flex flex-wrap gap-2">
                    <span class="bg-background/40 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ mappedDiveCount }} mapped dives</span>
                    <span class="bg-background/40 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ mappedSiteCount }} unique sites</span>
                    <span class="bg-background/40 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ mapCoverageLabel }}</span>
                  </div>
                  <p class="max-w-xl text-sm leading-6 text-on-surface-variant">{{ mapFooterNote }}</p>
                </div>
                <div v-if="mapTopSites.length" class="hidden min-w-[18rem] bg-background/35 p-4 lg:block">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Top Locations</p>
                  <div class="mt-3 space-y-2">
                    <div v-for="site in mapTopSites" :key="'site-' + site.key" class="flex items-center justify-between gap-4 text-sm">
                      <div class="min-w-0">
                        <p class="truncate font-semibold text-on-surface">{{ site.label }}</p>
                        <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ coordinateLabel(site.latitude, 'N', 'S') }} / {{ coordinateLabel(site.longitude, 'E', 'W') }}</p>
                      </div>
                      <span class="font-headline text-lg font-bold text-tertiary">{{ site.count }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="bg-surface-container-low p-6">
              <div class="mb-6 flex items-center justify-between">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Recent Expeditions</p>
                  <h4 class="mt-2 font-headline text-2xl font-bold tracking-tight">Recent Dives</h4>
                </div>
                <button @click="setView('logs')" class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary transition-colors hover:text-primary">View All</button>
              </div>
              <div class="space-y-4">
                <article
                  v-for="dive in recentDives"
                  :key="dive.id"
                  @click="openDive(dive.id)"
                  @keyup.enter="openDive(dive.id)"
                  tabindex="0"
                  role="button"
                  class="flex cursor-pointer items-center justify-between gap-4 bg-surface-container-high/40 p-4 transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
                >
                  <div class="flex min-w-0 items-center gap-4">
                    <div class="flex h-12 w-12 items-center justify-center bg-primary/10 text-primary">
                      <span class="material-symbols-outlined">scuba_diving</span>
                    </div>
                    <div class="min-w-0">
                      <h5 class="truncate text-sm font-bold tracking-tight">{{ diveTitle(dive) }}</h5>
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ formatDate(dive.started_at) }} | {{ diveModeLabel(dive) }}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="font-headline text-lg font-bold">{{ formatDepth(dive.max_depth_m) }}</p>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{{ formatDurationShort(dive.duration_seconds).replace(/m/g, 'min') }}</p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </section>
    </section>
  `
};


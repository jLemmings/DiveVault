import L from "leaflet";
import { dayOfMonth, monthShort, formatDate, formatTime, diveTitle, diveSubtitle, formatDepth, formatDepthNumber, formatDateTime, durationShort, formatTemperature, surfaceTemperature, profileBars, diveModeLabel, pressureUsedLabel, decoStatusLabel, formatAccumulatedDuration, formatBarTotal, filledIconStyle, numberOrZero, oxygenToxicityPercent, parseDate, importDraftSeed } from "../core.js";

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

function diveSiteName(dive) {
  const siteName = importDraftSeed(dive)?.site;
  return typeof siteName === "string" ? siteName.trim() : "";
}

function matchingSavedSite(dive, diveSites) {
  const siteName = normalizeSiteName(diveSiteName(dive));
  if (!siteName || !Array.isArray(diveSites)) return null;
  return diveSites.find((site) => normalizeSiteName(site?.name) === siteName) || null;
}

function savedSiteCoordinates(matchingSite) {
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
      diveLabelLayer: null,
      diveMarkerLayer: null,
      showMissingCoordinateDives: false,
      isMapExpanded: false,
      mapViewportInitialized: false
    };
  },
  mounted() {
    this.$nextTick(() => {
      this.initializeDiveMap();
      this.syncDiveMap({ reframe: true });
    });
    window.addEventListener("resize", this.handleMapResize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.handleMapResize);
    if (this.diveMap) {
      this.diveMap.remove();
      this.diveMap = null;
      this.diveTileLayer = null;
      this.diveLabelLayer = null;
      this.diveMarkerLayer = null;
    }
  },
  watch: {
    diveMapMarkers: {
      handler() {
        this.$nextTick(() => this.syncDiveMap({ reframe: !this.mapViewportInitialized }));
      },
      deep: true
    },
    unmappedDiveCount(value) {
      if (!value) {
        this.showMissingCoordinateDives = false;
      }
    },
    isMapExpanded() {
      this.$nextTick(() => {
        this.handleMapResize();
      });
    }
  },
  methods: {
    dayOfMonth,
    monthShort,
    formatDate,
    formatTime,
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
    diveSiteName,
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

      this.diveTileLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        className: "dive-theme-map-tiles",
        referrerPolicy: "origin"
      });
      this.diveTileLayer.setUrl("https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}");
      this.diveTileLayer.addTo(map);
      this.diveMarkerLayer = L.layerGroup().addTo(map);
      map.on("zoomend", () => this.syncDiveMap({ preserveViewport: true }));
      this.diveMap = map;
    },
    diveMarkerIcon(marker) {
      const size = markerDiameter(marker.count) + 10;
      const countLabel = `<span class="dive-map-marker-count">${marker.count}</span>`;

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
    diveMarkerBubble(marker) {
      const diveLabel = marker.count === 1 ? "1 dive" : `${marker.count} dives`;
      const locationLabel = marker.siteCount > 1 ? `${marker.siteCount} sites in this sector` : marker.label;
      const sitePreview = marker.siteCount > 1
        ? `${marker.siteLabels.slice(0, 3).join(" / ")}${marker.siteCount > 3 ? ` +${marker.siteCount - 3} more` : ""}`
        : "";
      return `
        <div class="dive-map-info-bubble">
          <p class="dive-map-info-title">${escapeHtml(locationLabel)}</p>
          <p class="dive-map-info-meta">${escapeHtml(diveLabel)} | ${escapeHtml(this.coordinateLabel(marker.latitude, "N", "S"))} / ${escapeHtml(this.coordinateLabel(marker.longitude, "E", "W"))}</p>
          ${sitePreview ? `<p class="dive-map-info-sites">${escapeHtml(sitePreview)}</p>` : ""}
        </div>
      `;
    },
    sectorSizeForZoom(zoom) {
      if (zoom >= 9) return 0.08;
      if (zoom >= 8) return 0.12;
      if (zoom >= 7) return 0.18;
      if (zoom >= 6) return 0.3;
      if (zoom >= 5) return 0.6;
      return 1.2;
    },
    sectorBucketValue(value, sectorSize) {
      return Math.floor(value / sectorSize) * sectorSize;
    },
    displayDiveMapMarkers() {
      if (!this.diveMapMarkers.length) return [];

      const sectorSize = this.sectorSizeForZoom(this.diveMap?.getZoom?.() ?? 4.25);
      const sectors = new Map();

      this.diveMapMarkers.forEach((marker) => {
        const bucketLat = this.sectorBucketValue(marker.latitude, sectorSize);
        const bucketLon = this.sectorBucketValue(marker.longitude, sectorSize);
        const key = `${bucketLat.toFixed(3)}:${bucketLon.toFixed(3)}`;
        const existing = sectors.get(key);

        if (existing) {
          existing.count += marker.count;
          existing.siteCount += 1;
          existing.latitudeTotal += marker.latitude * marker.count;
          existing.longitudeTotal += marker.longitude * marker.count;
          existing.sourceMarkers.push(marker);
          if (!existing.siteLabels.includes(marker.label)) {
            existing.siteLabels.push(marker.label);
          }
          if (marker.latestDiveDate && (!existing.latestDiveDate || marker.latestDiveDate > existing.latestDiveDate)) {
            existing.latestDiveDate = marker.latestDiveDate;
            existing.representativeId = marker.representativeId;
          }
          return;
        }

        sectors.set(key, {
          key,
          count: marker.count,
          siteCount: 1,
          label: marker.label,
          siteLabels: [marker.label],
          representativeId: marker.representativeId,
          latestDiveDate: marker.latestDiveDate,
          latitudeTotal: marker.latitude * marker.count,
          longitudeTotal: marker.longitude * marker.count,
          sourceMarkers: [marker]
        });
      });

      return Array.from(sectors.values())
        .map((sector) => ({
          key: sector.key,
          count: sector.count,
          siteCount: sector.siteCount,
          label: sector.label,
          siteLabels: sector.siteLabels,
          representativeId: sector.representativeId,
          latestDiveDate: sector.latestDiveDate,
          latitude: sector.latitudeTotal / sector.count,
          longitude: sector.longitudeTotal / sector.count,
          sourceMarkers: sector.sourceMarkers
        }))
        .sort((left, right) => {
          if (right.count !== left.count) return right.count - left.count;
          return (right.latestDiveDate?.getTime() || 0) - (left.latestDiveDate?.getTime() || 0);
        });
    },
    zoomIntoMarkerSector(marker) {
      if (!this.diveMap) return;

      const sourceMarkers = Array.isArray(marker?.sourceMarkers) ? marker.sourceMarkers : [];
      const positions = sourceMarkers.map((entry) => L.latLng(entry.latitude, entry.longitude));

      if (!positions.length) {
        this.diveMap.flyTo([marker.latitude, marker.longitude], Math.min((this.diveMap.getZoom?.() || 4.25) + 2, 10), { duration: 0.45 });
        return;
      }

      if (positions.length === 1) {
        this.diveMap.flyTo(positions[0], Math.min((this.diveMap.getZoom?.() || 4.25) + 2, 10), { duration: 0.45 });
        return;
      }

      this.diveMap.flyToBounds(L.latLngBounds(positions), {
        padding: [72, 72],
        maxZoom: 9,
        duration: 0.45
      });
    },
    syncDiveMap(options = {}) {
      if (!this.$refs.diveMapCanvas) return;
      this.initializeDiveMap();
      if (!this.diveMap || !this.diveMarkerLayer) return;

      const { preserveViewport = false, reframe = false } = options;
      this.diveMarkerLayer.clearLayers();
      const displayMarkers = this.displayDiveMapMarkers();

      if (!displayMarkers.length) {
        if (!preserveViewport) {
          this.diveMap.setView([18, 8], 1.75);
        }
        this.mapViewportInitialized = false;
        this.handleMapResize();
        return;
      }

      const bounds = [];
      displayMarkers.forEach((marker) => {
        const position = L.latLng(marker.latitude, marker.longitude);
        bounds.push(position);

        const leafletMarker = L.marker(position, {
          icon: this.diveMarkerIcon(marker)
        });
        leafletMarker.bindTooltip(this.diveMarkerBubble(marker), {
          className: "dive-map-tooltip",
          direction: "top",
          offset: [0, -8]
        });
        leafletMarker.on("click", () => {
          this.zoomIntoMarkerSector(marker);
        });
        leafletMarker.addTo(this.diveMarkerLayer);
      });

      if (!preserveViewport && (reframe || !this.mapViewportInitialized)) {
        if (bounds.length === 1) {
          this.diveMap.setView(bounds[0], 4.25);
        } else {
          this.diveMap.fitBounds(L.latLngBounds(bounds), {
            paddingTopLeft: [36, 72],
            paddingBottomRight: [36, 112],
            maxZoom: 5.5
          });
        }
        this.mapViewportInitialized = true;
      }

      this.handleMapResize();
    },
    toggleMissingCoordinateDives() {
      if (!this.unmappedDiveCount) return;
      this.showMissingCoordinateDives = !this.showMissingCoordinateDives;
    },
    toggleMapExpanded() {
      this.isMapExpanded = !this.isMapExpanded;
    },
    closeMapExpanded() {
      this.isMapExpanded = false;
    },
    closeMissingCoordinateDives() {
      this.showMissingCoordinateDives = false;
    },
    openMissingCoordinateDive(diveId) {
      this.showMissingCoordinateDives = false;
      this.openDive(diveId);
    }
  },
  computed: {
    recentDives() {
      return this.dives.slice(0, 5);
    },
    mapSourceDives() {
      return Array.isArray(this.dives) ? this.dives : [];
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
        const savedSite = matchingSavedSite(dive, this.diveSites);
        const coordinates = savedSiteCoordinates(savedSite) || diveCoordinates(dive);
        if (!coordinates) return;

        const siteName = diveSiteName(dive);
        const key = savedSite?.id
          || normalizeSiteName(savedSite?.name)
          || normalizeSiteName(siteName)
          || `${coordinates.lat.toFixed(4)}:${coordinates.lon.toFixed(4)}`;
        const existing = markers.get(key);
        const diveDate = parseDate(dive?.started_at);
        const siteLabel = (typeof savedSite?.name === "string" && savedSite.name.trim())
          || siteName
          || diveTitle(dive);

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
      return this.missingCoordinateDives.length;
    },
    missingCoordinateDives() {
      return this.mapSourceDives
        .filter((dive) => {
          const savedSite = matchingSavedSite(dive, this.diveSites);
          const coordinates = savedSiteCoordinates(savedSite) || diveCoordinates(dive);
          return !coordinates;
        })
        .map((dive) => {
          const savedSite = matchingSavedSite(dive, this.diveSites);
          const siteName = diveSiteName(dive);
          let reason = "No usable coordinates found";

          if (!siteName) {
            reason = "No dive site assigned";
          } else if (!savedSite) {
            reason = "Dive site is not linked to a saved site in Settings";
          } else {
            reason = "Saved dive site has no coordinates";
          }

          return {
            id: dive.id,
            date: dive.started_at,
            siteName: siteName || "Site pending",
            title: diveTitle(dive),
            device: `${dive.vendor || "Unknown"} ${dive.product || ""}`.trim(),
            depth: formatDepth(dive.max_depth_m),
            duration: durationShort(dive.duration_seconds),
            reason
          };
        })
        .sort((left, right) => (parseDate(right.date)?.getTime() || 0) - (parseDate(left.date)?.getTime() || 0));
    },
    mapCoverageLabel() {
      if (!this.mapSourceDives.length) return "No dives loaded";
      if (!this.hasDiveMapMarkers) return "No coordinates found in committed dives or saved dive sites";
      if (!this.unmappedDiveCount) return "Geotag coverage complete";
      return `${this.unmappedDiveCount} ${this.unmappedDiveCount === 1 ? "dive is" : "dives are"} missing coordinates`;
    },
    mapTopSites() {
      return this.diveMapMarkers
        .slice(0, 4)
        .map((site) => ({
          ...site,
          label: site.label.replace(/[^\x20-\x7E]/g, "").trim() || site.label
        }));
    },
    mapFooterNote() {
      if (!this.hasDiveMapMarkers) return "Add coordinates to saved dive sites to place committed dives accurately on the map.";
      return "Saved dive-site coordinates take priority over raw telemetry so the map reflects the curated logbook location for each dive.";
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
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ Math.floor((stats.totalSeconds || 0) / 3600) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">h</span> {{ Math.round(((stats.totalSeconds || 0) % 3600) / 60) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">min</span></p>
            </div>
          </div>
          <div class="group flex h-48 flex-col justify-between bg-surface-container-low p-6 transition-colors hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-3xl text-primary/40">straighten</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">Max Depth</p>
              <p class="mt-2 font-headline text-4xl font-bold group-hover:text-primary">{{ formatDepthNumber(stats.maxDepth) }}<span class="ml-1 text-sm font-normal uppercase text-secondary">m</span></p>
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
            <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
              <div class="space-y-5">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h4 class="font-headline text-3xl font-bold tracking-tight text-on-surface">Dive Map</h4>
                    <p class="mt-2 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">{{ mapTelemetryLabel }}</p>
                  </div>
                  <div class="flex flex-wrap gap-3">
                    <button
                      @click="toggleMapExpanded()"
                      class="border border-primary/15 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary transition-colors hover:border-primary/30 hover:text-on-surface"
                    >
                      {{ isMapExpanded ? 'Close Map' : 'Expand Map' }}
                    </button>
                    <span class="border border-primary/15 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ mappedDiveCount }} mapped dives</span>
                    <span class="border border-tertiary/15 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ mappedSiteCount }} unique sites</span>
                    <button
                      v-if="unmappedDiveCount"
                      @click="toggleMissingCoordinateDives()"
                      class="border border-outline-variant/15 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary transition-colors hover:border-primary/25 hover:text-primary"
                    >
                      {{ mapCoverageLabel }}
                    </button>
                    <span v-else class="border border-outline-variant/15 bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ mapCoverageLabel }}</span>
                  </div>
                </div>

                <div
                  :class="isMapExpanded ? 'fixed inset-0 z-[490] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm' : 'relative'"
                  @click.self="closeMapExpanded()"
                >
                  <div :class="isMapExpanded ? 'w-full max-w-7xl' : ''">
                    <div :class="['dive-map-shell relative overflow-hidden border border-primary/10 bg-surface-container-low shadow-panel']" :style="isMapExpanded ? { height: '85vh' } : null">
                      <div v-if="isMapExpanded" class="absolute left-6 top-6 z-[480] flex items-center gap-3">
                        <div class="border border-primary/15 bg-background/65 px-4 py-3 backdrop-blur-sm">
                          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Expanded Map</p>
                          <p class="mt-1 text-sm text-on-surface-variant">{{ mapTelemetryLabel }}</p>
                        </div>
                      </div>
                      <button
                        v-if="isMapExpanded"
                        @click="closeMapExpanded()"
                        class="absolute right-6 top-6 z-[480] bg-background/65 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary backdrop-blur-sm transition-colors hover:text-primary"
                      >
                        Close
                      </button>
                      <div ref="diveMapCanvas" class="dive-theme-map"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="mapTopSites.length" class="border border-primary/10 bg-surface-container-low p-5 shadow-panel">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Top Locations</p>
                <div class="mt-4 space-y-3">
                  <div v-for="site in mapTopSites" :key="'site-' + site.key" class="flex items-center justify-between gap-4 border border-outline-variant/10 bg-surface-container-high/70 px-4 py-3 text-sm">
                    <div class="min-w-0">
                      <p class="truncate font-semibold text-on-surface">{{ site.label }}</p>
                      <p class="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ coordinateLabel(site.latitude, 'N', 'S') }} / {{ coordinateLabel(site.longitude, 'E', 'W') }}</p>
                    </div>
                    <span class="font-headline text-2xl font-bold text-tertiary">{{ site.count }}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>
      </section>

      <div
        v-if="showMissingCoordinateDives && missingCoordinateDives.length"
        class="fixed inset-0 z-[500] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
        @click.self="closeMissingCoordinateDives()"
      >
        <section class="max-h-full w-full max-w-6xl overflow-auto border border-tertiary/18 bg-[linear-gradient(180deg,rgba(19,44,64,0.98),rgba(6,29,45,0.98))] p-6 shadow-panel md:p-8">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-tertiary">Missing Coordinates</p>
              <h5 class="mt-2 font-headline text-3xl font-bold tracking-tight">{{ unmappedDiveCount }} {{ unmappedDiveCount === 1 ? 'Dive Needs Coordinates' : 'Dives Need Coordinates' }}</h5>
              <p class="mt-3 max-w-3xl text-sm leading-7 text-on-surface-variant">These committed logbook dives do not currently resolve to a saved dive-site coordinate or usable embedded GPS position.</p>
            </div>
            <button @click="closeMissingCoordinateDives()" class="self-start bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary transition-colors hover:text-primary">
              Close
            </button>
          </div>

          <div class="mt-6 grid gap-4 xl:grid-cols-2">
            <article v-for="dive in missingCoordinateDives" :key="'missing-coordinate-' + dive.id" class="border border-outline-variant/10 bg-surface-container-high/55 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive #{{ dive.id }}</p>
                  <h6 class="mt-2 truncate font-headline text-xl font-bold text-on-surface">{{ dive.siteName }}</h6>
                  <p class="mt-1 text-sm text-on-surface-variant">{{ dive.title }}</p>
                </div>
                <button @click="openMissingCoordinateDive(dive.id)" class="bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary">
                  Open Dive
                </button>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Date</p>
                  <p class="mt-1 text-sm font-semibold text-on-surface">{{ formatDate(dive.date) }} {{ formatTime(dive.date) }}</p>
                </div>
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Dive Computer</p>
                  <p class="mt-1 text-sm font-semibold text-on-surface">{{ dive.device }}</p>
                </div>
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Depth / Duration</p>
                  <p class="mt-1 text-sm font-semibold text-on-surface">{{ dive.depth }} / {{ dive.duration }}</p>
                </div>
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Issue</p>
                  <p class="mt-1 text-sm font-semibold text-tertiary">{{ dive.reason }}</p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>
  `
};

<script>
import {
  buildDiveSequenceMap,
  dayOfMonth,
  monthShort,
  formatDate,
  formatTime,
  diveTitle,
  diveSubtitle,
  diveDeviceLabel,
  formatDepth,
  formatDepthNumber,
  formatDateTime,
  durationShort,
  formatTemperature,
  surfaceTemperature,
  diveModeLabel,
  pressureUsedLabel,
  decoStatusLabel,
  formatBarTotal,
  filledIconStyle,
  parseDate,
  paddedDiveIndex
} from "~/shared/utils/core.js";
import {
  coordinateLabel,
  diveCoordinates,
  diveSiteName,
  escapeHtml,
  markerDiameter,
  normalizeSiteName,
  savedSiteCoordinates
} from "~/shared/utils/dive-map.js";
import { loadLeaflet } from "~/shared/utils/leaflet-loader.js";
import { diveMapPreview } from "~/shared/utils/map-preview.js";

function matchingSavedSite(dive, diveSites) {
  const siteName = normalizeSiteName(diveSiteName(dive));
  if (!siteName || !Array.isArray(diveSites)) return null;
  return diveSites.find((site) => normalizeSiteName(site?.name) === siteName) || null;
}

export default {
  name: "DashboardView",
  props: [
    "displayMode",
    "dives",
    "allDives",
    "diveSites",
    "stats",
    "setView",
    "backendHealthy",
    "openDive",
    "currentUserName",
    "importedDiveCount",
    "openImportQueue"
  ],
  data() {
    return {
      diveMap: null,
      diveTileLayer: null,
      diveLabelLayer: null,
      diveMarkerLayer: null,
      leaflet: null,
      leafletLoadPromise: null,
      showMissingCoordinateDives: false,
      isMapExpanded: false,
      mapViewportInitialized: false
    };
  },
  mounted() {
    this.$nextTick(async () => {
      await this.initializeDiveMap();
      await this.syncDiveMap({ reframe: true });
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
    t(key, fallback = key, params = {}) {
      return this.$t(key, fallback, params);
    },
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
    diveModeLabel,
    pressureUsedLabel,
    decoStatusLabel,
    formatBarTotal,
    coordinateLabel,
    diveSiteName,
    diveMapPreview(dive) {
      return diveMapPreview(dive, this.diveSites);
    },
    async ensureLeaflet() {
      if (this.leaflet) return this.leaflet;
      if (!this.leafletLoadPromise) {
        this.leafletLoadPromise = loadLeaflet().then((leaflet) => {
          this.leaflet = leaflet;
          return leaflet;
        });
      }
      return this.leafletLoadPromise;
    },
    handleMapResize() {
      if (!this.diveMap) return;
      this.diveMap.invalidateSize(false);
    },
    async initializeDiveMap() {
      if (this.diveMap || !this.$refs.diveMapCanvas) return;
      const L = await this.ensureLeaflet();
      if (this.diveMap || !this.$refs.diveMapCanvas) return;

      const map = L.map(this.$refs.diveMapCanvas, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 1.5,
        maxZoom: 12,
        worldCopyJump: true
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      this.diveTileLayer = L.tileLayer("https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        className: "dive-theme-map-tiles",
        referrerPolicy: "origin"
      });
      this.diveTileLayer.addTo(map);
      this.diveMarkerLayer = L.layerGroup().addTo(map);
      map.on("zoomend", () => this.syncDiveMap({ preserveViewport: true }));
      this.diveMap = map;
    },
    diveMarkerIcon(marker) {
      const L = this.leaflet;
      if (!L) return null;
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
      const locationLabel = marker.siteCount > 1 ? `${marker.siteCount} sites in this area` : marker.label;
      const sitePreview =
        marker.siteCount > 1
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
    clusterRadiusForZoom(zoom) {
      if (zoom >= 9.5) return 0;
      if (zoom >= 8.5) return 18;
      if (zoom >= 7.5) return 24;
      if (zoom >= 6.5) return 30;
      if (zoom >= 5.5) return 38;
      return 48;
    },
    baseDisplayMarker(marker) {
      return {
        key: marker.key,
        count: marker.count,
        siteCount: 1,
        label: marker.label,
        siteLabels: [marker.label],
        representativeId: marker.representativeId,
        latestDiveDate: marker.latestDiveDate,
        latitude: marker.latitude,
        longitude: marker.longitude,
        sourceMarkers: [marker]
      };
    },
    displayDiveMapMarkers() {
      if (!this.diveMapMarkers.length) return [];

      const zoom = this.diveMap?.getZoom?.() ?? 4.25;
      const clusterRadius = this.clusterRadiusForZoom(zoom);
      const L = this.leaflet;

      if (!this.diveMap || !L || clusterRadius <= 0) {
        return this.diveMapMarkers
          .map((marker) => this.baseDisplayMarker(marker))
          .sort((left, right) => {
            if (right.count !== left.count) return right.count - left.count;
            return (right.latestDiveDate?.getTime() || 0) - (left.latestDiveDate?.getTime() || 0);
          });
      }

      const clusters = [];

      this.diveMapMarkers.forEach((marker) => {
        const point = this.diveMap.project(L.latLng(marker.latitude, marker.longitude), zoom);
        let nearestCluster = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        clusters.forEach((cluster) => {
          const distance = point.distanceTo(cluster.projectedCenter);
          if (distance <= clusterRadius && distance < nearestDistance) {
            nearestCluster = cluster;
            nearestDistance = distance;
          }
        });

        if (nearestCluster) {
          nearestCluster.count += marker.count;
          nearestCluster.siteCount += 1;
          nearestCluster.latitudeTotal += marker.latitude * marker.count;
          nearestCluster.longitudeTotal += marker.longitude * marker.count;
          nearestCluster.projectedXTotal += point.x * marker.count;
          nearestCluster.projectedYTotal += point.y * marker.count;
          nearestCluster.projectedCenter = L.point(
            nearestCluster.projectedXTotal / nearestCluster.count,
            nearestCluster.projectedYTotal / nearestCluster.count
          );
          nearestCluster.sourceMarkers.push(marker);
          if (!nearestCluster.siteLabels.includes(marker.label)) {
            nearestCluster.siteLabels.push(marker.label);
          }
          if (marker.latestDiveDate && (!nearestCluster.latestDiveDate || marker.latestDiveDate > nearestCluster.latestDiveDate)) {
            nearestCluster.latestDiveDate = marker.latestDiveDate;
            nearestCluster.representativeId = marker.representativeId;
            nearestCluster.label = marker.label;
          }
          return;
        }

        clusters.push({
          key: marker.key,
          count: marker.count,
          siteCount: 1,
          label: marker.label,
          siteLabels: [marker.label],
          representativeId: marker.representativeId,
          latestDiveDate: marker.latestDiveDate,
          latitudeTotal: marker.latitude * marker.count,
          longitudeTotal: marker.longitude * marker.count,
          projectedXTotal: point.x * marker.count,
          projectedYTotal: point.y * marker.count,
          projectedCenter: point,
          sourceMarkers: [marker]
        });
      });

      return clusters
        .map((cluster, index) => ({
          key: cluster.siteCount > 1 ? `cluster-${index}-${cluster.representativeId}` : cluster.key,
          count: cluster.count,
          siteCount: cluster.siteCount,
          label: cluster.label,
          siteLabels: cluster.siteLabels,
          representativeId: cluster.representativeId,
          latestDiveDate: cluster.latestDiveDate,
          latitude: cluster.latitudeTotal / cluster.count,
          longitude: cluster.longitudeTotal / cluster.count,
          sourceMarkers: cluster.sourceMarkers
        }))
        .sort((left, right) => {
          if (right.count !== left.count) return right.count - left.count;
          return (right.latestDiveDate?.getTime() || 0) - (left.latestDiveDate?.getTime() || 0);
        });
    },
    zoomIntoMarkerSector(marker) {
      const L = this.leaflet;
      if (!this.diveMap || !L) return;

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
        maxZoom: 11.5,
        duration: 0.45
      });
    },
    async syncDiveMap(options = {}) {
      if (!this.$refs.diveMapCanvas) return;
      await this.initializeDiveMap();
      if (!this.diveMap || !this.diveMarkerLayer) return;
      const L = this.leaflet;
      if (!L) return;

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
    filledIconStyle() {
      return filledIconStyle;
    },
    isMapView() {
      return this.displayMode === "map";
    },
    dashboardUserName() {
      return this.currentUserName || this.t("Diver", "Diver");
    },
    hasImportedDives() {
      return Number(this.importedDiveCount || 0) > 0;
    },
    importedDiveLabel() {
      const count = Number(this.importedDiveCount || 0);
      return this.t(
        count === 1 ? "{count} imported dive awaiting completion" : "{count} imported dives awaiting completion",
        count === 1 ? "{count} imported dive awaiting completion" : "{count} imported dives awaiting completion",
        { count }
      );
    },
    totalBottomTimeLabel() {
      const totalSeconds = Number(this.stats?.totalSeconds || 0);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.round((totalSeconds % 3600) / 60);
      return `${hours}h ${minutes}min`;
    },
    averageBottomTimeLabel() {
      const diveCount = Number(this.stats?.totalDives || 0);
      const totalSeconds = Number(this.stats?.totalSeconds || 0);
      if (!diveCount || !totalSeconds) return "No average yet";
      return `Avg ${durationShort(Math.round(totalSeconds / diveCount)).replace(/m/g, "min")}`;
    },
    yearlyDiveCount() {
      const currentYear = new Date().getFullYear();
      return this.dives.filter((dive) => parseDate(dive?.started_at)?.getFullYear() === currentYear).length;
    },
    dashboardStatCards() {
      return [
        {
          id: "dive-count",
          icon: "database",
          label: "Dive Count",
          value: String(this.stats?.totalDives || 0),
          unit: "Dives",
          detail: `${this.yearlyDiveCount} this year`
        },
        {
          id: "bottom-time",
          icon: "timer",
          label: "Bottom Time",
          value: this.totalBottomTimeLabel.replace("h ", "h\n"),
          unit: "",
          detail: this.averageBottomTimeLabel
        },
        {
          id: "max-depth",
          icon: "straighten",
          label: "Max Depth",
          value: `${this.formatDepthNumber(this.stats?.maxDepth)} m`,
          unit: "",
          detail: "Deepest logged dive"
        },
        {
          id: "gas-used",
          icon: "water_drop",
          label: "Air Consumption",
          value: `${this.formatBarTotal(this.stats?.totalBarConsumed)} bar`,
          unit: "",
          detail: "Recorded consumption"
        },
        {
          id: "mapped-sites",
          icon: "explore",
          label: "Mapped Sites",
          value: String(this.mappedSiteCount),
          unit: "Sites",
          detail: `${this.mappedDiveCount} mapped dives`
        },
        {
          id: "import-queue",
          icon: this.hasImportedDives ? "warning" : "task_alt",
          label: "Import Queue",
          value: String(Number(this.importedDiveCount || 0)),
          unit: "Pending",
          detail: this.hasImportedDives ? "Needs review" : "Clear"
        }
      ];
    },
    recentDiveFeed() {
      return this.recentDives.slice(0, 5).map((dive, index) => ({
        dive,
        active: index === 0,
        dateLabel: this.formatDate(dive.started_at),
        title: this.diveTitle(dive),
        meta: `${this.formatDepth(dive.max_depth_m)} / ${this.formatDurationShort(dive.duration_seconds).replace(/m/g, "min")}`
      }));
    },
    diveSequenceMap() {
      return buildDiveSequenceMap(this.allDives);
    },
    diveMapMarkers() {
      const markers = new Map();

      this.mapSourceDives.forEach((dive) => {
        const savedSite = matchingSavedSite(dive, this.diveSites);
        const coordinates = savedSiteCoordinates(savedSite) || diveCoordinates(dive);
        if (!coordinates) return;

        const siteName = diveSiteName(dive);
        const key =
          savedSite?.id ||
          normalizeSiteName(savedSite?.name) ||
          normalizeSiteName(siteName) ||
          `${coordinates.lat.toFixed(4)}:${coordinates.lon.toFixed(4)}`;
        const existing = markers.get(key);
        const diveDate = parseDate(dive?.started_at);
        const siteLabel = (typeof savedSite?.name === "string" && savedSite.name.trim()) || siteName || diveTitle(dive);

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
          let reason;

          if (!siteName) {
            reason = this.t("No dive site assigned", "No dive site assigned");
          } else if (!savedSite) {
            reason = this.t("Dive site is not linked to a saved site in Settings", "Dive site is not linked to a saved site in Settings");
          } else {
            reason = this.t("Saved dive site has no coordinates", "Saved dive site has no coordinates");
          }

          return {
            id: dive.id,
            displayIndex: paddedDiveIndex(dive, this.diveSequenceMap),
            date: dive.started_at,
            siteName: siteName || this.t("Site pending", "Site pending"),
            title: diveTitle(dive),
            device: diveDeviceLabel(dive),
            depth: formatDepth(dive.max_depth_m),
            duration: durationShort(dive.duration_seconds),
            reason
          };
        })
        .sort((left, right) => (parseDate(right.date)?.getTime() || 0) - (parseDate(left.date)?.getTime() || 0));
    },
    mapCoverageLabel() {
      if (!this.mapSourceDives.length) return this.t("No dives loaded", "No dives loaded");
      if (!this.hasDiveMapMarkers)
        return this.t(
          "No coordinates found in committed dives or saved dive sites",
          "No coordinates found in committed dives or saved dive sites"
        );
      if (!this.unmappedDiveCount) return this.t("Geotag coverage complete", "Geotag coverage complete");
      return this.t(
        this.unmappedDiveCount === 1 ? "{count} dive is missing coordinates" : "{count} dives are missing coordinates",
        this.unmappedDiveCount === 1 ? "{count} dive is missing coordinates" : "{count} dives are missing coordinates",
        { count: this.unmappedDiveCount }
      );
    },
    mapTopSites() {
      return this.diveMapMarkers.slice(0, 4).map((site) => ({
        ...site,
        label: site.label.replace(/[^\x20-\x7E]/g, "").trim() || site.label
      }));
    },
    mapFooterNote() {
      if (!this.hasDiveMapMarkers)
        return this.t(
          "Add coordinates to saved dive sites to place committed dives accurately on the map.",
          "Add coordinates to saved dive sites to place committed dives accurately on the map."
        );
      return this.t(
        "Saved dive-site coordinates take priority over raw telemetry so the map reflects the curated logbook location for each dive.",
        "Saved dive-site coordinates take priority over raw telemetry so the map reflects the curated logbook location for each dive."
      );
    },
    mapTelemetryLabel() {
      if (!this.hasDiveMapMarkers) return this.t("Awaiting usable GPS telemetry", "Awaiting usable GPS telemetry");
      return this.t(
        this.mappedDiveCount === 1
          ? "{diveCount} dive plotted across {siteCount} {siteLabel}"
          : "{diveCount} dives plotted across {siteCount} {siteLabel}",
        this.mappedDiveCount === 1
          ? "{diveCount} dive plotted across {siteCount} {siteLabel}"
          : "{diveCount} dives plotted across {siteCount} {siteLabel}",
        {
          diveCount: this.mappedDiveCount,
          siteCount: this.mappedSiteCount,
          siteLabel: this.t(this.mappedSiteCount === 1 ? "site" : "sites", this.mappedSiteCount === 1 ? "site" : "sites")
        }
      );
    }
  }
};
</script>

<template>
  <section :class="['dashboard-command-center text-on-surface', isMapView ? 'dashboard-map-only' : '']">
    <section v-if="hasImportedDives && !isMapView" class="dashboard-glass-card border-l-4 border-tertiary p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="dashboard-micro-label text-tertiary">Attention Required</p>
          <h4 class="mt-2 font-headline text-2xl font-bold text-primary">{{ importedDiveLabel }}</h4>
          <p class="mt-2 text-sm leading-6 text-on-surface-variant">
            Complete the dive site before these imported dives enter the logbook. Buddy and guide can stay blank.
          </p>
        </div>
        <UButton
          @click="openImportQueue()"
          class="rounded-xl bg-tertiary px-5 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-background transition-transform hover:scale-[0.98]"
        >
          Review Imported Dives
        </UButton>
      </div>
    </section>

    <div class="dashboard-canvas">
      <aside v-if="!isMapView" class="dashboard-side-rail">
        <section class="dashboard-glass-card dashboard-section dashboard-recent-card flex min-h-[30rem] flex-col p-5">
          <div class="mb-6 flex items-center justify-between">
            <h4 class="font-headline text-xl font-bold text-primary">Recent Dives</h4>
          </div>
          <div class="dashboard-feed flex-1 overflow-y-auto pr-1">
            <article
              v-for="entry in recentDiveFeed"
              :key="'feed-' + entry.dive.id"
              @click="openDive(entry.dive.id)"
              @keyup.enter="openDive(entry.dive.id)"
              tabindex="0"
              role="button"
              class="dashboard-feed-item cursor-pointer"
              :class="entry.active ? 'dashboard-feed-item-active' : ''"
            >
              <span class="dashboard-feed-dot"></span>
              <p class="dashboard-micro-label mb-1" :class="entry.active ? 'text-secondary' : 'text-on-surface-variant'">
                {{ entry.dateLabel }}
              </p>
              <h5 class="truncate text-sm font-bold text-primary">{{ entry.title }}</h5>
              <p class="mt-1 text-sm text-on-surface-variant">{{ entry.meta }}</p>
            </article>
            <div
              v-if="!recentDiveFeed.length"
              class="rounded-xl border border-outline-variant/15 bg-surface-container-low/60 p-4 text-sm text-on-surface-variant"
            >
              No committed dives yet.
            </div>
          </div>
          <UButton
            @click="setView('logs')"
            class="mt-6 flex items-center gap-2 self-start font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary hover:underline"
          >
            View All Logs <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </UButton>
        </section>
      </aside>

      <main class="dashboard-main-stage">
        <section v-if="!isMapView" class="dashboard-section dashboard-stat-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in dashboardStatCards.slice(0, 4)"
            :key="'stage-stat-' + card.id"
            class="dashboard-glass-card dashboard-stat-tile p-4"
          >
            <div class="dashboard-stat-icon-wrap">
              <span
                class="material-symbols-outlined dashboard-stat-icon text-secondary"
                :class="card.id === 'dive-count' ? 'dashboard-neon' : ''"
                :style="filledIconStyle"
                >{{ card.icon }}</span
              >
            </div>
            <div class="min-w-0">
              <p class="dashboard-stat-label">{{ card.label }}</p>
              <p class="dashboard-stat-value">
                <span>{{ card.value }}</span>
                <span v-if="card.unit" class="dashboard-stat-unit">{{ card.unit }}</span>
              </p>
            </div>
          </article>
        </section>

        <section
          :class="
            isMapExpanded
              ? 'fixed inset-0 z-[490] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm'
              : isMapView
                ? 'dashboard-section dashboard-map-section relative min-h-[calc(100vh-10rem)]'
                : 'dashboard-section dashboard-map-section relative min-h-[31rem]'
          "
          @click.self="closeMapExpanded()"
        >
          <div :class="isMapExpanded ? 'w-full max-w-7xl' : 'h-full'">
            <div
              :class="['dashboard-glass-card dashboard-map-panel relative h-full overflow-hidden']"
              :style="isMapExpanded ? { height: '85vh' } : null"
            >
              <UButton
                v-if="isMapExpanded"
                @click="closeMapExpanded()"
                class="absolute right-6 top-6 z-[480] rounded-full border border-outline-variant/30 bg-background/65 px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-sm"
              >
                Close
              </UButton>
              <UButton
                v-else
                @click="toggleMapExpanded()"
                class="dashboard-map-expand-button"
                type="button"
                aria-label="Expand map"
                title="Expand map"
              >
                <span class="material-symbols-outlined text-lg">fullscreen</span>
              </UButton>
              <div ref="diveMapCanvas" class="dive-theme-map"></div>
            </div>
          </div>
        </section>

        <section v-if="mapTopSites.length" class="dashboard-section dashboard-sites-section grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="site in mapTopSites"
            :key="'site-card-' + site.key"
            class="dashboard-glass-card dashboard-location-card flex items-center justify-between gap-4 p-4"
          >
            <div class="min-w-0">
              <h5 class="truncate text-sm font-bold text-primary">{{ site.label }}</h5>
              <p class="dashboard-micro-label mt-1 text-on-surface-variant">
                {{ coordinateLabel(site.latitude, "N", "S") }} / {{ coordinateLabel(site.longitude, "E", "W") }}
              </p>
            </div>
            <div class="font-headline text-2xl font-bold text-secondary">{{ site.count }}</div>
          </article>
        </section>
      </main>
    </div>

    <div
      v-if="showMissingCoordinateDives && missingCoordinateDives.length"
      class="fixed inset-0 z-[500] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      @click.self="closeMissingCoordinateDives()"
    >
      <section class="max-h-full w-full max-w-6xl overflow-auto border border-tertiary/18 bg-surface-container-low p-6 shadow-panel md:p-8">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-tertiary">Missing Coordinates</p>
            <h5 class="mt-2 font-headline text-3xl font-bold tracking-tight">
              {{ unmappedDiveCount }} {{ unmappedDiveCount === 1 ? "Dive Needs Coordinates" : "Dives Need Coordinates" }}
            </h5>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-on-surface-variant">
              These committed logbook dives do not currently resolve to a saved dive-site coordinate or usable embedded GPS position.
            </p>
          </div>
          <UButton
            @click="closeMissingCoordinateDives()"
            class="self-start bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary transition-colors hover:text-primary"
          >
            Close
          </UButton>
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-2">
          <article
            v-for="dive in missingCoordinateDives"
            :key="'missing-coordinate-' + dive.id"
            class="border border-outline-variant/10 bg-surface-container-high/55 p-4"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive {{ dive.displayIndex }}</p>
                <h6 class="mt-2 truncate font-headline text-xl font-bold text-on-surface">{{ dive.siteName }}</h6>
                <p class="mt-1 text-sm text-on-surface-variant">{{ dive.title }}</p>
              </div>
              <UButton
                @click="openMissingCoordinateDive(dive.id)"
                class="bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-on-primary"
              >
                Open Dive
              </UButton>
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
</template>

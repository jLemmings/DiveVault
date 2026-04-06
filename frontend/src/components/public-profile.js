import L from "leaflet";
import DiveDetailView from "./dive-detail.js";
import { buildDiveSequenceMap, diveTitle, formatDate, formatDepth, durationShort, numberOrZero, parseDate, importDraftSeed, paddedDiveIndex } from "../core.js";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export default {
  name: "PublicProfileView",
  components: {
    DiveDetailView
  },
  props: {
    slug: {
      type: String,
      default: ""
    }
  },
  data() {
    return {
      loading: true,
      error: "",
      diver: null,
      dives: [],
      stats: {},
      selectedDiveId: null,
      diveMap: null,
      diveTileLayer: null,
      diveMarkerLayer: null,
      mapViewportInitialized: false
    };
  },
  computed: {
    selectedDive() {
      return this.dives.find((dive) => String(dive.id) === String(this.selectedDiveId)) || null;
    },
    diveMapMarkers() {
      const markers = new Map();

      this.dives.forEach((dive) => {
        const coordinates = diveCoordinates(dive);
        if (!coordinates) return;

        const siteName = diveSiteName(dive);
        const key = normalizeSiteName(siteName) || `${coordinates.lat.toFixed(4)}:${coordinates.lon.toFixed(4)}`;
        const existing = markers.get(key);
        const diveDate = parseDate(dive?.started_at);
        const siteLabel = siteName || diveTitle(dive);

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
    mappedDiveCount() {
      return this.diveMapMarkers.reduce((sum, marker) => sum + marker.count, 0);
    },
    mappedSiteCount() {
      return this.diveMapMarkers.length;
    },
    diveSequenceMap() {
      return buildDiveSequenceMap(this.dives);
    },
    totalHoursLabel() {
      return `${numberOrZero(this.stats?.totalHours).toFixed(1)}h`;
    },
    maxDepthLabel() {
      return formatDepth(this.stats?.maxDepth);
    }
  },
  watch: {
    slug: {
      immediate: true,
      handler() {
        this.fetchPublicProfile();
      }
    },
    diveMapMarkers: {
      handler() {
        this.$nextTick(() => this.syncDiveMap({ reframe: !this.mapViewportInitialized }));
      },
      deep: true
    }
  },
  mounted() {
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
  methods: {
    formatDate,
    formatDepth,
    formatDurationShort: durationShort,
    diveTitle,
    displayDiveIndex(dive) {
      return paddedDiveIndex(dive, this.diveSequenceMap);
    },
    diveSiteLabel(dive) {
      return diveSiteName(dive) || "Unspecified Site";
    },
    openDive(diveId) {
      this.selectedDiveId = diveId;
    },
    closeDive() {
      this.selectedDiveId = null;
    },
    async fetchPublicProfile() {
      if (!this.slug) {
        this.error = "Missing public profile slug.";
        this.loading = false;
        return;
      }

      this.loading = true;
      this.error = "";
      try {
        const response = await fetch(`/api/public/divers/${encodeURIComponent(this.slug)}`, {
          credentials: "include"
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || `API returned ${response.status}`);
        }

        this.diver = payload?.diver || null;
        this.dives = Array.isArray(payload?.dives) ? payload.dives : [];
        this.stats = payload?.stats && typeof payload.stats === "object" ? payload.stats : {};
        this.selectedDiveId = null;
        this.$nextTick(() => this.syncDiveMap({ reframe: true }));
      } catch (error) {
        this.error = error?.message || "Could not load the public dive profile.";
        this.diver = null;
        this.dives = [];
        this.stats = {};
      } finally {
        this.loading = false;
      }
    },
    handleMapResize() {
      if (!this.diveMap) return;
      this.diveMap.invalidateSize(false);
    },
    initializeDiveMap() {
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

      this.diveTileLayer = L.tileLayer("https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
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
      const size = markerDiameter(marker.count) + 10;
      return L.divIcon({
        className: "dive-map-marker-shell",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -Math.round(size / 2)],
        html: `
          <span class="dive-map-marker-ring" style="width:${size}px;height:${size}px;">
            <span class="dive-map-marker-core"><span class="dive-map-marker-count">${marker.count}</span></span>
          </span>
        `
      });
    },
    diveMarkerBubble(marker) {
      const diveLabel = marker.count === 1 ? "1 dive" : `${marker.count} dives`;
      const locationLabel = marker.siteCount > 1 ? `${marker.siteCount} sites in this area` : marker.label;
      const sitePreview = marker.siteCount > 1
        ? `${marker.siteLabels.slice(0, 3).join(" / ")}${marker.siteCount > 3 ? ` +${marker.siteCount - 3} more` : ""}`
        : "";
      return `
        <div class="dive-map-info-bubble">
          <p class="dive-map-info-title">${escapeHtml(locationLabel)}</p>
          <p class="dive-map-info-meta">${escapeHtml(diveLabel)} | ${escapeHtml(coordinateLabel(marker.latitude, "N", "S"))} / ${escapeHtml(coordinateLabel(marker.longitude, "E", "W"))}</p>
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

      if (!this.diveMap || clusterRadius <= 0) {
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

      return clusters.map((cluster, index) => ({
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
      }));
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
        this.openDive(marker.representativeId);
        this.diveMap.flyTo(positions[0], Math.min((this.diveMap.getZoom?.() || 4.25) + 2, 10), { duration: 0.45 });
        return;
      }

      this.diveMap.flyToBounds(L.latLngBounds(positions), {
        padding: [72, 72],
        maxZoom: 11.5,
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
        leafletMarker.on("click", () => this.zoomIntoMarkerSector(marker));
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
    }
  },
  template: `
    <div class="min-h-screen bg-background px-4 py-6 text-on-background md:px-8 md:py-8">
      <div class="mx-auto max-w-7xl">
        <section v-if="loading" class="bg-surface-container-low p-10 shadow-panel">
          <p class="font-headline text-2xl font-bold">Loading public dive profile...</p>
          <p class="mt-2 text-on-surface-variant">Fetching the published dive log and map.</p>
        </section>

        <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
          <p class="font-headline text-2xl font-bold text-on-error-container">Public profile unavailable</p>
          <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
        </section>

        <section v-else class="space-y-8">
          <div class="relative overflow-hidden bg-surface-container-low p-8 shadow-panel">
            <div class="absolute inset-0 pointer-events-none technical-grid opacity-10"></div>
            <div class="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Public Dive Log</p>
                <h1 class="mt-3 font-headline text-4xl font-bold tracking-tight text-on-surface md:text-5xl">{{ diver?.name || 'DiveVault Diver' }}</h1>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Published dives only. Private settings, certifications, and internal telemetry metadata stay off this page.</p>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div class="rounded-2xl bg-surface-container-high px-5 py-4">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dives</p>
                  <p class="mt-2 font-headline text-3xl font-bold text-primary">{{ stats.totalDives || dives.length }}</p>
                </div>
                <div class="rounded-2xl bg-surface-container-high px-5 py-4">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Hours</p>
                  <p class="mt-2 font-headline text-3xl font-bold">{{ totalHoursLabel }}</p>
                </div>
                <div class="rounded-2xl bg-surface-container-high px-5 py-4">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Max Depth</p>
                  <p class="mt-2 font-headline text-3xl font-bold">{{ maxDepthLabel }}</p>
                </div>
              </div>
            </div>
          </div>

          <section class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
            <div class="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Published Dive Map</p>
                <h2 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Dive Map</h2>
              </div>
              <div class="flex flex-wrap gap-3">
                <span class="bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ mappedDiveCount }} mapped dives</span>
                <span class="bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">{{ mappedSiteCount }} unique sites</span>
              </div>
            </div>
            <div class="dive-map-shell relative overflow-hidden border border-primary/10 bg-surface-container-low shadow-panel">
              <div ref="diveMapCanvas" class="dive-theme-map"></div>
            </div>
          </section>

          <dive-detail-view
            v-if="selectedDive"
            :dive="selectedDive"
            :all-dives="dives"
            :public-view="true"
            :close-detail="closeDive"
          ></dive-detail-view>

          <section class="space-y-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Published Entries</p>
                <h2 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Dive Log</h2>
              </div>
            </div>

            <div v-if="!dives.length" class="rounded-[1.5rem] bg-surface-container-low p-8 shadow-panel">
              <p class="font-headline text-2xl font-bold">No public dives available</p>
              <p class="mt-2 text-secondary">This diver has not published any completed dives yet.</p>
            </div>

            <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <article
                v-for="dive in dives"
                :key="dive.id"
                @click="openDive(dive.id)"
                @keyup.enter="openDive(dive.id)"
                tabindex="0"
                role="button"
                class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel transition-colors hover:bg-surface-container-high focus:bg-surface-container-high focus:outline-none"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ formatDate(dive.started_at) }}</p>
                    <h3 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ diveTitle(dive) }}</h3>
                    <p class="mt-2 text-sm text-secondary">{{ diveSiteLabel(dive) }}</p>
                  </div>
                  <span class="rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{{ displayDiveIndex(dive) }}</span>
                </div>
                <div class="mt-6 grid grid-cols-3 gap-3">
                  <div class="rounded-xl bg-surface-container-high px-4 py-3">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Depth</p>
                    <p class="mt-2 font-headline text-xl font-bold text-primary">{{ formatDepth(dive.max_depth_m) }}</p>
                  </div>
                  <div class="rounded-xl bg-surface-container-high px-4 py-3">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Duration</p>
                    <p class="mt-2 font-headline text-xl font-bold">{{ formatDurationShort(dive.duration_seconds) }}</p>
                  </div>
                  <div class="rounded-xl bg-surface-container-high px-4 py-3">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Computer</p>
                    <p class="mt-2 text-sm font-semibold text-on-surface">{{ dive.vendor }} {{ dive.product }}</p>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </section>
      </div>
    </div>
  `
};

import { numericCoordinate, validCoordinates } from "~/shared/utils/dive-map.js";
import { loadLeaflet } from "~/shared/utils/leaflet-loader.js";

export function createSettingsDiveSiteMapOptions() {
  return {
    async ensureDiveSiteMapLeaflet() {
      if (this._diveSiteMapLeaflet) return this._diveSiteMapLeaflet;
      if (!this._diveSiteMapLeafletPromise) {
        this._diveSiteMapLeafletPromise = loadLeaflet().then((leaflet) => {
          this._diveSiteMapLeaflet = leaflet;
          return leaflet;
        });
      }
      return this._diveSiteMapLeafletPromise;
    },
    ensureDiveSiteMapStores() {
      if (!this._diveSiteMapEditors) {
        this._diveSiteMapEditors = new Map();
      }
      if (!this._diveSiteMapRefs) {
        this._diveSiteMapRefs = new Map();
      }
    },
    setDiveSiteMapRef(siteId, element) {
      this.ensureDiveSiteMapStores();
      if (element) {
        this._diveSiteMapRefs.set(siteId, element);
        return;
      }
      this._diveSiteMapRefs.delete(siteId);
    },
    diveSiteMapOpen(siteId) {
      return this.openDiveSiteMapIds.includes(siteId);
    },
    toggleDiveSiteMap(siteId) {
      if (this.diveSiteMapOpen(siteId)) {
        this.closeDiveSiteMap(siteId);
        return;
      }
      this.openDiveSiteMapIds = [siteId];
      this.$nextTick(() => this.initializeDiveSiteMap(siteId));
    },
    closeDiveSiteMap(siteId) {
      this.ensureDiveSiteMapStores();
      const editor = this._diveSiteMapEditors.get(siteId);
      if (editor?.map) {
        editor.map.remove();
      }
      this._diveSiteMapEditors.delete(siteId);
      this.openDiveSiteMapIds = this.openDiveSiteMapIds.filter((entryId) => entryId !== siteId);
    },
    closeAllDiveSiteMaps() {
      this.ensureDiveSiteMapStores();
      for (const siteId of [...this._diveSiteMapEditors.keys()]) {
        this.closeDiveSiteMap(siteId);
      }
      this.openDiveSiteMapIds = [];
    },
    diveSiteCoordinatePair(site) {
      const lat = numericCoordinate(site?.latitude);
      const lon = numericCoordinate(site?.longitude);
      return validCoordinates(lat, lon) ? { lat, lon } : null;
    },
    updateDiveSiteCoordinates(siteId, lat, lon) {
      if (!validCoordinates(lat, lon)) return;
      const index = this.findCollectionIndexById(this.diveSiteDrafts, siteId);
      if (index === -1) return;
      const nextDrafts = this.diveSiteDrafts.slice();
      nextDrafts[index] = {
        ...nextDrafts[index],
        latitude: lat.toFixed(6),
        longitude: lon.toFixed(6)
      };
      this.diveSiteDrafts = nextDrafts;
      this.syncDiveSiteMapFromFields(siteId, { preserveViewport: true });
    },
    diveSiteMapMarkerIcon() {
      const L = this._diveSiteMapLeaflet;
      if (!L) return null;
      const size = 32;
      return L.divIcon({
        className: "dive-map-marker-shell",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `
          <span class="dive-map-marker-ring" style="width:${size}px;height:${size}px;">
            <span class="dive-map-marker-core">
              <span class="material-symbols-outlined text-[16px]">my_location</span>
            </span>
          </span>
        `
      });
    },
    ensureDiveSiteMapMarker(siteId, editor, position) {
      const L = this._diveSiteMapLeaflet;
      if (!L) return null;
      if (editor.marker) {
        editor.marker.setLatLng(position);
        return editor.marker;
      }
      editor.marker = L.marker(position, {
        draggable: true,
        autoPan: true,
        icon: this.diveSiteMapMarkerIcon(),
        title: "Dive site GPS coordinate"
      }).addTo(editor.map);
      editor.marker.on("dragend", () => {
        const nextPosition = editor.marker.getLatLng();
        this.updateDiveSiteCoordinates(siteId, nextPosition.lat, nextPosition.lng);
      });
      return editor.marker;
    },
    async initializeDiveSiteMap(siteId) {
      this.ensureDiveSiteMapStores();
      const container = this._diveSiteMapRefs.get(siteId);
      if (!container) return;

      const site = this.diveSiteDrafts.find((entry) => entry.id === siteId);
      if (!site) return;

      const existingEditor = this._diveSiteMapEditors.get(siteId);
      if (existingEditor?.map) {
        existingEditor.map.invalidateSize(false);
        this.syncDiveSiteMapFromFields(siteId);
        return;
      }

      const L = await this.ensureDiveSiteMapLeaflet();
      if (!this.diveSiteMapOpen(siteId)) return;
      const currentContainer = this._diveSiteMapRefs.get(siteId);
      if (!currentContainer) return;

      const coordinates = this.diveSiteCoordinatePair(site);
      const center = coordinates ? [coordinates.lat, coordinates.lon] : [20, 0];
      const map = L.map(currentContainer, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 1.5,
        maxZoom: 16,
        worldCopyJump: true
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        className: "dive-theme-map-tiles",
        referrerPolicy: "origin"
      }).addTo(map);

      const editor = { map, marker: null };
      this._diveSiteMapEditors.set(siteId, editor);
      map.setView(center, coordinates ? 13 : 2.5);
      if (coordinates) {
        this.ensureDiveSiteMapMarker(siteId, editor, center);
      }
      map.on("click", (event) => {
        this.updateDiveSiteCoordinates(siteId, event.latlng.lat, event.latlng.lng);
      });
      this.$nextTick(() => map.invalidateSize(false));
    },
    syncDiveSiteMapFromFields(siteId, options = {}) {
      this.ensureDiveSiteMapStores();
      const editor = this._diveSiteMapEditors.get(siteId);
      if (!editor?.map) return;
      const site = this.diveSiteDrafts.find((entry) => entry.id === siteId);
      const coordinates = this.diveSiteCoordinatePair(site);
      if (!coordinates) return;
      const position = [coordinates.lat, coordinates.lon];
      this.ensureDiveSiteMapMarker(siteId, editor, position);
      if (!options.preserveViewport) {
        editor.map.setView(position, Math.max(editor.map.getZoom() || 13, 13));
      }
      editor.map.invalidateSize(false);
    }
  };
}



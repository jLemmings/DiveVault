<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "DiveSitesTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "areDiveSitesEditing",
      "diveSiteDrafts",
      "diveSiteFilter",
      "diveSitePage",
      "diveSitePageCount",
      "diveSitePageSize",
      "diveSitePageSizeOptions",
      "diveSitePaginationLabel",
      "diveSites",
      "diveSitesSaving",
      "isInteractionLocked",
      "pagedDiveSites",
      "visibleDiveSites"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "addDiveSiteEntry",
      "cancelDiveSitesEdit",
      "confirmRemoveDiveSiteItem",
      "displayValue",
      "diveSiteHasCoordinates",
      "diveSiteMapOpen",
      "editDiveSiteItem",
      "isDiveSiteEditing",
      "isDiveSiteExpanded",
      "isLookingUpDiveSite",
      "nextDiveSitePage",
      "pagedDiveSiteTitle",
      "previousDiveSitePage",
      "saveDiveSites",
      "searchDiveSiteLocationById",
      "setDiveSiteMapRef",
      "syncDiveSiteMapFromFields",
      "toggleDiveSiteMap"
    ])
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Sites</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Reusable Site Directory</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Locations are summarized first, with GPS detail tucked underneath so the list feels more like a directory and less like a long form dump.</p>
      </div>
      <div class="settings-toolbar">
        <button @click="addDiveSiteEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Dive Site</button>
      </div>
    </div>

    <label class="settings-filter-field mb-4">
      <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
      <input v-model="diveSiteFilter" type="text" class="settings-input" placeholder="Filter dive sites" />
    </label>

    <div v-if="!areDiveSitesEditing && diveSites.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved dive sites</p>
      <p class="mt-2 text-sm text-secondary">Create sites here so logbook entries can reuse them and the dashboard map can plot your dives.</p>
    </div>

    <div v-else-if="areDiveSitesEditing && diveSiteDrafts.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved dive sites</p>
      <p class="mt-2 text-sm text-secondary">Add the first site in your logbook catalog.</p>
    </div>

    <div v-else-if="visibleDiveSites.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No matching dive sites</p>
      <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved site directory.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ diveSitePaginationLabel }}</p>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label class="flex items-center gap-3">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Dive Sites Per Page</span>
            <select v-model.number="diveSitePageSize" class="settings-input min-w-[5.5rem] py-2">
              <option v-for="size in diveSitePageSizeOptions" :key="'settings-dive-site-page-size-' + size" :value="size">{{ size }}</option>
            </select>
          </label>
          <div class="flex items-center gap-2">
            <button @click="previousDiveSitePage" :disabled="diveSitePage === 1" class="settings-button settings-button-secondary" :class="diveSitePage === 1 ? 'opacity-50' : ''">Previous</button>
            <span class="settings-chip">Page {{ diveSitePage }} / {{ diveSitePageCount }}</span>
            <button @click="nextDiveSitePage" :disabled="diveSitePage >= diveSitePageCount" class="settings-button settings-button-secondary" :class="diveSitePage >= diveSitePageCount ? 'opacity-50' : ''">Next</button>
          </div>
        </div>
      </div>

      <article v-for="(site, index) in pagedDiveSites" :key="site.id" class="settings-item-card">
        <div class="settings-item-header">
          <div class="min-w-0">
            <h5 class="font-headline text-2xl font-bold tracking-tight text-on-surface">{{ pagedDiveSiteTitle(site, index) }}</h5>
            <div class="settings-chip-row mt-3">
              <span class="settings-chip">
                <span class="material-symbols-outlined text-[14px]">location_on</span>
                {{ displayValue(site.location, 'Location pending') }}
              </span>
              <span class="settings-chip">
                <span class="material-symbols-outlined text-[14px]">public</span>
                {{ displayValue(site.country, 'Country pending') }}
              </span>
              <span class="settings-chip" :class="diveSiteHasCoordinates(site) ? 'is-accent' : ''">
                <span class="material-symbols-outlined text-[14px]">{{ diveSiteHasCoordinates(site) ? 'my_location' : 'location_off' }}</span>
                {{ diveSiteHasCoordinates(site) ? 'GPS ready' : 'No GPS' }}
              </span>
            </div>
          </div>

          <div class="settings-toolbar">
            <button
              v-if="!isDiveSiteEditing(site.id)"
              @click="editDiveSiteItem(site.id)"
              class="settings-button settings-button-secondary"
            >
              Edit Site
            </button>
            <button
              v-if="isDiveSiteEditing(site.id)"
              @click="confirmRemoveDiveSiteItem(site.id)"
              class="settings-button settings-button-danger"
            >
              Remove
            </button>
            <button
              v-if="isDiveSiteEditing(site.id)"
              @click="cancelDiveSitesEdit"
              :disabled="isInteractionLocked"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              v-if="isDiveSiteEditing(site.id)"
              @click="saveDiveSites"
              :disabled="isInteractionLocked"
              class="settings-button settings-button-primary"
            >
              {{ diveSitesSaving ? 'Saving Dive Site' : 'Save Dive Site' }}
            </button>
          </div>
        </div>

        <div v-if="isDiveSiteEditing(site.id) || isDiveSiteExpanded(site.id)" class="space-y-5">
          <div v-if="isDiveSiteEditing(site.id)" class="space-y-5">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
              <input v-model="site.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
            </label>
            <div class="settings-side-panel mt-3">
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Lookup</p>
                    <p class="mt-2 text-sm text-secondary">Search from the location text, or open the map here and drag the marker to set the exact coordinate.</p>
                  </div>
                  <button
                    @click="searchDiveSiteLocationById(site.id)"
                    :disabled="isLookingUpDiveSite(site.id)"
                    class="settings-button settings-button-secondary"
                  >
                    {{ isLookingUpDiveSite(site.id) ? 'Searching GPS' : 'Search GPS From Location' }}
                  </button>
                  <button
                    @click="toggleDiveSiteMap(site.id)"
                    class="settings-button settings-button-secondary"
                  >
                    {{ diveSiteMapOpen(site.id) ? 'Close Map' : 'Map' }}
                  </button>
                </div>
                <div class="settings-form-grid settings-form-grid-wide">
                  <label class="space-y-2 md:col-span-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                    <input v-model="site.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                    <input v-model="site.country" type="text" class="settings-input" placeholder="Egypt" />
                  </label>
                </div>
                <div class="settings-form-grid settings-form-grid-wide">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <input v-model="site.latitude" @input="syncDiveSiteMapFromFields(site.id)" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <input v-model="site.longitude" @input="syncDiveSiteMapFromFields(site.id)" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                  </label>
                </div>
                <div v-if="diveSiteMapOpen(site.id)" class="space-y-3">
                  <div
                    :ref="(element) => setDiveSiteMapRef(site.id, element)"
                    class="dive-theme-map h-80 min-h-80 overflow-hidden rounded-2xl border border-primary/10"
                  ></div>
                  <p class="text-xs leading-5 text-secondary">Drag the marker or click the map to set the exact GPS coordinate. Save the dive site to keep the new location.</p>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="settings-detail-grid">
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.name) }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.country, 'Not set') }}</p>
            </div>
            <div class="settings-info-card md:col-span-2">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.location, 'Not set') }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.latitude, 'Not set') }}</p>
            </div>
            <div class="settings-info-card">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</p>
              <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(site.longitude, 'Not set') }}</p>
            </div>
          </div>
        </div>
      </article>

      <div class="flex flex-col gap-4 border-t border-primary/10 pt-4 md:flex-row md:items-center md:justify-between">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ diveSitePaginationLabel }}</p>
        <div class="flex items-center gap-2">
          <button @click="previousDiveSitePage" :disabled="diveSitePage === 1" class="settings-button settings-button-secondary" :class="diveSitePage === 1 ? 'opacity-50' : ''">Previous</button>
          <span class="settings-chip">Page {{ diveSitePage }} / {{ diveSitePageCount }}</span>
          <button @click="nextDiveSitePage" :disabled="diveSitePage >= diveSitePageCount" class="settings-button settings-button-secondary" :class="diveSitePage >= diveSitePageCount ? 'opacity-50' : ''">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>



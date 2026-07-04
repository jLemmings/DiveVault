<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "GuidesTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "areGuidesEditing",
      "guideDrafts",
      "guideFilter",
      "guides",
      "guidesSaving",
      "isInteractionLocked",
      "visibleGuides"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "addGuideEntry",
      "cancelGuidesEdit",
      "confirmRemoveGuideItem",
      "editGuideItem",
      "guideTitle",
      "isGuideEditing",
      "saveGuides"
    ])
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Dive Guide</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Saved Guide List</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Guides and instructors now use the same denser layout as buddies, which makes longer lists much easier to browse.</p>
      </div>
      <div class="settings-toolbar">
        <button @click="addGuideEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Guide</button>
      </div>
    </div>

    <label class="settings-filter-field mb-4">
      <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
      <input v-model="guideFilter" type="text" class="settings-input" placeholder="Filter guides" />
    </label>

    <div v-if="!areGuidesEditing && guides.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved guides</p>
      <p class="mt-2 text-sm text-secondary">Create a reusable guide list here so dive logs can search and reuse names instead of retyping them.</p>
    </div>

    <div v-else-if="areGuidesEditing && guideDrafts.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved guides</p>
      <p class="mt-2 text-sm text-secondary">Add the first guide or instructor you want available in your logbook forms.</p>
    </div>

    <div v-else-if="visibleGuides.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No matching guides</p>
      <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved guide list.</p>
    </div>

    <div v-else class="settings-compact-grid">
      <article v-for="(guide, index) in visibleGuides" :key="guide.id" class="settings-compact-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide {{ index + 1 }}</p>
            <h5 class="mt-2 font-headline text-xl font-bold text-on-surface">{{ guideTitle(guide, index) }}</h5>
          </div>
          <div class="settings-toolbar">
            <button
              v-if="!isGuideEditing(guide.id)"
              @click="editGuideItem(guide.id)"
              class="settings-button settings-button-secondary"
            >
              Edit Guide
            </button>
            <button v-if="isGuideEditing(guide.id)" @click="confirmRemoveGuideItem(guide.id)" class="settings-button settings-button-danger">Remove</button>
            <button v-if="isGuideEditing(guide.id)" @click="cancelGuidesEdit" :disabled="isInteractionLocked" class="settings-button settings-button-ghost">Cancel</button>
            <button v-if="isGuideEditing(guide.id)" @click="saveGuides" :disabled="isInteractionLocked" class="settings-button settings-button-primary">{{ guidesSaving ? 'Saving Guide' : 'Save Guide' }}</button>
          </div>
        </div>

        <div v-if="isGuideEditing(guide.id)" class="mt-5 space-y-3">
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
            <input v-model="guide.name" type="text" class="settings-input" placeholder="Kai Jensen" />
          </label>
        </div>
      </article>
    </div>
  </div>
</template>



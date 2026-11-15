<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "BuddiesTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "areBuddiesEditing",
      "buddies",
      "buddiesSaving",
      "buddyDrafts",
      "buddyFilter",
      "isInteractionLocked",
      "visibleBuddies"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "addBuddyEntry",
      "buddyTitle",
      "cancelBuddiesEdit",
      "confirmRemoveBuddyItem",
      "editBuddyItem",
      "isBuddyEditing",
      "saveBuddies"
    ])
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="settings-card-header">
      <div>
        <p class="font-label text-xs font-medium text-primary">Buddies</p>
        <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Saved dive buddy list</h4>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">People you dive with, ready to pick in your logs.</p>
      </div>
      <div class="settings-toolbar">
        <UButton @click="addBuddyEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary"
          >Add buddy</UButton
        >
      </div>
    </div>

    <label class="settings-filter-field mb-4">
      <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
      <UInput v-model="buddyFilter" type="text" class="settings-input" placeholder="Filter buddies" />
    </label>

    <div v-if="!areBuddiesEditing && buddies.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved buddies</p>
      <p class="mt-2 text-sm text-secondary">Create a reusable buddy list here so dive logs can select names instead of retyping them.</p>
    </div>

    <div v-else-if="areBuddiesEditing && buddyDrafts.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No saved buddies</p>
      <p class="mt-2 text-sm text-secondary">Add the first diver you want available in your logbook forms.</p>
    </div>

    <div v-else-if="visibleBuddies.length === 0" class="settings-empty-state">
      <p class="font-headline text-lg font-bold">No matching buddies</p>
      <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your saved buddy list.</p>
    </div>

    <div v-else class="settings-compact-grid">
      <article v-for="(buddy, index) in visibleBuddies" :key="buddy.id" class="settings-compact-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-label text-xs font-medium text-secondary">Buddy {{ index + 1 }}</p>
            <h5 class="mt-2 font-headline text-xl font-bold text-on-surface">{{ buddyTitle(buddy, index) }}</h5>
          </div>
          <div class="settings-toolbar">
            <UButton v-if="!isBuddyEditing(buddy.id)" @click="editBuddyItem(buddy.id)" class="settings-button settings-button-secondary">
              Edit buddy
            </UButton>
            <UButton
              v-if="isBuddyEditing(buddy.id)"
              @click="confirmRemoveBuddyItem(buddy.id)"
              class="settings-button settings-button-danger"
              >Remove</UButton
            >
            <UButton
              v-if="isBuddyEditing(buddy.id)"
              @click="cancelBuddiesEdit"
              :disabled="isInteractionLocked"
              class="settings-button settings-button-ghost"
              >Cancel</UButton
            >
            <UButton
              v-if="isBuddyEditing(buddy.id)"
              @click="saveBuddies"
              :disabled="isInteractionLocked"
              class="settings-button settings-button-primary"
              >{{ buddiesSaving ? "Saving buddy" : "Save buddy" }}</UButton
            >
          </div>
        </div>

        <div v-if="isBuddyEditing(buddy.id)" class="mt-5 space-y-3">
          <label class="space-y-2">
            <span class="font-label text-xs font-medium text-secondary">Buddy name</span>
            <UInput v-model="buddy.name" type="text" class="settings-input" placeholder="Sam Carter" />
          </label>
        </div>
      </article>
    </div>
  </div>
</template>

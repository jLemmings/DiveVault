<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "ApplicationSettingsTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "appVersion",
      "availableLanguages",
      "availableThemeOptions",
      "hasUnsavedPublicSharingChanges",
      "profileSaving",
      "publicProfileUrl",
      "publicSharingDraft",
      "publicSharingSaving",
      "resolvedTheme",
      "selectedLocale",
      "selectedThemePreference",
      "settingsProfile"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "changePreferredLanguage",
      "changeThemePreference",
      "copyPublicProfileUrl",
      "logbookFieldEnabled",
      "optionalLogbookFieldOptions",
      "requiredLogbookFieldEnabled",
      "requiredLogbookFieldOptions",
      "saveProfile",
      "savePublicSharing",
      "t",
      "toggleEquipmentSelectionEnabled",
      "toggleLogbookDisplayField",
      "toggleRequiredLogbookField"
    ])
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Current Build</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Application Version</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">This version comes from the frontend package used for the current build.</p>
        </div>
        <div class="settings-chip is-accent">v{{ appVersion }}</div>
      </div>
    </div>

    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Interface Language</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Preferred Language</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">Choose which translation bundle the app should use for supported interface text. Available options are loaded from <code>en.json</code>, <code>de.json</code>, and <code>fr.json</code>.</p>
        </div>
        <div class="settings-chip is-accent">
          {{ (availableLanguages.find((language) => language.value === selectedLocale)?.label || selectedLocale).toUpperCase() }}
        </div>
      </div>

      <div class="mt-6 grid gap-4 xl:grid-cols-[minmax(0,24rem)] xl:items-start">
        <label class="space-y-2">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Language</span>
          <USelect v-model="selectedLocale" :items="availableLanguages" @update:model-value="changePreferredLanguage" class="settings-input" />
        </label>
      </div>
    </div>

    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Interface Theme</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Appearance</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">Use the system theme by default, or keep DiveVault fixed in light or dark mode on this device.</p>
        </div>
        <div class="settings-chip is-accent">
          {{ resolvedTheme.toUpperCase() }}
        </div>
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-3">
        <UButton
          v-for="theme in availableThemeOptions"
          :key="'settings-theme-' + theme.value"
          type="button"
          @click="selectedThemePreference = theme.value; changeThemePreference()"
          class="flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-colors"
          :class="selectedThemePreference === theme.value ? 'border-primary/35 bg-primary/10 text-primary' : 'border-primary/10 bg-background/20 text-secondary hover:border-primary/25 hover:text-primary'"
        >
          <span class="material-symbols-outlined text-xl">{{ theme.icon }}</span>
          <span>
            <span class="block font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ t(theme.label, theme.label) }}</span>
            <span v-if="theme.value === 'system'" class="mt-1 block text-xs opacity-80">{{ t('Currently', 'Currently') }} {{ t(resolvedTheme === 'light' ? 'Light' : 'Dark', resolvedTheme) }}</span>
          </span>
        </UButton>
      </div>
    </div>

    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Public Dive Profile</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Share Completed Dives And Dive Map</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">When enabled, the public page only exposes completed dive entries and their map positions. Licenses, saved buddies, guides, and the rest of your private settings stay hidden.</p>
        </div>
        <div class="settings-chip" :class="publicSharingDraft.public_dives_enabled ? 'is-accent' : ''">
          {{ publicSharingDraft.public_dives_enabled ? 'Public' : 'Private' }}
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <label class="flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
          <UCheckbox v-model="publicSharingDraft.public_dives_enabled" class="mt-1" :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30' }" />
          <div>
            <p class="text-sm font-semibold text-on-surface">Make My Completed Dives Public</p>
            <p class="mt-1 text-sm leading-6 text-secondary">Imported drafts stay private until they are completed in the logbook.</p>
          </div>
        </label>

        <div class="flex flex-wrap gap-3">
          <UButton @click="savePublicSharing" :disabled="publicSharingSaving || (!hasUnsavedPublicSharingChanges && publicSharingDraft.public_dives_enabled === settingsProfile.public_dives_enabled)" class="settings-button settings-button-primary">
            {{ publicSharingSaving ? 'Saving Share Settings' : 'Save Sharing' }}
          </UButton>
          <UButton v-if="settingsProfile.public_dives_enabled && publicProfileUrl" @click="copyPublicProfileUrl" class="settings-button settings-button-secondary">Copy Public Link</UButton>
        </div>
      </div>

      <div v-if="settingsProfile.public_dives_enabled && publicProfileUrl" class="mt-5 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Public URL</p>
        <a :href="publicProfileUrl" target="_blank" rel="noreferrer" class="mt-2 block break-all text-sm font-semibold text-primary hover:text-primary/80">{{ publicProfileUrl }}</a>
      </div>
    </div>

    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">{{ t('settings.logLayout.title', 'Dive Log Layout') }}</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">{{ t('settings.logLayout.heading', 'Optional Metadata In Log Rows') }}</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">{{ t('settings.logLayout.copy', 'Choose which optional details appear directly in the dive log list. Core dive information stays visible; these settings control only the extra descriptive metadata.') }}</p>
        </div>
        <div class="settings-chip is-accent">
          {{ settingsProfile.logbook_display_fields.length }} {{ t('Enabled', 'Enabled') }}
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <label v-for="option in optionalLogbookFieldOptions()" :key="'logbook-field-' + option.key" class="flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
          <UCheckbox :model-value="logbookFieldEnabled(option.key)" @update:model-value="toggleLogbookDisplayField(option.key)" class="mt-1" :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30' }" />
          <div>
            <p class="text-sm font-semibold text-on-surface">{{ option.label }}</p>
            <p class="mt-1 text-sm leading-6 text-secondary">{{ option.detail }}</p>
          </div>
        </label>
      </div>

      <label class="mt-5 flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
        <UCheckbox :model-value="settingsProfile.equipment_selection_enabled" @update:model-value="toggleEquipmentSelectionEnabled()" class="mt-1" :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30' }" />
        <div>
          <p class="text-sm font-semibold text-on-surface">{{ t('settings.logLayout.equipmentSelector', 'Used gear selector') }}</p>
          <p class="mt-1 text-sm leading-6 text-secondary">{{ t('settings.logLayout.equipmentSelector.detail', 'Show an optional equipment area when creating or completing dive logs. Service warnings are informational and do not block saving.') }}</p>
        </div>
      </label>

      <div class="mt-8 border-t border-primary/10 pt-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h5 class="font-headline text-2xl font-bold tracking-tight text-on-surface">{{ t('settings.requiredLogbook.heading', 'Mandatory Logbook Fields') }}</h5>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-secondary">{{ t('settings.requiredLogbook.copy', 'Choose which logbook fields must be filled before manual dives, imported dives, or existing dive edits can be completed.') }}</p>
          </div>
          <div class="settings-chip is-accent">
            {{ settingsProfile.required_logbook_fields.length }} {{ t('Required', 'Required') }}
          </div>
        </div>

        <div class="mt-6 grid gap-4 lg:grid-cols-4">
          <label v-for="option in requiredLogbookFieldOptions()" :key="'required-logbook-field-' + option.key" class="flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
            <UCheckbox :model-value="requiredLogbookFieldEnabled(option.key)" :disabled="option.key === 'site'" @update:model-value="toggleRequiredLogbookField(option.key)" class="mt-1" :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30 disabled:opacity-60' }" />
            <div>
              <p class="text-sm font-semibold text-on-surface">{{ option.label }}</p>
              <p class="mt-1 text-sm leading-6 text-secondary">{{ option.detail }}</p>
            </div>
          </label>
        </div>
      </div>

      <div class="mt-5 flex justify-end">
        <UButton @click="saveProfile" :disabled="profileSaving" class="settings-button settings-button-primary">
          {{ profileSaving ? t('Saving Profile', 'Saving Profile') : t('settings.logLayout.save', 'Save Log Layout') }}
        </UButton>
      </div>
    </div>
  </div>
</template>



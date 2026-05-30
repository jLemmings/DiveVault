export const SETTINGS_TEMPLATE = `
    <section class="dashboard-command-center text-on-surface">
      <header class="settings-stat-strip">
        <article v-for="stat in settingsOverviewStats" :key="stat.id" class="settings-stat-pill">
          <span class="material-symbols-outlined settings-stat-pill-icon">{{ stat.icon }}</span>
          <p class="settings-stat-pill-label">{{ stat.label }}</p>
          <div v-if="profileLoading" class="settings-loading-bar settings-loading-bar-stat"></div>
          <p v-else class="settings-stat-pill-value">{{ stat.value }}</p>
        </article>
      </header>

      <div v-if="profileStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ profileStatus }}</div>
      <div v-if="profileError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">{{ profileError }}</div>

      <div class="settings-mobile-nav settings-panel flex gap-3 overflow-x-auto p-3 md:hidden">
        <button
          v-for="section in settingsSections"
          :key="section.id"
          @click="selectSettingsSection(section.id)"
          class="min-w-[14rem] shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors"
          :class="activeSettingsSection === section.id ? 'border-primary/30 bg-surface-container-high text-primary' : 'border-primary/10 bg-background/10 text-secondary'"
        >
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined mt-0.5 text-lg">{{ section.icon }}</span>
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em]">{{ section.label }}</p>
              <p class="mt-2 text-xs leading-5 opacity-80">{{ section.description }}</p>
            </div>
          </div>
        </button>
      </div>

      <section class="settings-page-layout">
        <aside class="settings-section-nav settings-panel">
          <button
            v-for="section in settingsSections"
            :key="'desktop-settings-' + section.id"
            type="button"
            @click="selectSettingsSection(section.id)"
            class="settings-section-nav-item"
            :class="activeSettingsSection === section.id ? 'is-active' : ''"
          >
            <span class="material-symbols-outlined settings-section-nav-icon">{{ section.icon }}</span>
            <span class="min-w-0">
              <span class="settings-section-nav-label">{{ section.label }}</span>
              <span class="settings-section-nav-description">{{ section.description }}</span>
            </span>
          </button>
        </aside>

        <section class="settings-content">
          <div v-if="profileLoading" class="settings-panel settings-card settings-loading-state">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Loading</p>
              <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Preparing Your Settings</h4>
              <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Fetching licenses, dive sites, buddies, guides, and saved profile details.</p>
            </div>

            <div class="settings-loading-grid">
              <div class="settings-loading-card">
                <div class="settings-loading-bar settings-loading-bar-title"></div>
                <div class="settings-loading-bar settings-loading-bar-body"></div>
                <div class="settings-loading-bar settings-loading-bar-body settings-loading-bar-short"></div>
              </div>
              <div class="settings-loading-card">
                <div class="settings-loading-bar settings-loading-bar-title"></div>
                <div class="settings-loading-bar settings-loading-bar-body"></div>
                <div class="settings-loading-bar settings-loading-bar-body"></div>
              </div>
              <div class="settings-loading-card">
                <div class="settings-loading-bar settings-loading-bar-title"></div>
                <div class="settings-loading-bar settings-loading-bar-body"></div>
                <div class="settings-loading-bar settings-loading-bar-body settings-loading-bar-short"></div>
              </div>
            </div>
          </div>

          <template v-else>
          <div v-if="activeSettingsSection === 'diver-details'" class="settings-panel settings-card">
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
                  <select v-model="selectedLocale" @change="changePreferredLanguage" class="settings-input">
                    <option v-for="language in availableLanguages" :key="'settings-language-' + language.value" :value="language.value">
                      {{ language.label }}
                    </option>
                  </select>
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
                <button
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
                </button>
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
                  <input v-model="publicSharingDraft.public_dives_enabled" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
                  <div>
                    <p class="text-sm font-semibold text-on-surface">Make My Completed Dives Public</p>
                    <p class="mt-1 text-sm leading-6 text-secondary">Imported drafts stay private until they are completed in the logbook.</p>
                  </div>
                </label>

                <div class="flex flex-wrap gap-3">
                  <button @click="savePublicSharing" :disabled="publicSharingSaving || (!hasUnsavedPublicSharingChanges && publicSharingDraft.public_dives_enabled === settingsProfile.public_dives_enabled)" class="settings-button settings-button-primary">
                    {{ publicSharingSaving ? 'Saving Share Settings' : 'Save Sharing' }}
                  </button>
                  <button v-if="settingsProfile.public_dives_enabled && publicProfileUrl" @click="copyPublicProfileUrl" class="settings-button settings-button-secondary">Copy Public Link</button>
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
                  <input :checked="logbookFieldEnabled(option.key)" @change="toggleLogbookDisplayField(option.key)" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{{ option.label }}</p>
                    <p class="mt-1 text-sm leading-6 text-secondary">{{ option.detail }}</p>
                  </div>
                </label>
              </div>

              <label class="mt-5 flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
                <input :checked="settingsProfile.equipment_selection_enabled" @change="toggleEquipmentSelectionEnabled()" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
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
                    <input :checked="requiredLogbookFieldEnabled(option.key)" :disabled="option.key === 'site'" @change="toggleRequiredLogbookField(option.key)" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30 disabled:opacity-60" />
                    <div>
                      <p class="text-sm font-semibold text-on-surface">{{ option.label }}</p>
                      <p class="mt-1 text-sm leading-6 text-secondary">{{ option.detail }}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="mt-5 flex justify-end">
                <button @click="saveProfile" :disabled="profileSaving" class="settings-button settings-button-primary">
                  {{ profileSaving ? t('Saving Profile', 'Saving Profile') : t('settings.logLayout.save', 'Save Log Layout') }}
                </button>
              </div>
            </div>

            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Diving Licenses</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Certifications And PDFs</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Certificates stay compact until opened, so the saved list is easier to scan and the attached PDFs are still one click away.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addLicenseEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add License</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="licenseFilter" type="text" class="settings-input" placeholder="Filter licenses" />
            </label>

            <div v-if="!areLicensesEditing && licenses.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Use Add License to create your first certification entry and attach its PDF.</p>
            </div>

            <div v-else-if="areLicensesEditing && licenseDrafts.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No saved licenses</p>
              <p class="mt-2 text-sm text-secondary">Add your first certification entry to build a reusable license list.</p>
            </div>

            <div v-else-if="visibleLicenses.length === 0" class="settings-empty-state">
              <p class="font-headline text-lg font-bold">No matching licenses</p>
              <p class="mt-2 text-sm text-secondary">Adjust the filter to see the rest of your certification list.</p>
            </div>

            <div v-else class="space-y-4">
              <article v-for="(license, index) in visibleLicenses" :key="license.id" class="settings-item-card">
                <div class="settings-item-header">
                  <div class="min-w-0">
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">License {{ index + 1 }}</p>
                    <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ licenseTitle(license, index) }}</h5>
                    <div class="settings-chip-row mt-3">
                      <span class="settings-chip">{{ displayValue(license.company, 'Company pending') }}</span>
                      <span class="settings-chip" :class="license.pdf ? 'is-accent' : ''">{{ license.pdf ? 'PDF attached' : 'No PDF' }}</span>
                    </div>
                  </div>

                  <div class="settings-toolbar">
                    <button
                      v-if="license.pdf"
                      @click="viewLicensePdf(license)"
                      class="settings-button settings-button-secondary"
                    >
                      View PDF
                    </button>
                    <button
                      v-if="!isLicenseEditing(license.id)"
                      @click="editLicenseItem(license.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit License
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="confirmRemoveLicenseItem(license.id)"
                      class="settings-button settings-button-danger"
                    >
                      Remove
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="cancelLicensesEdit"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      v-if="isLicenseEditing(license.id)"
                      @click="saveLicenses"
                      :disabled="isInteractionLocked"
                      class="settings-button settings-button-primary"
                    >
                      {{ licensesSaving ? 'Saving License' : 'Save License' }}
                    </button>
                  </div>
                </div>

                <div v-if="isLicenseEditing(license.id) || isLicenseExpanded(license.id)" class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div v-if="isLicenseEditing(license.id)" class="settings-form-grid">
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
                      <input v-model="license.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
                      <input v-model="license.certification_name" type="text" class="settings-input" placeholder="Advanced Open Water" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
                      <input v-model="license.student_number" type="text" class="settings-input" placeholder="Student or certification number" />
                    </label>
                    <label class="space-y-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
                      <input v-model="license.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
                    </label>
                    <label class="space-y-2 md:col-span-2">
                      <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
                      <input v-model="license.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
                    </label>
                  </div>

                  <div v-else class="settings-detail-grid">
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.company) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_name) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.student_number) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.certification_date) }}</p>
                    </div>
                    <div class="settings-info-card md:col-span-2">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(license.instructor_number) }}</p>
                    </div>
                  </div>

                  <div class="settings-side-panel">
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License PDF</p>
                      <button
                        v-if="isLicenseEditing(license.id)"
                        @click="triggerLicensePicker(license.id)"
                        :disabled="isUploadingLicense(license.id)"
                        class="settings-button settings-button-secondary"
                      >
                        {{ isUploadingLicense(license.id) ? 'Uploading...' : (license.pdf ? 'Replace PDF' : 'Upload PDF') }}
                      </button>
                    </div>

                    <div v-if="license.pdf" class="space-y-3">
                      <div class="settings-file-meta">
                        <p class="font-semibold text-on-surface">{{ license.pdf.filename }}</p>
                        <p class="mt-1 text-sm text-secondary">{{ formatBytes(license.pdf.size_bytes) }} · Uploaded {{ formatDateTime(license.pdf.uploaded_at) }}</p>
                      </div>
                      <license-pdf-preview :pdf="license.pdf" :authenticated-fetch="authenticatedFetch" @open-preview="openLicensePreview($event, license)" />
                    </div>

                    <div v-else class="settings-empty-state">
                      <p class="font-headline text-base font-bold">No PDF attached</p>
                      <p class="mt-2 text-sm text-secondary">{{ isLicenseEditing(license.id) ? 'Upload the certification PDF for this specific license entry.' : 'Open the license and switch to edit mode to attach a PDF.' }}</p>
                    </div>

                    <p v-if="isLicenseEditing(license.id) && !licenseExistsOnServer(license.id)" class="text-[10px] uppercase tracking-[0.14em] text-secondary/70">
                      Save this new license before uploading its PDF.
                    </p>
                  </div>
                </div>
              </article>
            </div>

            <input ref="licenseInput" @change="handleLicenseSelection" type="file" accept="application/pdf,.pdf" class="hidden" />
          </div>

          <div v-if="activeSettingsSection === 'dive-sites'" class="settings-panel settings-card">
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
                            <p class="mt-2 text-sm text-secondary">Search from the location text, then fine-tune latitude and longitude manually if needed.</p>
                          </div>
                          <button
                            @click="searchDiveSiteLocationById(site.id)"
                            :disabled="isLookingUpDiveSite(site.id)"
                            class="settings-button settings-button-secondary"
                          >
                            {{ isLookingUpDiveSite(site.id) ? 'Searching GPS' : 'Search GPS From Location' }}
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
                            <input v-model="site.latitude" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                          </label>
                          <label class="space-y-2">
                            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                            <input v-model="site.longitude" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                          </label>
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

          <div v-if="activeSettingsSection === 'buddies'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Buddies</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Saved Dive Buddy List</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Buddy names now scan as a compact grid instead of a long vertical stack.</p>
              </div>
              <div class="settings-toolbar">
                <button @click="addBuddyEntry" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Add Buddy</button>
              </div>
            </div>

            <label class="settings-filter-field mb-4">
              <span class="material-symbols-outlined text-[18px] text-secondary/70">search</span>
              <input v-model="buddyFilter" type="text" class="settings-input" placeholder="Filter buddies" />
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
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy {{ index + 1 }}</p>
                    <h5 class="mt-2 font-headline text-xl font-bold text-on-surface">{{ buddyTitle(buddy, index) }}</h5>
                  </div>
                  <div class="settings-toolbar">
                    <button
                      v-if="!isBuddyEditing(buddy.id)"
                      @click="editBuddyItem(buddy.id)"
                      class="settings-button settings-button-secondary"
                    >
                      Edit Buddy
                    </button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="confirmRemoveBuddyItem(buddy.id)" class="settings-button settings-button-danger">Remove</button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="cancelBuddiesEdit" :disabled="isInteractionLocked" class="settings-button settings-button-ghost">Cancel</button>
                    <button v-if="isBuddyEditing(buddy.id)" @click="saveBuddies" :disabled="isInteractionLocked" class="settings-button settings-button-primary">{{ buddiesSaving ? 'Saving Buddy' : 'Save Buddy' }}</button>
                  </div>
                </div>

                <div v-if="isBuddyEditing(buddy.id)" class="mt-5 space-y-3">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
                    <input v-model="buddy.name" type="text" class="settings-input" placeholder="Sam Carter" />
                  </label>
                </div>
              </article>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'dive-guide'" class="settings-panel settings-card">
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

          <div v-if="activeSettingsSection === 'data-management'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Exports And Desktop Sync</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">The actions below are organized as clear task cards instead of one long button list.</p>
              </div>
            </div>

            <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span>{{ dataManagementStatus }}</span>
                <button
                  v-if="importReadyForReview"
                  type="button"
                  @click="reviewCsvImportQueue"
                  class="settings-button settings-button-primary shrink-0"
                >
                  Review Imported Dives
                </button>
              </div>
            </div>
            <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ dataManagementError }}</div>
            <div v-if="dataManagementWarning" class="settings-feedback border-tertiary/30 bg-tertiary/10 text-tertiary">
              <div class="flex items-start gap-3">
                <span class="material-symbols-outlined text-base">warning</span>
                <span>{{ dataManagementWarning }}</span>
              </div>
            </div>

            <div class="settings-action-grid">
              <button
                @click="exportDivePdf"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">picture_as_pdf</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting PDF' ? 'Exporting Dive PDF' : 'Export Logs (PDF)' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Generate a printable logbook export for review, sharing, or offline archiving.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">north_east</span>
              </button>

              <button
                @click="exportDiveCsv"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">table_chart</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting CSV' ? 'Exporting Telemetry CSV' : 'Raw Telemetry (CSV)' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Download the raw dive telemetry for spreadsheet analysis or external processing.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">north_east</span>
              </button>

              <button
                @click="triggerCsvImport"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">upload_file</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Importing CSV' ? 'Importing Dive CSV' : 'Import Dives (CSV)' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Load spreadsheet dive rows into the imported dive queue for review before they enter the logbook.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">upload</span>
              </button>

              <button
                @click="triggerSubsurfaceImport"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">backup_table</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Previewing Subsurface' ? 'Reading Subsurface Export' : dataManagementAction === 'Importing Subsurface' ? 'Importing Subsurface Export' : 'Import Subsurface Export' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Preview a Subsurface XML or archive export, then confirm before adding the dives to the review queue.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">upload</span>
              </button>
            </div>
            <input
              ref="csvImportInput"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="handleCsvImportSelection"
            />
            <input
              ref="subsurfaceImportInput"
              type="file"
              accept=".xml,.ssrf,application/xml,text/xml,application/zip,application/gzip"
              class="hidden"
              @change="handleSubsurfaceImportSelection"
            />

            <div v-if="subsurfacePreview" class="settings-side-panel mt-6">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Subsurface Preview</p>
                  <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ subsurfacePreview.rows }} dives ready to import</h5>
                  <p class="mt-3 text-sm leading-7 text-secondary">Confirming will add these dives to the imported-dive queue. They will not enter the main logbook until you review and complete them.</p>
                </div>
                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    @click="confirmSubsurfaceImport"
                    :disabled="isDataManagementBusy || isInteractionLocked"
                    class="settings-button settings-button-primary"
                  >
                    Confirm Import
                  </button>
                  <button
                    type="button"
                    @click="cancelSubsurfaceImportPreview"
                    :disabled="isDataManagementBusy"
                    class="settings-button settings-button-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <div class="mt-5 grid gap-3 md:grid-cols-2">
                <div v-for="dive in subsurfacePreview.dives" :key="dive.dive_uid" class="settings-info-card">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ dive.started_at }}</p>
                  <p class="mt-2 text-base font-semibold text-on-surface">{{ dive.site || 'Unassigned site' }}</p>
                  <p class="mt-1 text-sm text-secondary">{{ Math.round((dive.duration_seconds || 0) / 60) }} min / {{ dive.max_depth_m || 0 }} m / {{ dive.sample_count || 0 }} samples</p>
                </div>
              </div>
            </div>

            <div class="settings-side-panel mt-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Desktop Sync Login</p>
                  <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-if="!hasCliAuthCode">Launch the Windows Dive Sync app and click Sign In. It will open this page with a one-time approval request so you can authorize the desktop sync session from your browser.</p>
                  <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary" v-else>The Windows Dive Sync app is requesting access to your account. Approve it once, then return to the desktop app to start importing dives.</p>
                </div>
                <span class="settings-chip" :class="hasCliAuthCode ? 'is-accent' : ''">{{ hasCliAuthCode ? 'Approval waiting' : 'Idle' }}</span>
              </div>

              <button
                v-if="hasCliAuthCode"
                @click="approveDesktopSync"
                :disabled="desktopSyncApproving"
                class="settings-button settings-button-primary mt-5 w-full justify-between"
              >
                <span class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-sm">verified_user</span>
                  <span>{{ desktopSyncApproving ? 'Approving Desktop Sync' : 'Approve Desktop Sync' }}</span>
                </span>
                <span class="material-symbols-outlined text-sm">login</span>
              </button>
              <p v-if="desktopSyncStatus" class="mt-3 text-sm text-primary">{{ desktopSyncStatus }}</p>
              <p v-if="desktopSyncError" class="mt-3 text-sm text-error">{{ desktopSyncError }}</p>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'manage-users' && canManageUsers" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Manage Users</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Invites And Access Control</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Invite new divers, review who can sign in, and control whether self-registration is open on this instance.</p>
              </div>
            </div>

            <div v-if="manageUsersStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ manageUsersStatus }}</div>
            <div v-if="manageUsersError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ manageUsersError }}</div>

            <div class="settings-action-grid">
              <div class="settings-action-card">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-primary">how_to_reg</span>
                      <p class="font-headline text-xl font-bold text-on-surface">Public Registration</p>
                    </div>
                    <p class="mt-3 text-sm leading-6 text-secondary">Keep sign-up closed and use invitations only, or open self-registration for this DiveVault instance.</p>
                  </div>
                  <span class="settings-chip" :class="authSettings.public_registration_enabled ? 'is-accent' : ''">
                    {{ authSettings.public_registration_enabled ? 'Open' : 'Invite only' }}
                  </span>
                </div>
                <label class="mt-5 flex items-start gap-4 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
                  <input v-model="authSettings.public_registration_enabled" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
                  <div>
                    <p class="text-sm font-semibold text-on-surface">Allow direct account creation</p>
                    <p class="mt-1 text-sm leading-6 text-secondary">When disabled, new users must come through an invite link from the instance owner.</p>
                  </div>
                </label>
                <button @click="savePublicRegistrationSetting" :disabled="manageUsersSaving || manageUsersLoading" class="settings-button settings-button-primary mt-5">
                  {{ manageUsersSaving ? 'Saving Access Policy' : 'Save Access Policy' }}
                </button>
              </div>

              <div class="settings-action-card">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-primary">person_add</span>
                      <p class="font-headline text-xl font-bold text-on-surface">Invite User</p>
                    </div>
                    <p class="mt-3 text-sm leading-6 text-secondary">Create a one-time sign-up link for a second diver or admin on this instance.</p>
                  </div>
                  <span class="settings-chip">{{ authUsers.length }} users</span>
                </div>
                <div class="mt-5 grid gap-4 md:grid-cols-2">
                  <label class="space-y-2 md:col-span-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</span>
                    <input v-model.trim="inviteDraft.email" type="email" class="settings-input" placeholder="second-user@example.com" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">First Name</span>
                    <input v-model.trim="inviteDraft.first_name" type="text" class="settings-input" placeholder="First name" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Last Name</span>
                    <input v-model.trim="inviteDraft.last_name" type="text" class="settings-input" placeholder="Last name" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Role</span>
                    <select v-model="inviteDraft.role" class="settings-input">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Expires In Days</span>
                    <input v-model.number="inviteDraft.expires_in_days" type="number" min="1" max="30" class="settings-input" />
                  </label>
                </div>
                <div class="mt-5 flex flex-wrap gap-3">
                  <button @click="createUserInvite" :disabled="inviteSubmitting || manageUsersLoading" class="settings-button settings-button-primary">
                    {{ inviteSubmitting ? 'Creating Invite' : 'Create Invite' }}
                  </button>
                  <button v-if="latestInviteUrl" @click="copyLatestInviteUrl" class="settings-button settings-button-secondary">Copy Invite Link</button>
                </div>
                <div v-if="latestInviteUrl" class="mt-5 rounded-2xl border border-primary/10 bg-background/20 px-4 py-4">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latest Invite Link</p>
                  <p class="mt-2 break-all text-sm font-semibold text-primary">{{ latestInviteUrl }}</p>
                </div>
              </div>
            </div>

            <div class="mt-6 space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Current Users</p>
                  <p class="mt-2 text-sm text-secondary">The owner account stays protected. Other users can be promoted, disabled, or removed here.</p>
                </div>
                <button @click="fetchUserManagement" :disabled="manageUsersLoading || manageUsersSaving" class="settings-button settings-button-secondary">
                  {{ manageUsersLoading ? 'Refreshing' : 'Refresh' }}
                </button>
              </div>

              <div v-if="manageUsersLoading && authUsers.length === 0" class="settings-empty-state">
                <p class="font-headline text-lg font-bold">Loading users</p>
                <p class="mt-2 text-sm text-secondary">Reading the current instance access list.</p>
              </div>

              <div v-else-if="authUsers.length === 0" class="settings-empty-state">
                <p class="font-headline text-lg font-bold">No users found</p>
                <p class="mt-2 text-sm text-secondary">Create an invitation above to add another diver.</p>
              </div>

              <div v-else class="space-y-4">
                <article v-for="user in authUsers" :key="user.id" class="settings-item-card">
                  <div class="settings-item-header">
                    <div class="min-w-0">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ user.id === ownerUserId ? 'Owner' : 'User' }}</p>
                      <h5 class="mt-2 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ user.email }}</h5>
                      <div class="settings-chip-row mt-3">
                        <span class="settings-chip" :class="user.role === 'admin' ? 'is-accent' : ''">{{ user.role }}</span>
                        <span class="settings-chip" :class="user.is_active ? 'is-accent' : ''">{{ user.is_active ? 'Active' : 'Inactive' }}</span>
                        <span v-if="user.id === ownerUserId" class="settings-chip">Protected</span>
                      </div>
                    </div>

                    <div v-if="user.id !== ownerUserId" class="settings-toolbar">
                      <button @click="toggleManagedUserRole(user)" :disabled="manageUsersSaving" class="settings-button settings-button-secondary">
                        {{ user.role === 'admin' ? 'Make User' : 'Make Admin' }}
                      </button>
                      <button @click="toggleManagedUserActive(user)" :disabled="manageUsersSaving" class="settings-button settings-button-secondary">
                        {{ user.is_active ? 'Deactivate' : 'Activate' }}
                      </button>
                      <button @click="deleteManagedUser(user)" :disabled="manageUsersSaving" class="settings-button settings-button-danger">Delete</button>
                    </div>
                  </div>

                  <div class="settings-detail-grid">
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue([user.first_name, user.last_name].filter(Boolean).join(' ')) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Last Login</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.last_login_at) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Created</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.created_at) }}</p>
                    </div>
                    <div class="settings-info-card">
                      <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Updated</p>
                      <p class="mt-2 text-base font-semibold text-on-surface">{{ formatDateTime(user.updated_at) }}</p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div v-if="activeSettingsSection === 'backup'" class="settings-panel settings-card">
            <div class="settings-card-header">
              <div>
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Backup</p>
                <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Backup And Restore</h4>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Backup tasks are separated from everyday exports so destructive restore actions feel more deliberate and easier to understand.</p>
              </div>
            </div>

            <div v-if="dataManagementStatus" class="settings-feedback border-primary/20 bg-primary/10 text-primary">{{ dataManagementStatus }}</div>
            <div v-if="dataManagementError" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container">{{ dataManagementError }}</div>

            <div class="settings-action-grid">
              <button
                @click="exportBackup"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">archive</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Exporting Backup' ? 'Building Full Backup' : 'Download Full Backup' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Save your account data, saved lists, PDFs, and imported dive state into one ZIP archive.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">download</span>
              </button>

              <button
                @click="triggerBackupImport"
                :disabled="isDataManagementBusy || isInteractionLocked"
                class="settings-action-card"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary">upload_file</span>
                    <p class="font-headline text-xl font-bold text-on-surface">{{ dataManagementAction === 'Importing Backup' ? 'Importing Backup' : 'Import From Backup' }}</p>
                  </div>
                  <p class="mt-3 text-sm leading-6 text-secondary">Restore from a previously exported ZIP backup when moving systems or recovering state.</p>
                </div>
                <span class="material-symbols-outlined text-secondary/60">upload</span>
              </button>
            </div>
            <input
              ref="backupImportInput"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,.json,application/json"
              class="hidden"
              @change="handleBackupImportSelection"
            />
          </div>
          </template>
        </section>
      </section>

      <div
        v-if="pendingCreation"
        @click.self="closeCreateDialog"
        class="fixed inset-0 z-[55] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="settings-modal-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">New Entry</p>
              <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">{{ pendingCreationTitle }}</h3>
              <p class="mt-3 text-sm text-secondary">This entry stays out of the list until you save it here.</p>
            </div>
            <button
              type="button"
              @click="closeCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-ghost"
            >
              Close
            </button>
          </div>

          <div v-if="pendingCreationError" class="settings-feedback mt-5 border-error/20 bg-error-container/20 text-on-error-container">
            {{ pendingCreationError }}
          </div>

          <div v-if="pendingCreationType === 'license'" class="settings-modal-grid mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Company</span>
              <input v-model="pendingCreationDraft.company" type="text" class="settings-input" placeholder="PADI / SSI / NAUI" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Name</span>
              <input v-model="pendingCreationDraft.certification_name" type="text" class="settings-input" placeholder="Advanced Open Water" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Student Number</span>
              <input v-model="pendingCreationDraft.student_number" type="text" class="settings-input" placeholder="Student or certification number" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Certification Date</span>
              <input v-model="pendingCreationDraft.certification_date" type="text" class="settings-input" placeholder="YYYY-MM-DD" />
            </label>
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Instructor Number</span>
              <input v-model="pendingCreationDraft.instructor_number" type="text" class="settings-input" placeholder="Instructor number" />
            </label>
            <div class="settings-side-panel md:col-span-2">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">PDF Upload</p>
              <p class="mt-2 text-sm text-secondary">Save the license first. You can attach or replace the PDF from the saved license card.</p>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'dive-site'" class="settings-modal-section mt-6">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Site Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="North Wall / Training Reef" />
            </label>
            <div class="settings-side-panel settings-modal-subsection">
              <div class="settings-modal-section">
                <div class="settings-modal-header">
                  <div>
                    <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">GPS Lookup</p>
                    <p class="settings-modal-copy mt-2 text-sm text-secondary">Search from the location text, then adjust latitude and longitude if needed.</p>
                  </div>
                  <button
                    type="button"
                    @click="searchPendingDiveSiteLocation"
                    :disabled="pendingCreationLookupLoading"
                    class="settings-button settings-button-secondary settings-modal-lookup-button"
                  >
                    {{ pendingCreationLookupLoading ? 'Searching GPS' : 'Search GPS From Location' }}
                  </button>
                </div>
                <label class="space-y-2">
                  <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Location</span>
                  <input v-model="pendingCreationDraft.location" type="text" class="settings-input" placeholder="Blue Hole, Dahab, Egypt" />
                </label>
                <div class="settings-modal-site-grid">
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Country</span>
                    <input v-model="pendingCreationDraft.country" type="text" class="settings-input" placeholder="Egypt" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latitude</span>
                    <input v-model="pendingCreationDraft.latitude" type="number" step="any" min="-90" max="90" class="settings-input" placeholder="25.1234" />
                  </label>
                  <label class="space-y-2">
                    <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Longitude</span>
                    <input v-model="pendingCreationDraft.longitude" type="number" step="any" min="-180" max="180" class="settings-input" placeholder="-80.4567" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="pendingCreationType === 'buddy'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Buddy Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Sam Carter" />
            </label>
          </div>

          <div v-else-if="pendingCreationType === 'guide'" class="settings-modal-grid mt-6">
            <label class="space-y-2 md:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Guide Name</span>
              <input v-model="pendingCreationDraft.name" type="text" class="settings-input" placeholder="Kai Jensen" />
            </label>
          </div>

          <div class="settings-modal-actions">
            <button
              type="button"
              @click="closeCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmCreateDialog"
              :disabled="pendingCreationSubmitting"
              class="settings-button settings-button-primary"
            >
              {{ pendingCreationSubmitting ? 'Saving...' : pendingCreationSubmitLabel }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="activeLicenseDocument"
        @click.self="closeLicenseDocument"
        class="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6 py-8 backdrop-blur-sm"
      >
        <div class="relative max-h-full w-full max-w-5xl overflow-auto border border-primary/15 bg-surface-container-low p-4 shadow-panel">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License PDF</p>
              <p class="mt-1 text-sm text-secondary">{{ activeLicenseDocument.pdf?.filename || 'License PDF' }}</p>
            </div>
            <button
              type="button"
              @click="closeLicenseDocument"
              class="settings-button settings-button-secondary"
            >
              Close
            </button>
          </div>
          <license-pdf-preview
            :pdf="activeLicenseDocument.pdf"
            :authenticated-fetch="authenticatedFetch"
            @open-preview="openLicensePreview($event, activeLicenseDocument)"
          />
        </div>
      </div>

      <div
        v-if="activeLicensePreview"
        @click.self="closeLicensePreview"
        class="fixed inset-0 z-[55] flex items-center justify-center bg-background/90 px-6 py-8 backdrop-blur-sm"
      >
        <div class="relative max-h-full w-full max-w-5xl overflow-auto border border-primary/15 bg-surface-container-low p-4 shadow-panel">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">License Preview</p>
              <p class="mt-1 text-sm text-secondary">{{ activeLicensePreview.filename }} - Page {{ activeLicensePreview.pageNumber }}</p>
            </div>
            <button
              type="button"
              @click="closeLicensePreview"
              class="settings-button settings-button-secondary"
            >
              Close
            </button>
          </div>
          <img :src="activeLicensePreview.image" :alt="activeLicensePreview.filename" class="mx-auto max-h-[80vh] w-auto max-w-full bg-white" />
        </div>
      </div>

      <div
        v-if="pendingRemoval"
        @click.self="closeRemovalDialog"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="settings-confirm-dialog">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Confirm Removal</p>
            <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Remove {{ pendingRemoval.label }}?</h3>
            <p class="mt-3 text-sm text-secondary">This action cannot be undone.</p>
          </div>
          <div class="settings-confirm-actions">
            <button
              type="button"
              @click="closeRemovalDialog"
              class="settings-button settings-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              @click="confirmPendingRemoval"
              class="settings-button settings-button-danger"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </section>
`;

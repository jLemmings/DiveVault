<script>
import { settingsContextComputed, settingsContextMethods } from "./settings-context.js";

export default {
  name: "DiverDetailsTab",
  inject: ["settingsContext"],
  computed: {
    ...settingsContextComputed([
      "areLicensesEditing",
      "currentUserEmail",
      "currentUserName",
      "hasUnsavedProfileChanges",
      "isInteractionLocked",
      "isProfileEditing",
      "licenseDrafts",
      "licenseFilter",
      "licenses",
      "licensesSaving",
      "profileDraft",
      "profileSaving",
      "settingsProfile",
      "visibleLicenses"
    ])
  },
  methods: {
    ...settingsContextMethods([
      "addLicenseEntry",
      "beginProfileEdit",
      "cancelLicensesEdit",
      "cancelProfileEdit",
      "confirmRemoveLicenseItem",
      "displayValue",
      "editLicenseItem",
      "formatBytes",
      "formatDateTime",
      "handleLicenseSelection",
      "isLicenseEditing",
      "isLicenseExpanded",
      "isUploadingLicense",
      "licenseExistsOnServer",
      "licenseTitle",
      "saveLicenses",
      "saveProfile",
      "viewLicensePdf"
    ]),
    triggerLicensePicker(licenseId) {
      const settings = this.settingsContext;
      settings.profileError = "";
      settings.profileStatus = "";

      if (!settings.areLicensesEditing) {
        settings.profileError = "Open license editing before uploading a PDF.";
        return;
      }
      if (!settings.licenseExistsOnServer(licenseId)) {
        settings.profileError = "Save the license list before uploading a PDF for a new entry.";
        return;
      }
      if (settings.hasUnsavedLicenseChanges()) {
        settings.profileError = "Save license list changes before uploading a PDF.";
        return;
      }

      settings.pendingLicenseUploadId = licenseId;
      this.$refs.licenseInput?.click();
    }
  }
};
</script>

<template>
  <div class="settings-panel settings-card">
    <div class="mb-8 rounded-2xl border border-primary/15 bg-surface-container-low p-6">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Diver Profile</p>
          <h4 class="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface">Diver Details</h4>
          <p class="mt-3 text-sm leading-7 text-secondary">Keep the public-facing diver identity separate from application behavior and instance settings.</p>
        </div>
        <div class="settings-toolbar">
          <button v-if="!isProfileEditing" @click="beginProfileEdit" :disabled="isInteractionLocked" class="settings-button settings-button-secondary">Edit Diver</button>
          <button v-if="isProfileEditing" @click="cancelProfileEdit" :disabled="isInteractionLocked" class="settings-button settings-button-ghost">Cancel</button>
          <button v-if="isProfileEditing" @click="saveProfile" :disabled="isInteractionLocked || !hasUnsavedProfileChanges" class="settings-button settings-button-primary">
            {{ profileSaving ? 'Saving Diver' : 'Save Diver' }}
          </button>
        </div>
      </div>

      <div v-if="isProfileEditing" class="settings-form-grid mt-6">
        <label class="space-y-2">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</span>
          <input v-model="profileDraft.name" type="text" class="settings-input" placeholder="Alex Diver" />
        </label>
        <label class="space-y-2">
          <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</span>
          <input v-model="profileDraft.email" type="email" class="settings-input" placeholder="diver@example.com" />
        </label>
      </div>

      <div v-else class="settings-detail-grid mt-6">
        <div class="settings-info-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</p>
          <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(settingsProfile.name || currentUserName) }}</p>
        </div>
        <div class="settings-info-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Email</p>
          <p class="mt-2 text-base font-semibold text-on-surface">{{ displayValue(settingsProfile.email || currentUserEmail) }}</p>
        </div>
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
                <p class="mt-1 text-sm text-secondary">{{ formatBytes(license.pdf.size_bytes) }} &middot; Uploaded {{ formatDateTime(license.pdf.uploaded_at) }}</p>
              </div>
              <button
                type="button"
                @click="viewLicensePdf(license)"
                class="settings-button settings-button-secondary"
              >
                Open PDF Preview
              </button>
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
</template>



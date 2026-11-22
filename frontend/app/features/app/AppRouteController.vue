<script>
import { defineAsyncComponent } from "vue";
import { useRouter } from "#app";
import { createDiveDataMethods } from "~/features/app/methods/dive-data-methods.js";
import { createImportMethods } from "~/features/app/methods/import-methods.js";
import { useAuth, useUser } from "~/shared/composables/auth.js";
import { isCommittedDive } from "~/shared/utils/core.js";
import { waiting } from "~/shared/utils/logbook.js";
import { ACCOUNT_VIEWS, NAV_ITEMS } from "~/config/navigation.js";
import { DEFAULT_REQUEST_TIMEOUT_MS } from "~/config/runtime.js";
import { initializeLegacyHashRoute, navigateToAppRoute } from "~/routing/app-navigation.js";
import { PATHS, routeToState } from "~/routing/routes.js";
import { createApiClient } from "~/shared/api/client.js";
import {
  createPreferenceState,
  detachSystemThemeListener,
  initializePreferences,
  setLocale,
  setThemePreference,
  syncSystemTheme
} from "~/shared/composables/app-preferences.js";
import { createManualDiveDraft } from "~/shared/utils/dive-drafts.js";
import BrandMark from "~/shared/components/chart/BrandMark.vue";
import TideLine from "~/shared/components/chart/TideLine.vue";
import ChartLink from "~/shared/components/ChartLink.vue";
import PasswordDialog from "~/features/app/PasswordDialog.vue";

const LogbookView = defineAsyncComponent(() => import("~/features/logbook/Logbook.vue"));
const DiveDetailView = defineAsyncComponent(() => import("~/features/logbook/DiveDetail.vue"));
const LogbookEditorView = defineAsyncComponent(() => import("~/features/logbook/LogbookEdit.vue"));
const ManualDiveView = defineAsyncComponent(() => import("~/features/logbook/ManualDive.vue"));
const ImportsView = defineAsyncComponent(() => import("~/features/imports/Imports.vue"));
const ImportFileView = defineAsyncComponent(() => import("~/features/imports/ImportFile.vue"));
const SitesView = defineAsyncComponent(() => import("~/features/sites/Sites.vue"));
const GearView = defineAsyncComponent(() => import("~/features/equipment/Equipment.vue"));
const DiverView = defineAsyncComponent(() => import("~/features/settings/Diver.vue"));
const ApplicationView = defineAsyncComponent(() => import("~/features/settings/Application.vue"));
const LoginView = defineAsyncComponent(() => import("~/features/auth/Login.vue"));
const PublicProfileView = defineAsyncComponent(() => import("~/features/public-profile/PublicProfile.vue"));

function emptyAccountState() {
  return {
    dives: [],
    diveTotal: 0,
    loading: true,
    error: "",
    profile: {},
    profileLoaded: false,
    profileError: "",
    profileDiveSites: [],
    profileBuddies: [],
    profileGuides: [],
    profileLogbookDisplayFields: [],
    profileRequiredLogbookFields: ["site"],
    profileEquipmentSelectionEnabled: true,
    equipment: [],
    equipmentLoaded: false,
    equipmentSaving: false,
    equipmentServicingId: null,
    equipmentStatusMessage: "",
    equipmentError: "",
    manualDiveDraft: createManualDiveDraft(),
    manualDiveCreating: false,
    manualDiveError: "",
    draftEdits: {},
    savingDiveId: null,
    bulkSaving: false,
    deletingDiveId: null,
    notice: "",
    noticeError: "",
    searchText: "",
    passwordDialogOpen: false
  };
}

export default {
  name: "AppRouteController",
  components: {
    BrandMark,
    TideLine,
    ChartLink,
    PasswordDialog,
    LogbookView,
    DiveDetailView,
    LogbookEditorView,
    ManualDiveView,
    ImportsView,
    ImportFileView,
    SitesView,
    GearView,
    DiverView,
    ApplicationView,
    LoginView,
    PublicProfileView
  },
  setup() {
    const router = useRouter();
    const { getToken, isLoaded, isSignedIn, sessionId, signOut } = useAuth();
    const { user } = useUser();

    return {
      authGetToken: getToken,
      authLoaded: isLoaded,
      authSessionId: sessionId,
      authSignOut: signOut,
      authSignedIn: isSignedIn,
      authUser: user,
      // Not useRoute(): that only follows along when a <NuxtPage> finishes, and this app draws its own pages.
      nuxtRoute: router.currentRoute,
      nuxtRouter: router
    };
  },
  data() {
    return {
      ready: false,
      loadedSessionId: null,
      paths: PATHS,
      navItems: NAV_ITEMS,
      ...emptyAccountState(),
      ...createPreferenceState()
    };
  },
  computed: {
    // The address is the only record of which page is open.
    place() {
      return routeToState({ path: this.nuxtRoute.path });
    },
    view() {
      return this.place.view;
    },
    isPublicRoute() {
      return this.view === "public";
    },
    isAuthenticated() {
      return Boolean(this.authSignedIn && this.authSessionId);
    },
    currentUserEmail() {
      return this.authUser?.primaryEmailAddress?.emailAddress || "";
    },
    currentUserName() {
      const signedUpAs = [this.authUser?.firstName, this.authUser?.lastName].filter(Boolean).join(" ").trim();
      return this.profile.name || signedUpAs || this.currentUserEmail || this.$tx("Diver");
    },
    canManageUsers() {
      return Boolean(this.authUser?.isOwner);
    },
    api() {
      return this.apiClient();
    },
    defaultEquipmentIds() {
      return this.equipment
        .filter((item) => item?.is_default || item?.is_standard)
        .map((item) => String(item.id))
        .filter(Boolean);
    },
    manualDraft() {
      const usual = this.profileEquipmentSelectionEnabled ? this.defaultEquipmentIds : [];
      return { ...this.manualDiveDraft, equipment_ids: this.manualDiveDraft.equipment_ids ?? usual };
    },
    committedDives() {
      return this.dives.filter(isCommittedDive);
    },
    waitingDives() {
      return waiting(this.dives);
    },
    openDiveRecord() {
      if (!["dive", "edit"].includes(this.view)) return null;
      return this.committedDives.find((dive) => String(dive.id) === this.place.id) || null;
    },
    // These pages bring their own header on a phone, as in a notebook opened at one page.
    ownPhoneHeader() {
      return this.view === "create" || Boolean(this.openDiveRecord);
    },
    activeNavId() {
      return this.navItems.find((item) => item.views.includes(this.view))?.id || "";
    },
    inAccount() {
      return ACCOUNT_VIEWS.includes(this.view);
    }
  },
  watch: {
    authSessionId() {
      this.loadAccount();
    },
    isPublicRoute() {
      this.loadAccount();
    },
    "nuxtRoute.path"() {
      if (this.keepNoticeOnce) this.keepNoticeOnce = false;
      else this.clearNotices();
      this.equipmentStatusMessage = "";
      window.scrollTo(0, 0);
    },
    view(next, previous) {
      // Dive Sync can add dives at any time, so arriving at a list from elsewhere refreshes it.
      const listed = ["logbook", "imports"].includes(next);
      if (this.isAuthenticated && listed && !["public", "dive", "edit", "create"].includes(previous)) this.fetchDives({ quiet: true });
    }
  },
  async mounted() {
    await initializeLegacyHashRoute(this);
    await initializePreferences(this);
    this.ready = true;
    await this.loadAccount();
  },
  beforeUnmount() {
    detachSystemThemeListener(this);
  },
  methods: {
    ...createImportMethods(),
    ...createDiveDataMethods(),
    async setLocale(locale) {
      await setLocale(this, locale);
    },
    setThemePreference(themePreference) {
      setThemePreference(this, themePreference);
    },
    syncSystemTheme() {
      syncSystemTheme(this);
    },
    apiClient() {
      return createApiClient({ getToken: this.authGetToken, timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS });
    },
    async loadAccount() {
      if (!this.ready || this.isPublicRoute) return;
      if (!this.isAuthenticated) {
        Object.assign(this, emptyAccountState());
        this.loadedSessionId = null;
        return;
      }
      if (this.loadedSessionId === this.authSessionId) return;
      this.loadedSessionId = this.authSessionId;
      await Promise.all([this.fetchDives(), this.fetchProfileData(), this.fetchEquipment()]);
    },
    async reloadAccount() {
      await Promise.all([this.fetchDives({ quiet: true }), this.fetchProfileData(), this.fetchEquipment()]);
    },
    async navigate(path, { keepNotice = false, replace = false } = {}) {
      this.keepNoticeOnce = keepNotice && this.nuxtRoute.path !== path;
      await navigateToAppRoute(this, path, { replace });
    },
    clearNotices() {
      this.notice = "";
      this.noticeError = "";
    },
    updateManualDiveDraft(key, value) {
      this.manualDiveDraft = { ...this.manualDiveDraft, [key]: value };
      this.manualDiveError = "";
    },
    cancelManualDive() {
      this.manualDiveDraft = createManualDiveDraft();
      this.manualDiveError = "";
      this.navigate(PATHS.logbook);
    },
    showDivesAt(siteName) {
      this.searchText = siteName;
      this.navigate(PATHS.logbook);
    },
    async signOutUser() {
      await this.authSignOut();
      await this.navigate(PATHS.logbook, { replace: true });
    },
    encodeBase64Utf8(value) {
      const bytes = new TextEncoder().encode(String(value ?? ""));
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return window.btoa(binary);
    },
    async sha256Hex(value) {
      const bytes = new TextEncoder().encode(String(value ?? ""));
      const hash = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash))
        .map((entry) => entry.toString(16).padStart(2, "0"))
        .join("");
    }
  }
};
</script>

<template>
  <div v-if="!ready || !authLoaded" class="app" aria-busy="true">
    <div class="land">
      <span class="brand"><brand-mark />DiveVault</span>
    </div>
    <tide-line />
  </div>
  <public-profile-view v-else-if="isPublicRoute" :slug="place.slug" />
  <login-view v-else-if="!isAuthenticated" :current-locale="i18nLocale" :set-locale="setLocale" />
  <div v-else class="app" :class="{ 'has-tabs': view !== 'create' }">
    <header class="land" :class="{ 'desk-only': ownPhoneHeader }">
      <chart-link class="brand" :to="paths.logbook"><brand-mark />DiveVault</chart-link>
      <nav :aria-label="$tx('Main')">
        <chart-link v-for="item in navItems" :key="item.id" :to="item.path" :aria-current="activeNavId === item.id ? 'page' : undefined">
          {{ $tx(item.label) }}
          <span v-if="item.id === 'imports' && waitingDives.length" class="count">{{ waitingDives.length }}</span>
        </chart-link>
      </nav>
      <chart-link v-if="view !== 'create'" class="btn" :to="paths.create">{{ $tx("Log a dive") }}</chart-link>
      <chart-link class="who" :to="paths.diver" :aria-current="inAccount ? 'page' : undefined">{{ currentUserName }}</chart-link>
    </header>

    <main>
      <section v-if="loading" class="page" aria-busy="true">
        <div class="topside">
          <h1 class="h1">{{ $tx("Reading your logbook…") }}</h1>
        </div>
        <tide-line />
        <div class="waiting-water shoal"></div>
        <div class="waiting-water mid"></div>
        <div class="waiting-water shelf"></div>
      </section>
      <section v-else-if="error" class="page">
        <div class="topside">
          <h1 class="h1">{{ $tx("Your dives didn't load") }}</h1>
        </div>
        <tide-line />
        <div class="pad stack">
          <p>{{ $tx("Check that the DiveVault server is running, then try again.") }}</p>
          <p class="soft" role="alert">{{ $tx(error) }}</p>
          <button type="button" class="btn" @click="fetchDives()">{{ $tx("Try again") }}</button>
        </div>
      </section>
      <logbook-view
        v-else-if="view === 'logbook'"
        :dives="committedDives"
        :waiting-count="waitingDives.length"
        :truncated="diveTotal > dives.length"
        :display-fields="profileLogbookDisplayFields"
        :search="searchText"
        :status="notice"
        :error="noticeError"
        @update:search="searchText = $event"
      />
      <dive-detail-view
        v-else-if="view === 'dive' && openDiveRecord"
        :key="place.id"
        :dive="openDiveRecord"
        :all-dives="committedDives"
        :dive-sites="profileDiveSites"
        :equipment="equipment"
        :deleting="deletingDiveId !== null"
        :status="notice"
        :error="noticeError"
        @delete="deleteDive(openDiveRecord.id)"
      />
      <logbook-editor-view
        v-else-if="view === 'edit' && openDiveRecord"
        :key="place.id"
        :dive="openDiveRecord"
        :all-dives="committedDives"
        :draft="draftFor(openDiveRecord)"
        :required-fields="profileRequiredLogbookFields"
        :dive-sites="profileDiveSites"
        :buddies="profileBuddies"
        :guides="profileGuides"
        :equipment="equipment"
        :equipment-enabled="profileEquipmentSelectionEnabled"
        :default-equipment-ids="defaultEquipmentIds"
        :saving="savingDiveId !== null || deletingDiveId !== null"
        :create-dive-site="createDiveSite"
        :search-location="searchDiveSiteLocation"
        :status="notice"
        :error="noticeError"
        @change="(key, value) => updateDraft(openDiveRecord.id, key, value)"
        @save="saveDraft(openDiveRecord.id, true)"
        @discard="discardDraft(openDiveRecord.id)"
        @delete="deleteDive(openDiveRecord.id)"
      />
      <section v-else-if="view === 'dive' || view === 'edit'" class="page">
        <div class="topside">
          <h1 class="h1">{{ $tx("That dive isn't in your logbook") }}</h1>
        </div>
        <tide-line />
        <div class="pad">
          <chart-link class="link big" :to="paths.logbook">{{ $tx("Back to the logbook") }}</chart-link>
        </div>
      </section>
      <manual-dive-view
        v-else-if="view === 'create'"
        :draft="manualDraft"
        :required-fields="profileRequiredLogbookFields"
        :dive-sites="profileDiveSites"
        :buddies="profileBuddies"
        :guides="profileGuides"
        :equipment="equipment"
        :equipment-enabled="profileEquipmentSelectionEnabled"
        :creating="manualDiveCreating"
        :create-dive-site="createDiveSite"
        :search-location="searchDiveSiteLocation"
        :error="manualDiveError"
        @change="updateManualDiveDraft"
        @create="createManualDive"
        @cancel="cancelManualDive"
      />
      <imports-view
        v-else-if="view === 'imports'"
        :queue="waitingDives"
        :dives="committedDives"
        :selected-id="place.id"
        :draft-for="draftFor"
        :required-fields="profileRequiredLogbookFields"
        :dive-sites="profileDiveSites"
        :buddies="profileBuddies"
        :guides="profileGuides"
        :equipment="equipment"
        :equipment-enabled="profileEquipmentSelectionEnabled"
        :default-equipment-ids="defaultEquipmentIds"
        :saving="savingDiveId !== null || deletingDiveId !== null || bulkSaving"
        :create-dive-site="createDiveSite"
        :search-location="searchDiveSiteLocation"
        :status="notice"
        :error="noticeError"
        @change="updateDraft"
        @save="saveDraft"
        @delete="deleteDive"
        @apply-people="applyPeopleToWaiting"
        @refresh="fetchDives({ quiet: true })"
      />
      <import-file-view
        v-else-if="view === 'importFile'"
        :key="place.code"
        :api="api"
        :code="place.code"
        :email="currentUserEmail"
        :refresh-dives="fetchDives"
      />
      <sites-view
        v-else-if="view === 'sites'"
        :dives="committedDives"
        :saved-sites="profileDiveSites"
        :loaded="profileLoaded"
        :load-error="profileError"
        :save-profile="saveProfile"
        :search-location="searchDiveSiteLocation"
        @retry="fetchProfileData"
        @show-dives="showDivesAt"
      />
      <gear-view
        v-else-if="view === 'gear'"
        :equipment="equipment"
        :dives="committedDives"
        :loaded="equipmentLoaded"
        :saving="equipmentSaving"
        :servicing-id="equipmentServicingId"
        :save-equipment="saveEquipment"
        :mark-serviced="markEquipmentServiced"
        :status="equipmentStatusMessage"
        :error="equipmentError"
        @retry="fetchEquipment"
      />
      <diver-view
        v-else-if="view === 'diver'"
        :api="api"
        :profile="profile"
        :loaded="profileLoaded"
        :load-error="profileError"
        :name="currentUserName"
        :email="currentUserEmail"
        :save-profile="saveProfile"
        :profile-updated="handleProfileUpdated"
        @retry="fetchProfileData"
        @password="passwordDialogOpen = true"
        @sign-out="signOutUser"
      />
      <application-view
        v-else-if="view === 'application'"
        :api="api"
        :profile="profile"
        :loaded="profileLoaded"
        :load-error="profileError"
        :can-manage-users="canManageUsers"
        :locale="i18nLocale"
        :theme="themePreference"
        :save-profile="saveProfile"
        :reload-account="reloadAccount"
        @retry="fetchProfileData"
        @locale="setLocale"
        @theme="setThemePreference"
      />
    </main>

    <nav v-if="view !== 'create'" class="tabs" :aria-label="$tx('Main')">
      <chart-link v-for="item in navItems" :key="item.id" :to="item.path" :aria-current="activeNavId === item.id ? 'page' : undefined">
        {{ $tx(item.label) }}<span v-if="item.id === 'imports' && waitingDives.length" class="count">{{ waitingDives.length }}</span>
      </chart-link>
      <chart-link :to="paths.diver" :aria-current="inAccount ? 'page' : undefined">{{ $tx("You") }}</chart-link>
    </nav>

    <password-dialog v-if="passwordDialogOpen" :api="api" @close="passwordDialogOpen = false" />
  </div>
</template>

<style>
.waiting-water {
  height: 90px;
}

.phone-only {
  display: none !important;
}

@media (max-width: 700px) {
  .desk-only {
    display: none !important;
  }

  .phone-only {
    display: flex !important;
  }
}
</style>

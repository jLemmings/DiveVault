export const APP_TEMPLATE = `
    <public-profile-view v-if="isPublicRoute" :slug="publicRouteSlug"></public-profile-view>
    <div v-else-if="!authLoaded" class="flex min-h-screen items-center justify-center bg-background px-6 text-on-background">
      <section class="bg-surface-container-low p-10 shadow-panel">
        <p class="font-headline text-2xl font-bold">Loading secure access...</p>
      </section>
    </div>
    <login-view v-else-if="!isAuthenticated" :current-locale="i18nLocale" :set-locale="setLocale"></login-view>
    <div v-else class="app-stage relative min-h-screen overflow-hidden bg-background text-on-background">
      <div class="app-stage-wave auth-stage-wave auth-stage-wave-back"></div>
      <div class="app-stage-wave auth-stage-wave auth-stage-wave-front"></div>
      <div class="app-stage-caustics auth-stage-caustics"></div>
      <aside class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-background shadow-[40px_0_40px_-20px_rgba(0,15,29,0.4)] md:flex">
        <div class="flex justify-center px-4 pb-2 pt-5">
          <div class="flex h-32 w-full items-center justify-center rounded-3xl shadow-panel">
            <img src="/logo-headline.png" alt="DiveVault" class="max-h-full w-full object-contain p-2" />
          </div>
        </div>
        <nav class="mt-6 flex-1 space-y-2">
          <div v-for="item in desktopNavItems" :key="item.id" class="space-y-2">
            <button @click="handleNavItemClick(item.id)" :disabled="item.disabled" class="group flex w-full items-center gap-4 p-4 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-100" :class="item.disabled ? 'border-l-4 border-tertiary bg-tertiary/12 text-tertiary' : ((activeView === item.id || (activeView === 'create' && item.id === 'logs')) ? 'border-r-4 border-primary bg-surface-container-high/70 text-primary' : 'text-secondary opacity-70 hover:bg-surface-container-high hover:text-primary hover:opacity-100')">
              <span class="material-symbols-outlined transition-transform group-active:scale-90" :style="(activeView === item.id || (activeView === 'create' && item.id === 'logs')) && !item.disabled ? filledIconStyle : ''">{{ item.icon }}</span>
              <span class="hidden items-center gap-2 font-label text-[11px] font-bold md:flex">
                <span>{{ item.label }}</span>
                <span v-if="item.badge" class="rounded bg-tertiary px-2 py-0.5 text-[9px] font-black tracking-[0.18em] text-background">{{ item.badge }}</span>
              </span>
            </button>
          </div>
        </nav>
        <div class="mt-auto p-6">
          <button @click="openManualDiveCreator()" class="hidden w-full items-center justify-center gap-2 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:brightness-110 md:flex">
            <span class="material-symbols-outlined text-sm">add</span>
            Log New Dive
          </button>
        </div>
      </aside>
      <header class="fixed left-0 right-0 top-0 z-30 h-16 border-b border-primary/10 bg-surface-container-high/95 backdrop-blur-xl md:left-64 md:bg-background/80">
        <div class="relative flex h-full items-center justify-between px-6 md:hidden">
          <div class="flex items-center gap-3">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl shadow-panel">
              <img src="/logo.png" alt="DiveVault" class="max-h-full max-w-full object-contain p-1" />
            </div>
            <h2 class="font-headline text-lg font-bold uppercase tracking-[0.14em] text-primary">{{ activeMenuTitle }}</h2>
          </div>
          <div class="relative">
            <button @click="toggleMobileAccountMenu" class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-surface-container-high text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
              {{ currentUserInitials }}
            </button>
            <div v-if="mobileAccountMenuOpen" class="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-56 rounded-2xl border border-primary/10 bg-surface-container-low p-3 shadow-panel">
              <div class="border-b border-primary/10 pb-3">
                <p class="truncate text-sm font-semibold text-on-surface">{{ currentUserName }}</p>
                <p class="mt-1 truncate text-xs text-secondary">{{ currentUserEmail }}</p>
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <button @click="openMobileSettings()" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Open Settings
                </button>
                <button @click="openPasswordDialog" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Change Password
                </button>
                <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="hidden h-full items-center justify-between px-8 md:flex">
          <h2 class="font-headline text-2xl font-bold tracking-[0.08em] text-primary">{{ activeMenuTitle }}</h2>
          <div class="relative flex items-center gap-4 border-l border-primary/10 pl-5 text-on-surface">
            <div class="min-w-0 text-right">
              <p class="font-label text-[9px] font-bold uppercase tracking-[0.18em] text-secondary/70">Diver</p>
              <p class="max-w-[11rem] truncate text-sm font-semibold leading-5 text-on-surface">{{ currentUserName }}</p>
            </div>
            <button
              @click="toggleDesktopAccountMenu"
              type="button"
              aria-label="Account menu"
              :aria-expanded="desktopAccountMenuOpen ? 'true' : 'false'"
              class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-background/50 text-[11px] font-bold uppercase tracking-[0.12em] text-primary shadow-[inset_0_1px_0_rgba(205,229,255,0.08)] transition-colors hover:border-primary/35 hover:bg-primary/12"
            >
              {{ currentUserInitials }}
              <span class="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-background bg-surface-container-high text-secondary">
                <span class="material-symbols-outlined text-[14px] transition-transform" :class="desktopAccountMenuOpen ? 'rotate-180 text-primary' : ''">expand_more</span>
              </span>
            </button>
            <div v-if="desktopAccountMenuOpen" class="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-56 rounded-2xl border border-primary/10 bg-surface-container-low p-3 shadow-panel">
              <div class="border-b border-primary/10 pb-3">
                <p class="truncate text-sm font-semibold text-on-surface">{{ currentUserName }}</p>
                <p class="mt-1 truncate text-xs text-secondary">{{ currentUserEmail }}</p>
              </div>
              <div class="mt-3 flex flex-col gap-2">
                <button @click="openPasswordDialog" class="inline-flex items-center justify-center rounded-xl bg-surface-container-high px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
                  Change Password
                </button>
                <button @click="signOutUser" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main class="relative z-10 md:ml-64" :class="activeView === 'map' ? 'px-0 pb-0 pt-16' : 'pb-24 pt-20'">
        <div class="mx-auto" :class="activeView === 'map' ? 'w-full max-w-none px-0 md:max-w-[96rem] md:px-8' : 'max-w-md px-4 md:max-w-[96rem] md:px-8'">
          <section v-if="loading" class="space-y-6">
            <div class="border border-primary/10 bg-surface-container-low p-6 shadow-panel animate-pulse">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                {{ loadingViewKey === 'dashboard' ? 'Loading Dashboard'
                  : loadingViewKey === 'map' ? 'Loading Dive Map'
                  : loadingViewKey === 'logs' ? 'Loading Dive Log'
                  : loadingViewKey === 'detail' ? 'Loading Dive Detail'
                  : loadingViewKey === 'imports' ? 'Loading Imports'
                  : loadingViewKey === 'edit' ? 'Loading Dive Editor'
                  : loadingViewKey === 'create' ? 'Loading Manual Entry'
                  : loadingViewKey === 'equipment' ? 'Loading Equipment'
                  : 'Loading Settings' }}
              </p>
              <div class="mt-4 h-9 w-56 bg-surface-container-high"></div>
              <div class="mt-3 h-4 w-72 max-w-full bg-surface-container-high/80"></div>
            </div>

            <div v-if="loadingViewKey === 'dashboard'" class="space-y-6 animate-pulse">
              <div class="dashboard-command-center space-y-6">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div v-for="index in 4" :key="'dashboard-stat-' + index" class="h-36 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <div class="space-y-6">
                    <div class="h-[28rem] rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                    <div class="grid gap-4 md:grid-cols-3">
                      <div v-for="index in 3" :key="'dashboard-recent-' + index" class="h-28 rounded-2xl bg-surface-container-low shadow-panel"></div>
                    </div>
                  </div>
                  <div class="space-y-4">
                    <div class="h-44 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                    <div class="h-44 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'map'" class="dashboard-command-center dashboard-map-only animate-pulse">
              <section class="dashboard-section dashboard-map-section relative min-h-[calc(100vh-10rem)]">
                <div class="dashboard-glass-card dashboard-map-panel relative h-full min-h-[calc(100vh-10rem)] overflow-hidden rounded-[1.5rem] bg-surface-container-low shadow-panel">
                  <div class="absolute left-6 top-6 z-10 space-y-3">
                    <div class="h-4 w-40 rounded bg-surface-container-high"></div>
                    <div class="h-9 w-72 rounded bg-surface-container-high"></div>
                    <div class="h-4 w-96 max-w-full rounded bg-surface-container-high"></div>
                  </div>
                  <div class="absolute inset-0 bg-surface-container-high/60"></div>
                  <div class="absolute inset-0 technical-grid opacity-[0.12]"></div>
                  <div class="absolute bottom-8 left-8 flex gap-3">
                    <div v-for="index in 4" :key="'map-site-chip-' + index" class="h-14 w-44 rounded-xl bg-surface-container-low"></div>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="loadingViewKey === 'equipment'" class="dashboard-command-center animate-pulse">
              <div class="flex justify-end">
                <div class="h-12 w-[24rem] rounded-xl bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="settings-stat-strip">
                <div v-for="index in 2" :key="'equipment-stat-' + index" class="h-20 rounded-2xl bg-surface-container-low shadow-panel"></div>
              </div>
              <div class="equipment-page-layout">
                <aside class="settings-panel settings-card equipment-service-sidebar h-[34rem] bg-surface-container-low shadow-panel"></aside>
                <section class="min-w-0">
                  <div class="equipment-items-grid">
                    <div v-for="index in 6" :key="'equipment-card-' + index" class="h-64 rounded-2xl bg-surface-container-low shadow-panel"></div>
                  </div>
                </section>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'logs'" class="space-y-6 animate-pulse">
              <div class="dashboard-command-center space-y-6">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div v-for="index in 4" :key="'logs-stat-' + index" class="h-32 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                  <div class="h-24 rounded-2xl bg-surface-container-low shadow-panel"></div>
                  <div class="h-24 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="space-y-4">
                  <div v-for="index in 5" :key="'logs-card-' + index" class="h-36 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'detail'" class="space-y-6 animate-pulse">
              <div class="relative h-[19rem] overflow-hidden rounded-[2rem] bg-surface-container-low shadow-panel">
                <div class="absolute left-8 top-8 h-11 w-36 rounded-xl bg-surface-container-high"></div>
                <div class="absolute bottom-8 left-8 right-8 space-y-5">
                  <div class="h-5 w-80 rounded bg-surface-container-high"></div>
                  <div class="h-14 max-w-3xl rounded bg-surface-container-high"></div>
                  <div class="flex flex-wrap gap-10">
                    <div v-for="index in 4" :key="'detail-hero-metric-' + index" class="space-y-2">
                      <div class="h-3 w-24 rounded bg-surface-container-high"></div>
                      <div class="h-8 w-20 rounded bg-surface-container-high"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-12 gap-6">
                <div class="col-span-12 space-y-6 xl:col-span-8">
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="mb-6 flex items-center justify-between">
                      <div class="h-6 w-52 rounded bg-surface-container-high"></div>
                      <div class="h-7 w-24 rounded-full bg-surface-container-high"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                      <div v-for="index in 6" :key="'detail-logbook-' + index" class="h-24 rounded-xl bg-surface-container-high"></div>
                    </div>
                  </div>
                  <div class="h-[20rem] rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="col-span-12 xl:col-span-4">
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="mb-5 h-5 w-56 rounded bg-surface-container-high"></div>
                    <div class="divide-y divide-primary/10">
                      <div v-for="index in 4" :key="'detail-telemetry-' + index" class="space-y-3 py-5 first:pt-0 last:pb-0">
                        <div class="h-5 w-5 rounded bg-surface-container-high"></div>
                        <div class="h-3 w-32 rounded bg-surface-container-high"></div>
                        <div class="h-7 w-28 rounded bg-surface-container-high"></div>
                        <div class="h-3 w-40 rounded bg-surface-container-high"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="col-span-12 pt-8">
                  <div class="mb-5 h-6 w-44 rounded bg-surface-container-high"></div>
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
                    <div v-for="index in 5" :key="'detail-equipment-' + index" class="h-20 rounded-xl bg-surface-container-low shadow-panel"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'imports'" class="space-y-6 animate-pulse">
              <div class="h-36 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(260px,0.82fr)]">
                <div class="space-y-4">
                  <div v-for="index in 5" :key="'imports-row-' + index" class="h-28 rounded-2xl bg-surface-container-low shadow-panel"></div>
                </div>
                <div class="space-y-4">
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'edit'" class="space-y-6 animate-pulse">
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
                <div class="space-y-6">
                  <div class="h-48 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                    <div class="grid gap-4 md:grid-cols-2">
                      <div v-for="index in 10" :key="'edit-field-' + index" class="h-16 rounded-xl bg-surface-container-high"></div>
                    </div>
                  </div>
                </div>
                <div class="space-y-4">
                  <div class="h-64 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else-if="loadingViewKey === 'create'" class="space-y-6 animate-pulse">
              <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
                <div class="rounded-[1.5rem] bg-surface-container-low p-6 shadow-panel">
                  <div class="grid gap-4 md:grid-cols-2">
                    <div v-for="index in 12" :key="'create-field-' + index" class="h-16 rounded-xl bg-surface-container-high"></div>
                  </div>
                </div>
                <div class="space-y-4">
                  <div class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                  <div class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </div>
            </div>

            <div v-else class="settings-layout animate-pulse">
              <aside class="settings-section-nav h-[42rem] bg-surface-container-low shadow-panel">
                <div class="space-y-3 p-4">
                  <div v-for="index in 8" :key="'settings-nav-' + index" class="h-14 rounded-xl bg-surface-container-high"></div>
                </div>
              </aside>
              <section class="min-w-0 space-y-6">
                <div class="h-40 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                <div class="grid gap-6 md:grid-cols-2">
                  <div v-for="index in 4" :key="'settings-panel-' + index" class="h-56 rounded-[1.5rem] bg-surface-container-low shadow-panel"></div>
                </div>
              </section>
            </div>
          </section>
          <section v-else-if="error" class="bg-error-container/25 p-10 shadow-panel">
            <p class="font-headline text-2xl font-bold text-on-error-container">Frontend could not load dive data</p>
            <p class="mt-2 text-sm text-on-error-container">{{ error }}</p>
            <button @click="fetchDives" class="mt-5 bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Retry</button>
          </section>
          <dashboard-view v-else-if="activeView === 'dashboard'" display-mode="dashboard" :dives="committedDives" :all-dives="dives" :dive-sites="profileDiveSites" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <dashboard-view v-else-if="activeView === 'map'" display-mode="map" :dives="committedDives" :all-dives="dives" :dive-sites="profileDiveSites" :stats="stats" :set-view="setView" :backend-healthy="backendHealthy" :open-dive="openDive" :current-user-name="currentUserName" :imported-dive-count="importedDiveCount" :open-import-queue="openImportQueue"></dashboard-view>
          <logs-view v-else-if="activeView === 'logs' && !selectedDive" :dives="committedDives" :dive-sites="profileDiveSites" :logbook-display-fields="profileLogbookDisplayFields" :search-text="searchText" :open-dive="openDive" :open-import-queue="openImportQueue" :open-manual-dive="openManualDiveCreator" :set-search-text="setSearchText" :delete-dive="deleteDive" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError"></logs-view>
          <manual-dive-entry-view v-else-if="activeView === 'create'" :draft="manualDiveDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :creating="manualDiveCreating" :error-message="manualDiveError" :update-draft="updateManualDiveDraft" :create-manual-dive="createManualDive" :close-creator="closeManualDiveCreator" :create-dive-site="createDiveSite" :search-dive-site-location="searchDiveSiteLocation"></manual-dive-entry-view>
          <dive-import-editor-view v-else-if="activeView === 'imports' && selectedImportDive" :dive="selectedImportDive" :draft="selectedImportDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :saving-import-id="savingImportId" :bulk-import-save-pending="bulkImportSavePending" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :update-import-draft="updateImportDraft" :save-import-draft="saveImportDraft" :delete-dive="deleteDive" :apply-buddy-guide-to-pending-imports="applyBuddyGuideToPendingImports" :create-dive-site="createDiveSite" :back-to-queue="backToImportQueue"></dive-import-editor-view>
          <dive-import-view v-else-if="activeView === 'imports'" :dives="dives" :import-drafts="importDrafts" :required-logbook-fields="profileRequiredLogbookFields" :selected-import-id="selectedImportId" :select-import-dive="selectImportDive" :deleting-dive-id="deletingDiveId" :import-error="importError" :import-status-message="importStatusMessage" :delete-dive="deleteDive" :set-view="setView" :fetch-dives="fetchDives"></dive-import-view>
          <logbook-editor-view v-else-if="activeView === 'edit' && selectedEditDive" :dive="selectedEditDive" :all-dives="dives" :draft="selectedEditDraft" :required-logbook-fields="profileRequiredLogbookFields" :dive-sites="profileDiveSites" :buddies="profileBuddies" :guides="profileGuides" :equipment="equipment" :default-equipment-ids="defaultEquipmentIds" :equipment-selection-enabled="profileEquipmentSelectionEnabled" :saving-import-id="savingImportId" :deleting-dive-id="deletingDiveId" :status-message="importStatusMessage" :error-message="importError" :update-dive-draft="updateImportDraft" :save-dive-logbook="saveExistingDiveLogbook" :delete-dive="deleteDive" :create-dive-site="createDiveSite" :close-editor="closeDiveEditor"></logbook-editor-view>
          <dive-detail-view v-else-if="activeView === 'logs' && selectedDive" :dive="selectedDive" :all-dives="dives" :dive-sites="profileDiveSites" :deleting-dive-id="deletingDiveId" :close-detail="closeDiveDetail" :open-dive-editor="openDiveEditor" :delete-dive="deleteDive"></dive-detail-view>
          <equipment-view v-else-if="activeView === 'equipment'" :equipment="equipment" :search-text="searchText" :set-search-text="setSearchText" :saving="equipmentSaving" :status-message="equipmentStatusMessage" :error-message="equipmentError" :save-equipment="saveEquipment"></equipment-view>
          <settings-view v-else-if="activeView === 'settings'" :cli-auth-code="cliAuthCode" :active-section="activeSettingsSection" :set-active-section="setSettingsSection" :profile-updated="handleProfileUpdated" :refresh-dives="fetchDives" :open-import-queue="openImportQueue" :upload-csv-import="uploadCsvImport" :upload-subsurface-import="uploadSubsurfaceImport" :current-locale="i18nLocale" :set-locale="setLocale" :theme-preference="themePreference" :resolved-theme="resolvedTheme" :set-theme-preference="setThemePreference"></settings-view>
        </div>
      </main>
      <nav class="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-primary/10 bg-surface-container-low/80 px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <button
          v-for="item in mobileNavItems"
          :key="item.id"
          @click="setView(item.id)"
          :disabled="item.disabled"
          class="flex flex-col items-center justify-center rounded-lg px-3 py-1 transition-all disabled:cursor-not-allowed disabled:opacity-100"
          :class="item.disabled ? 'bg-tertiary/12 text-tertiary' : (activeView === item.id || ((activeView === 'imports' || activeView === 'edit' || activeView === 'create') && item.id === 'logs') ? 'bg-surface-container-high text-primary' : 'text-secondary/60')"
        >
          <span class="material-symbols-outlined mb-1" :style="!item.disabled && (activeView === item.id || ((activeView === 'imports' || activeView === 'edit' || activeView === 'create') && item.id === 'logs')) ? filledIconStyle : ''">{{ item.mobileIcon || item.icon }}</span>
          <span class="font-label text-[10px] font-bold">{{ item.mobileLabel }}</span>
        </button>
      </nav>
      <div
        v-if="passwordDialogOpen"
        @click.self="closePasswordDialog"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      >
        <div class="w-full max-w-md rounded-3xl border border-primary/10 bg-surface-container-low p-6 shadow-panel">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Account Security</p>
              <h3 class="mt-3 font-headline text-2xl font-bold tracking-tight text-on-surface">Change Password</h3>
              <p class="mt-3 text-sm leading-6 text-secondary">Update the password for your current DiveVault account.</p>
            </div>
            <button @click="closePasswordDialog" :disabled="passwordSubmitting" class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/10 text-secondary transition-colors hover:bg-surface-container-high">
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <p v-if="passwordStatus" class="mt-5 text-sm text-primary">{{ passwordStatus }}</p>
          <p v-if="passwordError" class="mt-5 text-sm text-error">{{ passwordError }}</p>

          <div class="mt-5 space-y-4">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Current Password</span>
              <input v-model="passwordForm.currentPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">New Password</span>
              <input v-model="passwordForm.newPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Confirm New Password</span>
              <input v-model="passwordForm.confirmPassword" type="password" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/40" />
            </label>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            <button @click="submitPasswordChange" :disabled="passwordSubmitting" class="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary transition-all hover:brightness-110">
              {{ passwordSubmitting ? 'Updating Password' : 'Update Password' }}
            </button>
            <button @click="closePasswordDialog" :disabled="passwordSubmitting" class="inline-flex items-center justify-center rounded-xl border border-primary/15 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
`;

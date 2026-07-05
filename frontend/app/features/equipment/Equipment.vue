<script>
function createEquipmentId() {
  return `equipment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const EQUIPMENT_ICON_OPTIONS = [
  { icon: "scuba_diving", label: "Diver" },
  { icon: "air", label: "Regulator" },
  { icon: "watch", label: "Computer" },
  { icon: "water", label: "Fins" },
  { icon: "backpack", label: "BCD" },
  { icon: "opacity", label: "Tank" },
  { icon: "visibility", label: "Mask" },
  { icon: "fitness_center", label: "Weights" },
  { icon: "flashlight_on", label: "Torch" },
  { icon: "photo_camera", label: "Camera" },
  { icon: "waves", label: "Exposure" },
  { icon: "build", label: "Tools" }
];

function emptyEquipment() {
  return {
    id: createEquipmentId(),
    name: "",
    category: "Regulator",
    icon: "scuba_diving",
    year_bought: "",
    vendor: "",
    brand: "",
    model: "",
    serial: "",
    warranty: "",
    next_service_due: "",
    max_dives_before_service: "",
    track_service: true,
    service_tag: "",
    service_interval_months: "12",
    last_service_date: "",
    is_default: false
  };
}

function normalizeEquipment(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    id: item?.id || `equipment-${index + 1}`,
    name: item?.name || [item?.brand, item?.vendor, item?.model, item?.category || item?.type].filter(Boolean).join(" "),
    category: item?.category || item?.type || "",
    icon: item?.icon || "scuba_diving",
    year_bought: item?.year_bought ? String(item.year_bought) : "",
    vendor: item?.vendor || "",
    brand: item?.brand || "",
    model: item?.model || "",
    serial: item?.serial || "",
    warranty: item?.warranty || "",
    next_service_due: item?.next_service_due || "",
    max_dives_before_service: item?.max_dives_before_service ? String(item.max_dives_before_service) : "",
    track_service: item?.track_service !== false,
    service_tag: item?.service_tag || "",
    service_interval_months: item?.service_interval_months ? String(item.service_interval_months) : "",
    last_service_date: item?.last_service_date || item?.last_serviced_at?.slice?.(0, 10) || "",
    is_default: Boolean(item?.is_default || item?.is_standard),
    service_status: item?.service_status || "unknown",
    service_due_date: item?.service_due_date || "",
    dives_remaining_before_service: item?.dives_remaining_before_service
  }));
}

function equipmentPayload(item) {
  return {
    id: item.id,
    name: item.name.trim(),
    category: item.category.trim(),
    icon: item.icon || "scuba_diving",
    type: item.category.trim(),
    year_bought: item.year_bought ? Number.parseInt(item.year_bought, 10) : null,
    vendor: item.vendor.trim(),
    brand: item.brand.trim(),
    model: item.model.trim(),
    serial: item.serial.trim(),
    warranty: item.warranty.trim(),
    next_service_due: item.next_service_due,
    service_interval_months: item.service_interval_months ? Number.parseInt(item.service_interval_months, 10) : null,
    last_service_date: item.last_service_date,
    max_dives_before_service: item.max_dives_before_service ? Number.parseInt(item.max_dives_before_service, 10) : null,
    track_service: item.track_service !== false,
    service_tag: item.service_tag.trim(),
    is_default: Boolean(item.is_default)
  };
}

function defaultMissingServiceData(item) {
  if (!item?.is_default) return false;
  return !item.last_service_date || !item.service_interval_months;
}

function daysUntilService(item) {
  const dueDate = item?.service_due_date || item?.next_service_due || "";
  if (!dueDate) return null;
  const dueTime = Date.parse(`${dueDate}T00:00:00`);
  if (!Number.isFinite(dueTime)) return null;
  const today = new Date();
  const todayTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((dueTime - todayTime) / 86400000);
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export default {
  name: "EquipmentView",
  props: ["equipment", "searchText", "setSearchText", "saving", "statusMessage", "errorMessage", "saveEquipment"],
  data() {
    return {
      drafts: normalizeEquipment(this.equipment),
      editing: false,
      editingItemId: null
    };
  },
  watch: {
    equipment: {
      handler(value) {
        if (!this.editing) {
          this.drafts = normalizeEquipment(value);
        }
      },
      deep: true
    }
  },
  computed: {
    visibleDrafts() {
      const query = typeof this.searchText === "string" ? this.searchText.trim().toLowerCase() : "";
      if (!query) return this.drafts;
      return this.drafts.filter((item) =>
        [item.name, item.category, item.brand, item.model, item.serial].join(" ").toLowerCase().includes(query)
      );
    },
    defaultCount() {
      return this.drafts.filter((item) => item.is_default).length;
    },
    editingItem() {
      if (!this.editingItemId) return null;
      return this.drafts.find((item) => String(item.id) === String(this.editingItemId)) || null;
    },
    serviceTimeline() {
      return this.drafts
        .filter((item) => item.track_service !== false)
        .map((item) => {
          const dueDate = item.service_due_date || item.next_service_due || "";
          const dueTime = dueDate ? Date.parse(`${dueDate}T00:00:00`) : Number.POSITIVE_INFINITY;
          const divesRemaining = Number.isFinite(Number(item.dives_remaining_before_service))
            ? Number(item.dives_remaining_before_service)
            : Number.POSITIVE_INFINITY;
          const statusRank =
            item.service_status === "overdue" || defaultMissingServiceData(item)
              ? 0
              : item.service_status === "due_soon"
                ? 1
                : Number.isFinite(dueTime)
                  ? 2
                  : 3;
          return {
            ...item,
            timelineDueDate: dueDate,
            timelineDueTime: dueTime,
            timelineDivesRemaining: divesRemaining,
            timelineStatusRank: statusRank
          };
        })
        .sort((left, right) => {
          if (left.timelineStatusRank !== right.timelineStatusRank) return left.timelineStatusRank - right.timelineStatusRank;
          if (left.timelineDueTime !== right.timelineDueTime) return left.timelineDueTime - right.timelineDueTime;
          if (left.timelineDivesRemaining !== right.timelineDivesRemaining)
            return left.timelineDivesRemaining - right.timelineDivesRemaining;
          return String(left.name || left.category || "").localeCompare(String(right.name || right.category || ""));
        })
        .slice(0, 6);
    },
    equipmentIconOptions() {
      return EQUIPMENT_ICON_OPTIONS;
    }
  },
  methods: {
    defaultMissingServiceData,
    daysUntilService,
    beginEdit() {
      this.drafts = normalizeEquipment(this.equipment);
      this.editing = true;
      this.editingItemId = null;
    },
    beginEditItem(id) {
      if (!this.editing) {
        this.drafts = normalizeEquipment(this.equipment);
      }
      this.editing = true;
      this.editingItemId = String(id);
    },
    cancelEdit() {
      this.drafts = normalizeEquipment(this.equipment);
      this.editing = false;
      this.editingItemId = null;
    },
    addItem() {
      const item = emptyEquipment();
      if (!this.editing) {
        this.drafts = normalizeEquipment(this.equipment);
      }
      this.editing = true;
      this.editingItemId = String(item.id);
      this.drafts = [item, ...this.drafts];
    },
    updateSearch(value) {
      if (typeof this.setSearchText === "function") {
        this.setSearchText(value);
      }
    },
    removeItem(id) {
      this.drafts = this.drafts.filter((item) => item.id !== id);
    },
    async removeAndSave(id) {
      this.removeItem(id);
      await this.save();
    },
    updateItem(id, key, value) {
      this.drafts = this.drafts.map((item) => (item.id === id ? { ...item, [key]: value } : item));
    },
    async save() {
      const savedEquipment = await this.saveEquipment(this.drafts.map(equipmentPayload));
      if (savedEquipment) {
        this.drafts = normalizeEquipment(Array.isArray(savedEquipment) ? savedEquipment : this.equipment);
        this.editing = false;
        this.editingItemId = null;
      }
    },
    timelineMeta(item) {
      if (defaultMissingServiceData(item)) return "Service interval missing";
      const details = [];
      if (item.timelineDueDate)
        details.push(item.service_status === "overdue" ? `Overdue since ${item.timelineDueDate}` : `Due ${item.timelineDueDate}`);
      if (Number.isFinite(item.timelineDivesRemaining)) details.push(`${item.timelineDivesRemaining} dives left`);
      return details.length ? details.join(" / ") : "No service schedule set";
    },
    serviceCountdownLabel(item) {
      const days = daysUntilService(item);
      if (days === null) return "No date";
      if (days < 0) return `${Math.abs(days)} Days Overdue`;
      if (days === 0) return "Due Today";
      return `${days} Days`;
    },
    serviceCountdownDivesLabel(item) {
      const divesRemaining = Number(item?.dives_remaining_before_service);
      return Number.isFinite(divesRemaining) ? `${divesRemaining} dives left` : "Dive interval not set";
    },
    serviceCountdownLastServiceLabel(item) {
      return item?.last_service_date ? `Last Service: ${item.last_service_date}` : "Last Service: not set";
    },
    countdownDonutStyle(item) {
      const days = daysUntilService(item);
      const intervalMonths = Number(item?.service_interval_months);
      const totalDays = Number.isFinite(intervalMonths) && intervalMonths > 0 ? intervalMonths * 30.44 : 365;
      const daysPercent = days === null ? 0 : clampPercent((Math.max(days, 0) / totalDays) * 100);
      const divesRemaining = Number(item?.dives_remaining_before_service);
      const maxDives = Number(item?.max_dives_before_service);
      const divesPercent =
        Number.isFinite(divesRemaining) && Number.isFinite(maxDives) && maxDives > 0
          ? clampPercent((Math.max(divesRemaining, 0) / maxDives) * 100)
          : 0;
      return {
        "--days-progress": `${daysPercent}%`,
        "--dives-progress": `${divesPercent}%`,
        "--days-progress-value": daysPercent,
        "--dives-progress-value": divesPercent
      };
    }
  }
};
</script>

<template>
  <section class="dashboard-command-center text-on-surface">
    <div class="flex flex-col justify-end gap-3 lg:flex-row lg:items-center">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative min-w-[18rem] flex-1 sm:w-[24rem] sm:flex-none">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">search</span>
          <UInput
            :value="searchText"
            @input="updateSearch($event.target.value)"
            type="text"
            class="w-full rounded-xl border border-primary/10 bg-surface-container-high/70 py-3 pl-12 pr-4 text-sm font-label tracking-[0.12em] text-on-surface placeholder:text-on-surface-variant/50 focus:ring-1 focus:ring-primary/20"
            placeholder="Search equipment..."
          />
        </div>
        <UButton
          @click="addItem"
          class="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary"
        >
          <span class="material-symbols-outlined text-sm">add</span>
          New Entry
        </UButton>
      </div>
    </div>

    <div v-if="statusMessage" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ statusMessage }}</div>
    <div v-if="errorMessage" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">
      {{ errorMessage }}
    </div>

    <div class="settings-stat-strip">
      <article class="settings-stat-pill">
        <p class="settings-stat-pill-label">Items</p>
        <p class="settings-stat-pill-value">{{ drafts.length }}</p>
      </article>
      <article class="settings-stat-pill">
        <p class="settings-stat-pill-label">Defaults</p>
        <p class="settings-stat-pill-value">{{ defaultCount }}</p>
      </article>
    </div>

    <div class="equipment-page-layout">
      <aside class="settings-panel settings-card equipment-service-sidebar">
        <div class="mb-5">
          <p class="dashboard-micro-label text-secondary">Service Timeline</p>
          <h3 class="mt-2 font-headline text-xl font-bold text-primary">Next Equipment Due</h3>
        </div>
        <div v-if="serviceTimeline.length" class="equipment-service-timeline">
          <article
            v-for="item in serviceTimeline"
            :key="'service-timeline-' + item.id"
            class="equipment-service-timeline-item"
            :class="
              item.service_status === 'overdue' || defaultMissingServiceData(item)
                ? 'is-urgent'
                : item.service_status === 'due_soon'
                  ? 'is-soon'
                  : ''
            "
          >
            <span class="equipment-service-timeline-dot"></span>
            <div class="min-w-0">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.category || "Equipment" }}</p>
              <h4 class="mt-1 truncate font-headline text-base font-bold text-on-surface">{{ item.name || "Unnamed Equipment" }}</h4>
              <p v-if="item.service_tag" class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.14em] text-tertiary">
                {{ item.service_tag }}
              </p>
              <p class="mt-1 text-sm text-on-surface-variant">{{ timelineMeta(item) }}</p>
            </div>
          </article>
        </div>
        <div v-else class="settings-empty-state">
          <p class="font-headline text-base font-bold">No service timeline</p>
          <p class="mt-2 text-sm text-secondary">Add equipment and service data to build the timeline.</p>
        </div>
      </aside>

      <section class="min-w-0">
        <div v-if="!drafts.length" class="settings-empty-state">
          <p class="font-headline text-lg font-bold">No equipment registered</p>
          <p class="mt-2 text-sm text-secondary">
            Add your first item, set its service interval and latest service date, then mark it as default if it should be applied to new
            imports.
          </p>
        </div>

        <div v-else class="equipment-items-grid">
          <article
            v-for="item in visibleDrafts"
            :key="item.id"
            class="settings-item-card equipment-item-card"
            :class="defaultMissingServiceData(item) ? 'settings-item-card-error' : ''"
          >
            <div class="equipment-item-card-header">
              <div class="min-w-0">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">
                  {{ item.category || "Uncategorized" }}
                </p>
                <h4 class="mt-2 font-headline text-2xl font-bold leading-tight">{{ item.name || "Unnamed Equipment" }}</h4>
                <div class="settings-chip-row mt-3">
                  <span v-if="item.is_default" class="settings-chip is-accent">Default</span>
                  <span v-if="item.service_tag" class="settings-chip is-accent">{{ item.service_tag }}</span>
                  <span v-if="item.track_service === false" class="settings-chip">Not tracked</span>
                </div>
              </div>
              <div class="equipment-item-actions">
                <UButton v-if="!editing" @click="beginEditItem(item.id)" class="settings-button settings-button-secondary">Edit</UButton>
              </div>
            </div>
            <div v-if="item.track_service !== false" class="equipment-service-countdown">
              <div
                class="equipment-service-countdown-ring"
                :style="countdownDonutStyle(item)"
                :class="
                  item.service_status === 'overdue' || defaultMissingServiceData(item)
                    ? 'is-urgent'
                    : item.service_status === 'due_soon'
                      ? 'is-soon'
                      : ''
                "
              >
                <svg class="equipment-service-countdown-svg" viewBox="0 0 100 100" aria-hidden="true">
                  <circle class="equipment-service-countdown-track is-time" cx="50" cy="50" r="45" pathLength="100"></circle>
                  <circle class="equipment-service-countdown-progress is-time" cx="50" cy="50" r="45" pathLength="100"></circle>
                  <circle class="equipment-service-countdown-track is-dives" cx="50" cy="50" r="31" pathLength="100"></circle>
                  <circle class="equipment-service-countdown-progress is-dives" cx="50" cy="50" r="31" pathLength="100"></circle>
                </svg>
                <div class="equipment-service-countdown-center">
                  <strong>{{
                    item.dives_remaining_before_service !== null && item.dives_remaining_before_service !== undefined
                      ? item.dives_remaining_before_service
                      : "--"
                  }}</strong>
                  <span>Dives</span>
                </div>
              </div>
              <div class="equipment-service-countdown-copy">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Service Countdown</p>
                <p class="equipment-service-countdown-layer is-time">
                  <span></span><strong>{{ serviceCountdownLabel(item) }}</strong>
                </p>
                <p class="equipment-service-countdown-layer is-dives"><span></span>{{ serviceCountdownDivesLabel(item) }}</p>
                <p class="text-xs leading-5 text-on-surface-variant">{{ serviceCountdownLastServiceLabel(item) }}</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div
      v-if="editing && editingItem"
      class="fixed inset-0 z-[560] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm"
      @click.self="cancelEdit"
    >
      <section class="settings-modal-card equipment-edit-modal">
        <div class="settings-modal-header">
          <div>
            <p class="dashboard-micro-label text-secondary">Equipment</p>
            <h3 class="mt-2 font-headline text-2xl font-bold text-primary">{{ editingItem.name || "New Equipment" }}</h3>
          </div>
          <UButton type="button" @click="cancelEdit" :disabled="saving" class="settings-button settings-button-ghost">Close</UButton>
        </div>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</span>
            <UInput
              :value="editingItem.name"
              @input="updateItem(editingItem.id, 'name', $event.target.value)"
              class="settings-input"
              placeholder="Equipment name"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Category</span>
            <UInput
              :value="editingItem.category"
              @input="updateItem(editingItem.id, 'category', $event.target.value)"
              class="settings-input"
              placeholder="Regulator"
            />
          </label>
          <fieldset class="space-y-3 md:col-span-2">
            <legend class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Icon</legend>
            <div class="grid grid-cols-4 gap-2 md:grid-cols-6">
              <UButton
                v-for="option in equipmentIconOptions"
                :key="'equipment-icon-' + option.icon"
                type="button"
                @click="updateItem(editingItem.id, 'icon', option.icon)"
                class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
                :class="
                  editingItem.icon === option.icon
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-primary/10 bg-background/20 text-on-surface-variant hover:border-primary/30 hover:text-primary'
                "
                :aria-pressed="editingItem.icon === option.icon"
                :title="option.label"
              >
                <span class="material-symbols-outlined text-xl">{{ option.icon }}</span>
                <span class="truncate text-xs font-bold">{{ option.label }}</span>
              </UButton>
            </div>
          </fieldset>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Year Bought</span>
            <UInput
              :value="editingItem.year_bought"
              @input="updateItem(editingItem.id, 'year_bought', $event.target.value)"
              class="settings-input"
              placeholder="2024"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Vendor</span>
            <UInput
              :value="editingItem.vendor"
              @input="updateItem(editingItem.id, 'vendor', $event.target.value)"
              class="settings-input"
              placeholder="Dive Shop"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Brand</span>
            <UInput
              :value="editingItem.brand"
              @input="updateItem(editingItem.id, 'brand', $event.target.value)"
              class="settings-input"
              placeholder="Aqualung"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Model</span>
            <UInput
              :value="editingItem.model"
              @input="updateItem(editingItem.id, 'model', $event.target.value)"
              class="settings-input"
              placeholder="MK25"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Serial</span>
            <UInput
              :value="editingItem.serial"
              @input="updateItem(editingItem.id, 'serial', $event.target.value)"
              class="settings-input"
              placeholder="Serial number"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Warranty</span>
            <UInput
              :value="editingItem.warranty"
              @input="updateItem(editingItem.id, 'warranty', $event.target.value)"
              class="settings-input"
              placeholder="2 years, shop receipt, serial number..."
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Max Dives Before Service</span>
            <UInput
              :value="editingItem.max_dives_before_service"
              @input="updateItem(editingItem.id, 'max_dives_before_service', $event.target.value)"
              class="settings-input"
              placeholder="100"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Tag</span>
            <UInput
              :value="editingItem.service_tag"
              @input="updateItem(editingItem.id, 'service_tag', $event.target.value)"
              class="settings-input"
              placeholder="Primary regulator, travel kit..."
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Interval Months</span>
            <UInput
              :value="editingItem.service_interval_months"
              @input="updateItem(editingItem.id, 'service_interval_months', $event.target.value)"
              type="number"
              min="1"
              class="settings-input"
            />
          </label>
          <label class="space-y-2">
            <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latest Service Date</span>
            <UInput
              :value="editingItem.last_service_date"
              @input="updateItem(editingItem.id, 'last_service_date', $event.target.value)"
              class="settings-input"
              placeholder="YYYY-MM-DD"
            />
          </label>
          <label class="flex items-start gap-3 rounded-xl border border-primary/10 bg-background/20 p-4 md:col-span-2">
            <UCheckbox
              :model-value="editingItem.track_service !== false"
              @update:model-value="updateItem(editingItem.id, 'track_service', $event)"
              class="mt-1"
              :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30' }"
            />
            <span>
              <span class="block text-sm font-semibold">Track next service</span>
              <span class="mt-1 block text-xs leading-5 text-secondary"
                >Show this item in the service timeline and calculate due dates or dives remaining.</span
              >
            </span>
          </label>
          <label class="flex items-start gap-3 rounded-xl border border-primary/10 bg-background/20 p-4 md:col-span-2">
            <UCheckbox
              :model-value="editingItem.is_default"
              @update:model-value="updateItem(editingItem.id, 'is_default', $event)"
              class="mt-1"
              :ui="{ base: 'h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30' }"
            />
            <span>
              <span class="block text-sm font-semibold">Use by default on each dive</span>
              <span class="mt-1 block text-xs leading-5 text-secondary">Defaults are applied to new imported dives.</span>
            </span>
          </label>
        </div>

        <div class="settings-modal-actions">
          <UButton type="button" @click="removeAndSave(editingItem.id)" :disabled="saving" class="settings-button settings-button-danger"
            >Remove</UButton
          >
          <UButton type="button" @click="cancelEdit" :disabled="saving" class="settings-button settings-button-ghost">Cancel</UButton>
          <UButton type="button" @click="save" :disabled="saving" class="settings-button settings-button-primary">{{
            saving ? "Saving" : "Save Gear"
          }}</UButton>
        </div>
      </section>
    </div>
  </section>
</template>

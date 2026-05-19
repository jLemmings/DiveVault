function createEquipmentId() {
  return `equipment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyEquipment() {
  return {
    id: createEquipmentId(),
    name: "",
    category: "Regulator",
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

function serviceTone(status) {
  if (status === "serviced") return "text-primary";
  if (status === "due_soon") return "text-tertiary";
  return "text-on-error-container";
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
  props: ["equipment", "searchText", "saving", "servicingId", "statusMessage", "errorMessage", "saveEquipment", "markServiced"],
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
      return this.drafts.filter((item) => [item.name, item.category, item.brand, item.model, item.serial].join(" ").toLowerCase().includes(query));
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
          const divesRemaining = Number.isFinite(Number(item.dives_remaining_before_service)) ? Number(item.dives_remaining_before_service) : Number.POSITIVE_INFINITY;
          const statusRank = item.service_status === "overdue" || defaultMissingServiceData(item)
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
          if (left.timelineDivesRemaining !== right.timelineDivesRemaining) return left.timelineDivesRemaining - right.timelineDivesRemaining;
          return String(left.name || left.category || "").localeCompare(String(right.name || right.category || ""));
        })
        .slice(0, 6);
    }
  },
  methods: {
    serviceTone,
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
    removeItem(id) {
      this.drafts = this.drafts.filter((item) => item.id !== id);
    },
    async removeAndSave(id) {
      this.removeItem(id);
      await this.save();
    },
    updateItem(id, key, value) {
      this.drafts = this.drafts.map((item) => item.id === id ? { ...item, [key]: value } : item);
    },
    async save() {
      const saved = await this.saveEquipment(this.drafts.map(equipmentPayload));
      if (saved) {
        this.drafts = normalizeEquipment(this.drafts.map(equipmentPayload));
        this.editing = false;
        this.editingItemId = null;
      }
    },
    statusLabel(item) {
      if (defaultMissingServiceData(item)) return "Default gear service data missing";
      if (item.service_status === "serviced") return item.service_due_date ? `Serviced until ${item.service_due_date}` : "Serviced";
      if (item.service_status === "due_soon") return item.service_due_date ? `Due soon: ${item.service_due_date}` : "Due soon";
      if (item.service_status === "overdue") return item.service_due_date ? `Overdue since ${item.service_due_date}` : "Overdue";
      return "Service data missing";
    },
    timelineMeta(item) {
      if (defaultMissingServiceData(item)) return "Service interval missing";
      const details = [];
      if (item.timelineDueDate) details.push(item.service_status === "overdue" ? `Overdue since ${item.timelineDueDate}` : `Due ${item.timelineDueDate}`);
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
      const divesPercent = Number.isFinite(divesRemaining) && Number.isFinite(maxDives) && maxDives > 0
        ? clampPercent((Math.max(divesRemaining, 0) / maxDives) * 100)
        : 0;
      return {
        "--days-progress": `${daysPercent}%`,
        "--dives-progress": `${divesPercent}%`
      };
    }
  },
  template: `
    <section class="dashboard-command-center text-on-surface">
      <div class="flex flex-wrap justify-end gap-3">
        <button @click="addItem" class="settings-button settings-button-ghost">Add Equipment</button>
      </div>

      <div v-if="statusMessage" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ statusMessage }}</div>
      <div v-if="errorMessage" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">{{ errorMessage }}</div>

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
              :class="item.service_status === 'overdue' || defaultMissingServiceData(item) ? 'is-urgent' : (item.service_status === 'due_soon' ? 'is-soon' : '')"
            >
              <span class="equipment-service-timeline-dot"></span>
              <div class="min-w-0">
                <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">{{ item.category || 'Equipment' }}</p>
                <h4 class="mt-1 truncate font-headline text-base font-bold text-on-surface">{{ item.name || 'Unnamed Equipment' }}</h4>
                <p v-if="item.service_tag" class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.14em] text-tertiary">{{ item.service_tag }}</p>
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
            <p class="mt-2 text-sm text-secondary">Add your first item, set its service interval and latest service date, then mark it as default if it should be applied to new imports.</p>
          </div>

          <div v-else class="equipment-items-grid">
          <article v-for="item in visibleDrafts" :key="item.id" class="settings-item-card equipment-item-card" :class="defaultMissingServiceData(item) ? 'settings-item-card-error' : ''">
          <div class="equipment-item-card-header">
            <div class="min-w-0">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ item.category || 'Uncategorized' }}</p>
              <h4 class="mt-2 font-headline text-2xl font-bold leading-tight">{{ item.name || 'Unnamed Equipment' }}</h4>
              <div class="settings-chip-row mt-3">
                <span v-if="item.is_default" class="settings-chip is-accent">Default</span>
                <span v-if="item.service_tag" class="settings-chip is-accent">{{ item.service_tag }}</span>
                <span v-if="item.track_service === false" class="settings-chip">Not tracked</span>
                <span class="settings-chip" :class="defaultMissingServiceData(item) ? 'settings-chip-error' : serviceTone(item.service_status)">{{ statusLabel(item) }}</span>
                <span v-if="item.dives_remaining_before_service !== null && item.dives_remaining_before_service !== undefined" class="settings-chip">{{ item.dives_remaining_before_service }} dives remaining</span>
              </div>
              <div v-if="item.track_service !== false" class="equipment-service-countdown">
                <div class="equipment-service-countdown-ring" :style="countdownDonutStyle(item)" :class="item.service_status === 'overdue' || defaultMissingServiceData(item) ? 'is-urgent' : (item.service_status === 'due_soon' ? 'is-soon' : '')">
                  <strong>{{ item.dives_remaining_before_service !== null && item.dives_remaining_before_service !== undefined ? item.dives_remaining_before_service : '--' }}</strong>
                  <span>Dives</span>
                </div>
                <div class="min-w-0">
                  <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Service Countdown</p>
                  <p class="font-headline font-bold text-on-surface">{{ serviceCountdownLabel(item) }}</p>
                  <p class="mt-1 text-xs leading-5 text-on-surface-variant">{{ serviceCountdownDivesLabel(item) }}</p>
                  <p class="text-xs leading-5 text-on-surface-variant">{{ serviceCountdownLastServiceLabel(item) }}</p>
                </div>
              </div>
            </div>
            <div class="equipment-item-actions">
              <button v-if="!editing" @click="beginEditItem(item.id)" class="settings-button settings-button-secondary">Edit</button>
              <button v-if="!editing" @click="markServiced(item.id)" :disabled="servicingId === String(item.id)" class="settings-button settings-button-secondary">
                {{ servicingId === String(item.id) ? 'Updating' : 'Mark Serviced' }}
              </button>
            </div>
          </div>
          </article>
          </div>
        </section>
      </div>

      <div v-if="editing && editingItem" class="fixed inset-0 z-[560] flex items-center justify-center bg-background/88 px-6 py-8 backdrop-blur-sm" @click.self="cancelEdit">
        <section class="settings-modal-card equipment-edit-modal">
          <div class="settings-modal-header">
            <div>
              <p class="dashboard-micro-label text-secondary">Equipment</p>
              <h3 class="mt-2 font-headline text-2xl font-bold text-primary">{{ editingItem.name || 'New Equipment' }}</h3>
            </div>
            <button type="button" @click="cancelEdit" :disabled="saving" class="settings-button settings-button-ghost">Close</button>
          </div>

          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</span>
              <input :value="editingItem.name" @input="updateItem(editingItem.id, 'name', $event.target.value)" class="settings-input" placeholder="Equipment name" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Category</span>
              <input :value="editingItem.category" @input="updateItem(editingItem.id, 'category', $event.target.value)" class="settings-input" placeholder="Regulator" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Year Bought</span>
              <input :value="editingItem.year_bought" @input="updateItem(editingItem.id, 'year_bought', $event.target.value)" class="settings-input" placeholder="2024" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Vendor</span>
              <input :value="editingItem.vendor" @input="updateItem(editingItem.id, 'vendor', $event.target.value)" class="settings-input" placeholder="Dive Shop" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Brand</span>
              <input :value="editingItem.brand" @input="updateItem(editingItem.id, 'brand', $event.target.value)" class="settings-input" placeholder="Aqualung" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Model</span>
              <input :value="editingItem.model" @input="updateItem(editingItem.id, 'model', $event.target.value)" class="settings-input" placeholder="MK25" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Serial</span>
              <input :value="editingItem.serial" @input="updateItem(editingItem.id, 'serial', $event.target.value)" class="settings-input" placeholder="Serial number" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Warranty</span>
              <input :value="editingItem.warranty" @input="updateItem(editingItem.id, 'warranty', $event.target.value)" class="settings-input" placeholder="2 years, shop receipt, serial number..." />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Next Service Due</span>
              <input :value="editingItem.next_service_due" @input="updateItem(editingItem.id, 'next_service_due', $event.target.value)" type="date" class="settings-input" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Max Dives Before Service</span>
              <input :value="editingItem.max_dives_before_service" @input="updateItem(editingItem.id, 'max_dives_before_service', $event.target.value)" class="settings-input" placeholder="100" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Tag</span>
              <input :value="editingItem.service_tag" @input="updateItem(editingItem.id, 'service_tag', $event.target.value)" class="settings-input" placeholder="Primary regulator, travel kit..." />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Interval Months</span>
              <input :value="editingItem.service_interval_months" @input="updateItem(editingItem.id, 'service_interval_months', $event.target.value)" type="number" min="1" class="settings-input" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latest Service Date</span>
              <input :value="editingItem.last_service_date" @input="updateItem(editingItem.id, 'last_service_date', $event.target.value)" class="settings-input" placeholder="YYYY-MM-DD" />
            </label>
            <label class="flex items-start gap-3 rounded-xl border border-primary/10 bg-background/20 p-4 md:col-span-2">
              <input :checked="editingItem.track_service !== false" @change="updateItem(editingItem.id, 'track_service', $event.target.checked)" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
              <span>
                <span class="block text-sm font-semibold">Track next service</span>
                <span class="mt-1 block text-xs leading-5 text-secondary">Show this item in the service timeline and calculate due dates or dives remaining.</span>
              </span>
            </label>
            <label class="flex items-start gap-3 rounded-xl border border-primary/10 bg-background/20 p-4 md:col-span-2">
              <input :checked="editingItem.is_default" @change="updateItem(editingItem.id, 'is_default', $event.target.checked)" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
              <span>
                <span class="block text-sm font-semibold">Use by default on each dive</span>
                <span class="mt-1 block text-xs leading-5 text-secondary">Defaults are applied to new imported dives.</span>
              </span>
            </label>
          </div>

          <div class="settings-modal-actions">
            <button type="button" @click="removeAndSave(editingItem.id)" :disabled="saving" class="settings-button settings-button-danger">Remove</button>
            <button type="button" @click="cancelEdit" :disabled="saving" class="settings-button settings-button-ghost">Cancel</button>
            <button type="button" @click="save" :disabled="saving" class="settings-button settings-button-primary">{{ saving ? 'Saving' : 'Save Gear' }}</button>
          </div>
        </section>
      </div>
    </section>
  `
};

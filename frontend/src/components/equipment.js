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
    is_default: Boolean(item.is_default)
  };
}

function serviceTone(status) {
  if (status === "serviced") return "text-primary";
  if (status === "due_soon") return "text-tertiary";
  return "text-on-error-container";
}

export default {
  name: "EquipmentView",
  props: ["equipment", "searchText", "saving", "servicingId", "statusMessage", "errorMessage", "saveEquipment", "markServiced"],
  data() {
    return {
      drafts: normalizeEquipment(this.equipment),
      editing: false
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
    }
  },
  methods: {
    serviceTone,
    beginEdit() {
      this.drafts = normalizeEquipment(this.equipment);
      this.editing = true;
    },
    cancelEdit() {
      this.drafts = normalizeEquipment(this.equipment);
      this.editing = false;
    },
    addItem() {
      if (!this.editing) this.beginEdit();
      this.drafts = [emptyEquipment(), ...this.drafts];
    },
    removeItem(id) {
      this.drafts = this.drafts.filter((item) => item.id !== id);
    },
    updateItem(id, key, value) {
      this.drafts = this.drafts.map((item) => item.id === id ? { ...item, [key]: value } : item);
    },
    async save() {
      const saved = await this.saveEquipment(this.drafts.map(equipmentPayload));
      if (saved) {
        this.drafts = normalizeEquipment(this.drafts.map(equipmentPayload));
        this.editing = false;
      }
    },
    statusLabel(item) {
      if (item.service_status === "serviced") return item.service_due_date ? `Serviced until ${item.service_due_date}` : "Serviced";
      if (item.service_status === "due_soon") return item.service_due_date ? `Due soon: ${item.service_due_date}` : "Due soon";
      if (item.service_status === "overdue") return item.service_due_date ? `Overdue since ${item.service_due_date}` : "Overdue";
      return "Service data missing";
    }
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <header class="flex flex-col justify-between gap-5 bg-surface-container-low p-6 shadow-panel lg:flex-row lg:items-end">
        <div>
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Gear Locker</p>
          <h3 class="mt-2 font-headline text-4xl font-bold tracking-tight">Equipment Management</h3>
          <p class="mt-3 max-w-3xl text-sm leading-7 text-secondary">Maintain reusable dive gear, mark normal defaults, and keep service intervals current before gear is used on committed dives.</p>
        </div>
        <div class="flex flex-wrap gap-3">
          <button @click="addItem" class="settings-button settings-button-secondary">Add Equipment</button>
          <button type="button" class="settings-button settings-button-ghost">Service Schedule</button>
          <button v-if="!editing" @click="beginEdit" class="settings-button settings-button-primary">Edit Inventory</button>
          <button v-if="editing" @click="cancelEdit" :disabled="saving" class="settings-button settings-button-ghost">Cancel</button>
          <button v-if="editing" @click="save" :disabled="saving" class="settings-button settings-button-primary">{{ saving ? 'Saving' : 'Save Gear' }}</button>
        </div>
      </header>

      <div v-if="statusMessage" class="settings-feedback border-primary/20 bg-primary/10 text-primary shadow-panel">{{ statusMessage }}</div>
      <div v-if="errorMessage" class="settings-feedback border-error/20 bg-error-container/20 text-on-error-container shadow-panel">{{ errorMessage }}</div>

      <div class="grid gap-4 md:grid-cols-3">
        <div class="settings-stat-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Items</p>
          <p class="mt-3 font-headline text-3xl font-bold">{{ drafts.length }}</p>
        </div>
        <div class="settings-stat-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Defaults</p>
          <p class="mt-3 font-headline text-3xl font-bold text-primary">{{ defaultCount }}</p>
        </div>
        <div class="settings-stat-card">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Rule</p>
          <p class="mt-3 text-sm leading-6 text-on-surface">Service due by dive count and commit checks use each dive date.</p>
        </div>
      </div>

      <div v-if="!drafts.length" class="settings-empty-state">
        <p class="font-headline text-lg font-bold">No equipment registered</p>
        <p class="mt-2 text-sm text-secondary">Add your first item, set its service interval and latest service date, then mark it as default if it should be applied to new imports.</p>
      </div>

      <div v-else class="grid gap-4 xl:grid-cols-2">
        <article v-for="item in visibleDrafts" :key="item.id" class="settings-item-card">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">{{ item.category || 'Uncategorized' }}</p>
              <h4 class="mt-2 font-headline text-2xl font-bold">{{ item.name || 'Unnamed Equipment' }}</h4>
              <div class="settings-chip-row mt-3">
                <span class="settings-chip" :class="item.is_default ? 'is-accent' : ''">{{ item.is_default ? 'Default' : 'Optional' }}</span>
                <span class="settings-chip" :class="serviceTone(item.service_status)">{{ statusLabel(item) }}</span>
                <span v-if="item.dives_remaining_before_service !== null && item.dives_remaining_before_service !== undefined" class="settings-chip">{{ item.dives_remaining_before_service }} dives remaining</span>
              </div>
            </div>
            <button v-if="!editing" @click="markServiced(item.id)" :disabled="servicingId === String(item.id)" class="settings-button settings-button-secondary">
              {{ servicingId === String(item.id) ? 'Updating' : 'Mark Serviced' }}
            </button>
            <button v-else @click="removeItem(item.id)" class="settings-button settings-button-danger">Remove</button>
          </div>

          <div v-if="editing" class="mt-5 grid gap-4 md:grid-cols-2">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Name</span>
              <input :value="item.name" @input="updateItem(item.id, 'name', $event.target.value)" class="settings-input" placeholder="Equipment name" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Category</span>
              <input :value="item.category" @input="updateItem(item.id, 'category', $event.target.value)" class="settings-input" placeholder="Regulator" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Year Bought</span>
              <input :value="item.year_bought" @input="updateItem(item.id, 'year_bought', $event.target.value)" class="settings-input" placeholder="2024" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Vendor</span>
              <input :value="item.vendor" @input="updateItem(item.id, 'vendor', $event.target.value)" class="settings-input" placeholder="Dive Shop" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Brand</span>
              <input :value="item.brand" @input="updateItem(item.id, 'brand', $event.target.value)" class="settings-input" placeholder="Aqualung" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Model</span>
              <input :value="item.model" @input="updateItem(item.id, 'model', $event.target.value)" class="settings-input" placeholder="MK25" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Serial</span>
              <input :value="item.serial" @input="updateItem(item.id, 'serial', $event.target.value)" class="settings-input" placeholder="Serial number" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Warranty</span>
              <input :value="item.warranty" @input="updateItem(item.id, 'warranty', $event.target.value)" class="settings-input" placeholder="2 years, shop receipt, serial number..." />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Next Service Due</span>
              <input :value="item.next_service_due" @input="updateItem(item.id, 'next_service_due', $event.target.value)" type="date" class="settings-input" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Max Dives Before Service</span>
              <input :value="item.max_dives_before_service" @input="updateItem(item.id, 'max_dives_before_service', $event.target.value)" class="settings-input" placeholder="100" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Service Interval Months</span>
              <input :value="item.service_interval_months" @input="updateItem(item.id, 'service_interval_months', $event.target.value)" type="number" min="1" class="settings-input" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Latest Service Date</span>
              <input :value="item.last_service_date" @input="updateItem(item.id, 'last_service_date', $event.target.value)" class="settings-input" placeholder="YYYY-MM-DD" />
            </label>
            <label class="flex items-start gap-3 rounded-xl border border-primary/10 bg-background/20 p-4">
              <input :checked="item.is_default" @change="updateItem(item.id, 'is_default', $event.target.checked)" type="checkbox" class="mt-1 h-5 w-5 rounded border-primary/20 bg-surface-container-high text-primary focus:ring-primary/30" />
              <span>
                <span class="block text-sm font-semibold">Use by default on each dive</span>
                <span class="mt-1 block text-xs leading-5 text-secondary">Defaults are applied to new imported dives.</span>
              </span>
            </label>
          </div>
        </article>
      </div>
    </section>
  `
};

function createEquipmentId() {
  return `equipment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyEquipment() {
  return {
    id: createEquipmentId(),
    type: "",
    year_bought: "",
    vendor: "",
    brand: "",
    warranty: "",
    next_service_due: "",
    max_dives_before_service: "",
    is_standard: false,
    last_serviced_at: null,
    last_service_dive_count: 0
  };
}

function normalizeEquipmentItem(item = {}) {
  return {
    id: item?.id || createEquipmentId(),
    type: item?.type || "",
    year_bought: item?.year_bought ?? "",
    vendor: item?.vendor || "",
    brand: item?.brand || "",
    warranty: item?.warranty || "",
    next_service_due: item?.next_service_due || "",
    max_dives_before_service: item?.max_dives_before_service ?? "",
    is_standard: Boolean(item?.is_standard),
    last_serviced_at: item?.last_serviced_at || null,
    last_service_dive_count: item?.last_service_dive_count || 0,
    dives_since_service: item?.dives_since_service || 0,
    dives_remaining_before_service: item?.dives_remaining_before_service ?? null,
    service_due: Boolean(item?.service_due),
    service_due_reason: item?.service_due_reason || ""
  };
}

function cloneEquipment(equipment) {
  return Array.isArray(equipment) ? equipment.map(normalizeEquipmentItem) : [];
}

function dateLabel(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function equipmentName(item) {
  return [item.brand, item.vendor, item.type].filter(Boolean).join(" ") || "Unnamed Equipment";
}

export default {
  name: "EquipmentView",
  props: ["equipment", "searchText", "saving", "servicingId", "statusMessage", "errorMessage", "saveEquipment", "markServiced"],
  data() {
    return {
      activeTab: "inventory",
      draftEquipment: cloneEquipment(this.equipment)
    };
  },
  watch: {
    equipment: {
      handler(value) {
        this.draftEquipment = cloneEquipment(value);
      },
      deep: true
    }
  },
  computed: {
    filteredEquipment() {
      const query = typeof this.searchText === "string" ? this.searchText.trim().toLowerCase() : "";
      if (!query) return this.draftEquipment;
      return this.draftEquipment.filter((item) => [item.type, item.vendor, item.brand, item.warranty].join(" ").toLowerCase().includes(query));
    },
    standardEquipment() {
      return this.draftEquipment.filter((item) => item.is_standard);
    },
    serviceSchedule() {
      return this.draftEquipment
        .slice()
        .sort((left, right) => {
          if (left.service_due !== right.service_due) return left.service_due ? -1 : 1;
          const leftDate = left.next_service_due ? new Date(left.next_service_due).getTime() : Number.POSITIVE_INFINITY;
          const rightDate = right.next_service_due ? new Date(right.next_service_due).getTime() : Number.POSITIVE_INFINITY;
          if (leftDate !== rightDate) return leftDate - rightDate;
          return equipmentName(left).localeCompare(equipmentName(right));
        });
    },
    dueCount() {
      return this.draftEquipment.filter((item) => item.service_due).length;
    }
  },
  methods: {
    equipmentName,
    dateLabel,
    addEquipment() {
      this.draftEquipment = [emptyEquipment(), ...this.draftEquipment];
    },
    removeEquipment(equipmentId) {
      this.draftEquipment = this.draftEquipment.filter((item) => String(item.id) !== String(equipmentId));
    },
    payloadItem(item) {
      return {
        id: item.id,
        type: String(item.type || "").trim(),
        year_bought: item.year_bought === "" ? null : Number.parseInt(item.year_bought, 10),
        vendor: String(item.vendor || "").trim(),
        brand: String(item.brand || "").trim(),
        warranty: String(item.warranty || "").trim(),
        next_service_due: String(item.next_service_due || "").trim(),
        max_dives_before_service: item.max_dives_before_service === "" ? null : Number.parseInt(item.max_dives_before_service, 10),
        is_standard: Boolean(item.is_standard),
        last_serviced_at: item.last_serviced_at || null,
        last_service_dive_count: item.last_service_dive_count || 0
      };
    },
    async persistEquipment() {
      await this.saveEquipment(this.draftEquipment.map(this.payloadItem));
    },
    async serviceItem(item) {
      await this.markServiced(item.id);
    },
    serviceStatusLabel(item) {
      if (item.service_due) {
        return item.service_due_reason === "dives" ? "Service due by dive count" : "Service due by date";
      }
      if (item.max_dives_before_service) {
        return `${item.dives_remaining_before_service ?? item.max_dives_before_service} dives remaining`;
      }
      return "No dive-count interval";
    }
  },
  template: `
    <section class="space-y-8 text-on-surface">
      <div class="relative overflow-hidden rounded-[2rem] border border-primary/10 bg-surface-container-low p-6 shadow-panel md:p-8">
        <div class="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-tertiary/10 blur-3xl"></div>
        <div class="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div>
            <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Gear Locker</p>
            <h3 class="mt-3 font-headline text-4xl font-bold tracking-tight text-on-surface">Equipment Management</h3>
            <p class="mt-4 max-w-2xl text-base leading-7 text-secondary">
              Register optional equipment details, choose the standard kit used on every dive, and track date or dive-count service windows.
            </p>
          </div>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="rounded-3xl bg-background/25 p-4">
              <p class="font-headline text-3xl font-bold text-primary">{{ draftEquipment.length }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.16em] text-secondary">Items</p>
            </div>
            <div class="rounded-3xl bg-background/25 p-4">
              <p class="font-headline text-3xl font-bold text-primary">{{ standardEquipment.length }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.16em] text-secondary">Standard</p>
            </div>
            <div class="rounded-3xl bg-background/25 p-4">
              <p class="font-headline text-3xl font-bold" :class="dueCount ? 'text-error' : 'text-primary'">{{ dueCount }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.16em] text-secondary">Due</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex rounded-2xl border border-primary/10 bg-surface-container-low p-1">
          <button @click="activeTab = 'inventory'" class="rounded-xl px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] transition-colors" :class="activeTab === 'inventory' ? 'bg-primary text-on-primary' : 'text-primary hover:bg-surface-container-high'">Inventory</button>
          <button @click="activeTab = 'service'" class="rounded-xl px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.16em] transition-colors" :class="activeTab === 'service' ? 'bg-primary text-on-primary' : 'text-primary hover:bg-surface-container-high'">Service Schedule</button>
        </div>
        <div class="flex flex-wrap gap-3">
          <button @click="addEquipment" class="inline-flex items-center gap-2 rounded-2xl bg-surface-container-high px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-highest">
            <span class="material-symbols-outlined text-sm">add</span>
            Add Equipment
          </button>
          <button @click="persistEquipment" :disabled="saving" class="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
            <span class="material-symbols-outlined text-sm">save</span>
            {{ saving ? 'Saving' : 'Save Gear' }}
          </button>
        </div>
      </div>

      <p v-if="statusMessage" class="rounded-2xl border border-primary/10 bg-primary/10 px-4 py-3 text-sm text-primary">{{ statusMessage }}</p>
      <p v-if="errorMessage" class="rounded-2xl border border-error/20 bg-error-container/20 px-4 py-3 text-sm text-error">{{ errorMessage }}</p>

      <div v-if="activeTab === 'inventory'" class="space-y-5">
        <div v-if="!draftEquipment.length" class="rounded-[2rem] border border-primary/10 bg-surface-container-low p-8 text-center shadow-panel">
          <p class="font-headline text-2xl font-bold text-on-surface">No equipment registered yet</p>
          <p class="mt-2 text-sm text-secondary">Add your first regulator, BCD, computer, suit, tank, or accessory.</p>
        </div>

        <article v-for="item in filteredEquipment" :key="item.id" class="rounded-[2rem] border border-primary/10 bg-surface-container-low p-5 shadow-panel">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em]" :class="item.service_due ? 'text-error' : 'text-primary'">{{ item.service_due ? 'Service Due' : 'Registered Gear' }}</p>
              <h4 class="mt-2 font-headline text-2xl font-bold text-on-surface">{{ equipmentName(item) }}</h4>
              <p class="mt-1 text-sm text-secondary">{{ item.is_standard ? 'Standard equipment for every dive' : 'Not part of the standard kit' }}</p>
            </div>
            <button @click="removeEquipment(item.id)" class="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/10 text-secondary transition-colors hover:bg-error-container/20 hover:text-error" aria-label="Remove equipment">
              <span class="material-symbols-outlined text-lg">delete</span>
            </button>
          </div>

          <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Type</span>
              <input v-model="item.type" placeholder="Regulator" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Year Bought</span>
              <input v-model="item.year_bought" type="number" min="1900" placeholder="2024" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Vendor</span>
              <input v-model="item.vendor" placeholder="Dive Shop" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Brand</span>
              <input v-model="item.brand" placeholder="Aqualung" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
          </div>

          <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-2 xl:col-span-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Warranty</span>
              <input v-model="item.warranty" placeholder="2 years, shop receipt, serial number..." class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Next Service Due</span>
              <input v-model="item.next_service_due" type="date" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
            <label class="space-y-2">
              <span class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Max Dives Before Service</span>
              <input v-model="item.max_dives_before_service" type="number" min="1" placeholder="100" class="w-full rounded-2xl border border-primary/15 bg-background/20 px-4 py-3 text-sm outline-none focus:border-primary/40" />
            </label>
          </div>

          <div class="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-background/20 p-4">
            <label class="inline-flex items-center gap-3 text-sm text-secondary">
              <input v-model="item.is_standard" type="checkbox" class="h-5 w-5 accent-primary" />
              Use by default on each dive
            </label>
            <button @click="serviceItem(item)" :disabled="servicingId === String(item.id)" class="inline-flex items-center gap-2 rounded-2xl border border-primary/15 px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high disabled:cursor-wait disabled:opacity-70">
              <span class="material-symbols-outlined text-sm">build_circle</span>
              {{ servicingId === String(item.id) ? 'Updating' : 'Mark Serviced' }}
            </button>
          </div>
        </article>
      </div>

      <div v-else class="grid gap-5 lg:grid-cols-2">
        <article v-for="item in serviceSchedule" :key="'service-' + item.id" class="rounded-[2rem] border p-5 shadow-panel" :class="item.service_due ? 'border-error/30 bg-error-container/15' : 'border-primary/10 bg-surface-container-low'">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em]" :class="item.service_due ? 'text-error' : 'text-primary'">{{ serviceStatusLabel(item) }}</p>
              <h4 class="mt-2 font-headline text-2xl font-bold text-on-surface">{{ equipmentName(item) }}</h4>
              <p class="mt-1 text-sm text-secondary">Next date: {{ dateLabel(item.next_service_due) }}</p>
            </div>
            <span class="material-symbols-outlined text-3xl" :class="item.service_due ? 'text-error' : 'text-primary'">{{ item.service_due ? 'warning' : 'verified' }}</span>
          </div>
          <div class="mt-5 grid grid-cols-3 gap-3 text-center">
            <div class="rounded-2xl bg-background/20 p-3">
              <p class="font-headline text-xl font-bold text-on-surface">{{ item.is_standard ? item.dives_since_service : 0 }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.14em] text-secondary">Dives Since</p>
            </div>
            <div class="rounded-2xl bg-background/20 p-3">
              <p class="font-headline text-xl font-bold text-on-surface">{{ item.max_dives_before_service || '--' }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.14em] text-secondary">Max Dives</p>
            </div>
            <div class="rounded-2xl bg-background/20 p-3">
              <p class="font-headline text-xl font-bold text-on-surface">{{ item.last_serviced_at ? dateLabel(item.last_serviced_at) : 'Never' }}</p>
              <p class="mt-1 font-label text-[9px] font-bold uppercase tracking-[0.14em] text-secondary">Serviced</p>
            </div>
          </div>
          <button @click="serviceItem(item)" :disabled="servicingId === String(item.id)" class="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 font-label text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
            <span class="material-symbols-outlined text-sm">build_circle</span>
            Mark Serviced
          </button>
        </article>
      </div>
    </section>
  `
};

export default {
  name: "EquipmentView",
  props: ["searchText"],
  data() {
    return {
      equipmentFilter: "All",
      equipmentFilters: ["All", "Life Support", "Computers", "Exposure"],
      serviceFocus: "Scubapro MK25 EVO",
      equipment: [
        { name: "Scubapro MK25 EVO/A700", serial: "7041289945", lastService: "Jan 12, 2023", metaLabel: "Depth Rating", metaValue: "300m / 1000ft", status: "Ready", category: "Life Support", icon: "air" },
        { name: "Shearwater Teric", serial: "TER-9902-A", lastService: "May 05, 2022", metaLabel: "Battery", metaValue: "Service Req.", status: "Service Soon", category: "Computers", icon: "watch" },
        { name: "Mares Dragon SLS", serial: "BC-440211", lastService: "Aug 18, 2023", metaLabel: "Lift", metaValue: "19kg / 42lbs", status: "Ready", category: "Life Support", icon: "scuba_diving" },
        { name: "Fourth Element Argosy", serial: "DRY-FE-001", lastService: "Sep 30, 2023", metaLabel: "Issue", metaValue: "Neck Seal", status: "Repairing", category: "Exposure", icon: "checkroom" }
      ],
      serviceRecords: [
        { month: "Jan", day: "12", year: "2023", title: "Annual Overhaul", description: "Full kit replacement, O-rings, high-pressure seat.", type: "Official Service", typeClass: "bg-secondary-container text-on-secondary-container", cost: "$185.00" },
        { month: "Jul", day: "04", year: "2022", title: "Visual Inspection", description: "Post-expedition rinse and functional pressure test.", type: "User Check", typeClass: "bg-surface-container-highest text-on-surface-variant", cost: "$0.00" },
        { month: "Jan", day: "20", year: "2022", title: "Initial Calibration", description: "Out-of-box adjustment and nitrox cleaning.", type: "Official Service", typeClass: "bg-secondary-container text-on-secondary-container", cost: "$45.00" }
      ]
    };
  },
  computed: {
    filteredEquipment() {
      const search = (this.searchText || "").toLowerCase();
      return this.equipment.filter((item) => {
        const matchesFilter = this.equipmentFilter === "All" || item.category === this.equipmentFilter;
        const matchesSearch = !search || `${item.name} ${item.serial} ${item.metaValue}`.toLowerCase().includes(search);
        return matchesFilter && matchesSearch;
      });
    },
    nextMaintenanceItem() {
      return "Scubapro MK25 Regulator";
    },
    nextMaintenanceDate() {
      return "Oct 24, 2023";
    }
  },
  methods: {
    statusClass(status) {
      if (status === "Ready") return "bg-primary/10 text-primary";
      if (status === "Service Soon") return "bg-tertiary/10 text-tertiary";
      return "bg-error-container text-on-error-container";
    }
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <section class="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div class="relative overflow-hidden bg-surface-container-low p-6 md:col-span-2">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Asset Totals</p>
          <div class="mt-4 flex items-baseline gap-2">
            <h3 class="font-headline text-5xl font-bold">{{ equipment.length }}</h3>
            <span class="font-label text-sm uppercase tracking-[0.16em] text-secondary">Active Units</span>
          </div>
          <div class="mt-6 grid grid-cols-3 gap-2">
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Regulators</p><p class="mt-1 font-headline text-lg font-bold text-primary">06</p></div>
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Cylinders</p><p class="mt-1 font-headline text-lg font-bold text-primary">14</p></div>
            <div class="bg-surface-container-high p-3"><p class="font-label text-[9px] uppercase text-secondary">Computers</p><p class="mt-1 font-headline text-lg font-bold text-primary">04</p></div>
          </div>
        </div>
        <div class="border-l-2 border-tertiary bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Next Maintenance</p>
          <h3 class="mt-4 font-headline text-3xl font-bold">{{ nextMaintenanceDate }}</h3>
          <p class="mt-1 text-sm text-secondary">{{ nextMaintenanceItem }}</p>
          <div class="mt-8 h-1 overflow-hidden bg-surface-container-highest"><div class="h-full w-4/5 bg-tertiary"></div></div>
        </div>
      </section>
      <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div class="flex-1">
          <div class="mb-6 flex items-end justify-between gap-4">
            <div>
              <h4 class="font-headline text-2xl font-bold tracking-tight">ASSET REGISTRY</h4>
              <p class="font-label text-[10px] uppercase tracking-[0.24em] text-secondary/70">Deep-Sea Operational Hardware</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button v-for="filter in equipmentFilters" :key="filter" @click="equipmentFilter = filter" class="px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] transition-colors" :class="equipmentFilter === filter ? 'bg-surface-container-high text-primary' : 'bg-surface-container-low text-on-surface-variant hover:text-primary'">{{ filter }}</button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <article v-for="item in filteredEquipment" :key="item.name" class="group relative bg-surface-container-low p-5 transition-colors hover:bg-surface-container-high">
              <div class="flex gap-4">
                <div class="flex h-24 w-24 items-center justify-center overflow-hidden rounded bg-surface-container-highest">
                  <span class="material-symbols-outlined text-5xl text-secondary/60 transition-colors group-hover:text-primary">{{ item.icon }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h5 class="font-headline text-lg font-bold leading-tight">{{ item.name }}</h5>
                      <p class="mt-1 font-label text-[10px] uppercase tracking-[0.2em] text-secondary">SN: {{ item.serial }}</p>
                    </div>
                    <span class="px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-[0.18em]" :class="statusClass(item.status)">{{ item.status }}</span>
                  </div>
                  <div class="mt-4 grid grid-cols-3 gap-4 border-t border-outline-variant/10 pt-3">
                    <div><p class="font-label text-[8px] uppercase text-secondary">Last Service</p><p class="mt-1 text-[11px] font-headline">{{ item.lastService }}</p></div>
                    <div><p class="font-label text-[8px] uppercase text-secondary">{{ item.metaLabel }}</p><p class="mt-1 text-[11px] font-headline">{{ item.metaValue }}</p></div>
                    <div><p class="font-label text-[8px] uppercase text-secondary">Category</p><p class="mt-1 text-[11px] font-headline">{{ item.category }}</p></div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
        <aside class="w-full bg-surface-container-low p-6 lg:w-80">
          <h4 class="font-headline text-lg font-bold uppercase tracking-tight">Service History</h4>
          <div class="relative mt-6 space-y-6 before:absolute before:bottom-0 before:left-[11px] before:top-2 before:w-px before:bg-outline-variant/30 before:content-['']">
            <article v-for="record in serviceRecords" :key="record.title + record.month + record.day + record.year" class="relative pl-8">
              <span class="absolute left-0 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-highest text-secondary"><span class="material-symbols-outlined text-[14px]">build</span></span>
              <div>
                <p class="font-label text-[10px] font-bold uppercase text-primary">{{ record.day }} {{ record.month }} {{ record.year }}</p>
                <h5 class="mt-1 font-headline text-xs font-bold uppercase">{{ record.title }}</h5>
                <p class="mt-1 text-[11px] leading-relaxed text-secondary/70">{{ record.description }}</p>
                <p class="mt-2 text-[11px] font-bold">{{ record.cost }}</p>
              </div>
            </article>
          </div>
        </aside>
      </div>
    </section>
  `
};


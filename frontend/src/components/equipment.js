export default {
  name: "EquipmentView",
  props: ["searchText"],
  template: `
    <section class="space-y-10 text-on-surface">
      <div class="relative overflow-hidden bg-surface-container-low p-8">
        <div class="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/8 blur-3xl"></div>
        <div class="relative z-10 max-w-3xl">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">WIP</p>
          <h3 class="mt-3 font-headline text-4xl font-bold tracking-tight text-on-surface">Equipment Management</h3>
          <p class="mt-4 text-base leading-7 text-secondary">
            This section is still in progress and is not ready yet.
          </p>
          <p class="mt-2 text-sm leading-6 text-secondary/80">
            Equipment inventory, service intervals, and gear tracking are coming soon.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="border border-primary/10 bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Planned</p>
          <p class="mt-3 text-lg font-semibold text-on-surface">Gear Inventory</p>
          <p class="mt-2 text-sm leading-6 text-secondary">Track regulators, BCDs, suits, tanks, and computers in one place.</p>
        </div>
        <div class="border border-primary/10 bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Planned</p>
          <p class="mt-3 text-lg font-semibold text-on-surface">Service Reminders</p>
          <p class="mt-2 text-sm leading-6 text-secondary">Flag upcoming maintenance windows and keep equipment records current.</p>
        </div>
        <div class="border border-primary/10 bg-surface-container-low p-6">
          <p class="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Planned</p>
          <p class="mt-3 text-lg font-semibold text-on-surface">Dive Associations</p>
          <p class="mt-2 text-sm leading-6 text-secondary">Link specific gear setups to dives once the module is ready.</p>
        </div>
      </div>
    </section>
  `
};

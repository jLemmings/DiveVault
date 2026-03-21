const SettingsView = {
  data() {
    return {
      settingsProfile: {
        name: "Elias Thorne",
        email: "elias.thorne@cartographer.marine",
        certification: "Master Scuba Diver",
        registry: "MSD-992-0402-X"
      },
      settingsUnits: {
        depth: "metric",
        temperature: "fahrenheit",
        pressure: "bar"
      },
      settingsSafety: {
        mix: "Nitrox (32% O2)",
        stopDepth: 5,
        stopMinutes: 3
      },
      unitCards: [
        { key: "depth", label: "Depth", icon: "waves", options: [{ value: "metric", label: "METRIC (M)" }, { value: "imperial", label: "IMPERIAL (FT)" }] },
        { key: "temperature", label: "Temperature", icon: "thermostat", options: [{ value: "celsius", label: "CELSIUS" }, { value: "fahrenheit", label: "FAHRENHEIT" }] },
        { key: "pressure", label: "Pressure", icon: "tire_repair", options: [{ value: "bar", label: "BAR" }, { value: "psi", label: "PSI" }] }
      ]
    };
  },
  template: `
    <section class="space-y-10 text-on-surface">
      <div class="max-w-5xl">
        <p class="font-label text-[10px] font-bold uppercase tracking-[0.3em] text-primary">System Configuration</p>
        <h3 class="mt-2 font-headline text-5xl font-bold tracking-tight text-primary">SYSTEM CONFIG</h3>
        <p class="mt-3 max-w-3xl text-sm text-secondary">Modify operational parameters, safety thresholds, and telemetry units for the DiveVault logbook interface.</p>
      </div>
      <section class="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div class="flex flex-col gap-8 lg:col-span-8">
          <div class="group relative overflow-hidden bg-surface-container-low p-8">
            <div class="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl"></div>
            <div class="relative z-10 flex items-start gap-6">
              <div class="h-24 w-24 rounded-lg border border-primary/20 bg-surface-container-highest"></div>
              <div class="flex-1">
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Operational Identity</h4>
                <h3 class="mt-2 font-headline text-2xl font-bold">{{ settingsProfile.name }}</h3>
                <p class="mt-1 text-sm text-secondary">{{ settingsProfile.email }}</p>
                <div class="mt-4 flex gap-3">
                  <button class="bg-primary px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary">Edit Credentials</button>
                  <button class="border border-primary/10 bg-surface-container-highest px-4 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Sync License</button>
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="border-l-4 border-tertiary bg-surface-container-high p-6">
              <div class="mb-6 flex items-center gap-3">
                <span class="material-symbols-outlined text-tertiary">security</span>
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-tertiary">Safety Protocols</h4>
              </div>
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Gas Mix Warning</p><p class="text-[10px] text-secondary/60">Alert if pO2 exceeds 1.4 bar</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Safety Stop Timer</p><p class="text-[10px] text-secondary/60">Auto-start at 5m depth</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
                <div class="flex items-center justify-between">
                  <div><p class="text-sm font-headline font-bold">Ascent Rate Alarm</p><p class="text-[10px] text-secondary/60">Critical threshold &gt; 9m/min</p></div>
                  <div class="w-12 rounded-full bg-tertiary-container p-1"><div class="ml-auto h-4 w-4 rounded-full bg-tertiary"></div></div>
                </div>
              </div>
            </div>
            <div class="bg-surface-container-high p-6">
              <div class="mb-6 flex items-center gap-3">
                <span class="material-symbols-outlined text-primary">settings_input_component</span>
                <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Unit Systems</h4>
              </div>
              <div class="space-y-8">
                <div class="flex flex-col gap-4">
                  <span class="font-label text-[10px] uppercase tracking-[0.22em] text-secondary/60">Global Configuration</span>
                  <div class="flex rounded-lg bg-surface-container-lowest p-1">
                    <button class="flex-1 rounded px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em]" :class="settingsUnits.depth === 'metric' ? 'bg-primary text-on-primary' : 'text-secondary'" @click="settingsUnits.depth = 'metric'">Metric</button>
                    <button class="flex-1 rounded px-3 py-2 font-label text-[10px] font-bold uppercase tracking-[0.2em]" :class="settingsUnits.depth === 'imperial' ? 'bg-primary text-on-primary' : 'text-secondary'" @click="settingsUnits.depth = 'imperial'">Imperial</button>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div class="border border-outline-variant/10 bg-surface-container-lowest p-4"><p class="font-label text-[10px] text-secondary/60">TEMP</p><p class="mt-1 font-headline text-lg font-bold">{{ settingsUnits.temperature === 'celsius' ? 'CELSIUS' : 'FAHRENHEIT' }}</p></div>
                  <div class="border border-outline-variant/10 bg-surface-container-lowest p-4"><p class="font-label text-[10px] text-secondary/60">PRESSURE</p><p class="mt-1 font-headline text-lg font-bold">{{ settingsUnits.pressure.toUpperCase() }}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-8 lg:col-span-4">
          <div class="glass-panel bg-surface-container-high p-6 shadow-panel">
            <h4 class="mb-6 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Data Management</h4>
            <div class="flex flex-col gap-4">
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">picture_as_pdf</span><span class="text-sm font-headline font-bold">Export Logs (PDF)</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">table_chart</span><span class="text-sm font-headline font-bold">Raw Telemetry (CSV)</span></span>
                <span class="material-symbols-outlined text-secondary/50">chevron_right</span>
              </button>
              <button class="flex w-full items-center justify-between rounded bg-surface-container-lowest p-4 transition-colors hover:bg-surface-bright">
                <span class="flex items-center gap-3"><span class="material-symbols-outlined text-secondary">cloud_sync</span><span class="text-sm font-headline font-bold">Cloud Synchronization</span></span>
                <span class="font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Online</span>
              </button>
            </div>
            <div class="mt-12 border-t border-outline-variant/10 pt-8">
              <h5 class="mb-4 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-error">Danger Zone</h5>
              <div class="flex flex-col gap-3">
                <button class="w-full rounded border border-error/20 p-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-error transition-all hover:bg-error-container">Purge All Dive Data</button>
                <button class="w-full rounded p-4 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-secondary/40 transition-colors hover:text-error">Deactivate Operator Account</button>
              </div>
            </div>
          </div>
          <div class="border border-outline-variant/10 bg-surface-container-low p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(156,202,255,0.6)]"></span>
              <h4 class="font-label text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">System Integrity</h4>
            </div>
            <div class="space-y-4">
              <div><div class="mb-1 flex items-end justify-between"><span class="text-[10px] text-secondary/60">Firmware</span><span class="text-sm font-headline font-bold">v2.4.9-ABYSS</span></div><div class="h-1 overflow-hidden rounded-full bg-surface-container-highest"><div class="h-full w-[94%] bg-primary"></div></div></div>
              <div><div class="mb-1 flex items-end justify-between"><span class="text-[10px] text-secondary/60">Encrypted Storage</span><span class="text-sm font-headline font-bold">1.2 GB / 5 GB</span></div></div>
            </div>
          </div>
        </div>
      </section>
    </section>
  `
};


const LoginView = {
  props: [
    "email",
    "password",
    "submitLogin",
    "updateLoginField",
    "loginError",
    "loginSubmitting"
  ],
  computed: {
    filledIconStyle() {
      return filledIconStyle;
    },
    canSubmit() {
      return Boolean(this.email?.trim() && this.password);
    }
  },
  methods: {
    setField(key, event) {
      this.updateLoginField(key, event.target.value);
    },
    onSubmit() {
      this.submitLogin();
    }
  },
  template: `
    <div class="abyssal-auth-shell relative min-h-screen overflow-hidden bg-surface text-on-surface">
      <div class="pointer-events-none absolute inset-0 opacity-60">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(6,33,53,0.5),transparent_34rem)]"></div>
        <div class="absolute inset-0 technical-grid opacity-[0.05]"></div>
      </div>

      <div class="relative flex min-h-screen flex-col">
        <header class="px-6 pb-6 pt-10 md:px-8 md:pt-12">
          <div class="mx-auto flex max-w-5xl flex-col items-center text-center">
            <span class="font-headline text-3xl font-bold tracking-tight text-primary md:text-5xl">DiveVault</span>
            <div class="mt-3 h-px w-16 bg-primary/50"></div>
            <span class="mt-3 font-label text-[10px] font-bold uppercase tracking-[0.28em] text-on-surface-variant">
              Deep-Sea Cartography Systems
            </span>
          </div>
        </header>

        <main class="relative flex flex-1 items-center justify-center px-6 pb-20 md:px-8">
          <div class="w-full max-w-md">
            <div class="relative">
              <div class="absolute -left-3 -top-3 h-8 w-8 border-l border-t border-primary/25 md:-left-5 md:-top-5 md:h-10 md:w-10"></div>
              <div class="absolute -bottom-3 -right-3 h-8 w-8 border-b border-r border-primary/25 md:-bottom-5 md:-right-5 md:h-10 md:w-10"></div>

              <section class="auth-panel relative overflow-hidden p-7 shadow-[0_24px_60px_rgba(0,15,29,0.45)] md:p-10">
                <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent"></div>

                <div class="relative">
                  <div class="mb-9 text-center">
                    <h1 class="font-headline text-2xl font-semibold uppercase tracking-[0.08em] text-on-surface md:text-3xl">
                      Authentication
                    </h1>
                    <p class="mt-2 font-label text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
                      Secure Encrypted Channel
                    </p>
                  </div>

                  <form class="space-y-6" @submit.prevent="onSubmit">
                    <label class="block space-y-2.5">
                      <span class="flex items-center gap-2 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                        <span class="material-symbols-outlined text-sm">badge</span>
                        Diver ID
                      </span>
                      <input
                        :value="email"
                        @input="setField('email', $event)"
                        type="email"
                        autocomplete="email"
                        placeholder="operator@system.abyss"
                        class="w-full border-none bg-surface-container-highest/45 px-4 py-4 font-headline text-sm tracking-[0.18em] text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary/30"
                      />
                    </label>

                    <label class="block space-y-2.5">
                      <span class="flex items-center gap-2 font-label text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                        <span class="material-symbols-outlined text-sm">key</span>
                        Access Code
                      </span>
                      <input
                        :value="password"
                        @input="setField('password', $event)"
                        type="password"
                        autocomplete="current-password"
                        placeholder="............"
                        class="w-full border-none bg-surface-container-highest/45 px-4 py-4 font-headline text-sm tracking-[0.3em] text-on-surface placeholder:text-on-surface-variant/30 focus:ring-1 focus:ring-primary/30"
                      />
                    </label>

                    <p v-if="loginError" class="bg-error-container/18 px-4 py-3 text-sm text-on-error-container">
                      {{ loginError }}
                    </p>

                    <div class="pt-2">
                      <button
                        type="submit"
                        :disabled="loginSubmitting || !canSubmit"
                        class="auth-button-glow flex w-full items-center justify-center gap-2 bg-primary px-5 py-5 font-label text-[11px] font-bold uppercase tracking-[0.24em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>{{ loginSubmitting ? 'Initiating Session' : 'Initiate Session' }}</span>
                        <span class="material-symbols-outlined text-lg" :style="filledIconStyle">arrow_right_alt</span>
                      </button>
                    </div>
                  </form>

                  <div class="mt-10 flex flex-col items-center gap-4 text-center">
                    <button type="button" class="font-label text-[10px] font-bold uppercase tracking-[0.22em] text-primary transition-colors hover:text-on-surface">
                      Recover Access
                    </button>
                    <div class="h-px w-8 bg-outline-variant/30"></div>
                    <p class="text-[11px] tracking-[0.04em] text-on-surface-variant">
                      New Operator?
                      <button type="button" class="ml-1 font-label text-[10px] font-bold uppercase tracking-[0.18em] text-primary underline underline-offset-4 transition-colors hover:text-on-surface">
                        Register New Diver
                      </button>
                    </p>
                  </div>
                </div>

                <div class="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-surface-container-highest">
                  <div class="h-full w-1/3 bg-primary/40 animate-pulse"></div>
                </div>
              </section>
            </div>

            <div class="mt-7 flex items-center justify-between px-2">
              <div class="flex items-center gap-2">
                <div class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                <span class="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                  Uplink Stable
                </span>
              </div>
              <div class="flex items-center gap-4">
                <span class="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/40">
                  Node_7a2
                </span>
                <span class="font-label text-[9px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/40">
                  Lat:-45.89 Lon:12.33
                </span>
              </div>
            </div>
          </div>
        </main>

        <footer class="relative px-6 py-8 md:px-12">
          <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-outline-variant/10 pt-8 text-center md:flex-row md:text-left">
            <p class="text-[10px] uppercase tracking-[0.08em] text-on-surface-variant/50">
              Copyright 2026 Deep-Sea Cartography Systems. All rights reserved.
            </p>
            <div class="flex flex-wrap items-center justify-center gap-6 text-[10px] uppercase tracking-[0.08em] text-on-surface-variant/50 md:justify-end">
              <button type="button" class="transition-all hover:text-primary hover:opacity-100">Terms Of Service</button>
              <button type="button" class="transition-all hover:text-primary hover:opacity-100">System Status</button>
              <button type="button" class="transition-all hover:text-primary hover:opacity-100">Encryption Protocol</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  `
};

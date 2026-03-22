import { SignIn } from "@clerk/vue";

export default {
  name: "LoginView",
  components: {
    SignIn
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

                  <div class="space-y-6">
                    <div class="rounded border border-primary/10 bg-surface-container-highest/25 p-4 text-center text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                      Sign in with Clerk to access the dive logbook.
                    </div>
                    <SignIn />
                  </div>

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

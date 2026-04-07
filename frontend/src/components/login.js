import { SignIn, Waitlist, useSignIn } from "../auth.js";

const AUTH_VIEW_ENTRY = "entry";
const AUTH_VIEW_SIGNIN = "signin";
const AUTH_VIEW_RECOVER = "recover";
const AUTH_VIEW_WAITLIST = "waitlist";
const AUTH_VIEWS = new Set([AUTH_VIEW_ENTRY, AUTH_VIEW_SIGNIN, AUTH_VIEW_RECOVER, AUTH_VIEW_WAITLIST]);

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#7fd3ff",
    colorBackground: "rgba(19, 44, 64, 0.18)",
    colorInputBackground: "rgba(9, 31, 48, 0.72)",
    colorInputText: "#eaf7ff",
    colorText: "#eaf7ff",
    colorTextSecondary: "rgba(211, 232, 247, 0.74)",
    colorNeutral: "rgba(146, 185, 215, 0.42)",
    colorDanger: "#ff978d",
    borderRadius: "1rem",
    fontFamily: "\"Space Grotesk\", sans-serif"
  },
  elements: {
    rootBox: {
      width: "100%"
    },
    cardBox: {
      width: "100%",
      boxShadow: "none",
      background: "transparent"
    },
    card: {
      boxShadow: "none",
      background: "transparent",
      border: "1px solid rgba(127, 211, 255, 0.08)",
      borderRadius: "1.25rem",
      padding: "0"
    },
    headerTitle: {
      display: "none"
    },
    headerSubtitle: {
      display: "none"
    },
    formFieldLabel: {
      color: "rgba(212, 237, 255, 0.72)",
      letterSpacing: "0.16em",
      fontSize: "10px",
      fontWeight: "700"
    },
    formFieldInput: {
      minHeight: "46px",
      background: "rgba(12, 34, 54, 0.58)",
      border: "1px solid rgba(127, 211, 255, 0.08)",
      color: "#eaf7ff",
      boxShadow: "none"
    },
    formFieldInputShowPasswordButton: {
      color: "rgba(212, 237, 255, 0.72)"
    },
    formButtonPrimary: {
      minHeight: "46px",
      background: "linear-gradient(135deg, rgba(113, 208, 255, 0.88), rgba(83, 165, 255, 0.82))",
      color: "#02101f",
      fontWeight: "800",
      letterSpacing: "0.04em",
      boxShadow: "0 10px 22px rgba(11, 59, 103, 0.18)"
    },
    footerAction: {
      display: "none"
    },
    footerActionLink: {
      color: "#7fd3ff",
      fontWeight: "700",
      letterSpacing: "0.04em"
    },
    formResendCodeLink: {
      color: "#7fd3ff",
      fontWeight: "700"
    },
    socialButtonsBlockButton: {
      background: "rgba(16, 44, 69, 0.52)",
      border: "1px solid rgba(127, 211, 255, 0.1)",
      color: "#eaf7ff",
      boxShadow: "none"
    },
    socialButtonsBlockButtonText: {
      color: "#eaf7ff",
      fontWeight: "600",
      letterSpacing: "0.04em"
    },
    dividerLine: {
      background: "rgba(127, 211, 255, 0.08)"
    },
    dividerText: {
      color: "rgba(212, 237, 255, 0.62)",
      letterSpacing: "0.18em",
      fontSize: "10px"
    },
    identityPreviewText: {
      color: "#eaf7ff"
    },
    identityPreviewEditButton: {
      color: "#7fd3ff"
    },
    alert: {
      background: "rgba(255, 138, 128, 0.08)",
      border: "1px solid rgba(255, 138, 128, 0.18)"
    },
    alertText: {
      color: "#ffd7d2"
    }
  }
};

export default {
  name: "LoginView",
  components: {
    SignIn,
    Waitlist
  },
  setup() {
    const { isLoaded, signIn, setActive } = useSignIn();

    return {
      clerkSignInLoaded: isLoaded,
      clerkSignIn: signIn,
      clerkSetActive: setActive
    };
  },
  data() {
    return {
      authView: AUTH_VIEW_SIGNIN,
      clerkAppearance: CLERK_APPEARANCE,
      recoveryEmail: "",
      recoveryCode: "",
      recoveryPassword: "",
      recoveryPasswordConfirm: "",
      recoveryStep: "email",
      recoveryLoading: false,
      recoveryError: "",
      recoveryMessage: ""
    };
  },
  computed: {
    authTitle() {
      if (this.authView === AUTH_VIEW_RECOVER) {
        return "Recover Access";
      }
      if (this.authView === AUTH_VIEW_WAITLIST) {
        return "Join Waitlist";
      }
      return "Login";
    },
    isRecoveryCodeStep() {
      return this.recoveryStep === "code";
    }
  },
  mounted() {
    this.syncAuthViewFromHash();
    window.addEventListener("hashchange", this.syncAuthViewFromHash);
  },
  beforeUnmount() {
    window.removeEventListener("hashchange", this.syncAuthViewFromHash);
  },
  methods: {
    syncAuthViewFromHash() {
      const rawHash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
      this.authView = AUTH_VIEWS.has(rawHash) ? rawHash : AUTH_VIEW_SIGNIN;
    },
    setAuthView(view) {
      const nextView = AUTH_VIEWS.has(view) ? view : AUTH_VIEW_SIGNIN;
      window.location.hash = nextView === AUTH_VIEW_SIGNIN ? "" : nextView;
      this.authView = nextView;
    },
    openRecovery() {
      this.recoveryCode = "";
      this.recoveryPassword = "";
      this.recoveryPasswordConfirm = "";
      this.recoveryStep = "email";
      this.recoveryError = "";
      this.recoveryMessage = "";
      this.setAuthView(AUTH_VIEW_RECOVER);
    },
    formatClerkError(error) {
      const errors = Array.isArray(error?.errors) ? error.errors : [];
      if (errors.length) {
        return errors
          .map((entry) => entry?.longMessage || entry?.message || entry?.code)
          .filter(Boolean)
          .join(" ");
      }
      if (typeof error?.message === "string" && error.message.trim()) {
        return error.message.trim();
      }
      return "Clerk could not complete that request.";
    },
    async startPasswordRecovery() {
      const email = this.recoveryEmail.trim();
      if (!email) {
        this.recoveryError = "Enter the email address linked to your DiveVault account.";
        return;
      }
      if (!this.clerkSignInLoaded || !this.clerkSignIn) {
        this.recoveryError = "Clerk is still loading. Try again in a moment.";
        return;
      }

      this.recoveryLoading = true;
      this.recoveryError = "";
      this.recoveryMessage = "";

      try {
        await this.clerkSignIn.create({
          strategy: "reset_password_email_code",
          identifier: email
        });
        this.recoveryStep = "code";
        this.recoveryMessage = `Recovery code sent to ${email}.`;
      } catch (error) {
        this.recoveryError = this.formatClerkError(error);
      } finally {
        this.recoveryLoading = false;
      }
    },
    async completePasswordRecovery() {
      if (!this.clerkSignInLoaded || !this.clerkSignIn || !this.clerkSetActive) {
        this.recoveryError = "Clerk is still loading. Try again in a moment.";
        return;
      }
      if (!this.recoveryCode.trim()) {
        this.recoveryError = "Enter the recovery code from Clerk.";
        return;
      }
      if (!this.recoveryPassword) {
        this.recoveryError = "Enter a new password.";
        return;
      }
      if (this.recoveryPassword !== this.recoveryPasswordConfirm) {
        this.recoveryError = "The new password and confirmation must match.";
        return;
      }

      this.recoveryLoading = true;
      this.recoveryError = "";
      this.recoveryMessage = "";

      try {
        let result = await this.clerkSignIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code: this.recoveryCode.trim(),
          password: this.recoveryPassword
        });

        if (result.status === "needs_new_password") {
          result = await this.clerkSignIn.resetPassword({
            password: this.recoveryPassword
          });
        }

        if (result.status === "complete" && result.createdSessionId) {
          window.location.hash = "";
          await this.clerkSetActive({ session: result.createdSessionId });
          return;
        }

        this.recoveryMessage = "Password updated. Complete any remaining Clerk verification steps to sign in.";
      } catch (error) {
        this.recoveryError = this.formatClerkError(error);
      } finally {
        this.recoveryLoading = false;
      }
    }
  },
  template: `
    <div class="abyssal-auth-shell relative min-h-screen overflow-hidden bg-surface text-on-surface">
      <div class="pointer-events-none absolute inset-0 opacity-60">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(6,33,53,0.5),transparent_34rem)]"></div>
        <div class="absolute inset-0 technical-grid opacity-[0.05]"></div>
      </div>

      <div class="relative flex min-h-screen flex-col">
        <div class="flex flex-1 flex-col justify-center py-10 md:py-12">
          <header class="px-6 pb-4 md:px-8 md:pb-5">
            <div class="mx-auto flex max-w-5xl flex-col items-center text-center">
              <div class="flex items-center justify-center gap-4">
                <img src="/logo.png" alt="DiveVault logo" class="h-20 w-20 object-contain md:h-28 md:w-28" />
                <span class="font-headline text-3xl font-bold tracking-tight text-primary md:text-5xl">DiveVault</span>
              </div>
              <div class="mt-3 h-px w-16 bg-primary/50"></div>
            </div>
          </header>

          <main class="relative flex items-center justify-center px-6 md:px-8">
            <div class="w-full max-w-md">
              <div class="relative">
                <div class="absolute -left-3 -top-3 h-8 w-8 border-l border-t border-primary/25 md:-left-5 md:-top-5 md:h-10 md:w-10"></div>
                <div class="absolute -bottom-3 -right-3 h-8 w-8 border-b border-r border-primary/25 md:-bottom-5 md:-right-5 md:h-10 md:w-10"></div>

                <section class="auth-panel relative overflow-hidden p-7 shadow-[0_24px_60px_rgba(0,15,29,0.45)] md:p-10">
                  <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent"></div>

                <div class="relative">
                  <div class="mb-9 text-center">
                    <h1 class="font-headline text-2xl font-semibold tracking-[0.02em] text-on-surface md:text-3xl">
                      {{ authTitle }}
                    </h1>
                  </div>

                  <div v-if="authView === 'signin'" class="space-y-6">
                    <SignIn
                      routing="hash"
                      sign-in-url="#signin"
                      waitlist-url="#waitlist"
                      :with-sign-up="false"
                      :appearance="clerkAppearance"
                    />
                  </div>

                  <div v-else-if="authView === 'recover'" class="space-y-5">
                    <div v-if="recoveryMessage" class="rounded border border-primary/14 bg-primary/6 px-4 py-3 text-sm text-primary">
                      {{ recoveryMessage }}
                    </div>
                    <div v-if="recoveryError" class="rounded border border-red-300/16 bg-red-400/7 px-4 py-3 text-sm text-red-100">
                      {{ recoveryError }}
                    </div>

                    <div class="space-y-4">
                      <label class="block">
                        <span class="mb-2 block font-label text-[10px] font-bold tracking-[0.18em] text-on-surface-variant">
                          Email Address
                        </span>
                        <input
                          v-model.trim="recoveryEmail"
                          type="email"
                          autocomplete="email"
                          class="w-full rounded-2xl border border-primary/8 bg-surface-container-highest/35 px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary/25"
                          placeholder="diver@example.com"
                        />
                      </label>

                      <template v-if="isRecoveryCodeStep">
                        <label class="block">
                          <span class="mb-2 block font-label text-[10px] font-bold tracking-[0.18em] text-on-surface-variant">
                            Recovery Code
                          </span>
                          <input
                            v-model.trim="recoveryCode"
                            type="text"
                            inputmode="numeric"
                            autocomplete="one-time-code"
                            class="w-full rounded-2xl border border-primary/8 bg-surface-container-highest/35 px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary/25"
                            placeholder="Enter The Clerk Code"
                          />
                        </label>

                        <label class="block">
                          <span class="mb-2 block font-label text-[10px] font-bold tracking-[0.18em] text-on-surface-variant">
                            New Password
                          </span>
                          <input
                            v-model="recoveryPassword"
                            type="password"
                            autocomplete="new-password"
                            class="w-full rounded-2xl border border-primary/8 bg-surface-container-highest/35 px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary/25"
                            placeholder="Create A New Password"
                          />
                        </label>

                        <label class="block">
                          <span class="mb-2 block font-label text-[10px] font-bold tracking-[0.18em] text-on-surface-variant">
                            Confirm Password
                          </span>
                          <input
                            v-model="recoveryPasswordConfirm"
                            type="password"
                            autocomplete="new-password"
                            class="w-full rounded-2xl border border-primary/8 bg-surface-container-highest/35 px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary/25"
                            placeholder="Repeat The New Password"
                          />
                        </label>
                      </template>
                    </div>

                    <div class="flex flex-col gap-3">
                      <button
                        type="button"
                        :disabled="recoveryLoading"
                        @click="isRecoveryCodeStep ? completePasswordRecovery() : startPasswordRecovery()"
                        class="w-full rounded-[1.1rem] bg-[linear-gradient(135deg,#71c8ff_0%,#5faeff_45%,#5997ef_100%)] px-4 py-4 font-label text-[0.95rem] font-black tracking-[0.08em] text-[#031726] shadow-[0_14px_28px_rgba(43,116,181,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {{ recoveryLoading ? "Working..." : (isRecoveryCodeStep ? "Reset Password" : "Send Recovery Code") }}
                      </button>
                    </div>
                  </div>

                  <div v-else class="space-y-6">
                    <p class="text-center text-sm leading-6 text-on-surface-variant">
                      DiveVault is currently in beta, so new access is being released gradually through the waitlist.
                    </p>
                    <Waitlist
                      sign-in-url="#signin"
                      after-join-waitlist-url="#signin"
                      :appearance="clerkAppearance"
                    />
                  </div>

                  <div class="mt-10 flex flex-col items-center gap-4 text-center">
                    <button
                      v-if="authView !== 'recover'"
                      type="button"
                      @click="openRecovery"
                      class="font-label text-[10px] font-bold tracking-[0.12em] text-primary transition-colors hover:text-on-surface"
                    >
                      Recover Access
                    </button>
                    <button
                      v-else
                      type="button"
                      @click="setAuthView('signin')"
                      class="font-label text-[10px] font-bold tracking-[0.12em] text-primary transition-colors hover:text-on-surface"
                    >
                      Back To Login
                    </button>
                    <div class="h-px w-8 bg-outline-variant/30"></div>
                    <p class="text-[11px] tracking-[0.04em] text-on-surface-variant">
                      New Diver?
                      <button
                        v-if="authView !== 'waitlist'"
                        type="button"
                        @click="setAuthView('waitlist')"
                        class="ml-1 font-label text-[10px] font-bold tracking-[0.12em] text-primary underline underline-offset-4 transition-colors hover:text-on-surface"
                      >
                        Join Waitlist
                      </button>
                      <button
                        v-else
                        type="button"
                        @click="setAuthView('signin')"
                        class="ml-1 font-label text-[10px] font-bold tracking-[0.12em] text-primary underline underline-offset-4 transition-colors hover:text-on-surface"
                      >
                        Back To Login
                      </button>
                    </p>
                  </div>
                </div>

                  <div class="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-surface-container-highest">
                    <div class="h-full w-1/3 bg-primary/40 animate-pulse"></div>
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>

        <footer class="relative mt-10 px-6 pb-8 pt-8 md:px-12 md:pb-10">
          <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-primary/18 pt-8 text-center md:flex-row md:text-left">
            <p class="text-[10px] tracking-[0.08em] text-on-surface-variant/50">
              Copyright 2026
            </p>
            <a
              href="https://github.com/jLemmings/DiveVault"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-2 text-[10px] tracking-[0.08em] text-on-surface-variant/50 transition-all hover:text-primary hover:opacity-100"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="h-3.5 w-3.5 fill-current">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.11.79-.25.79-.56 0-.28-.01-1.2-.02-2.17-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.69.08-.69 1.15.08 1.75 1.18 1.75 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.27 1.18-3.08-.12-.29-.51-1.48.11-3.09 0 0 .97-.31 3.17 1.18a11.02 11.02 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.61.23 2.8.11 3.09.73.81 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.15 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              <span>jLemmings/DiveVault</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  `
};

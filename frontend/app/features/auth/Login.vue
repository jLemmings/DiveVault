<script>
import { loginWithPassword, registerUser } from "~/shared/composables/auth.js";
import { authStatusUrl } from "~/shared/api/endpoints.js";
import { LOCALES } from "~/i18n/locales.js";

const AUTH_VIEW_SIGNIN = "signin";
const AUTH_VIEW_REGISTER = "register";
export default {
  name: "LoginView",
  props: {
    currentLocale: {
      type: String,
      default: "en"
    },
    setLocale: {
      type: Function,
      default: null
    }
  },
  data() {
    const inviteToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite_token") || "" : "";
    return {
      authView: AUTH_VIEW_SIGNIN,
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      inviteToken,
      authStatus: {
        initialized: false,
        bootstrap_registration_open: false,
        public_registration_enabled: false,
        public_registration_open: false,
        invite: null
      },
      loading: false,
      showPassword: false,
      error: "",
      message: ""
    };
  },
  computed: {
    canRegister() {
      return Boolean(this.authStatus.public_registration_open || this.authStatus.invite);
    },
    availableLanguages() {
      return LOCALES.map((locale) => ({
        value: locale.code,
        label: locale.name
      }));
    },
    selectedLocale() {
      return this.availableLanguages.some((language) => language.value === this.currentLocale) ? this.currentLocale : "en";
    },
    demoMode() {
      return Boolean(typeof window !== "undefined" && window.__APP_CONFIG__?.demoMode);
    },
    showAlternateAccountPrompt() {
      return this.authView === AUTH_VIEW_REGISTER || this.canRegister;
    },
    isInviteRegistration() {
      return Boolean(this.inviteToken && this.authStatus.invite);
    },
    authHeading() {
      return this.authView === AUTH_VIEW_REGISTER ? "Create your DiveVault account" : "Welcome back";
    },
    authEyebrow() {
      return this.authView === AUTH_VIEW_REGISTER ? "Secure Account Setup" : "DiveVault Access";
    },
    authSummary() {
      if (this.isInviteRegistration) {
        return `This invitation reserves access for ${this.authStatus.invite.email}.`;
      }
      if (this.authView === AUTH_VIEW_REGISTER) {
        return "Create a local account to sync logs, manage your dive archive, and approve desktop imports.";
      }
      return "Sign in to access your dive archive, imports, profile, and system controls.";
    },
    submitLabel() {
      if (this.loading) {
        return this.authView === AUTH_VIEW_REGISTER ? "Creating Account" : "Signing In";
      }
      return this.authView === AUTH_VIEW_REGISTER ? "Create Account" : "Sign In";
    },
    alternateActionLabel() {
      return this.authView === AUTH_VIEW_REGISTER ? "Sign In" : "Create Account";
    },
    alternateActionCopy() {
      return this.authView === AUTH_VIEW_REGISTER ? "Already provisioned?" : "Need an account?";
    }
  },
  async mounted() {
    await this.loadAuthStatus();
  },
  methods: {
    async loadAuthStatus() {
      try {
        const query = this.inviteToken ? `?invite_token=${encodeURIComponent(this.inviteToken)}` : "";
        const response = await fetch(authStatusUrl(query));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load authentication state");
        }
        this.authStatus = {
          initialized: Boolean(payload?.initialized),
          bootstrap_registration_open: Boolean(payload?.bootstrap_registration_open),
          public_registration_enabled: Boolean(payload?.public_registration_enabled),
          public_registration_open: Boolean(payload?.public_registration_open),
          invite: payload?.invite || null
        };
        if (this.authStatus.invite) {
          this.authView = AUTH_VIEW_REGISTER;
          this.email = this.authStatus.invite.email || this.email;
          this.firstName = this.authStatus.invite.first_name || this.firstName;
          this.lastName = this.authStatus.invite.last_name || this.lastName;
        }
      } catch (error) {
        this.error = error?.message || "Unable to load sign-in options.";
      }
    },
    async handleLocaleChange(value) {
      const locale = value?.target?.value || value || "en";
      if (typeof this.setLocale === "function") {
        await this.setLocale(locale);
      }
    },
    async submitSignIn() {
      this.loading = true;
      this.error = "";
      try {
        await loginWithPassword(this.email.trim(), this.password);
      } catch (error) {
        this.error = error?.message || "Login failed.";
      } finally {
        this.loading = false;
      }
    },
    async submitRegister() {
      this.loading = true;
      this.error = "";
      this.message = "";
      try {
        await registerUser({
          email: this.email.trim(),
          password: this.password,
          first_name: this.firstName.trim(),
          last_name: this.lastName.trim(),
          invite_token: this.inviteToken || undefined
        });
        this.authView = AUTH_VIEW_SIGNIN;
        this.message = "Account created. Sign in with your new credentials.";
        if (this.inviteToken && typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.delete("invite_token");
          window.history.replaceState({}, "", url.toString());
          this.inviteToken = "";
          this.authStatus.invite = null;
        }
      } catch (error) {
        this.error = error?.message || "Registration failed.";
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<template>
  <div class="abyssal-auth-shell auth-stage relative min-h-screen overflow-hidden bg-surface text-on-surface">
    <div class="auth-stage-orb auth-stage-orb-left"></div>
    <div class="auth-stage-orb auth-stage-orb-right"></div>
    <div class="auth-stage-orb auth-stage-orb-bottom"></div>
    <div class="auth-stage-wave auth-stage-wave-back"></div>
    <div class="auth-stage-wave auth-stage-wave-front"></div>
    <div class="auth-stage-caustics"></div>

    <div class="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
      <label class="sr-only" for="login-language">Language</label>
      <USelect
        id="login-language"
        :model-value="selectedLocale"
        :items="availableLanguages"
        @update:model-value="handleLocaleChange"
        aria-label="Language"
        class="rounded-xl border border-primary/14 bg-surface-container-high/55 px-3 py-2 text-xs font-semibold text-secondary outline-none transition-colors hover:border-primary/30 hover:text-white focus:border-primary/50"
      />
    </div>

    <div
      class="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-4 sm:px-5 sm:py-8 md:px-8 lg:px-10"
    >
      <div class="w-full max-w-[34rem]">
        <div class="mx-auto mb-4 flex max-w-[28rem] flex-col items-center px-2 text-center sm:mb-7">
          <div class="flex h-40 w-full max-w-[30rem] items-center justify-center sm:h-52">
            <img src="/logo-headline.png" alt="DiveVault" class="max-h-full w-full object-contain" />
          </div>
        </div>

        <section
          class="auth-panel auth-panel-centered relative overflow-hidden rounded-[1.75rem] border border-primary/14 px-4 py-5 sm:rounded-[2rem] sm:px-8 sm:py-8 lg:px-10 lg:py-10"
        >
          <div class="technical-grid absolute inset-0"></div>
          <div class="auth-panel-sheen"></div>

          <div class="relative">
            <h2 class="font-headline text-[2rem] font-bold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.02]">
              {{ authHeading }}
            </h2>
            <p class="mt-3 max-w-[30rem] text-sm leading-6 text-secondary sm:mt-4 sm:leading-7">{{ authSummary }}</p>
          </div>

          <div
            v-if="demoMode"
            class="relative mt-5 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-4 text-sm text-on-surface sm:mt-6"
          >
            <div class="flex items-start gap-3">
              <span class="material-symbols-outlined mt-0.5 text-[20px] text-primary">info</span>
              <div class="min-w-0">
                <p class="font-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">Demo Mode</p>
                <p class="mt-1 leading-6 text-secondary">
                  This public instance resets on a schedule. Sign in with username
                  <span class="font-semibold text-on-surface">admin</span> and password
                  <span class="font-semibold text-on-surface">admin</span>.
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="message"
            class="relative mt-5 rounded-2xl border border-primary/16 bg-primary/10 px-4 py-3 text-sm text-primary sm:mt-6"
          >
            {{ message }}
          </div>
          <div v-if="error" class="relative mt-4 rounded-2xl border border-error/25 bg-error-container/20 px-4 py-3 text-sm text-error">
            {{ error }}
          </div>

          <div class="relative mt-6 space-y-4 sm:mt-8 sm:space-y-5">
            <label class="block space-y-2">
              <span class="font-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-secondary">Email</span>
              <UInput
                v-model.trim="email"
                type="email"
                autocomplete="email"
                placeholder="Email"
                class="auth-input w-full rounded-2xl border border-primary/12 px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-secondary/45 sm:py-3.5"
              />
            </label>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-3">
                <span class="font-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-secondary">Password</span>
                <UButton
                  @click="showPassword = !showPassword"
                  type="button"
                  class="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:text-white"
                >
                  {{ showPassword ? "Hide" : "Show" }}
                </UButton>
              </div>
              <UInput
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Password"
                class="auth-input w-full rounded-2xl border border-primary/12 px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-secondary/45 sm:py-3.5"
              />
            </div>

            <template v-if="authView === 'register'">
              <div class="grid gap-5 sm:grid-cols-2">
                <label class="block space-y-2">
                  <span class="font-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-secondary">First Name</span>
                  <UInput
                    v-model.trim="firstName"
                    type="text"
                    autocomplete="given-name"
                    placeholder="First name"
                    class="auth-input w-full rounded-2xl border border-primary/12 px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-secondary/45 sm:py-3.5"
                  />
                </label>
                <label class="block space-y-2">
                  <span class="font-label text-[0.65rem] font-bold uppercase tracking-[0.18em] text-secondary">Last Name</span>
                  <UInput
                    v-model.trim="lastName"
                    type="text"
                    autocomplete="family-name"
                    placeholder="Last name"
                    class="auth-input w-full rounded-2xl border border-primary/12 px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-secondary/45 sm:py-3.5"
                  />
                </label>
              </div>
            </template>
          </div>

          <div class="relative mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <UButton
              v-if="authView === 'signin'"
              @click="submitSignIn"
              :disabled="loading"
              class="auth-button-glow auth-primary-button inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl px-5 py-3 font-label text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-13 sm:py-3.5 sm:text-[0.7rem] sm:tracking-[0.2em]"
            >
              {{ submitLabel }}
            </UButton>
            <UButton
              v-if="authView === 'register'"
              @click="submitRegister"
              :disabled="loading"
              class="auth-button-glow auth-primary-button inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl px-5 py-3 font-label text-[0.68rem] font-bold uppercase tracking-[0.18em] text-on-primary transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-13 sm:py-3.5 sm:text-[0.7rem] sm:tracking-[0.2em]"
            >
              {{ submitLabel }}
            </UButton>
            <UButton
              v-if="canRegister"
              :key="'auth-toggle-' + authView"
              @click="authView = authView === 'signin' ? 'register' : 'signin'"
              type="button"
              class="inline-flex min-h-12 items-center justify-center rounded-2xl border border-primary/14 bg-surface-container-high/40 px-5 py-3 font-label text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-surface-container-high/70 hover:text-white sm:min-h-13 sm:py-3.5 sm:text-[0.7rem] sm:tracking-[0.18em]"
            >
              {{ alternateActionLabel }}
            </UButton>
          </div>

          <div v-if="showAlternateAccountPrompt" class="relative mt-4 flex flex-wrap items-center gap-2 text-xs text-secondary sm:mt-5">
            <span>{{ alternateActionCopy }}</span>
            <span v-if="canRegister" class="font-semibold uppercase tracking-[0.14em] text-primary/80">
              {{ alternateActionLabel }}
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

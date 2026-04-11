import { loginWithPassword, registerUser } from "../auth.js";

const AUTH_VIEW_SIGNIN = "signin";
const AUTH_VIEW_REGISTER = "register";

export default {
  name: "LoginView",
  data() {
    const inviteToken = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invite_token") || ""
      : "";
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
      error: "",
      message: ""
    };
  },
  computed: {
    canRegister() {
      return Boolean(this.authStatus.public_registration_open || this.authStatus.invite);
    },
    isInviteRegistration() {
      return Boolean(this.inviteToken && this.authStatus.invite);
    }
  },
  async mounted() {
    await this.loadAuthStatus();
  },
  methods: {
    async loadAuthStatus() {
      try {
        const query = this.inviteToken ? `?invite_token=${encodeURIComponent(this.inviteToken)}` : "";
        const response = await fetch(`/api/auth/status${query}`);
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
  },
  template: `
    <div class="min-h-screen flex items-center justify-center bg-surface px-4">
      <div class="w-full max-w-md rounded-2xl border border-primary/20 bg-surface-container-high/40 p-6 space-y-4">
        <h1 class="text-2xl font-semibold text-on-surface">DiveVault Authentication</h1>
        <p v-if="isInviteRegistration" class="text-sm text-primary">This invitation reserves access for {{ authStatus.invite.email }}.</p>
        <p v-if="message" class="text-sm text-primary">{{ message }}</p>
        <p v-if="error" class="text-sm text-red-300">{{ error }}</p>

        <div class="space-y-3">
          <input v-model.trim="email" type="email" placeholder="Email" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          <input v-model="password" type="password" placeholder="Password" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          <template v-if="authView === 'register'">
            <input v-model.trim="firstName" type="text" placeholder="First name" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
            <input v-model.trim="lastName" type="text" placeholder="Last name" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          </template>
        </div>

        <button v-if="authView === 'signin'" @click="submitSignIn" :disabled="loading" class="w-full rounded-xl bg-primary px-4 py-2 text-black font-semibold">Sign In</button>
        <button v-if="authView === 'register'" @click="submitRegister" :disabled="loading" class="w-full rounded-xl bg-primary px-4 py-2 text-black font-semibold">Create Account</button>

        <div class="text-xs text-on-surface-variant flex gap-3">
          <button v-if="authView !== 'signin'" @click="authView='signin'">Sign In</button>
          <button v-if="canRegister" @click="authView='register'">Create Account</button>
        </div>
      </div>
    </div>
  `
};

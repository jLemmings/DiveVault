import { loginWithPassword, registerUser } from "../auth.js";

const AUTH_VIEW_SIGNIN = "signin";
const AUTH_VIEW_REGISTER = "register";
const AUTH_VIEW_RECOVER = "recover";

export default {
  name: "LoginView",
  data() {
    return {
      authView: AUTH_VIEW_SIGNIN,
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      loading: false,
      error: "",
      message: "",
      recoveryCode: "",
      recoveryPassword: ""
    };
  },
  methods: {
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
          last_name: this.lastName.trim()
        });
        this.authView = AUTH_VIEW_SIGNIN;
        this.message = "Account created. Sign in with your new credentials.";
      } catch (error) {
        this.error = error?.message || "Registration failed.";
      } finally {
        this.loading = false;
      }
    },
    async sendRecoveryCode() {
      this.loading = true;
      this.error = "";
      this.message = "";
      try {
        const response = await fetch("/api/auth/recover/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email.trim() })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to start recovery");
        }
        this.message = `Recovery code generated: ${payload.recovery_code}`;
      } catch (error) {
        this.error = error?.message || "Unable to start recovery.";
      } finally {
        this.loading = false;
      }
    },
    async completeRecovery() {
      this.loading = true;
      this.error = "";
      this.message = "";
      try {
        const response = await fetch("/api/auth/recover/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.email.trim(), code: this.recoveryCode.trim(), password: this.recoveryPassword })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to reset password");
        }
        this.authView = AUTH_VIEW_SIGNIN;
        this.message = "Password reset complete. Sign in with your new password.";
      } catch (error) {
        this.error = error?.message || "Recovery failed.";
      } finally {
        this.loading = false;
      }
    }
  },
  template: `
    <div class="min-h-screen flex items-center justify-center bg-surface px-4">
      <div class="w-full max-w-md rounded-2xl border border-primary/20 bg-surface-container-high/40 p-6 space-y-4">
        <h1 class="text-2xl font-semibold text-on-surface">DiveVault Authentication</h1>
        <p v-if="message" class="text-sm text-primary">{{ message }}</p>
        <p v-if="error" class="text-sm text-red-300">{{ error }}</p>

        <div class="space-y-3">
          <input v-model.trim="email" type="email" placeholder="Email" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          <input v-if="authView !== 'recover'" v-model="password" type="password" placeholder="Password" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          <template v-if="authView === 'register'">
            <input v-model.trim="firstName" type="text" placeholder="First name" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
            <input v-model.trim="lastName" type="text" placeholder="Last name" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          </template>
          <template v-if="authView === 'recover'">
            <input v-model.trim="recoveryCode" type="text" placeholder="Recovery code" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
            <input v-model="recoveryPassword" type="password" placeholder="New password" class="w-full rounded-xl border border-primary/20 bg-transparent px-3 py-2" />
          </template>
        </div>

        <button v-if="authView === 'signin'" @click="submitSignIn" :disabled="loading" class="w-full rounded-xl bg-primary px-4 py-2 text-black font-semibold">Sign In</button>
        <button v-if="authView === 'register'" @click="submitRegister" :disabled="loading" class="w-full rounded-xl bg-primary px-4 py-2 text-black font-semibold">Create Account</button>
        <div v-if="authView === 'recover'" class="grid grid-cols-2 gap-2">
          <button @click="sendRecoveryCode" :disabled="loading" class="rounded-xl border border-primary/30 px-3 py-2">Send Code</button>
          <button @click="completeRecovery" :disabled="loading" class="rounded-xl bg-primary px-3 py-2 text-black font-semibold">Reset</button>
        </div>

        <div class="text-xs text-on-surface-variant flex gap-3">
          <button @click="authView='signin'">Sign In</button>
          <button @click="authView='register'">Create Account</button>
          <button @click="authView='recover'">Recover</button>
        </div>
      </div>
    </div>
  `
};

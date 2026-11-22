<script>
import { loginWithPassword, registerUser } from "~/shared/composables/auth.js";
import { authStatusUrl } from "~/shared/api/endpoints.js";
import { LOCALES } from "~/i18n/locales.js";
import BrandMark from "~/shared/components/chart/BrandMark.vue";
import TideLine from "~/shared/components/chart/TideLine.vue";
import SeaSwell from "~/shared/components/chart/SeaSwell.vue";

export default {
  name: "LoginView",
  components: { BrandMark, TideLine, SeaSwell },
  props: {
    currentLocale: { type: String, default: "en" },
    setLocale: { type: Function, required: true }
  },
  data() {
    return {
      locales: LOCALES,
      registering: false,
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      showPassword: false,
      inviteToken: new URLSearchParams(window.location.search).get("invite_token") || "",
      authStatus: { bootstrap_registration_open: false, public_registration_open: false, invite: null },
      demoMode: Boolean(window.__APP_CONFIG__?.demoMode),
      loading: false,
      error: "",
      message: ""
    };
  },
  computed: {
    canRegister() {
      return Boolean(this.authStatus.public_registration_open || this.authStatus.invite);
    },
    registerNote() {
      if (this.inviteToken && this.authStatus.invite)
        return this.$tx("This invitation is for {email}.", { email: this.authStatus.invite.email });
      if (this.authStatus.bootstrap_registration_open) return this.$tx("The first account becomes the owner of this DiveVault.");
      return "";
    },
    submitLabel() {
      if (this.loading) return this.registering ? this.$tx("Creating your account…") : this.$tx("Signing in…");
      return this.registering ? this.$tx("Create account") : this.$tx("Sign in");
    }
  },
  mounted() {
    this.loadAuthStatus();
  },
  methods: {
    async loadAuthStatus() {
      try {
        const query = this.inviteToken ? `?invite_token=${encodeURIComponent(this.inviteToken)}` : "";
        const response = await fetch(authStatusUrl(query));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Unable to load sign-in options.");
        this.authStatus = {
          bootstrap_registration_open: Boolean(payload?.bootstrap_registration_open),
          public_registration_open: Boolean(payload?.public_registration_open),
          invite: payload?.invite || null
        };
        const { invite } = this.authStatus;
        if (invite) {
          this.registering = true;
          this.email = invite.email || this.email;
          this.firstName = invite.first_name || this.firstName;
          this.lastName = invite.last_name || this.lastName;
        }
      } catch (error) {
        this.error = error?.message || "Unable to load sign-in options.";
      }
    },
    toggleMode() {
      this.registering = !this.registering;
      this.error = "";
      this.message = "";
    },
    async submit() {
      this.loading = true;
      this.error = "";
      this.message = "";
      try {
        if (this.registering) await this.register();
        else await loginWithPassword(this.email.trim(), this.password);
      } catch (error) {
        this.error = error?.message || "That didn't work. Try again.";
      } finally {
        this.loading = false;
      }
    },
    async register() {
      await registerUser({
        email: this.email.trim(),
        password: this.password,
        first_name: this.firstName.trim(),
        last_name: this.lastName.trim(),
        invite_token: this.inviteToken || undefined
      });
      this.registering = false;
      this.message = "Account created. Sign in with your new credentials.";
      if (this.inviteToken) {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite_token");
        window.history.replaceState(window.history.state, "", url.toString());
        this.inviteToken = "";
        this.authStatus.invite = null;
      }
    }
  }
};
</script>

<template>
  <div class="app shelf arrival">
    <sea-swell tall />
    <header class="land arrival-top">
      <label class="field arrival-language">
        {{ $tx("Language") }}
        <select :value="currentLocale" @change="setLocale($event.target.value)">
          <option v-for="language in locales" :key="language.code" :value="language.code">{{ language.name }}</option>
        </select>
      </label>
    </header>
    <div class="arrival-mast">
      <div class="arrival-name">
        <brand-mark />
        <p>DiveVault</p>
      </div>
    </div>
    <tide-line />
    <div class="shoal arrival-shoal"></div>
    <div class="mid arrival-mid"></div>
    <main class="arrival-main">
      <p class="site arrival-line">{{ $tx("Your dives, from the surface down.") }}</p>
      <form class="stack arrival-form" @submit.prevent="submit">
        <h1 class="h2">{{ registering ? $tx("Create your account") : $tx("Sign in") }}</h1>
        <p v-if="demoMode" class="arrival-demo">
          {{
            $tx("This is a demo and resets on a schedule. Sign in as {user} with the password {password}.", {
              user: "admin",
              password: "admin"
            })
          }}
        </p>
        <p v-if="registering && registerNote">{{ registerNote }}</p>
        <p v-if="message" role="status">
          <strong>{{ $tx(message) }}</strong>
        </p>
        <p v-if="error" class="warn" role="alert">
          <strong>{{ $tx(error) }}</strong>
        </p>
        <div v-if="registering" class="form pair">
          <label class="field">{{ $tx("First name") }}<input v-model="firstName" autocomplete="given-name" /></label>
          <label class="field">{{ $tx("Last name") }}<input v-model="lastName" autocomplete="family-name" /></label>
        </div>
        <!-- The demo signs in as "admin", so this is not an email-type input. -->
        <label class="field">
          {{ $tx("Email") }}
          <input
            v-model="email"
            :type="registering ? 'email' : 'text'"
            inputmode="email"
            autocapitalize="none"
            autocomplete="username"
            required
          />
        </label>
        <label class="field">
          {{ $tx("Password") }}
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :autocomplete="registering ? 'new-password' : 'current-password'"
            required
          />
        </label>
        <label class="check"><input v-model="showPassword" type="checkbox" />{{ $tx("Show password") }}</label>
        <button class="btn arrival-submit" type="submit" :disabled="loading">{{ submitLabel }}</button>
        <button v-if="registering || canRegister" type="button" class="link" @click="toggleMode">
          {{ registering ? $tx("I already have an account") : $tx("Create an account") }}
        </button>
      </form>
    </main>
  </div>
</template>

<style>
.arrival {
  background: var(--shelf);
}

.arrival-top {
  justify-content: flex-end !important;
  padding-top: 22px;
  padding-bottom: 0;
}

.arrival-language {
  width: 150px;
}

.arrival-mast {
  padding: 34px var(--gutter) 22px;
}

.arrival-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 28px;
  max-width: 1040px;
  margin: 0 auto;
}

.arrival-name svg {
  width: 150px;
}

.arrival-name p {
  font-size: clamp(56px, 9vw, 108px);
  font-weight: 800;
  line-height: 1;
}

.arrival-shoal {
  flex: none;
  height: 34px;
}

.arrival-mid {
  flex: none;
  height: 24px;
}

.app.arrival > .arrival-main {
  flex: 1 0 auto;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: flex-start;
  gap: 34px 90px;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 56px var(--gutter) 90px;
}

.arrival-line {
  flex: 1 1 300px;
  font-size: 44px;
  font-weight: 700;
  line-height: 1.12;
}

.arrival-form {
  flex: 1 1 300px;
  gap: 18px;
  min-width: 0;
}

.arrival-form .arrival-submit {
  align-self: stretch;
}

.arrival-demo {
  padding: 10px 12px;
  background: var(--shoal);
}

@media (max-width: 700px) {
  .arrival-mast {
    padding-top: 8px;
    padding-bottom: 12px;
  }

  .arrival-name svg {
    width: 88px;
  }

  .app.arrival > .arrival-main {
    gap: 22px;
    padding-top: 26px;
  }

  .arrival-line {
    flex-basis: 100%;
    font-size: 30px;
  }

  .arrival-form {
    flex-basis: 100%;
  }
}
</style>

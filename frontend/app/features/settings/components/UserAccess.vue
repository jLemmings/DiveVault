<script>
import { fetchAuthSettings, fetchUsers, updateAuthSettings } from "~/shared/api/auth.js";
import { requireJson } from "~/shared/api/client.js";
import { userUrl } from "~/shared/api/endpoints.js";
import { parseDate } from "~/shared/utils/core.js";
import { dayMonthLong } from "~/shared/utils/format.js";
import ChartNote from "~/shared/components/chart/ChartNote.vue";
import InviteDialog from "./InviteDialog.vue";
import UserDialog from "./UserDialog.vue";

export default {
  name: "UserAccess",
  components: { ChartNote, InviteDialog, UserDialog },
  props: { api: { type: Object, required: true } },
  data() {
    return {
      users: [],
      ownerId: "",
      registrationOpen: false,
      loaded: false,
      busy: false,
      inviting: false,
      editing: null,
      status: "",
      error: ""
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.error = "";
      try {
        const [settings, list] = await Promise.all([fetchAuthSettings(this.api).then(requireJson), fetchUsers(this.api).then(requireJson)]);
        this.registrationOpen = Boolean(settings?.public_registration_enabled);
        this.ownerId = settings?.owner_user_id || "";
        this.users = Array.isArray(list?.users) ? list.users : [];
        this.loaded = true;
      } catch (error) {
        this.error = error?.message || "Could not load who can sign in.";
      }
    },
    async run(action, message) {
      this.busy = true;
      this.status = "";
      this.error = "";
      try {
        await action();
        this.status = message;
        return true;
      } catch (error) {
        this.error = error?.message || "That change could not be saved.";
        return false;
      } finally {
        this.busy = false;
      }
    },
    async setRegistration(event) {
      const input = event.target;
      const open = input.checked;
      const saved = await this.run(
        async () => requireJson(await updateAuthSettings(this.api, { public_registration_enabled: open })),
        open ? "Anyone can register now." : "Registration is by invitation only."
      );
      if (saved) this.registrationOpen = open;
      else input.checked = this.registrationOpen;
    },
    async setActive(user) {
      const saved = await this.run(
        () =>
          this.api.json(userUrl(user.id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !user.is_active })
          }),
        user.is_active ? "Account deactivated." : "Account reactivated."
      );
      if (saved) await this.load();
    },
    async remove(user) {
      if (!window.confirm(this.$tx("Delete {email} and their data? This cannot be undone.", { email: user.email }))) return;
      const saved = await this.run(() => this.api.json(userUrl(user.id), { method: "DELETE" }), "Account deleted.");
      if (saved) await this.load();
    },
    async accountSaved(message) {
      this.editing = null;
      await this.load();
      this.status = message;
    },
    roleOf(user) {
      if (user.id === this.ownerId) return this.$tx("Owner");
      const role = user.role === "admin" ? this.$tx("Admin") : this.$tx("User");
      return user.is_active ? role : this.$tx("{role}, deactivated", { role });
    },
    lastSeen(user) {
      const date = parseDate(user.last_login_at);
      if (!date) return this.$tx("Never");
      return date.toDateString() === new Date().toDateString() ? this.$tx("Today") : dayMonthLong(user.last_login_at);
    },
    fullName(user) {
      return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
    }
  }
};
</script>

<template>
  <section>
    <chart-note :status="status" :error="error" />
    <div class="pad stack">
      <div class="row between">
        <div>
          <h2 class="h2">{{ $tx("Who can sign in") }}</h2>
          <p class="soft">{{ $tx("Only you see this, as the owner of this DiveVault.") }}</p>
        </div>
        <div class="row">
          <label class="check">
            <input type="checkbox" :checked="registrationOpen" :disabled="!loaded || busy" @change="setRegistration" />{{
              $tx("Anyone can register")
            }}
          </label>
          <button type="button" class="btn line" @click="inviting = true">{{ $tx("Invite someone") }}</button>
          <button type="button" class="link" @click="editing = { user: null }">{{ $tx("Create an account") }}</button>
        </div>
      </div>
      <button v-if="!loaded && error" type="button" class="link" @click="load">{{ $tx("Try again") }}</button>
      <div v-if="loaded" class="scroll">
        <table class="log folds">
          <thead>
            <tr>
              <th>{{ $tx("Name") }}</th>
              <th>{{ $tx("Email") }}</th>
              <th>{{ $tx("Role") }}</th>
              <th>{{ $tx("Last signed in") }}</th>
              <th>
                <span class="sr-only">{{ $tx("Actions") }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="free">
                <strong>{{ fullName(user) }}</strong>
              </td>
              <td class="free" :data-label="$tx('Email')">{{ user.email }}</td>
              <td :data-label="$tx('Role')">{{ roleOf(user) }}</td>
              <td :data-label="$tx('Last signed in')">{{ lastSeen(user) }}</td>
              <td v-if="user.id === ownerId" class="soft">{{ $tx("Can't be removed") }}</td>
              <td v-else class="line-actions">
                <button type="button" class="link" :disabled="busy" @click="editing = { user }">{{ $tx("Edit") }}</button>
                <button type="button" class="link" :disabled="busy" @click="setActive(user)">
                  {{ user.is_active ? $tx("Deactivate") : $tx("Reactivate") }}
                </button>
                <button type="button" class="link" :disabled="busy" @click="remove(user)">{{ $tx("Delete") }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <invite-dialog v-if="inviting" :api="api" @close="inviting = false" />
    <user-dialog v-if="editing" :api="api" :user="editing.user" @close="editing = null" @saved="accountSaved" />
  </section>
</template>

<script>
import { API_ENDPOINTS, userUrl } from "~/shared/api/endpoints.js";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

// Makes an account directly, or edits someone else's.
export default {
  name: "UserDialog",
  components: { ChartDialog, ChartNote },
  props: {
    api: { type: Object, required: true },
    user: { type: Object, default: null }
  },
  emits: ["close", "saved"],
  data() {
    return {
      draft: {
        email: this.user?.email || "",
        first_name: this.user?.first_name || "",
        last_name: this.user?.last_name || "",
        role: this.user?.role || "user",
        password: ""
      },
      saving: false,
      error: ""
    };
  },
  methods: {
    async submit() {
      const { password, ...details } = this.draft;
      this.saving = true;
      this.error = "";
      try {
        await this.api.json(this.user ? userUrl(this.user.id) : API_ENDPOINTS.users, {
          method: this.user ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.user ? details : { ...details, password })
        });
        this.$emit("saved", this.user ? "Account updated." : "Account created.");
      } catch (error) {
        this.error = error?.message || "Could not save the account.";
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<template>
  <chart-dialog :title="user ? $tx('Edit account') : $tx('Create an account')" :busy="saving" @close="$emit('close')">
    <form class="stack" @submit.prevent="submit">
      <div class="form">
        <label class="field">{{ $tx("First name") }}<input v-model.trim="draft.first_name" /></label>
        <label class="field">{{ $tx("Last name") }}<input v-model.trim="draft.last_name" /></label>
        <label class="field">{{ $tx("Email") }}<input v-model.trim="draft.email" type="email" required /></label>
        <label class="field">
          {{ $tx("Role") }}
          <select v-model="draft.role">
            <option value="user">{{ $tx("User") }}</option>
            <option value="admin">{{ $tx("Admin") }}</option>
          </select>
        </label>
        <label v-if="!user" class="field wide">
          {{ $tx("Password, at least 8 characters") }}
          <input v-model="draft.password" type="password" autocomplete="new-password" minlength="8" required />
        </label>
      </div>
      <chart-note :error="error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">
          <template v-if="saving">{{ $tx("Saving…") }}</template>
          <template v-else>{{ user ? $tx("Save account") : $tx("Create an account") }}</template>
        </button>
      </div>
    </form>
  </chart-dialog>
</template>

<script>
import { updatePassword } from "~/shared/api/auth.js";
import { replaceSessionToken } from "~/shared/composables/auth.js";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

export default {
  name: "PasswordDialog",
  components: { ChartDialog, ChartNote },
  props: { api: { type: Object, required: true } },
  emits: ["close"],
  data() {
    return { current: "", next: "", confirmation: "", saving: false, error: "", status: "" };
  },
  beforeUnmount() {
    window.clearTimeout(this.closeTimer);
  },
  methods: {
    async submit() {
      this.error = "";
      this.status = "";
      if (!this.current || !this.next) {
        this.error = "Current password and new password are required.";
        return;
      }
      if (this.next.length < 8) {
        this.error = "New password must be at least 8 characters.";
        return;
      }
      if (this.next !== this.confirmation) {
        this.error = "New password confirmation does not match.";
        return;
      }
      this.saving = true;
      try {
        const response = await updatePassword(this.api, { current_password: this.current, new_password: this.next });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || `API returned ${response.status}`);
        // The backend revokes all other sessions and returns a fresh token.
        replaceSessionToken(payload?.token);
        this.status = "Password updated. Other devices have been signed out.";
        this.closeTimer = window.setTimeout(() => this.$emit("close"), 1400);
      } catch (error) {
        this.error = error?.message || "Could not update the password.";
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<template>
  <chart-dialog
    :title="$tx('Change password')"
    :intro="$tx('Your other devices will be signed out.')"
    :busy="saving"
    @close="$emit('close')"
  >
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ $tx("Current password") }}<input v-model="current" type="password" autocomplete="current-password" /></label>
      <label class="field">{{ $tx("New password") }}<input v-model="next" type="password" autocomplete="new-password" /></label>
      <label class="field"
        >{{ $tx("New password, again") }}<input v-model="confirmation" type="password" autocomplete="new-password"
      /></label>
      <chart-note :status="status" :error="error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Change password") }}</button>
      </div>
    </form>
  </chart-dialog>
</template>

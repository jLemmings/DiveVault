<script>
import { inviteUser } from "~/shared/api/auth.js";
import { requireJson } from "~/shared/api/client.js";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

export default {
  name: "InviteDialog",
  components: { ChartDialog, ChartNote },
  props: { api: { type: Object, required: true } },
  emits: ["close"],
  data() {
    return {
      draft: { email: "", first_name: "", last_name: "", role: "user", expires_in_days: 7 },
      saving: false,
      status: "",
      error: "",
      url: ""
    };
  },
  methods: {
    async submit() {
      this.saving = true;
      this.error = "";
      this.status = "";
      try {
        const email = this.draft.email.trim();
        const payload = await requireJson(await inviteUser(this.api, { ...this.draft, email }));
        const url = String(payload?.invite_url || "");
        this.url = url.startsWith("/") ? `${window.location.origin}${url}` : url;
        this.status = this.$tx("Invitation made for {email}. Send them this link.", { email });
      } catch (error) {
        this.error = error?.message || "Could not create the invitation.";
      } finally {
        this.saving = false;
      }
    },
    async copy() {
      try {
        await navigator.clipboard.writeText(this.url);
        this.status = "Link copied.";
      } catch {
        this.error = "Could not copy the link.";
      }
    }
  }
};
</script>

<template>
  <chart-dialog
    :title="$tx('Invite someone')"
    :intro="$tx('You get a link that works once. DiveVault sends no email.')"
    :busy="saving"
    @close="$emit('close')"
  >
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ $tx("Email") }}<input v-model="draft.email" type="email" required /></label>
      <div class="form">
        <label class="field">{{ $tx("First name") }}<input v-model.trim="draft.first_name" /></label>
        <label class="field">{{ $tx("Last name") }}<input v-model.trim="draft.last_name" /></label>
        <label class="field">
          {{ $tx("Role") }}
          <select v-model="draft.role">
            <option value="user">{{ $tx("User") }}</option>
            <option value="admin">{{ $tx("Admin") }}</option>
          </select>
        </label>
        <label class="field"
          >{{ $tx("Link works for, days") }}<input v-model.number="draft.expires_in_days" type="number" min="1" max="30"
        /></label>
      </div>
      <chart-note :status="status" :error="error" />
      <label v-if="url" class="field">{{ $tx("Invitation link") }}<input :value="url" readonly @focus="$event.target.select()" /></label>
      <div class="row">
        <button class="btn" :class="{ line: url }" type="submit" :disabled="saving">
          {{ saving ? $tx("Saving…") : $tx("Make invitation") }}
        </button>
        <button v-if="url" type="button" class="btn" @click="copy">{{ $tx("Copy link") }}</button>
      </div>
    </form>
  </chart-dialog>
</template>

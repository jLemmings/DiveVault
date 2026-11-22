<script>
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

export default {
  name: "DetailsDialog",
  components: { ChartDialog, ChartNote },
  props: {
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    save: { type: Function, required: true }
  },
  emits: ["close", "saved"],
  data() {
    return { draftName: this.name, draftEmail: this.email, saving: false, error: "" };
  },
  methods: {
    async submit() {
      this.saving = true;
      this.error = "";
      try {
        await this.save({ name: this.draftName.trim(), email: this.draftEmail.trim() });
        this.$emit("saved");
      } catch (error) {
        this.error = error?.message || "Could not save your details.";
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<template>
  <chart-dialog
    :title="$tx('Edit details')"
    :intro="$tx('How you appear in DiveVault. It does not change how you sign in.')"
    :busy="saving"
    @close="$emit('close')"
  >
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ $tx("Name") }}<input v-model="draftName" autocomplete="name" /></label>
      <label class="field">{{ $tx("Email") }}<input v-model="draftEmail" type="email" autocomplete="email" /></label>
      <chart-note :error="error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save details") }}</button>
      </div>
    </form>
  </chart-dialog>
</template>

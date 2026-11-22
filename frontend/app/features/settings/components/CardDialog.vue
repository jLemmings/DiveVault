<script>
import { newEntryId } from "~/shared/utils/settings-profile.js";
import ChartDialog from "~/shared/components/chart/ChartDialog.vue";
import ChartNote from "~/shared/components/chart/ChartNote.vue";

export default {
  name: "CardDialog",
  components: { ChartDialog, ChartNote },
  props: {
    card: { type: Object, default: null },
    hasPdf: Boolean,
    saving: Boolean,
    error: { type: String, default: "" }
  },
  emits: ["close", "save", "remove", "attach"],
  data() {
    const value = (key) => this.card?.[key] || "";
    return {
      problem: "",
      draft: {
        id: this.card?.id || newEntryId("license"),
        certification_name: value("certification_name"),
        company: value("company"),
        student_number: value("student_number"),
        certification_date: value("certification_date"),
        instructor_number: value("instructor_number")
      }
    };
  },
  methods: {
    submit() {
      if (!this.draft.certification_name.trim() && !this.draft.company.trim()) {
        this.problem = "Enter the certification or the agency.";
        return;
      }
      this.problem = "";
      this.$emit("save", { ...this.draft });
    }
  }
};
</script>

<template>
  <chart-dialog :title="card ? $tx('Edit card') : $tx('Add a card')" :busy="saving" @close="$emit('close')">
    <form class="stack" @submit.prevent="submit">
      <label class="field">{{ $tx("Certification") }}<input v-model="draft.certification_name" /></label>
      <div class="form">
        <label class="field">{{ $tx("Agency") }}<input v-model="draft.company" placeholder="PADI, SSI, CMAS" /></label>
        <label class="field">{{ $tx("Diver number") }}<input v-model="draft.student_number" /></label>
        <label class="field">{{ $tx("Instructor number") }}<input v-model="draft.instructor_number" /></label>
        <label class="field">
          {{ $tx("Certified on") }}
          <input
            v-model="draft.certification_date"
            :type="!draft.certification_date || /^\d{4}-\d{2}-\d{2}$/.test(draft.certification_date) ? 'date' : 'text'"
          />
        </label>
      </div>
      <p v-if="!card" class="soft small">{{ $tx("Save the card, then attach its PDF.") }}</p>
      <chart-note :error="problem || error" />
      <div class="row">
        <button class="btn" type="submit" :disabled="saving">{{ saving ? $tx("Saving…") : $tx("Save card") }}</button>
        <button v-if="card" type="button" class="link" :disabled="saving" @click="$emit('attach', card)">
          {{ hasPdf ? $tx("Replace PDF") : $tx("Attach PDF") }}
        </button>
        <button v-if="card" type="button" class="link" :disabled="saving" @click="$emit('remove', card)">{{ $tx("Remove") }}</button>
      </div>
    </form>
  </chart-dialog>
</template>

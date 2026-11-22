<script>
import { equipmentTitle, serviceWarning } from "~/shared/utils/equipment-dive.js";
import KitList from "./KitList.vue";

// One line for the usual answer, and the whole list only when someone wants to choose.
export default {
  name: "KitField",
  components: { KitList },
  props: {
    equipment: { type: Array, required: true },
    selected: { type: Array, required: true },
    usual: { type: Array, required: true },
    date: { type: String, default: "" }
  },
  emits: ["change"],
  data() {
    return { choosing: false };
  },
  computed: {
    isUsual() {
      return (
        this.usual.length > 0 &&
        this.usual.length === this.selected.length &&
        this.usual.every((id) => this.selected.map(String).includes(id))
      );
    },
    answer() {
      if (this.choosing) return "choose";
      if (!this.selected.length) return "none";
      return this.isUsual ? "usual" : "choose";
    },
    warnings() {
      return this.equipment
        .filter((item) => this.selected.map(String).includes(String(item.id)))
        .map((item) => ({ id: item.id, title: equipmentTitle(item), text: serviceWarning(item, this.date) }))
        .filter((entry) => entry.text);
    }
  },
  methods: {
    answerWith(value) {
      this.choosing = value === "choose";
      if (value === "usual") this.$emit("change", [...this.usual]);
      if (value === "none") this.$emit("change", []);
    }
  }
};
</script>

<template>
  <div>
    <label class="field">
      {{ $tx("Kit") }}
      <select :value="answer" @change="answerWith($event.target.value)">
        <option v-if="usual.length" value="usual">{{ $tn(usual.length, "Usual kit, {count} item", "Usual kit, {count} items") }}</option>
        <option value="none">{{ $tx("No gear") }}</option>
        <option v-if="equipment.length" value="choose">{{ $tx("Choose gear") }}</option>
      </select>
    </label>
    <kit-list v-if="answer === 'choose'" :equipment="equipment" :selected="selected" :date="date" @change="$emit('change', $event)" />
    <template v-else>
      <p v-for="warning in warnings" :key="warning.id" class="warn small">{{ warning.title }}: {{ $tx(warning.text) }}</p>
    </template>
  </div>
</template>

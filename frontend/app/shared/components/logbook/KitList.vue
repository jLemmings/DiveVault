<script>
import { equipmentTitle, serviceWarning } from "~/shared/utils/equipment-dive.js";

export default {
  name: "KitList",
  props: {
    equipment: { type: Array, required: true },
    selected: { type: Array, required: true },
    date: { type: String, default: "" }
  },
  emits: ["change"],
  computed: {
    items() {
      return [...this.equipment]
        .map((item) => ({ id: String(item.id), title: equipmentTitle(item), usual: Boolean(item.is_default || item.is_standard), item }))
        .sort((left, right) => right.usual - left.usual || left.title.localeCompare(right.title));
    }
  },
  methods: {
    chosen(id) {
      return this.selected.map(String).includes(id);
    },
    warning(item) {
      return serviceWarning(item, this.date);
    },
    toggle(id) {
      const current = this.selected.map(String);
      this.$emit("change", current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
    }
  }
};
</script>

<template>
  <div>
    <label v-for="entry in items" :key="entry.id" class="check">
      <input type="checkbox" :checked="chosen(entry.id)" @change="toggle(entry.id)" />
      <span>
        {{ entry.title || $tx("Unnamed gear") }}
        <span v-if="chosen(entry.id) && warning(entry.item)" class="warn kit-warning">{{ $tx(warning(entry.item)) }}</span>
      </span>
    </label>
    <p v-if="!items.length" class="soft">{{ $tx("Gear you add under Gear can be ticked here.") }}</p>
  </div>
</template>

<style>
.kit-warning {
  margin-left: 6px;
}
</style>

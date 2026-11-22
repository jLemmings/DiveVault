<script>
// Looks like a select, but several names can be ticked.
export default {
  name: "FilterMenu",
  props: {
    label: { type: String, required: true },
    all: { type: String, required: true },
    options: { type: Array, required: true },
    modelValue: { type: Array, required: true }
  },
  emits: ["update:modelValue"],
  computed: {
    summary() {
      if (!this.modelValue.length) return this.all;
      return this.modelValue.length === 1 ? this.modelValue[0] : this.$tx("{count} chosen", { count: this.modelValue.length });
    }
  },
  mounted() {
    document.addEventListener("pointerdown", this.closeFromOutside);
  },
  beforeUnmount() {
    document.removeEventListener("pointerdown", this.closeFromOutside);
  },
  methods: {
    closeFromOutside(event) {
      if (!this.$refs.menu?.contains(event.target)) this.$refs.menu?.removeAttribute("open");
    },
    closeFromKeyboard() {
      this.$refs.menu.removeAttribute("open");
      this.$refs.summary.focus();
    },
    closeWhenLeft(event) {
      if (event.relatedTarget && !this.$refs.menu.contains(event.relatedTarget)) this.$refs.menu.removeAttribute("open");
    },
    toggle(value) {
      const next = this.modelValue.includes(value) ? this.modelValue.filter((entry) => entry !== value) : [...this.modelValue, value];
      this.$emit("update:modelValue", next);
    }
  }
};
</script>

<template>
  <div class="field filter">
    <span aria-hidden="true">{{ label }}</span>
    <details ref="menu" @keydown.esc="closeFromKeyboard" @focusout="closeWhenLeft">
      <summary ref="summary" :aria-label="`${label}: ${summary}`">
        <span>{{ summary }}</span>
      </summary>
      <div class="filter-options">
        <label class="check"
          ><input type="checkbox" :checked="!modelValue.length" @change="$emit('update:modelValue', [])" />{{ all }}</label
        >
        <label v-for="option in options" :key="option" class="check">
          <input type="checkbox" :checked="modelValue.includes(option)" @change="toggle(option)" />{{ option }}
        </label>
      </div>
    </details>
  </div>
</template>

<style>
.filter details {
  position: relative;
}

.filter summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--soft);
  border-radius: 3px;
  background: var(--deep);
  color: var(--ink);
  font-size: 18px;
  font-weight: 500;
  list-style: none;
  cursor: pointer;
}

.filter summary::-webkit-details-marker {
  display: none;
}

.filter summary span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter summary::after {
  flex: none;
  width: 8px;
  height: 8px;
  margin: -4px 4px 0 0;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  content: "";
  transform: rotate(45deg);
}

.filter-options {
  position: absolute;
  z-index: 700;
  top: calc(100% + 2px);
  right: 0;
  min-width: 100%;
  width: max-content;
  max-width: min(300px, calc(100vw - 36px));
  max-height: 300px;
  padding: 4px 12px;
  overflow-y: auto;
  border: 1px solid var(--soft);
  border-radius: 3px;
  background: var(--deep);
  color: var(--ink);
  font-size: 17px;
}
</style>

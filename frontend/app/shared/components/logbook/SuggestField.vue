<script>
let nextId = 0;

// A text field that offers saved names. Anything else can still be typed.
export default {
  name: "SuggestField",
  props: {
    modelValue: { type: String, default: "" },
    label: { type: String, required: true },
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: "" },
    need: Boolean,
    detail: { type: Function, default: null }
  },
  emits: ["update:modelValue"],
  data() {
    nextId += 1;
    return { listId: `suggestions-${nextId}`, open: false, highlighted: -1 };
  },
  computed: {
    matches() {
      const query = this.modelValue.trim().toLowerCase();
      return this.options.filter((option) => {
        const name = String(option?.name || "").trim();
        if (!name) return false;
        if (name.toLowerCase() === query && this.highlighted < 0) return false;
        return !query || `${name} ${this.detail?.(option) || ""}`.toLowerCase().includes(query);
      });
    },
    showList() {
      return this.open && this.matches.length > 0;
    }
  },
  methods: {
    type(event) {
      this.highlighted = -1;
      this.open = true;
      this.$emit("update:modelValue", event.target.value);
    },
    choose(option) {
      this.close();
      this.$emit("update:modelValue", option.name.trim());
    },
    close() {
      this.open = false;
      this.highlighted = -1;
    },
    async move(step) {
      this.open = true;
      const count = this.matches.length;
      if (!count) return;
      const from = this.highlighted < 0 && step < 0 ? 0 : this.highlighted;
      this.highlighted = (from + step + count) % count;
      await this.$nextTick();
      this.$refs.list?.children[this.highlighted]?.scrollIntoView({ block: "nearest" });
    },
    confirm(event) {
      if (!this.showList || this.highlighted < 0) return;
      event.preventDefault();
      this.choose(this.matches[this.highlighted]);
    }
  }
};
</script>

<template>
  <div class="suggest">
    <label class="field" :class="{ need }">
      {{ label }}
      <input
        :value="modelValue"
        :placeholder="placeholder"
        :required="need"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-expanded="showList"
        :aria-controls="showList ? listId : undefined"
        :aria-activedescendant="showList && highlighted >= 0 ? `${listId}-${highlighted}` : undefined"
        @focus="open = true"
        @click="open = true"
        @blur="close"
        @input="type"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter="confirm"
        @keydown.esc="close"
      />
    </label>
    <ul v-if="showList" :id="listId" ref="list" class="suggest-list" role="listbox" :aria-label="label">
      <li
        v-for="(option, index) in matches"
        :id="`${listId}-${index}`"
        :key="option.id || option.name"
        role="option"
        :aria-selected="index === highlighted"
        @mousedown.prevent
        @click="choose(option)"
      >
        <span>{{ option.name }}</span>
        <span v-if="detail?.(option)" class="soft small">{{ detail(option) }}</span>
      </li>
    </ul>
  </div>
</template>

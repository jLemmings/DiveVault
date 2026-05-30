function normalizeOptionName(option) {
  return typeof option?.name === "string" ? option.name.trim() : "";
}

export default {
  name: "MetadataAutocompleteField",
  props: {
    modelValue: {
      type: String,
      default: ""
    },
    options: {
      type: Array,
      default: () => []
    },
    placeholder: {
      type: String,
      default: ""
    },
    inputClass: {
      type: String,
      default: ""
    },
    emptyMessage: {
      type: String,
      default: "No matching saved entries."
    },
    optionDetail: {
      type: Function,
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ["update:modelValue"],
  data() {
    return {
      isOpen: false,
      highlightedIndex: -1,
      closeTimer: null
    };
  },
  computed: {
    normalizedOptions() {
      if (!Array.isArray(this.options)) return [];
      return this.options.filter((option) => normalizeOptionName(option));
    },
    query() {
      return typeof this.modelValue === "string" ? this.modelValue.trim().toLowerCase() : "";
    },
    filteredOptions() {
      if (!this.query) return this.normalizedOptions;
      return this.normalizedOptions.filter((option) => {
        const name = normalizeOptionName(option).toLowerCase();
        const detail = this.optionDetailText(option).toLowerCase();
        return name.includes(this.query) || detail.includes(this.query);
      });
    },
    showMenu() {
      return this.isOpen && this.normalizedOptions.length > 0;
    }
  },
  beforeUnmount() {
    this.clearCloseTimer();
  },
  methods: {
    clearCloseTimer() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    },
    optionKey(option, index) {
      return option?.id ?? `${normalizeOptionName(option)}-${index}`;
    },
    optionDetailText(option) {
      if (typeof this.optionDetail !== "function") return "";
      const value = this.optionDetail(option);
      return typeof value === "string" ? value : "";
    },
    ensureHighlight() {
      if (!this.filteredOptions.length) {
        this.highlightedIndex = -1;
        return;
      }
      if (this.highlightedIndex < 0 || this.highlightedIndex >= this.filteredOptions.length) {
        this.highlightedIndex = 0;
      }
    },
    openMenu() {
      if (this.disabled || !this.normalizedOptions.length) return;
      this.clearCloseTimer();
      this.isOpen = true;
      this.ensureHighlight();
    },
    toggleMenu() {
      if (this.disabled || !this.normalizedOptions.length) return;
      this.clearCloseTimer();
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        this.ensureHighlight();
        this.$nextTick(() => {
          this.$refs.input?.focus();
        });
      }
    },
    scheduleClose() {
      this.clearCloseTimer();
      this.closeTimer = setTimeout(() => {
        this.isOpen = false;
        this.highlightedIndex = -1;
      }, 120);
    },
    handleInput(event) {
      this.$emit("update:modelValue", event.target.value);
      this.isOpen = this.normalizedOptions.length > 0;
      this.highlightedIndex = 0;
    },
    moveHighlight(step) {
      if (!this.filteredOptions.length) {
        this.highlightedIndex = -1;
        return;
      }
      if (this.highlightedIndex < 0) {
        this.highlightedIndex = 0;
        return;
      }
      const nextIndex = this.highlightedIndex + step;
      if (nextIndex < 0) {
        this.highlightedIndex = this.filteredOptions.length - 1;
        return;
      }
      if (nextIndex >= this.filteredOptions.length) {
        this.highlightedIndex = 0;
        return;
      }
      this.highlightedIndex = nextIndex;
    },
    handleKeydown(event) {
      if (!this.normalizedOptions.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.isOpen = true;
        this.moveHighlight(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.isOpen = true;
        this.moveHighlight(-1);
        return;
      }
      if (event.key === "Enter" && this.isOpen && this.highlightedIndex >= 0 && this.filteredOptions[this.highlightedIndex]) {
        event.preventDefault();
        this.selectOption(this.filteredOptions[this.highlightedIndex]);
        return;
      }
      if (event.key === "Escape") {
        this.isOpen = false;
        this.highlightedIndex = -1;
      }
    },
    selectOption(option) {
      const name = normalizeOptionName(option);
      if (!name) return;
      this.$emit("update:modelValue", name);
      this.isOpen = false;
      this.highlightedIndex = -1;
      this.$nextTick(() => {
        this.$refs.input?.focus();
      });
    }
  },
  template: `
    <div class="metadata-autocomplete" @focusout="scheduleClose">
      <div class="metadata-autocomplete-input-shell">
        <input
          ref="input"
          :value="modelValue"
          :disabled="disabled"
          :placeholder="placeholder"
          :class="inputClass"
          autocomplete="off"
          @focus="openMenu"
          @input="handleInput"
          @keydown="handleKeydown"
        />
        <button
          v-if="normalizedOptions.length"
          type="button"
          class="metadata-autocomplete-toggle"
          :disabled="disabled"
          @mousedown.prevent
          @click="toggleMenu"
        >
          <span class="material-symbols-outlined text-[18px]">{{ showMenu ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}</span>
        </button>
      </div>
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="translate-y-[-4px] opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-[-4px] opacity-0"
      >
        <div v-if="showMenu" class="metadata-autocomplete-menu">
          <button
            v-for="(option, index) in filteredOptions"
            :key="optionKey(option, index)"
            type="button"
            class="metadata-autocomplete-option"
            :class="{ 'is-active': index === highlightedIndex }"
            @mousedown.prevent
            @click="selectOption(option)"
          >
            <span class="metadata-autocomplete-option-label">{{ option.name }}</span>
            <span v-if="optionDetailText(option)" class="metadata-autocomplete-option-detail">{{ optionDetailText(option) }}</span>
          </button>
          <div v-if="!filteredOptions.length" class="metadata-autocomplete-empty">{{ emptyMessage }}</div>
        </div>
      </transition>
    </div>
  `
};

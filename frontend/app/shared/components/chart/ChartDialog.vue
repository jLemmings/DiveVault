<script>
import TideLine from "./TideLine.vue";

let nextId = 0;

// A native modal dialog: the browser supplies the focus trap, Escape and the inert background.
export default {
  name: "ChartDialog",
  components: { TideLine },
  props: {
    title: { type: String, required: true },
    intro: { type: String, default: "" },
    wide: Boolean,
    busy: Boolean
  },
  emits: ["close"],
  data() {
    nextId += 1;
    return { headingId: `sheet-title-${nextId}` };
  },
  mounted() {
    this.opener = document.activeElement;
    this.$refs.dialog.showModal();
    this.$refs.dialog.querySelector(".sheet-body input, .sheet-body select, .sheet-body textarea")?.focus();
  },
  beforeUnmount() {
    this.$refs.dialog.close();
    this.opener?.focus?.();
  },
  methods: {
    requestClose() {
      if (!this.busy) this.$emit("close");
    }
  }
};
</script>

<template>
  <dialog ref="dialog" class="sheet" :class="{ wide }" :aria-labelledby="headingId" @cancel.prevent="requestClose">
    <header class="sheet-head">
      <div>
        <h2 :id="headingId" class="h2">{{ title }}</h2>
        <p v-if="intro" class="soft">{{ intro }}</p>
      </div>
      <button type="button" class="link" :disabled="busy" @click="requestClose">{{ $tx("Close") }}</button>
    </header>
    <tide-line />
    <div class="sheet-body pad stack">
      <slot></slot>
    </div>
  </dialog>
</template>

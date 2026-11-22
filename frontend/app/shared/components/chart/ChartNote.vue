<script>
export default {
  name: "ChartNote",
  props: { status: { type: String, default: "" }, error: { type: String, default: "" } },
  watch: {
    // The message can be above the button that caused it, so it comes into view.
    async error(value) {
      if (!value) return;
      await this.$nextTick();
      this.$refs.error?.scrollIntoView({ block: "nearest" });
    },
    async status(value) {
      if (!value) return;
      await this.$nextTick();
      this.$refs.status?.scrollIntoView({ block: "nearest" });
    }
  }
};
</script>

<template>
  <p v-if="error" ref="error" class="note bad" role="alert">{{ $tx(error) }}</p>
  <div v-else-if="status" ref="status" class="note" role="status">
    <p>{{ $tx(status) }}</p>
    <slot></slot>
  </div>
</template>

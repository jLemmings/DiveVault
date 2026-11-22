// Drawings are laid out in real pixels, so their type never shrinks with the screen.
export const measured = {
  data() {
    return { width: 1280 };
  },
  mounted() {
    this.measure();
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.$el);
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
  },
  methods: {
    measure() {
      const width = Math.round(this.$el?.getBoundingClientRect?.().width || 0);
      if (width) this.width = width;
    }
  }
};

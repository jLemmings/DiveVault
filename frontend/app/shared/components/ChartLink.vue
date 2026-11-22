<script>
import { useRouter } from "#app";

// A real link, so it can be opened in a new tab. The caller decides aria-current, as several paths share a page.
export default {
  name: "ChartLink",
  props: { to: { type: String, required: true } },
  setup() {
    return { router: useRouter() };
  },
  computed: {
    href() {
      return this.router.resolve(this.to).href;
    }
  },
  methods: {
    follow(event) {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      this.router.push(this.to);
    }
  }
};
</script>

<template>
  <a :href="href" @click="follow"><slot></slot></a>
</template>

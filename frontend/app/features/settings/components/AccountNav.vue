<script>
import { PATHS } from "~/routing/routes.js";
import ChartLink from "~/shared/components/ChartLink.vue";

export default {
  name: "AccountNav",
  components: { ChartLink },
  props: { current: { type: String, required: true } },
  data() {
    return { paths: PATHS };
  }
};
</script>

<template>
  <nav class="shoal row account-nav" :aria-label="$tx('Your account')">
    <chart-link class="link" :to="paths.diver" :aria-current="current === 'diver' ? 'page' : undefined">{{
      $tx("You and your people")
    }}</chart-link>
    <chart-link class="link" :to="paths.application" :aria-current="current === 'application' ? 'page' : undefined">
      {{ $tx("Application, data and access") }}
    </chart-link>
  </nav>
</template>

<style>
.account-nav {
  flex: none;
  gap: 4px 32px;
  padding: 4px var(--gutter) 10px;
}
</style>

<script>
import { depthSeries } from "~/shared/utils/core.js";
import { chartFloor, profilePath } from "~/shared/utils/depth.js";
import { maxDepthOf } from "~/shared/utils/logbook.js";

export default {
  name: "ProfileThumb",
  props: { dive: { type: Object, required: true }, now: Boolean },
  computed: {
    floor() {
      return chartFloor([maxDepthOf(this.dive)], 35);
    },
    depthScale() {
      return 84 / this.floor;
    },
    path() {
      return profilePath(depthSeries(this.dive), {
        start: 4,
        length: 102,
        depthScale: this.depthScale,
        duration: this.dive.duration_seconds,
        limit: 30
      });
    },
    reach() {
      return (maxDepthOf(this.dive) || 0) * this.depthScale;
    }
  }
};
</script>

<template>
  <svg class="thumb" viewBox="0 0 110 84" width="110" height="84" aria-hidden="true">
    <rect class="b1" width="110" :height="5 * depthScale" />
    <rect class="b2" width="110" :y="5 * depthScale" :height="13 * depthScale" />
    <rect class="b4" width="110" :y="18 * depthScale" :height="84 - 18 * depthScale" />
    <path v-if="path" class="profile" :class="{ now }" :d="path" />
    <template v-else>
      <path class="trace dash" :class="{ now }" :d="`M55 0V${reach}`" />
      <path :class="now ? 'f-act' : 'f-ink'" :d="`M55 ${reach - 6}l6 6-6 6-6-6Z`" />
    </template>
  </svg>
</template>

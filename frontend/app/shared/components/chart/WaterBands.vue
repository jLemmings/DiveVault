<script>
import { DEPTH_BOUNDARIES, depthBands } from "~/shared/utils/depth.js";

// The depth bands behind a drawing. Sideways is the phone logbook, where depth runs left to right.
export default {
  name: "WaterBands",
  props: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    floor: { type: Number, required: true },
    sideways: Boolean,
    labelled: { type: Boolean, default: true },
    fontSize: { type: Number, default: 15 },
    // On a narrow drawing only the deepest label carries the unit.
    terse: Boolean
  },
  computed: {
    depthSize() {
      return this.sideways ? this.width : this.height;
    },
    bands() {
      return depthBands(this.depthSize, this.floor).map((band) => ({
        className: band.className,
        x: this.sideways ? band.start : 0,
        y: this.sideways ? 0 : band.start,
        width: this.sideways ? band.size : this.width,
        height: this.sideways ? this.height : band.size
      }));
    },
    labels() {
      if (!this.labelled) return [];
      let taken = 0;
      return DEPTH_BOUNDARIES.map((depth) => ({ depth, at: (depth / this.floor) * this.depthSize })).filter((label) => {
        const room = this.sideways ? this.fontSize * 2.3 : this.fontSize + 2;
        if (label.at > this.depthSize || label.at - taken < room * 0.6) return false;
        taken = label.at;
        return true;
      });
    }
  }
};
</script>

<template>
  <g aria-hidden="true">
    <rect
      v-for="band in bands"
      :key="band.className"
      :class="band.className"
      :x="band.x"
      :y="band.y"
      :width="band.width"
      :height="band.height"
    />
    <text
      v-for="label in labels"
      :key="label.depth"
      class="t-soft"
      :font-size="fontSize"
      :x="sideways ? label.at + 2 : fontSize * 0.6"
      :y="sideways ? fontSize + 1 : label.at - 5"
    >
      {{ terse && label !== labels[labels.length - 1] ? label.depth : `${label.depth} m` }}
    </text>
  </g>
</template>

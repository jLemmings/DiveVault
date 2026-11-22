<script>
import { depthSeries, importDraftSeed, isManualDive } from "~/shared/utils/core.js";
import { chartFloor, profilePath } from "~/shared/utils/depth.js";
import { dayMonth, metres, minutes } from "~/shared/utils/format.js";
import { maxDepthOf, newestFirst, siteOf } from "~/shared/utils/logbook.js";
import WaterBands from "./WaterBands.vue";
import { measured } from "./measured.js";

const DIAMOND = 9;
const PHONE_ROW = 100;
const PHONE_DEPTH_WIDTH = 140;
const PHONE_TEXT_X = 150;

// The signature drawing: recent dives hang from the waterline as their recorded profiles.
// A dive without samples gets a plumb line to its greatest depth, never an invented curve.
export default {
  name: "HangingDives",
  components: { WaterBands },
  mixins: [measured],
  props: {
    dives: { type: Array, required: true },
    // The public endpoint carries no samples, so every dive there is a plumb line.
    plumb: Boolean
  },
  emits: ["open"],
  computed: {
    isPhone() {
      return this.width <= 700;
    },
    capacity() {
      return this.isPhone ? 5 : Math.min(8, Math.max(3, Math.floor(this.width / 152)));
    },
    shown() {
      const latest = newestFirst(this.dives).slice(0, this.capacity);
      return this.isPhone ? latest : latest.reverse();
    },
    height() {
      if (this.isPhone) return Math.max(220, 20 + this.shown.length * PHONE_ROW);
      return this.plumb ? 330 : 352;
    },
    floor() {
      return chartFloor(this.shown.map(maxDepthOf), this.isPhone ? 35 : 39);
    },
    // On a phone the deep band carries on under the words, so the bands only span the profiles.
    bandWidth() {
      return this.isPhone ? PHONE_DEPTH_WIDTH : this.width;
    },
    depthScale() {
      return (this.isPhone ? PHONE_DEPTH_WIDTH : this.height) / this.floor;
    },
    marks() {
      const count = this.shown.length;
      // A short logbook keeps its dives a full slot apart rather than stretching them across the sea.
      const slot = (this.width - 70) / this.capacity;
      const first = count < this.capacity ? 60 : 54;
      const longest = Math.max(...this.shown.map((dive) => dive.duration_seconds || 0), 1);
      return this.shown.map((dive, index) => {
        const along = this.isPhone ? 22 + index * PHONE_ROW : first + index * slot;
        const span = this.isPhone ? 86 : slot * (0.72 + 0.14 * Math.min(1, (dive.duration_seconds || 0) / longest));
        const depth = maxDepthOf(dive) || 0;
        const reach = depth * this.depthScale;
        const path = this.plumb
          ? ""
          : profilePath(depthSeries(dive), {
              start: along,
              length: span,
              depthScale: this.depthScale,
              duration: dive.duration_seconds,
              vertical: this.isPhone
            });
        const site = siteOf(dive) || this.$tx("No site");
        const buddy = importDraftSeed(dive).buddy.trim();
        const manual = isManualDive(dive);
        const isLatest = this.isPhone ? index === 0 : index === count - 1;
        const big = !this.plumb && isLatest && !this.isPhone;
        const room = this.isPhone ? this.width - PHONE_TEXT_X - 14 : slot - 10;
        const characters = Math.max(6, Math.floor(room / ((this.isPhone ? 21 : big ? 22 : 18) * 0.46)));
        const when = dayMonth(dive.started_at);
        return {
          id: dive.id,
          latest: isLatest,
          big,
          path,
          plumb: this.plumbShapes(along + span / 2, reach),
          byHand: manual && !this.plumb && !path && reach > 60,
          handX: along + span / 2 + 10,
          handY: reach * 0.56,
          hit: this.isPhone
            ? { x: 0, y: along - 8, width: this.width, height: PHONE_ROW }
            : { x: along - 6, y: 0, width: slot, height: this.height },
          site: site.length > characters ? `${site.slice(0, characters - 1).trimEnd()}…` : site,
          summary: [site, when, metres(maxDepthOf(dive)), minutes(dive.duration_seconds)].join(", "),
          x: this.isPhone ? PHONE_TEXT_X : path ? along + 4 : along + span / 2,
          y: this.isPhone ? along + 30 : Math.min(reach + 28, this.height - 24),
          anchor: !this.isPhone && !path ? "middle" : "start",
          figures: this.isPhone
            ? `${metres(maxDepthOf(dive))}, ${minutes(dive.duration_seconds)}`
            : this.plumb
              ? metres(maxDepthOf(dive))
              : `${when}, ${metres(maxDepthOf(dive))}`,
          context: manual
            ? this.$tx("{date}, logged by hand", { date: when })
            : buddy
              ? this.$tx("{date} with {buddy}", { date: when, buddy })
              : when,
          rule: this.isPhone && index < count - 1 ? along + PHONE_ROW - 7 : null
        };
      });
    }
  },
  methods: {
    plumbShapes(along, reach) {
      const d = DIAMOND;
      if (this.isPhone) {
        return {
          line: `M0 ${along}H${reach}`,
          weight: `M${reach - d} ${along}L${reach} ${along - d} ${reach + d} ${along} ${reach} ${along + d}Z`
        };
      }
      return {
        line: `M${along} 0V${reach}`,
        weight: `M${along} ${reach - d}L${along + d} ${reach} ${along} ${reach + d} ${along - d} ${reach}Z`
      };
    }
  }
};
</script>

<template>
  <div class="drawing">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :height="height"
      role="group"
      :aria-label="plumb ? $tx('Plumb lines to the deepest point of recent dives') : $tx('Recent dives hanging from the surface by depth')"
    >
      <rect class="b4" :width="width" :height="height" />
      <water-bands
        :width="bandWidth"
        :height="height"
        :floor="floor"
        :sideways="isPhone"
        :labelled="!plumb"
        :font-size="isPhone ? 13 : 15"
      />
      <g
        v-for="mark in marks"
        :key="mark.id"
        class="dive-mark"
        role="button"
        tabindex="0"
        :aria-label="mark.summary"
        @click="$emit('open', mark.id)"
        @keydown.enter.prevent="$emit('open', mark.id)"
        @keydown.space.prevent="$emit('open', mark.id)"
      >
        <rect :x="mark.hit.x" :y="mark.hit.y" :width="mark.hit.width" :height="mark.hit.height" fill="transparent" />
        <path v-if="mark.path" class="profile" :class="{ now: mark.latest }" :d="mark.path" />
        <template v-else>
          <path class="trace" :class="{ now: mark.latest, dash: !plumb }" :d="mark.plumb.line" />
          <path :class="mark.latest ? 'f-act' : 'f-ink'" :d="mark.plumb.weight" />
          <text v-if="mark.byHand && !isPhone" class="t-soft" :x="mark.handX" :y="mark.handY" font-size="15">{{ $tx("by hand") }}</text>
        </template>
        <text
          class="t-site"
          :class="{ 't-act': mark.latest }"
          :x="mark.x"
          :y="mark.y"
          :text-anchor="mark.anchor"
          :font-size="isPhone ? 21 : mark.big ? 22 : 18"
        >
          {{ mark.site }}
        </text>
        <text
          :class="isPhone || plumb ? '' : mark.latest ? 't-act' : 't-soft'"
          :x="mark.x"
          :y="mark.y + (isPhone ? 22 : 18)"
          :text-anchor="mark.anchor"
          :font-size="isPhone ? 16 : 15"
        >
          {{ mark.figures }}
        </text>
        <text v-if="isPhone" class="t-soft" :x="mark.x" :y="mark.y + 42" font-size="16">{{ mark.context }}</text>
        <path v-if="mark.rule" class="contour" :d="`M${mark.x} ${mark.rule}H${width - 16}`" />
      </g>
    </svg>
  </div>
</template>

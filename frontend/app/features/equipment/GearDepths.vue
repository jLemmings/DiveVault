<script>
import { measured } from "~/shared/components/chart/measured.js";
import { gearDrawing } from "./gear-drawings.js";

const HEIGHT = 390;
const DUE = 290;

// Gear sinks as its service gets closer. Below the line it is overdue.
export default {
  name: "GearDepths",
  mixins: [measured],
  props: { rows: { type: Array, required: true } },
  emits: ["open"],
  data() {
    return { height: HEIGHT, due: DUE };
  },
  computed: {
    isPhone() {
      return this.width <= 700;
    },
    capacity() {
      return this.isPhone ? 3 : Math.max(3, Math.floor((this.width - 80) / 190));
    },
    hung() {
      const slot = this.isPhone ? this.width / this.capacity : (this.width - 64) / this.capacity;
      const first = this.isPhone ? slot / 2 : Math.min(150, slot * 0.7);
      return this.rows.slice(0, this.capacity).map((row, index) => {
        const drawing = gearDrawing(row.item);
        const { status, urgency } = row.service;
        let top = 28 + urgency * (DUE - 92 - drawing.height / 2);
        if (status === "overdue") top = DUE + 4;
        else if (status === "untracked") top = -4;
        else if (status === "unknown") top = 14;
        const x = first + index * slot;
        const urgent = status === "overdue";
        const room = this.isPhone ? slot - 4 : slot - 48;
        const limit = Math.max(6, Math.floor(room / 10.5));
        const below = top + drawing.height;
        // Wide pieces at the surface, such as fins, have their words underneath.
        const under = this.isPhone || status === "untracked";
        return {
          id: row.id,
          urgent,
          path: drawing.d,
          x,
          top,
          line: top > 0 ? `M${x} 0V${top}` : "",
          name: row.short.length > limit ? `${row.short.slice(0, limit - 1)}…` : row.short,
          note: row.note,
          summary: `${row.short}, ${row.note}`,
          textX: this.isPhone ? x : under ? x - 30 : x + 37,
          textY: under ? Math.min(HEIGHT - 22, below + (this.isPhone ? 18 : 24)) : Math.max(22, top + drawing.height / 2),
          anchor: this.isPhone ? "middle" : "start"
        };
      });
    }
  }
};
</script>

<template>
  <div class="drawing">
    <svg :viewBox="`0 0 ${width} ${height}`" :height="height" role="group" :aria-label="$tx('Gear hanging by how close its service is')">
      <rect class="b1" :width="width" height="90" />
      <rect class="b2" y="90" :width="width" height="110" />
      <rect class="b3" y="200" :width="width" height="90" />
      <rect class="b4" :y="due" :width="width" :height="height - due" />
      <path class="trace bad dash" :d="`M0 ${due}H${width}`" />
      <text class="t-warn" :x="width - 16" :y="isPhone ? due + 18 : due - 8" text-anchor="end" font-size="16" font-weight="700">
        {{ $tx("Service due") }}
      </text>
      <g
        v-for="piece in hung"
        :key="piece.id"
        class="dive-mark"
        role="button"
        tabindex="0"
        :aria-label="piece.summary"
        @click="$emit('open', piece.id)"
        @keydown.enter.prevent="$emit('open', piece.id)"
        @keydown.space.prevent="$emit('open', piece.id)"
      >
        <path v-if="piece.line" class="trace" :class="{ bad: piece.urgent }" :d="piece.line" />
        <path
          class="profile"
          :class="{ bad: piece.urgent }"
          fill-rule="evenodd"
          :transform="`translate(${piece.x} ${piece.top})`"
          :d="piece.path"
        />
        <text
          :class="{ 't-warn': piece.urgent }"
          :x="piece.textX"
          :y="piece.textY"
          :text-anchor="piece.anchor"
          :font-size="isPhone ? 17 : 20"
          font-weight="800"
        >
          {{ piece.name }}
        </text>
        <text
          :class="piece.urgent ? 't-warn' : 't-soft'"
          :x="piece.textX"
          :y="piece.textY + 20"
          :text-anchor="piece.anchor"
          :font-size="isPhone ? 13 : 16"
        >
          {{ piece.note }}
        </text>
      </g>
    </svg>
  </div>
</template>

<script>
import { depthSeries, numberOrZero, pressureSeries } from "~/shared/utils/core.js";
import { chartFloor, profilePath, thinSeries } from "~/shared/utils/depth.js";
import { bar, degrees, formatNumber, metres } from "~/shared/utils/format.js";
import { maxDepthOf } from "~/shared/utils/logbook.js";
import WaterBands from "./WaterBands.vue";
import { measured } from "./measured.js";

// A safety stop is only named when the recording really levels off near 5 m late in the dive.
function findSafetyStop(series, end) {
  let run = [];
  let best = null;
  const close = () => {
    if (run.length > 1) {
      const length = run[run.length - 1].time - run[0].time;
      if (length >= 120 && (!best || length > best.length)) best = { length, point: run[Math.floor(run.length / 2)] };
    }
    run = [];
  };
  for (const point of series) {
    if (point.time > end * 0.55 && point.value >= 3 && point.value <= 6.5) run.push(point);
    else close();
  }
  close();
  return best?.point || null;
}

function nearest(series, time) {
  return series.reduce((found, point) => (!found || Math.abs(point.time - time) < Math.abs(found.time - time) ? point : found), null);
}

export default {
  name: "DepthProfile",
  components: { WaterBands },
  mixins: [measured],
  props: {
    dive: { type: Object, required: true },
    compact: Boolean
  },
  data() {
    return { picked: null };
  },
  watch: {
    "dive.id"() {
      this.picked = null;
    }
  },
  computed: {
    isPhone() {
      return this.width <= 700;
    },
    height() {
      if (this.isPhone) return this.compact ? 180 : 244;
      return this.compact ? 260 : 360;
    },
    series() {
      return depthSeries(this.dive);
    },
    recorded() {
      return this.series.length > 1;
    },
    pressures() {
      return this.compact || this.isPhone ? [] : pressureSeries(this.dive);
    },
    end() {
      return Math.max(numberOrZero(this.dive.duration_seconds), this.series[this.series.length - 1]?.time || 0, 1);
    },
    deepest() {
      return this.series.reduce((found, point) => (!found || point.value > found.value ? point : found), null);
    },
    maxDepth() {
      return Math.max(maxDepthOf(this.dive) || 0, this.deepest?.value || 0);
    },
    floor() {
      return chartFloor([this.maxDepth], this.compact ? 34.5 : 33);
    },
    inset() {
      return this.isPhone ? 22 : this.compact ? 40 : 60;
    },
    depthScale() {
      return this.height / this.floor;
    },
    path() {
      return profilePath(this.series, {
        start: this.inset,
        length: this.width - this.inset * 2,
        depthScale: this.depthScale,
        duration: this.end,
        limit: this.width > 700 ? 180 : 90
      });
    },
    deepestLabel() {
      const point = this.deepest;
      const minute = formatNumber(Math.round(point.time / 60));
      const depth = metres(this.maxDepth);
      const brief = this.compact || this.isPhone;
      const text = brief
        ? this.$tx("{depth} at {minute} min", { depth, minute })
        : this.$tx("Deepest, {depth} at {minute} min", { depth, minute });
      const half = text.length * 4;
      return {
        text,
        x: Math.max(half + 34, Math.min(this.width - half - 8, this.xAt(point.time))),
        y: Math.min(this.height - 6, this.maxDepth * this.depthScale + 24)
      };
    },
    stopLabel() {
      if (this.compact || this.isPhone) return null;
      const point = findSafetyStop(this.series, this.end);
      if (!point) return null;
      return {
        text: this.$tx("Safety stop, {depth} m", { depth: formatNumber(Math.round(point.value)) }),
        x: Math.min(this.width - 150, this.xAt(point.time)),
        y: point.value * this.depthScale + 26
      };
    },
    ticks() {
      if (this.compact || this.isPhone) return [];
      const step = this.end > 5400 ? 20 : this.end > 1500 ? 10 : 5;
      const ticks = [];
      for (let minute = step; minute * 60 < this.end * 0.98; minute += step) ticks.push({ minute, x: this.xAt(minute * 60) });
      return ticks;
    },
    // Until someone points at the drawing, the reading rests a little past half way, clear of both labels.
    selected() {
      if (this.compact || (this.isPhone && this.picked === null)) return null;
      return nearest(this.series, this.picked ?? this.end * 0.6);
    },
    readout() {
      const point = this.selected;
      if (!point) return null;
      const pressure = nearest(pressureSeries(this.dive), point.time);
      const samples = (this.dive.samples || []).filter((sample) => typeof sample.temperature_c === "number");
      const index = Math.round((point.time / this.end) * (samples.length - 1));
      const temperature = samples[Math.max(0, Math.min(samples.length - 1, index))]?.temperature_c;
      const details = [];
      if (pressure) details.push(this.$tx("{pressure} left", { pressure: bar(pressure.value) }));
      if (typeof temperature === "number") details.push(degrees(temperature));
      const x = this.xAt(point.time);
      const y = point.value * this.depthScale;
      const onLeft = x > this.width - 220;
      return {
        x,
        y,
        textX: onLeft ? x - 12 : x + 12,
        textY: Math.min(this.height - 66, Math.max(48, y + 62)),
        anchor: onLeft ? "end" : "start",
        title: this.$tx("{depth} at {minute} min", { depth: metres(point.value), minute: formatNumber(Math.round(point.time / 60)) }),
        detail: details.join(", ")
      };
    },
    pressureTrace() {
      if (this.pressures.length < 2) return null;
      const values = thinSeries(this.pressures, 80);
      const low = Math.min(...values.map((point) => point.value));
      const high = Math.max(...values.map((point) => point.value));
      const y = (value) => 12 + ((high - value) / Math.max(high - low, 1)) * 46;
      const first = values[0];
      const last = values[values.length - 1];
      return {
        path: values.map((point, index) => `${index ? "L" : "M"}${this.xAt(point.time).toFixed(1)} ${y(point.value).toFixed(1)}`).join(""),
        first: { text: formatNumber(first.value), y: y(first.value) + 5 },
        last: { text: bar(last.value), x: Math.min(this.width - 8, this.xAt(last.time) + 52), y: Math.min(64, y(last.value) + 6) },
        dot: this.selected ? { x: this.xAt(this.selected.time), y: y(nearest(this.pressures, this.selected.time).value) } : null
      };
    }
  },
  methods: {
    metres,
    xAt(time) {
      return this.inset + (time / this.end) * (this.width - this.inset * 2);
    },
    point(event) {
      if (this.compact || !this.recorded) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left - this.inset) / (this.width - this.inset * 2);
      this.picked = Math.max(0, Math.min(1, ratio)) * this.end;
    },
    step(direction) {
      if (!this.selected) this.picked = this.end * 0.6;
      const index = this.series.indexOf(this.selected);
      const jump = Math.max(1, Math.round(this.series.length / 50));
      this.picked = this.series[Math.max(0, Math.min(this.series.length - 1, index + direction * jump))].time;
    }
  }
};
</script>

<template>
  <div class="drawing">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :height="height"
      :role="recorded && !compact ? 'slider' : 'img'"
      :tabindex="recorded && !compact ? 0 : undefined"
      :aria-label="recorded ? $tx('Recorded depth profile') : $tx('Plumb line to the deepest point')"
      :aria-valuemin="recorded && !compact ? 0 : undefined"
      :aria-valuemax="recorded && !compact ? Math.round(end / 60) : undefined"
      :aria-valuenow="selected ? Math.round(selected.time / 60) : recorded && !compact ? 0 : undefined"
      :aria-valuetext="readout ? `${readout.title}. ${readout.detail}` : undefined"
      @pointermove="point"
      @pointerdown="point"
      @pointerleave="picked = null"
      @keydown.left.prevent="recorded && !compact && step(-1)"
      @keydown.right.prevent="recorded && !compact && step(1)"
    >
      <water-bands :width="width" :height="height" :floor="floor" :font-size="isPhone ? 13 : 15" :terse="isPhone" />
      <template v-if="recorded">
        <path class="profile now" :d="path" />
        <text v-for="tick in ticks" :key="tick.minute" class="t-soft" :x="tick.x" y="18" font-size="15" text-anchor="middle">
          {{ tick.minute }} min
        </text>
        <text
          class="t-act"
          :x="deepestLabel.x"
          :y="deepestLabel.y"
          :font-size="compact || isPhone ? 15 : 17"
          font-weight="700"
          text-anchor="middle"
        >
          {{ deepestLabel.text }}
        </text>
        <text v-if="stopLabel" class="t-act" :x="stopLabel.x" :y="stopLabel.y" font-size="17" font-weight="700" text-anchor="middle">
          {{ stopLabel.text }}
        </text>
        <g v-if="readout">
          <path class="trace dash" :d="`M${readout.x} 0V${height - 22}`" />
          <circle class="f-ink" :cx="readout.x" :cy="readout.y" r="6" />
          <text :x="readout.textX" :y="readout.textY" :text-anchor="readout.anchor" :font-size="isPhone ? 18 : 22" font-weight="800">
            {{ readout.title }}
          </text>
          <text class="t-soft" :x="readout.textX" :y="readout.textY + 20" :text-anchor="readout.anchor" font-size="16">
            {{ readout.detail }}
          </text>
        </g>
      </template>
      <g v-else-if="maxDepth">
        <path class="trace now dash" :d="`M${width / 2} 0V${maxDepth * depthScale}`" />
        <path class="f-act" :d="`M${width / 2} ${maxDepth * depthScale - 10}l10 10-10 10-10-10Z`" />
        <text :x="width / 2 + 22" :y="maxDepth * depthScale - 4" :font-size="isPhone ? 18 : 22" font-weight="800">
          {{ metres(maxDepth) }}
        </text>
        <text class="t-soft" :x="width / 2 + 22" :y="maxDepth * depthScale + 16" :font-size="isPhone ? 14 : 16">
          {{ $tx("No recorded profile") }}
        </text>
      </g>
    </svg>
    <svg v-if="pressureTrace" :viewBox="`0 0 ${width} 70`" height="70" role="img" :aria-label="$tx('Tank pressure')">
      <path class="trace" :d="pressureTrace.path" />
      <circle v-if="pressureTrace.dot" class="f-ink" :cx="pressureTrace.dot.x" :cy="pressureTrace.dot.y" r="4" />
      <g font-size="15">
        <text class="t-soft" x="12" :y="pressureTrace.first.y">{{ pressureTrace.first.text }}</text>
        <text class="t-soft" :x="pressureTrace.last.x" :y="pressureTrace.last.y" text-anchor="end">{{ pressureTrace.last.text }}</text>
        <text class="t-soft" x="62" y="52">{{ $tx("Tank pressure") }}</text>
      </g>
    </svg>
  </div>
</template>

<script>
import { sortNamedCollection } from "~/shared/utils/equipment-dive.js";
import SuggestField from "./SuggestField.vue";

const DRAFT_KEYS = {
  imported: { weather: "weather_description", suit: "wetsuit_description", weights: "weight_description" },
  manual: { weather: "weatherDescription", suit: "wetsuitDescription", weights: "weightDescription" }
};

// People, conditions and what you wore. Used by all three logbook forms.
export default {
  name: "DiveFields",
  components: { SuggestField },
  props: {
    draft: { type: Object, required: true },
    // Manual drafts use camelCase keys; imported and logged dives use the stored ones.
    manual: Boolean,
    required: { type: Array, default: () => [] },
    buddies: { type: Array, default: () => [] },
    guides: { type: Array, default: () => [] }
  },
  emits: ["change"],
  computed: {
    keys() {
      return DRAFT_KEYS[this.manual ? "manual" : "imported"];
    },
    buddyOptions() {
      return sortNamedCollection(this.buddies);
    },
    guideOptions() {
      return sortNamedCollection(this.guides);
    }
  },
  methods: {
    needs(field, value) {
      return this.required.includes(field) && !String(value || "").trim();
    },
    labelled(field, label) {
      return this.required.includes(field) ? this.$tx("{field}, required", { field: this.$tx(label) }) : this.$tx(label);
    }
  }
};
</script>

<template>
  <div class="dive-fields">
    <slot name="before"></slot>
    <suggest-field
      :model-value="draft.buddy"
      :label="labelled('buddy', 'Buddy')"
      :options="buddyOptions"
      :need="needs('buddy', draft.buddy)"
      @update:model-value="$emit('change', 'buddy', $event)"
    />
    <suggest-field
      :model-value="draft.guide"
      :label="labelled('guide', 'Guide')"
      :options="guideOptions"
      :need="needs('guide', draft.guide)"
      @update:model-value="$emit('change', 'guide', $event)"
    />
    <label class="field" :class="{ need: needs('weather_description', draft[keys.weather]) }">
      {{ labelled("weather_description", "Weather") }}
      <input
        :value="draft[keys.weather]"
        :placeholder="manual ? $tx('Sunny, calm') : ''"
        @input="$emit('change', keys.weather, $event.target.value)"
      />
    </label>
    <label class="field" :class="{ need: needs('visibility', draft.visibility) }">
      {{ labelled("visibility", "Visibility") }}
      <input :value="draft.visibility" :placeholder="manual ? '18 m' : ''" @input="$emit('change', 'visibility', $event.target.value)" />
    </label>
    <label class="field" :class="{ need: needs('wetsuit_description', draft[keys.suit]) }">
      {{ labelled("wetsuit_description", "Suit") }}
      <input
        :value="draft[keys.suit]"
        :placeholder="manual ? $tx('5 mm full suit') : ''"
        @input="$emit('change', keys.suit, $event.target.value)"
      />
    </label>
    <label class="field" :class="{ need: needs('weight_description', draft[keys.weights]) }">
      {{ labelled("weight_description", "Weights") }}
      <input :value="draft[keys.weights]" :placeholder="manual ? '8 kg' : ''" @input="$emit('change', keys.weights, $event.target.value)" />
    </label>
    <slot name="after"></slot>
  </div>
</template>

<style>
.dive-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
  gap: 14px 18px;
}

.dive-fields > .span-two {
  grid-column: span 2;
  min-width: 0;
}

.dive-fields > .span-all {
  grid-column: 1 / -1;
  min-width: 0;
}

@media (max-width: 1100px) {
  .dive-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

<script>
export default {
  name: "SeaSwell",
  props: { tall: Boolean }
};
</script>

<template>
  <div class="swell" :class="{ tall }" aria-hidden="true">
    <svg viewBox="0 0 2560 220" preserveAspectRatio="none">
      <path opacity=".12" d="M0 80C220 0 420 130 640 90s420-80 640-10c220-80 420 50 640 10s420-80 640-10V220H0Z" />
      <path opacity=".14" d="M0 130C200 190 400 50 640 100s440 90 640 30c200 60 400-80 640-30s440 90 640 30V220H0Z" />
    </svg>
  </div>
</template>

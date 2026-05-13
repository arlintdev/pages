<template>
  <span class="brand-mark" aria-hidden="true">
    <svg :width="size" :height="size" viewBox="0 0 24 24">
      <!-- Two offset rounded squares — the monochrome mark from the
           Linear/Vercel mock. Filled with --text-1 so it auto-flips on
           dark mode. -->
      <rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" />
      <rect
        x="7"
        y="7"
        width="14"
        height="14"
        rx="2"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
</script>

<style scoped>
.brand-mark {
  color: var(--text-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.brand-mark svg {
  display: block;
}
</style>

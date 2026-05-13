<template>
  <span class="live-dot" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>

<script setup lang="ts">
defineProps<{ size?: number }>()
</script>

<style scoped>
.live-dot {
  display: inline-block;
  background: var(--live);
  border-radius: 50%;
  /* Soft outer halo — matches the mock's `boxShadow: 0 0 0 3px live22`
   * effect. Slightly larger ring than the dot, semi-transparent. */
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 15%, transparent);
}
</style>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    class="logo"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#a78bfa" />
        <stop offset="1" stop-color="#6366f1" />
      </linearGradient>
    </defs>
    <!-- Back page (faded) -->
    <rect
      x="9"
      y="6"
      width="16"
      height="20"
      rx="2.5"
      :fill="`url(#${gradId})`"
      opacity="0.35"
      transform="rotate(-8 17 16)"
    />
    <!-- Middle page -->
    <rect
      x="8"
      y="6"
      width="16"
      height="20"
      rx="2.5"
      :fill="`url(#${gradId})`"
      opacity="0.6"
      transform="rotate(4 16 16)"
    />
    <!-- Front page with corner fold -->
    <g>
      <path
        d="M7 8.5 a2.5 2.5 0 0 1 2.5 -2.5 h11 l4 4 v13.5 a2.5 2.5 0 0 1 -2.5 2.5 h-12.5 a2.5 2.5 0 0 1 -2.5 -2.5 z"
        :fill="`url(#${gradId})`"
      />
      <!-- Corner fold highlight -->
      <path
        d="M20.5 6 v2.5 a1.5 1.5 0 0 0 1.5 1.5 h2.5"
        fill="none"
        stroke="#0b0d10"
        stroke-width="1.1"
        stroke-linejoin="round"
        opacity="0.5"
      />
      <!-- Lines suggesting text -->
      <rect x="10.5" y="14" width="9" height="1.4" rx="0.7" fill="#0b0d10" opacity="0.45" />
      <rect x="10.5" y="17" width="11" height="1.4" rx="0.7" fill="#0b0d10" opacity="0.35" />
      <rect x="10.5" y="20" width="7" height="1.4" rx="0.7" fill="#0b0d10" opacity="0.45" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: number }>(), { size: 28 })
// Unique gradient id per instance so multiple logos in the same DOM don't collide.
const gradId = computed(() => `pages-grad-${Math.random().toString(36).slice(2, 9)}`)
void props.size
</script>

<style scoped>
.logo {
  display: block;
  filter: drop-shadow(0 4px 10px rgba(99, 102, 241, 0.35));
}
</style>

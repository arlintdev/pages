<template>
  <span class="chip" :class="{ live: shared }">
    <component :is="shared ? Globe : Lock" :size="11" />
    {{ shared ? 'Shared' : 'Private' }}
  </span>
</template>

<script setup lang="ts">
import { Globe, Lock } from 'lucide-vue-next'

defineProps<{ shared: boolean }>()
</script>

<style scoped>
/* chip class lives in theme.css — this just adds icon alignment */
.chip :deep(svg) {
  flex: 0 0 auto;
}
</style>

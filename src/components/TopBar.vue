<template>
  <div class="top-bar">
    <!-- Breadcrumbs — left side. Last crumb is bold; separators are slashes. -->
    <nav v-if="crumbs?.length" class="crumbs" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="crumb-sep">/</span>
        <router-link
          v-if="c.to && i < crumbs.length - 1"
          :to="c.to"
          class="crumb"
        >{{ c.label }}</router-link>
        <span
          v-else
          class="crumb"
          :class="{ current: i === crumbs.length - 1 }"
        >{{ c.label }}</span>
      </template>
    </nav>
    <h1 v-else-if="title" class="bar-title">{{ title }}</h1>

    <div class="spacer" />

    <!-- Optional ⌘K search affordance — only renders if showSearch -->
    <div v-if="showSearch" class="search">
      <Search :size="13" />
      <input
        type="text"
        :value="searchValue"
        placeholder="Search pages…"
        @input="$emit('update:searchValue', ($event.target as HTMLInputElement).value)"
        @keydown.escape="$emit('update:searchValue', '')"
      />
      <span class="kbd">⌘K</span>
    </div>

    <!-- Right-side action slot — callers stick their buttons in here. -->
    <slot name="actions" />
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

export type Crumb = { label: string; to?: RouteLocationRaw }

defineProps<{
  crumbs?: Crumb[]
  title?: string
  showSearch?: boolean
  searchValue?: string
}>()

defineEmits<{
  (e: 'update:searchValue', v: string): void
}>()
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.crumb {
  color: var(--text-2);
  font-weight: 400;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.1s ease;
}
.crumb:hover {
  color: var(--text-1);
}
.crumb.current {
  color: var(--text-1);
  font-weight: 500;
  cursor: default;
}
.crumb-sep {
  color: var(--text-3);
}

.bar-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-1);
  letter-spacing: -0.01em;
}

.spacer {
  flex: 1;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  min-width: 260px;
  background: var(--surface);
  color: var(--text-3);
  font-size: 13px;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.search:focus-within {
  border-color: var(--border-strong);
  background: var(--bg);
}
.search input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-1);
  font: inherit;
  min-width: 0;
}
.search input::placeholder {
  color: var(--text-3);
}
</style>

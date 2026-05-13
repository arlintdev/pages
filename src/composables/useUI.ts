import { ref, watch } from 'vue'

const KEY = 'pages.sidebar.collapsed'

const initial = (() => {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(KEY) === '1'
})()

const sidebarCollapsed = ref(initial)

watch(sidebarCollapsed, (v) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, v ? '1' : '0')
  }
})

export function useSidebar() {
  return {
    collapsed: sidebarCollapsed,
    toggle: () => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    },
    collapse: () => {
      sidebarCollapsed.value = true
    },
    expand: () => {
      sidebarCollapsed.value = false
    },
  }
}

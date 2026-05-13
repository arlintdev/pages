<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="pending"
        class="confirm-backdrop"
        role="dialog"
        aria-modal="true"
        @click.self="answer(false)"
      >
        <div class="confirm-card" @click.stop>
          <header class="confirm-head">
            <h2>{{ pending.title || 'Are you sure?' }}</h2>
            <button class="confirm-close" title="Close" @click="answer(false)">
              <X :size="14" />
            </button>
          </header>
          <p class="confirm-body">{{ pending.message }}</p>
          <div class="confirm-actions">
            <button class="btn" ref="cancelBtn" @click="answer(false)">
              {{ pending.cancelLabel || 'Cancel' }}
            </button>
            <button
              class="btn"
              :class="pending.destructive ? 'destructive' : 'primary'"
              @click="answer(true)"
            >
              {{ pending.confirmLabel || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { X } from 'lucide-vue-next'
import { _useConfirmHostState } from '@/composables/useConfirm'

const { pending, answer } = _useConfirmHostState()

const cancelBtn = ref<HTMLButtonElement | null>(null)

// Body scroll-lock while open, autofocus the Cancel button (safer
// default than the destructive button), and route Escape to "no",
// Enter to "yes" — matches macOS Cmd+. and Cmd+. conventions.
function onKey(e: KeyboardEvent) {
  if (!pending.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    answer(false)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    answer(true)
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

watch(pending, async (p) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = p ? 'hidden' : ''
  if (p) {
    await nextTick()
    cancelBtn.value?.focus()
  }
})
</script>

<style>
/* Unscoped because Teleport lifts the markup out of the component
 * subtree. Class names are prefixed with `confirm-` to avoid clashing
 * with the StylesView modal which uses bare `.modal-*` names. */

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  /* Light backdrop with a heavy blur — pulls focus to the card without
   * the heavy "lights off" feel of the previous 62% black. Matches the
   * Linear/Vercel modal pattern where the surface stays bright and the
   * card has subtle elevation. */
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  display: grid;
  place-items: center;
  padding: 24px;
}

.confirm-card {
  width: min(420px, 100%);
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* Stack two shadows: a small near-shadow for definition + a long
   * distant shadow for depth. Matches the Vercel command palette feel. */
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.04),
    0 12px 32px -8px rgba(0, 0, 0, 0.18),
    0 32px 80px -16px rgba(0, 0, 0, 0.24);
}

.confirm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 8px;
}
.confirm-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: -0.01em;
}
.confirm-close {
  background: transparent;
  border: none;
  color: var(--text-3);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.confirm-close:hover {
  background: var(--hover);
  color: var(--text-1);
}

.confirm-body {
  margin: 0;
  padding: 0 20px 20px;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

/* `.btn` classes from theme.css already handle the base / primary
 * styling. We only need to override the destructive variant — solid red
 * fill so it reads as a serious action even when scanning fast. */
.confirm-actions .btn.destructive {
  background: var(--danger);
  border-color: var(--danger);
  color: #ffffff;
}
.confirm-actions .btn.destructive:hover:not(:disabled) {
  opacity: 0.9;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .confirm-card,
.fade-leave-active .confirm-card {
  transition: transform 0.18s ease, opacity 0.15s ease;
}
.fade-enter-from .confirm-card,
.fade-leave-to .confirm-card {
  transform: translateY(8px) scale(0.98);
  opacity: 0;
}
</style>

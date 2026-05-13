<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="pending"
        class="modal-backdrop"
        role="dialog"
        aria-modal="true"
        @click.self="answer(false)"
      >
        <div class="modal" @click.stop>
          <header class="modal-head">
            <h2>{{ pending.title || 'Are you sure?' }}</h2>
            <button class="iconbtn" title="Close" @click="answer(false)">
              <X :size="16" />
            </button>
          </header>
          <p class="modal-body">{{ pending.message }}</p>
          <div class="modal-actions">
            <button class="ghost" @click="answer(false)" ref="cancelBtn">
              {{ pending.cancelLabel || 'Cancel' }}
            </button>
            <button
              :class="['primary', { danger: pending.destructive }]"
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
// default than the destructive button), and route Escape to "no".
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
/* Unscoped so it applies to the Teleported markup. The class names are
   prefixed (.confirm-*) elsewhere if we ever need to disambiguate from
   the styles-view modal — here `.modal-*` is fine because Teleport puts
   us in a sibling subtree and the styles-view modal isn't open at the
   same time. */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  padding: 24px;
}
.modal-backdrop .modal {
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.modal-backdrop .modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px 6px;
}
.modal-backdrop .modal-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.modal-backdrop .modal-body {
  margin: 0;
  padding: 0 20px 20px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.55;
}
.modal-backdrop .modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.modal-backdrop .modal-actions button {
  background: var(--bg-elev-2);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
}
.modal-backdrop .modal-actions button:hover {
  background: var(--bg-hover);
}
.modal-backdrop .modal-actions button.ghost {
  background: transparent;
  color: var(--text-dim);
}
.modal-backdrop .modal-actions button.primary {
  background: var(--accent);
  color: #0b0d10;
  border-color: var(--accent);
}
.modal-backdrop .modal-actions button.primary.danger {
  background: var(--danger);
  color: #0b0d10;
  border-color: var(--danger);
}
.modal-backdrop .iconbtn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
}
.modal-backdrop .iconbtn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .modal,
.fade-leave-active .modal {
  transition: transform 0.18s ease, opacity 0.15s ease;
}
.fade-enter-from .modal,
.fade-leave-to .modal {
  transform: translateY(8px) scale(0.98);
  opacity: 0;
}
</style>

// Async confirmation dialog backed by a single global modal mounted by
// ConfirmHost in App.vue. Callers `await confirm({ ... })` and get a
// boolean. The composable shape mirrors the native `window.confirm` API
// so existing call sites become almost search-and-replace:
//
//   if (!(await confirm({ message: 'Delete this?' }))) return
//
// We hold pending requests in a Vue ref so the host component can render
// whichever one is on top. Only one at a time — opening a second confirm
// while the first is pending is undefined behaviour the UI never needs.

import { reactive, ref } from 'vue'

export type ConfirmOptions = {
  /** Short headline above the message. Defaults to "Are you sure?". */
  title?: string
  /** Body text — supports plain text only, not HTML. */
  message: string
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string
  /** Treat the action as destructive — paints the confirm button red. */
  destructive?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

// Module-level singleton so every component that calls useConfirm() sees
// the same queue. The ConfirmHost component reads `pending` to render.
const pending = ref<Pending | null>(null)

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    // If a prior confirm is somehow still open, resolve it as cancelled
    // so we don't leak unresolved promises.
    if (pending.value) {
      pending.value.resolve(false)
      pending.value = null
    }
    return new Promise<boolean>((resolve) => {
      pending.value = reactive({ ...opts, resolve })
    })
  }
  return { confirm }
}

// State accessor for the host component. Not exported in useConfirm() so
// only ConfirmHost reaches into the singleton — every other caller goes
// through the promise.
export function _useConfirmHostState() {
  function answer(ok: boolean) {
    const p = pending.value
    if (!p) return
    pending.value = null
    p.resolve(ok)
  }
  return { pending, answer }
}

import { useState } from 'react'
import type { Target } from '../../../lib/api/targets'

/** Which dialog is open. `edit` holds the snapshot of the target the dialog opened with. */
export type TargetDialogState =
  | { mode: 'none' }
  | { mode: 'add'; opener: HTMLElement | null; nonce: number }
  | { mode: 'edit'; target: Target; opener: HTMLElement | null; nonce: number }

/** Which target dialog is open, with what, and the element that opened it (where focus may return to). */
export function useTargetDialog() {
  const [state, setState] = useState<TargetDialogState>({ mode: 'none' })
  // A new number for every opening, so that a dialog opened again starts with a fresh form.
  const [nonce, setNonce] = useState(0)

  return {
    state,
    openAdd: (opener: HTMLElement | null) => {
      setNonce(nonce + 1)
      setState({ mode: 'add', opener, nonce: nonce + 1 })
    },
    openEdit: (target: Target, opener: HTMLElement | null) => {
      setNonce(nonce + 1)
      setState({ mode: 'edit', target: structuredClone(target), opener, nonce: nonce + 1 })
    },
    close: () => setState({ mode: 'none' }),
  }
}

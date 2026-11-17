import { useRef } from 'react'
import { Dialog } from '../../../components/ui/Dialog'

type Props = {
  open: boolean
  /** "Keep editing", Esc and a click on the backdrop. */
  onKeep: () => void
  onDiscard: () => void
}

/** Asks before a changed form is left by Cancel or the back link. */
export function DiscardDialog({ open, onKeep, onDiscard }: Props) {
  const keepRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      title="Discard unsaved changes?"
      onClose={onKeep}
      initialFocus={keepRef}
      footer={
        <>
          <button type="button" className="btn" ref={keepRef} onClick={onKeep}>
            <span>Keep editing</span>
          </button>
          <button type="button" className="btn btn--danger" onClick={onDiscard}>
            <span>Discard changes</span>
          </button>
        </>
      }
    >
      <p>The changes to this service will be lost.</p>
    </Dialog>
  )
}

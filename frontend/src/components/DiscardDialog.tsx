import { useRef } from 'react'
import { Dialog } from './ui/Dialog'

type Props = {
  open: boolean
  /** The sentence under the title: what will be lost. */
  body: string
  /** "Keep editing", Esc and a click on the backdrop. */
  onKeep: () => void
  onDiscard: () => void
}

/** Asks before a changed form is left: `Keep editing` takes focus first. */
export function DiscardDialog({ open, body, onKeep, onDiscard }: Props) {
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
      <p>{body}</p>
    </Dialog>
  )
}

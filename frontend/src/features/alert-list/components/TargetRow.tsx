import { useEffect, useRef, type KeyboardEvent } from 'react'
import { LoaderCircle, Mail, Pencil, Trash2, TriangleAlert, Webhook } from 'lucide-react'
import type { Target } from '../../../lib/api/targets'

/** Fixed text (NFR-7); shown while the server says the last delivery failed (FR-86). */
const DELIVERY_FAILED_NOTICE = 'Last delivery failed. Shown until a later delivery succeeds.'

/** What names a target: its name, or when that is absent, empty or only spaces, its address or URL. */
function targetLabel(target: Target): string {
  const name = target.name?.trim()
  if (name) return target.name as string
  return target.type === 'email' ? target.address : target.url
}

/** One target and its inline two-step removal (FR-16, FR-17, FR-80, FR-81). Server text is rendered as text (NFR-7). */
export function TargetRow({
  target,
  asking,
  removing,
  removeRef,
  editRef,
  onEdit,
  onAsk,
  onCancel,
  onConfirm,
}: {
  target: Target
  /** This row shows the confirmation. */
  asking: boolean
  /** A removal request is in flight (for this row or another). */
  removing: boolean
  /** Receives this row's `Remove` button, so the screen can move focus to it. */
  removeRef: (button: HTMLButtonElement | null) => void
  /** Receives this row's `Edit` button, so the screen can move focus to it. */
  editRef: (button: HTMLButtonElement | null) => void
  /** Opens the dialog for this target; receives the button, where focus returns. */
  onEdit: (opener: HTMLButtonElement) => void
  onAsk: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const isEmail = target.type === 'email'
  const hasName = Boolean(target.name?.trim())
  const label = targetLabel(target)
  const confirmButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (asking) confirmButton.current?.focus()
  }, [asking])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    if (!removing) onCancel()
  }

  return (
    <li className="target">
      <span className="target__type">
        {isEmail ? <Mail className="icon" aria-hidden="true" /> : <Webhook className="icon" aria-hidden="true" />}
        <span className="sr-only">{isEmail ? 'Email' : 'Webhook'}</span>
      </span>
      <div className="target__main">
        <div className="target__title">
          {hasName ? (
            <span className="target__name plain-text">{target.name}</span>
          ) : (
            <span className="target__name target__name--fallback">{isEmail ? 'Unnamed email' : 'Unnamed webhook'}</span>
          )}
          <span className="chip">{isEmail ? 'EMAIL' : 'WEBHOOK'}</span>
        </div>
        <span className="target__addr">{isEmail ? target.address : target.url}</span>
        {target.last_delivery_failed === true && (
          <p className="notice notice--warn">
            <TriangleAlert className="icon icon--sm" aria-hidden="true" />
            <span>{DELIVERY_FAILED_NOTICE}</span>
          </p>
        )}
      </div>
      {asking ? (
        <div className="target__confirm" role="group" aria-label="Confirm removal" onKeyDown={onKeyDown}>
          <span>Remove this target?</span>
          <button type="button" className="btn" disabled={removing} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            ref={confirmButton}
            className="btn btn--danger"
            aria-disabled={removing ? 'true' : undefined}
            aria-busy={removing ? 'true' : undefined}
            onClick={() => {
              if (!removing) onConfirm()
            }}
          >
            {removing ? (
              <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
            ) : (
              <Trash2 className="icon icon--sm" aria-hidden="true" />
            )}
            <span>{removing ? 'Removing…' : 'Remove'}</span>
          </button>
        </div>
      ) : (
        <div className="target__actions">
          <button
            type="button"
            ref={editRef}
            className="btn btn--ghost"
            aria-label={`Edit ${label}`}
            disabled={removing}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            <Pencil className="icon icon--sm" aria-hidden="true" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            ref={removeRef}
            className="btn btn--ghost-danger"
            aria-label={`Remove ${label}`}
            disabled={removing}
            onClick={onAsk}
          >
            <Trash2 className="icon icon--sm" aria-hidden="true" />
            <span>Remove</span>
          </button>
        </div>
      )}
    </li>
  )
}

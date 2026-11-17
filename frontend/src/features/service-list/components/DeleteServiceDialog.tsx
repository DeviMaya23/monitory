import { useRef } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { AlertDialog } from '../../../components/ui/AlertDialog'
import type { Service } from '../../../lib/api/services'

type Props = {
  /** The service being asked about; the dialog is open while there is one. */
  service: Service | null
  /** The request is in flight. */
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
  /** Where focus goes on close; null means back to the button that opened it. */
  finalFocus?: () => HTMLElement | null
}

function TargetCount({ count }: { count: number }) {
  if (count === 0) return <p>It has no notification targets.</p>
  return (
    <p>
      Its alert list goes with it: <strong>{count === 1 ? '1 notification target' : `${count} notification targets`}</strong>.
    </p>
  )
}

/** Asks the admin to confirm deleting a service, naming it and its notification targets (FR-72). The name is text (NFR-7). */
export function DeleteServiceDialog({ service, deleting, onCancel, onConfirm, finalFocus }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog
      open={service !== null}
      title={service ? `Delete “${service.name}”?` : ''}
      onClose={onCancel}
      busy={deleting}
      initialFocus={cancelRef}
      finalFocus={finalFocus}
      footer={
        <>
          <button type="button" className="btn" ref={cancelRef} disabled={deleting} onClick={onCancel}>
            <span>Cancel</span>
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={deleting}
            aria-busy={deleting ? 'true' : undefined}
            onClick={onConfirm}
          >
            {deleting ? (
              <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
            ) : (
              <Trash2 className="icon icon--sm" aria-hidden="true" />
            )}
            <span>{deleting ? 'Deleting…' : 'Delete service'}</span>
          </button>
        </>
      }
    >
      {service && (
        <>
          <TargetCount count={service.target_count} />
          <p>Checks stop and its current state is removed. This can’t be undone.</p>
        </>
      )}
    </AlertDialog>
  )
}

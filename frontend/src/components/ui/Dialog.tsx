import type { ReactNode, RefObject } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { getPortalHost } from './portalHost'

type Props = {
  open: boolean
  title: string
  /** Called for Esc, a click on the backdrop or Close; never while `busy`. */
  onClose: () => void
  /** While busy, Esc and the backdrop do nothing (a request is in flight). */
  busy?: boolean
  /** The element to focus on open; otherwise the first focusable one. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Panel width: 440px, or 600px when wide. */
  wide?: boolean
  /** Shows a Close icon button at the end of the head; it calls `onClose`, and does nothing while `busy`. */
  showClose?: boolean
  /** A full-screen sheet at the narrow breakpoint. */
  sheet?: boolean
  /** Where focus goes on close. Return null to let it go back to what opened the dialog. */
  finalFocus?: () => HTMLElement | null
  children: ReactNode
  footer?: ReactNode
}

/**
 * A modal with a title (its accessible name), a body and a footer. Focus returns to what
 * opened it when it closes.
 */
export function Dialog({
  open,
  title,
  onClose,
  busy = false,
  initialFocus,
  wide = false,
  showClose = false,
  sheet = false,
  finalFocus,
  children,
  footer,
}: Props) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <BaseDialog.Portal container={getPortalHost()}>
        <BaseDialog.Backdrop className="dialog-backdrop" />
        <BaseDialog.Viewport className={sheet ? 'dialog-layer dialog-layer--sheet' : 'dialog-layer'}>
          <BaseDialog.Popup
            className={['dialog', wide && 'dialog--wide', sheet && 'dialog--sheet'].filter(Boolean).join(' ')}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
          >
            <div className="dialog__head">
              <BaseDialog.Title className="dialog__title">{title}</BaseDialog.Title>
              {showClose && (
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  aria-label="Close"
                  onClick={() => {
                    if (!busy) onClose()
                  }}
                >
                  <X className="icon" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="dialog__body">{children}</div>
            {footer && <div className="dialog__foot">{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

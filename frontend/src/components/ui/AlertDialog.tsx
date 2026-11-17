import type { ReactNode, RefObject } from 'react'
import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'

type Props = {
  open: boolean
  title: string
  /** Called for Esc; never while `busy`. A click on the backdrop does not close an alert dialog. */
  onClose: () => void
  /** While busy, Esc does nothing (a request is in flight). */
  busy?: boolean
  /** The element to focus on open; otherwise the first focusable one. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Where focus goes on close. Return null to let it go back to what opened the dialog. */
  finalFocus?: () => HTMLElement | null
  children: ReactNode
  footer?: ReactNode
}

/**
 * A modal that asks for a decision (role `alertdialog`): a title (its accessible name), a body
 * (its description) and a footer. Only a button or Esc closes it.
 */
export function AlertDialog({ open, title, onClose, busy = false, initialFocus, finalFocus, children, footer }: Props) {
  return (
    <BaseAlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="dialog-backdrop" />
        <BaseAlertDialog.Viewport className="dialog-layer">
          <BaseAlertDialog.Popup className="dialog" initialFocus={initialFocus} finalFocus={finalFocus}>
            <div className="dialog__head">
              <BaseAlertDialog.Title className="dialog__title">{title}</BaseAlertDialog.Title>
            </div>
            <BaseAlertDialog.Description className="dialog__body" render={<div />}>
              {children}
            </BaseAlertDialog.Description>
            {footer && <div className="dialog__foot">{footer}</div>}
          </BaseAlertDialog.Popup>
        </BaseAlertDialog.Viewport>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  )
}

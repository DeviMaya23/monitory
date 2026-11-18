import type { ReactNode, RefObject } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
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
  children: ReactNode
  footer?: ReactNode
}

/**
 * A modal with a title (its accessible name), a body and a footer. Focus returns to what
 * opened it when it closes.
 */
export function Dialog({ open, title, onClose, busy = false, initialFocus, wide = false, children, footer }: Props) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <BaseDialog.Portal container={getPortalHost()}>
        <BaseDialog.Backdrop className="dialog-backdrop" />
        <BaseDialog.Viewport className="dialog-layer">
          <BaseDialog.Popup className={wide ? 'dialog dialog--wide' : 'dialog'} initialFocus={initialFocus}>
            <div className="dialog__head">
              <BaseDialog.Title className="dialog__title">{title}</BaseDialog.Title>
            </div>
            <div className="dialog__body">{children}</div>
            {footer && <div className="dialog__foot">{footer}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

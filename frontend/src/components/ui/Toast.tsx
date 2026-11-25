import { useMemo, type ReactNode } from 'react'
import { Toast as BaseToast } from '@base-ui/react/toast'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { getPortalHost } from './portalHost'
import { ToastContext, type ToastApi } from './useToast'

/** How long a success toast stays; an error toast stays until dismissed (a timeout of 0). */
export const SUCCESS_TOAST_MS = 5000

function ToastList() {
  const manager = BaseToast.useToastManager()
  return manager.toasts.map((toast) => (
    <BaseToast.Root key={toast.id} toast={toast} className="toast">
      {toast.type === 'error' ? (
        <CircleAlert className="icon icon--sm" aria-hidden="true" />
      ) : (
        <CircleCheck className="icon icon--sm" aria-hidden="true" />
      )}
      <BaseToast.Title className="toast__text" />
      <BaseToast.Action className="btn btn--ghost btn--sm" />
      <BaseToast.Close className="btn btn--ghost btn--icon btn--sm" aria-label="Dismiss">
        <X className="icon icon--sm" aria-hidden="true" />
      </BaseToast.Close>
    </BaseToast.Root>
  ))
}

function ToastBridge({ children }: { children: ReactNode }) {
  const manager = BaseToast.useToastManager()
  const api = useMemo<ToastApi>(
    () => ({
      show: ({ kind, message, action }) => {
        let id = ''
        id = manager.add({
          title: message,
          type: kind,
          priority: kind === 'error' ? 'high' : 'low',
          timeout: kind === 'error' ? 0 : SUCCESS_TOAST_MS,
          actionProps: action && {
            children: action.label,
            onClick: () => {
              action.onClick()
              manager.close(id)
            },
          },
        })
      },
    }),
    [manager],
  )
  return (
    <ToastContext value={api}>
      {children}
      <BaseToast.Portal container={getPortalHost()}>
        <BaseToast.Viewport className="toast-viewport">
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </ToastContext>
  )
}

/** Mounts the toast viewport once, and `useToast` for everything below it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      <ToastBridge>{children}</ToastBridge>
    </BaseToast.Provider>
  )
}

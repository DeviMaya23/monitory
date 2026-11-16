import { createContext, useContext } from 'react'

export type ToastInput = {
  kind: 'success' | 'error'
  /** Plain text. */
  message: string
  action?: { label: string; onClick: () => void }
}

export type ToastApi = { show: (toast: ToastInput) => void }

export const ToastContext = createContext<ToastApi | null>(null)

/** Shows a toast. Must be used under `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside ToastProvider')
  return api
}

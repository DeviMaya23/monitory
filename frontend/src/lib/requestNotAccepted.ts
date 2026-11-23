import type { ToastInput } from '../components/ui/useToast'

/** The banner's title when the server refused the request's CSRF token. */
export const REQUEST_NOT_ACCEPTED_TITLE = 'The request wasn’t accepted.'

/** The banner's text under that title. */
export const REQUEST_NOT_ACCEPTED_TEXT = 'Reload the page and try again.'

/** The toast's message: the toast words it a little shorter than the banner. */
export const REQUEST_NOT_ACCEPTED_TOAST = 'The request wasn’t accepted. Reload and try again.'

/** The label of every Reload button and toast action. */
export const RELOAD_LABEL = 'Reload'

/** The toast for a refused CSRF token, with a Reload action that reloads the page. */
export function csrfToast() {
  return {
    kind: 'error',
    message: REQUEST_NOT_ACCEPTED_TOAST,
    action: { label: RELOAD_LABEL, onClick: () => window.location.reload() },
  } satisfies ToastInput & { action: NonNullable<ToastInput['action']> }
}

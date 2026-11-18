const HOST_ATTRIBUTE = 'data-portal-host'

/**
 * The element the dialog, alert dialog and select list render into. It carries the class `app`,
 * so the `.app` rules (container query, font, resets, focus ring) reach the popups, and it is a
 * fixed, viewport-sized box so the library's fixed layers still cover the viewport. Created
 * lazily; safe to call on every render.
 */
export function getPortalHost(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${HOST_ATTRIBUTE}]`)
  if (existing && existing.isConnected) return existing
  const host = document.createElement('div')
  host.className = 'app portal-host'
  host.setAttribute(HOST_ATTRIBUTE, '')
  document.body.appendChild(host)
  return host
}

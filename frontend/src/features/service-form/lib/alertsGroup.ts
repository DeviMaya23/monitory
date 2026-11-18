/** The longest alert message the server accepts (FR-65). Only the counter shows it; nothing checks it. */
export const MESSAGE_MAX = 500

export const ALERTS_TEXT = {
  legend: 'Alerts',
  switchLabel: 'Send alerts',
  switchHint: 'To this service’s alert list when it goes down or recovers.',
  optional: '(optional)',
  placeholder: 'Default message is used when empty',
  unhealthyLabel: 'Unhealthy message',
  recoveryLabel: 'Recovery message',
} as const

/** The number of characters in a message, as the server counts them: Unicode code points. */
export function countCharacters(text: string): number {
  return Array.from(text).length
}

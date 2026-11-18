import type { FieldTarget } from './fieldLabels'

/** The element id of each field's control: the inputs, the text areas and the method select's trigger. */
export const FIELD_IDS: Record<FieldTarget, string> = {
  name: 'service-name',
  'check.method': 'service-method',
  'check.url': 'service-url',
  'settings.check_interval_seconds': 'service-check-interval',
  'settings.timeout_seconds': 'service-timeout',
  'settings.retry_count': 'service-retries',
  'settings.retry_interval_seconds': 'service-retry-interval',
  unhealthy_message: 'service-unhealthy-message',
  recovery_message: 'service-recovery-message',
}

/** Moves focus to a field's control. */
export function focusField(target: FieldTarget): void {
  document.getElementById(FIELD_IDS[target])?.focus()
}

/** The id of the error text under the control with id `fieldId`. */
export const errorId = (fieldId: string) => `${fieldId}-error`

import { CERT_DAYS_ID, CERT_DAYS_PATH } from './certificateOptions'
import type { FieldTarget, StaticTarget } from './fieldLabels'
import { HOST_ID, HOST_PATH, PORT_ID, PORT_PATH } from './serviceType'
import { parseRulePath, ruleInputId } from './jsonRules'
import { BODY_CONTENT_ID, BODY_CONTENT_PATH, parseRowPath, rowInputId } from './requestRows'

/** The element id of each field's control: the inputs, the text areas and the method select's trigger. */
export const FIELD_IDS: Record<StaticTarget, string> = {
  name: 'service-name',
  'check.method': 'service-method',
  'check.url': 'service-url',
  [HOST_PATH]: HOST_ID,
  [PORT_PATH]: PORT_ID,
  [CERT_DAYS_PATH]: CERT_DAYS_ID,
  'settings.check_interval_seconds': 'service-check-interval',
  'settings.timeout_seconds': 'service-timeout',
  'settings.retry_count': 'service-retries',
  'settings.retry_interval_seconds': 'service-retry-interval',
  unhealthy_message: 'service-unhealthy-message',
  recovery_message: 'service-recovery-message',
}

/** The element id of a field's control, row inputs and the body text included. */
export function fieldId(target: FieldTarget): string {
  if (target === BODY_CONTENT_PATH) return BODY_CONTENT_ID
  const row = parseRowPath(target)
  if (row !== null) return rowInputId(row.list, row.index, row.part)
  const rule = parseRulePath(target)
  if (rule !== null) return ruleInputId(rule.index, rule.part === 'field' ? 'field' : 'kind')
  return FIELD_IDS[target as StaticTarget]
}

/** Moves focus to a field's control. */
export function focusField(target: FieldTarget): void {
  document.getElementById(fieldId(target))?.focus()
}

/** The id of the error text under the control with id `fieldId`. */
export const errorId = (fieldId: string) => `${fieldId}-error`

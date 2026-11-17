import type { FieldTarget } from './fieldLabels'

/** The element id of each field's control: the two inputs and the method select's trigger. */
export const FIELD_IDS: Record<FieldTarget, string> = {
  name: 'service-name',
  'check.method': 'service-method',
  'check.url': 'service-url',
}

/** Moves focus to a field's control. */
export function focusField(target: FieldTarget): void {
  document.getElementById(FIELD_IDS[target])?.focus()
}

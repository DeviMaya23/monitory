import { useState } from 'react'
import type { FieldError } from '../../../lib/api/services'
import { fieldLabel, type FieldTarget } from '../lib/fieldLabels'

export type SummaryEntry = {
  /** Stable within one response: the error's position in it. */
  key: number
  label: string
  message: string
  /** The input the entry links to; null when the path has no input on this screen. */
  target: FieldTarget | null
}

const NONE: ReadonlySet<FieldTarget> = new Set()

/**
 * The state of a `422`: the errors of the last response (`errors`, a new array for every
 * response) minus the fields edited since. The errors themselves are never copied.
 */
export function useServerErrors(errors: readonly FieldError[] | null) {
  // Which fields were edited, and for which response; another response starts empty.
  const [edited, setEdited] = useState<{ source: readonly FieldError[] | null; fields: ReadonlySet<FieldTarget> }>({
    source: null,
    fields: NONE,
  })
  const cleared = edited.source === errors ? edited.fields : NONE

  const entries: SummaryEntry[] = (errors ?? [])
    .map((error, key) => ({ key, message: error.message, ...fieldLabel(error.field) }))
    .filter((entry) => entry.target === null || !cleared.has(entry.target))

  return {
    /** The summary's entries, in the order the server sent them. */
    entries,
    count: entries.length,
    /** The message shown on a field: the first error the server sent for it. */
    errorFor: (target: FieldTarget): string | null =>
      entries.find((entry) => entry.target === target)?.message ?? null,
    /** The field was edited: its error and its summary entries go. */
    clearField: (target: FieldTarget) => {
      setEdited((prev) => ({
        source: errors,
        fields: new Set([...(prev.source === errors ? prev.fields : NONE), target]),
      }))
    },
  }
}

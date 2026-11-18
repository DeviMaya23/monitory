import { useState } from 'react'
import type { FieldError } from '../../../lib/api/services'
import { fieldLabel, TIMING_GROUP_PATH, type FieldTarget } from '../lib/fieldLabels'

export type SummaryEntry = {
  /** Stable within one response: the error's position in it. */
  key: number
  label: string
  message: string
  /** The input the entry links to; null when the path has no input on this screen. */
  target: FieldTarget | null
}

/** The Timing group's own error (the bare `settings` path) is tracked as a cleared "field" of its own. */
const GROUP = 'group'
type Cleared = FieldTarget | typeof GROUP
const NONE: ReadonlySet<Cleared> = new Set()

const isGroupError = (field: string) => field === TIMING_GROUP_PATH

/**
 * The state of a `422`: the errors of the last response (`errors`, a new array for every
 * response) minus the fields edited since. The errors themselves are never copied.
 */
export function useServerErrors(errors: readonly FieldError[] | null) {
  // Which fields were edited, and for which response; another response starts empty.
  const [edited, setEdited] = useState<{
    source: readonly FieldError[] | null
    fields: ReadonlySet<Cleared>
  }>({
    source: null,
    fields: NONE,
  })
  const cleared = edited.source === errors ? edited.fields : NONE

  const entries: SummaryEntry[] = (errors ?? [])
    .map((error, key) => ({
      key,
      group: isGroupError(error.field),
      message: error.message,
      ...fieldLabel(error.field),
    }))
    .filter((entry) => (entry.group ? !cleared.has(GROUP) : entry.target === null || !cleared.has(entry.target)))
    .map(({ key, label, message, target }) => ({
      key,
      label,
      message,
      target,
    }))

  const clear = (...fields: Cleared[]) => {
    setEdited((prev) => ({
      source: errors,
      fields: new Set([...(prev.source === errors ? prev.fields : NONE), ...fields]),
    }))
  }

  return {
    /** The summary's entries, in the order the server sent them. */
    entries,
    count: entries.length,
    /** The message shown on a field: the first error the server sent for it. */
    errorFor: (target: FieldTarget): string | null => entries.find((entry) => entry.target === target)?.message ?? null,
    /** The Timing group's message (the bare `settings` error), or null. */
    groupError: (): string | null => {
      const index = (errors ?? []).findIndex((error) => isGroupError(error.field))
      return index >= 0 && !cleared.has(GROUP) ? (errors ?? [])[index].message : null
    },
    /** The field was edited: its error and its summary entries go. */
    clearField: (target: FieldTarget) => clear(target),
    /** One of the four timing inputs was edited: its error goes, and so does the group's, which is now stale. */
    clearTiming: (target: FieldTarget) => clear(target, GROUP),
  }
}

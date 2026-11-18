import { useState } from 'react'
import type { FieldError } from '../../../lib/api/services'
import { fieldInfo, isHeadersPath } from '../lib/targetFields'

export type SummaryEntry = {
  /** Stable within one response: the error's position in it. */
  key: number
  /** The server's path. */
  field: string
  label: string
  message: string
  /** The input the entry links to; null when the path has no input on this screen. */
  inputId: string | null
}

type Edited = {
  source: readonly FieldError[] | null
  fields: ReadonlySet<string>
  headers: boolean
}

const NONE: Edited = { source: null, fields: new Set(), headers: false }

/**
 * The state of a `422`: the errors of the last response (`errors`, a new array for every
 * response) minus the fields edited since. The errors themselves are never copied.
 */
export function useTargetServerErrors(errors: readonly FieldError[] | null) {
  // Which fields were edited, and for which response; another response starts empty.
  const [edited, setEdited] = useState<Edited>(NONE)
  const current = edited.source === errors ? edited : NONE

  const entries: SummaryEntry[] = (errors ?? [])
    .map((error, key) => ({ key, field: error.field, message: error.message, ...fieldInfo(error.field) }))
    .filter((entry) => !current.fields.has(entry.field) && !(current.headers && isHeadersPath(entry.field)))

  return {
    /** The summary's entries, in the order the server sent them. */
    entries,
    count: entries.length,
    /** The message shown on a field: the first error the server sent for its path. */
    errorFor: (path: string): string | null => entries.find((entry) => entry.field === path)?.message ?? null,
    /** The field was edited: its error and its summary entries go. Only that exact path. */
    clearField: (path: string) => {
      setEdited((prev) => {
        const base = prev.source === errors ? prev : NONE
        return { source: errors, fields: new Set([...base.fields, path]), headers: base.headers }
      })
    },
    /** A header row went: the bare `headers` error and every `headers[…]` error go (the indexes moved). */
    clearHeaders: () => {
      setEdited((prev) => {
        const base = prev.source === errors ? prev : NONE
        return { source: errors, fields: base.fields, headers: true }
      })
    },
  }
}

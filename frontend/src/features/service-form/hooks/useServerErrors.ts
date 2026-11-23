import { useState } from 'react'
import type { FieldError } from '../../../lib/api/services'
import { CERT_DAYS_PATH, CERT_ENABLED_PATH, IGNORE_CERT_PATH } from '../lib/certificateOptions'
import { parseRulePath, RULES_PATH } from '../lib/jsonRules'
import { fieldLabel, TIMING_GROUP_PATH, type BarePath, type FieldTarget } from '../lib/fieldLabels'
import { CHECK_PREFIX, HOST_PATH, PORT_PATH } from '../lib/serviceType'
import { BODY_CONTENT_PATH, BODY_TYPE_PATH, listPath, parseRowPath, type RowList } from '../lib/requestRows'

export type SummaryEntry = {
  /** Stable within one response: the error's position in it. */
  key: number
  label: string
  message: string
  /** The input the entry links to; null when the path has no input on this screen. */
  target: FieldTarget | null
}

/**
 * What was edited since a response, by server path. `rows:<list>` stands for every row path of
 * that list at once (the indexes shifted, so none of them can be trusted).
 */
type Cleared = string
const NONE: ReadonlySet<Cleared> = new Set()

const ROWS_OF = (list: RowList) => `rows:${list}`
const RULE_ROWS = 'rows:json_rules'
/** Stands for every path that starts with `check.`, an unknown one included. */
const CHECK_PATHS = 'prefix:check.'

export type ErrorSource = 'save' | 'test'

/**
 * The one set of server field errors of the form and where it came from. A new `422` replaces
 * the set, whether a save's (`saveErrors`, the errors of the save hook's failure) or a test's
 * (`showTest`). Starting a test drops the set only if a test made it; starting a save drops any.
 */
export function useFieldErrorSet(saveErrors: readonly FieldError[] | null) {
  // A test's 422 and the save errors it found on screen: a newer save failure (another array) hides it.
  const [test, setTest] = useState<{ errors: readonly FieldError[]; over: readonly FieldError[] | null } | null>(null)
  const testShows = test !== null && test.over === saveErrors
  const drop = () => setTest(null)
  return {
    errors: testShows ? test.errors : saveErrors,
    source: (testShows ? 'test' : saveErrors !== null ? 'save' : null) as ErrorSource | null,
    showTest: (errors: readonly FieldError[]) => setTest({ errors, over: saveErrors }),
    // A save's own errors go with its failure; only a test's are dropped here.
    startTest: drop,
    startSave: drop,
  }
}

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

  const isCleared = (path: string) => {
    if (cleared.has(path)) return true
    if (cleared.has(CHECK_PATHS) && path.startsWith(CHECK_PREFIX)) return true
    const row = parseRowPath(path)
    if (row !== null && cleared.has(ROWS_OF(row.list))) return true
    return parseRulePath(path) !== null && cleared.has(RULE_ROWS)
  }

  const entries: SummaryEntry[] = (errors ?? [])
    .map((error, key) => ({
      key,
      path: error.field,
      message: error.message,
      ...fieldLabel(error.field),
    }))
    .filter((entry) => !isCleared(entry.path))
    .map(({ key, label, message, target }) => ({
      key,
      label,
      message,
      target,
    }))

  const messageAt = (path: string): string | null => {
    const error = (errors ?? []).find((candidate) => candidate.field === path)
    return error !== undefined && !isCleared(path) ? error.message : null
  }

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
    groupError: (): string | null => messageAt(TIMING_GROUP_PATH),
    /** The message of a list as a whole or of the body type (paths with no input), or null. */
    bareError: (path: BarePath): string | null => messageAt(path),
    /** The field was edited: its error and its summary entries go. */
    clearField: (target: FieldTarget) => clear(target),
    /** One of the four timing inputs was edited: its error goes, and so does the group's, which is now stale. */
    clearTiming: (target: FieldTarget) => clear(target, TIMING_GROUP_PATH),
    /** A row was added to the list: the list's own error goes. */
    clearList: (list: RowList) => clear(listPath(list)),
    /** A row was removed: the list's own error and every row error of it go. */
    clearRows: (list: RowList) => clear(listPath(list), ROWS_OF(list)),
    /** A rule was added: the rules' own error goes. */
    clearRulesList: () => clear(RULES_PATH),
    /** A rule was removed: the rules' own error and every rule row error go (the indexes shifted). */
    clearRuleRows: () => clear(RULES_PATH, RULE_ROWS),
    /** The mode or a switch changed: its error goes (a path with no input). */
    clearBare: (path: BarePath) => clear(path),
    /** The expiry switch went off: its error and the days' go. */
    clearExpiryOff: () => clear(CERT_ENABLED_PATH, CERT_DAYS_PATH),
    /** The URL was edited: its error goes, and so do the HTTPS ones, whose cause may be gone. */
    clearUrl: () => clear('check.url', CERT_ENABLED_PATH, IGNORE_CERT_PATH, CERT_DAYS_PATH),
    /** The host was edited: its error goes. */
    clearHost: () => clear(HOST_PATH),
    /** The port was edited: its error goes. */
    clearPort: () => clear(PORT_PATH),
    /** The type changed: every `check.` error was answered for the other type, so all go. */
    clearCheck: () => clear(CHECK_PATHS),
    /** The body type changed: the type's error and the text's go. */
    clearBodyType: () => clear(BODY_TYPE_PATH, BODY_CONTENT_PATH),
  }
}

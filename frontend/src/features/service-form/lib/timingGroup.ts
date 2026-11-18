import type { ServiceFormValues } from '../hooks/useCreateService'

/** The four timing inputs, by form value name. */
export type TimingName = 'check_interval' | 'timeout' | 'retries' | 'retry_interval'

/** The form's timing values, as text. */
export type TimingTexts = Pick<ServiceFormValues, TimingName>

/** Where a new service starts: the contract's defaults (FR-57), as the inputs show them. */
export const TIMING_DEFAULTS: TimingTexts = {
  check_interval: '60',
  timeout: '10',
  retries: '2',
  retry_interval: '10',
}

export const TIMING_NAMES: readonly TimingName[] = ['check_interval', 'timeout', 'retries', 'retry_interval']

export const TIMING_FIELDS = {
  check_interval: {
    label: 'Check interval',
    addon: 's',
    path: 'settings.check_interval_seconds',
  },
  timeout: { label: 'Timeout', addon: 's', path: 'settings.timeout_seconds' },
  retries: { label: 'Retries', addon: 'times', path: 'settings.retry_count' },
  retry_interval: {
    label: 'Retry interval',
    addon: 's',
    path: 'settings.retry_interval_seconds',
  },
} as const satisfies Record<TimingName, { label: string; addon: string; path: string }>

export const TIMING_TEXT = {
  legend: 'Timing',
  notWhole: 'Enter a whole number.',
  longest: 'Longest attempt:',
  fits: 'fits in',
  exceeds: 'exceeds',
} as const

/** The id of the summary line, and of the group's error text. */
export const TIMING_SUM_ID = 'service-timing-sum'
export const TIMING_ERROR_ID = 'service-timing-error'

/** The text as a whole number, or null when it is not one: digits only once trimmed, and a safe integer. */
export function readWholeNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}

/** The four texts as numbers, or null when any is not a whole number. */
export function readTiming(texts: TimingTexts) {
  const interval = readWholeNumber(texts.check_interval)
  const timeout = readWholeNumber(texts.timeout)
  const retries = readWholeNumber(texts.retries)
  const retryInterval = readWholeNumber(texts.retry_interval)
  if (interval === null || timeout === null || retries === null || retryInterval === null) return null
  return { interval, timeout, retries, retryInterval }
}

/** The longest a check can take (FR-56's formula), shown for information; null when it is not a safe integer. */
export function longestAttempt(timeout: number, retries: number, retryInterval: number, interval: number) {
  const seconds = timeout * (1 + retries) + retryInterval * retries
  if (!Number.isSafeInteger(seconds)) return null
  return { seconds, fits: seconds <= interval }
}

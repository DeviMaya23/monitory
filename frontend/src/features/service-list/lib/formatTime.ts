type Day = { year: number; month: number; day: number }

function dayIn(date: Date, locale: string | undefined, timeZone: string | undefined): Day {
  // Latin digits so Number() can read the parts; the locale still picks the calendar.
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

const HM = { hour: '2-digit', minute: '2-digit' } as const
const HMS = { ...HM, second: '2-digit' } as const

/**
 * Formats an ISO timestamp for the viewer (FR-94): the time alone today, day and time earlier
 * (or later, by clock skew) in the same year, and day, year and time without seconds in another
 * year. A string that is not a date is returned as received. `locale` and `timeZone` default
 * to the viewer's.
 */
export function formatTime(iso: string, now: Date, locale?: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const then = dayIn(date, locale, timeZone)
  const today = dayIn(now, locale, timeZone)

  let options: Intl.DateTimeFormatOptions
  if (then.year !== today.year) {
    options = { day: 'numeric', month: 'short', year: 'numeric', ...HM }
  } else if (then.month === today.month && then.day === today.day) {
    options = HMS
  } else {
    options = { day: 'numeric', month: 'short', ...HMS }
  }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date)
}

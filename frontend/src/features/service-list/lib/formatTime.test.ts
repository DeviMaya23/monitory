import { describe, expect, it } from 'vitest'
import { formatTime } from './formatTime'

const NOW = new Date('2026-11-15T14:35:00Z')
const fmt = (iso: string, zone = 'UTC', now = NOW) => formatTime(iso, now, 'en-GB', zone)

describe('formatTime (FR-94)', () => {
  it('shows hour, minute and second only for earlier today', () => {
    expect(fmt('2026-11-15T14:31:52Z')).toBe('14:31:52')
  })

  it('shows day, month and time with seconds for earlier this year', () => {
    const text = fmt('2026-11-12T08:14:03Z')
    expect(text).toContain('12 Nov')
    expect(text).toContain('08:14:03')
    expect(text).not.toContain('2026')
  })

  it('shows the year and no seconds for another year', () => {
    const text = fmt('2025-01-03T08:14:03Z')
    expect(text).toContain('3 Jan 2025')
    expect(text).toContain('08:14')
    expect(text).not.toContain('08:14:03')
  })

  it('puts just before and just after midnight in the zone on either side of today', () => {
    expect(fmt('2026-11-14T23:59:59Z')).toContain('14 Nov')
    expect(fmt('2026-11-15T00:00:00Z')).toBe('00:00:00')
    // 23:30 UTC on the 14th is already the 15th in Tokyo (UTC+9), so it is today there.
    const now = new Date('2026-11-15T10:00:00Z')
    expect(fmt('2026-11-14T23:30:00Z', 'Asia/Tokyo', now)).toBe('08:30:00')
    expect(fmt('2026-11-14T23:30:00Z', 'UTC', now)).toContain('14 Nov')
  })

  it('differs by the zone for the same instant', () => {
    expect(fmt('2026-11-15T14:31:52Z', 'UTC')).toBe('14:31:52')
    expect(fmt('2026-11-15T14:31:52Z', 'Asia/Tokyo')).not.toBe('14:31:52')
  })

  it('uses the same-year format for a later day in the same year', () => {
    const text = fmt('2026-12-20T08:14:03Z')
    expect(text).toContain('20 Dec')
    expect(text).toContain('08:14:03')
  })

  it('uses the other-year format for a later year', () => {
    const text = fmt('2027-02-01T08:14:03Z')
    expect(text).toContain('1 Feb 2027')
    expect(text).not.toContain('08:14:03')
  })

  it.each(['ar-EG', 'fa-IR'])('shows the time alone for earlier today in %s, whose digits are not Latin', (locale) => {
    const iso = '2026-11-15T14:31:52Z'
    const timeOnly = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(iso))
    expect(formatTime(iso, NOW, locale, 'UTC')).toBe(timeOnly)
  })

  it('returns a string that is not a date as received', () => {
    expect(fmt('not a date')).toBe('not a date')
  })
})

import { describe, expect, it } from 'vitest'
import { certificateParts, startsWithHttps } from './certificateOptions'

describe('certificateParts', () => {
  it('sends no days while the check is off, even with days typed', () => {
    expect(
      certificateParts({
        cert_enabled: false,
        cert_days: '30',
        ignore_cert_errors: false,
      }),
    ).toEqual({
      certificate_check: { enabled: false },
      ignore_certificate_errors: false,
    })
  })

  it('sends the days as a number while the check is on, and the ignore switch as it is', () => {
    expect(
      certificateParts({
        cert_enabled: true,
        cert_days: ' 30 ',
        ignore_cert_errors: true,
      }),
    ).toEqual({
      certificate_check: { enabled: true, min_days_left: 30 },
      ignore_certificate_errors: true,
    })
  })
})

describe('startsWithHttps', () => {
  it.each(['https://a', 'HTTPS://a', ' https://a', 'https://'])('is true for %j', (url) => {
    expect(startsWithHttps(url)).toBe(true)
  })

  it.each(['http://a', 'https:/a', '', 'ftp://a', 'xhttps://a'])('is false for %j', (url) => {
    expect(startsWithHttps(url)).toBe(false)
  })
})

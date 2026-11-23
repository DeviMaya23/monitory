import { describe, expect, it } from 'vitest'
import type { Service } from '../../../lib/api/services'
import { makeRichService, makeService, makeTcp } from '../../../test/fixtures'
import { ADD_DEFAULT_VALUES } from './formValues'
import { toFormValues, toServiceInput, toTestInput } from './serviceInput'

describe('toFormValues (FR-7, FR-39)', () => {
  it('gives each text of a full HTTP service as the form holds it', () => {
    expect(toFormValues(makeRichService())).toEqual({
      name: 'Edge cache',
      type: 'http',
      host: '',
      port: '',
      method: 'POST',
      url: 'https://edge.example.com/health',
      query_params: [{ name: 'region', value: 'eu' }],
      headers: [
        { name: 'Authorization', value: 'Bearer abc123-secret' },
        { name: 'X-Trace', value: 'on' },
      ],
      body_type: 'json',
      body_content: '{"ping":1}',
      json_rules: [
        { field: 'checks.db.status', kind: 'text', text: 'down' },
        { field: 'maintenance', kind: 'false', text: '' },
      ],
      json_rule_mode: 'all',
      cert_enabled: true,
      cert_days: '30',
      ignore_cert_errors: true,
      alerts_enabled: false,
      shown_on_public_view: true,
      unhealthy_message: 'Edge is down',
      recovery_message: 'Edge is back',
      check_interval: '120',
      timeout: '7',
      retries: '3',
      retry_interval: '4',
    })
  })

  it('gives a true rule as kind true with an empty text', () => {
    const service = makeService({
      check: { type: 'http', method: 'GET', url: 'https://a.example', json_rules: [{ field: 'ok', failing_value: true }] },
    })
    expect(toFormValues(service).json_rules).toEqual([{ field: 'ok', kind: 'true', text: '' }])
  })

  it('gives a TCP service its host and port as text and the add defaults for the HTTP values', () => {
    expect(toFormValues(makeTcp({ name: 'Cache', check: { type: 'tcp', host: 'cache.internal', port: 6379 } }))).toEqual({
      ...ADD_DEFAULT_VALUES,
      name: 'Cache',
      type: 'tcp',
      host: 'cache.internal',
      port: '6379',
      shown_on_public_view: true,
    })
  })

  it('gives the add timing defaults for a service with no settings, and the add values for the rest', () => {
    const values = toFormValues(makeService({ name: 'Plain' }))
    expect(values).toEqual({ ...ADD_DEFAULT_VALUES, name: 'Plain', url: 'https://example.com/health', shown_on_public_view: true })
  })

  it('treats a body with a type and no content as an empty text, and a none body as no text', () => {
    const body = (b: NonNullable<Extract<Service['check'], { type: 'http' }>['body']>) =>
      toFormValues(makeService({ check: { type: 'http', method: 'GET', url: 'https://a.example', body: b } }))
    expect(body({ type: 'text' })).toMatchObject({ body_type: 'text', body_content: '' })
    expect(body({ type: 'none', content: 'left over' })).toMatchObject({ body_type: 'none', body_content: '' })
  })

  it('keeps the days of a saved certificate check that is off', () => {
    const service = makeService({
      check: { type: 'http', method: 'GET', url: 'https://a.example', certificate_check: { enabled: false, min_days_left: 9 } },
    })
    expect(toFormValues(service)).toMatchObject({ cert_enabled: false, cert_days: '9' })
  })
})

describe('the public page flag (FR-27, FR-68)', () => {
  it('starts false on the add form', () => {
    expect(ADD_DEFAULT_VALUES.shown_on_public_view).toBe(false)
  })

  it.each([true, false])('is sent as %s for an HTTP and a TCP form', (shown) => {
    const http = toFormValues(makeService({ shown_on_public_view: !shown }))
    const tcp = toFormValues(makeTcp({ shown_on_public_view: !shown }))
    expect(toServiceInput({ ...http, shown_on_public_view: shown }).shown_on_public_view).toBe(shown)
    expect(toServiceInput({ ...tcp, shown_on_public_view: shown }).shown_on_public_view).toBe(shown)
  })

  it.each<[string, boolean | undefined, boolean]>([
    ['true', true, true],
    ['false', false, false],
    ['absent', undefined, false],
  ])('is read from a service with the flag %s', (_label, saved, expected) => {
    expect(toFormValues(makeService({ shown_on_public_view: saved })).shown_on_public_view).toBe(expected)
    expect(toFormValues(makeTcp({ shown_on_public_view: saved })).shown_on_public_view).toBe(expected)
  })

  it('survives the round trip', () => {
    for (const shown of [true, false]) {
      const service = makeRichService({ shown_on_public_view: shown })
      expect(toServiceInput(toFormValues(service)).shown_on_public_view).toBe(shown)
    }
  })
})

describe('toServiceInput', () => {
  it('round-trips an HTTP service with rules, a body and certificate options on', () => {
    const service = makeRichService()
    const input = toServiceInput(toFormValues(service))
    expect(input).toEqual({
      name: service.name,
      check: service.check,
      settings: service.settings,
      alerts_enabled: service.alerts_enabled,
      shown_on_public_view: true,
      unhealthy_message: service.unhealthy_message,
      recovery_message: service.recovery_message,
    })
  })

  it('round-trips the limits as typed: 20 headers and 20 query rows, 10 rules, a 64 KB body, spaces and markup kept', () => {
    const rows = (prefix: string) =>
      Array.from({ length: 20 }, (_, i) => ({ name: `${prefix}-${i}`, value: ` v ${i} <b>x</b> & "q" ` }))
    const service = makeService({
      name: '  Spaced <i>name</i>  ',
      check: {
        type: 'http',
        method: 'POST',
        url: 'https://big.example.com',
        query_params: rows('q'),
        headers: rows('H'),
        body: { type: 'json', content: `{"k":"${'x'.repeat(64 * 1024 - 8)}"}` },
        json_rules: Array.from({ length: 10 }, (_, i) => ({ field: `a.b${i}`, failing_value: i % 3 === 0 ? ` s${i} ` : i % 3 === 1 }) ),
        json_rule_mode: 'all',
      },
    })
    const input = toServiceInput(toFormValues(service))
    expect(input.name).toBe(service.name)
    expect(input.check).toMatchObject({ ...service.check, certificate_check: { enabled: false }, ignore_certificate_errors: false })
  })

  it('sends { enabled: false } for a saved certificate check that is off, without days', () => {
    const service = makeService({
      check: { type: 'http', method: 'GET', url: 'https://a.example', certificate_check: { enabled: false, min_days_left: 9 } },
    })
    const { check } = toServiceInput(toFormValues(service))
    expect(check).toMatchObject({ certificate_check: { enabled: false } })
    expect((check as { certificate_check: object }).certificate_check).toEqual({ enabled: false })
  })

  it('round-trips a TCP service with no key of the HTTP check', () => {
    const service = makeTcp({ settings: { check_interval_seconds: 30, timeout_seconds: 5, retry_count: 1, retry_interval_seconds: 2 } })
    const input = toServiceInput(toFormValues(service))
    expect(input.check).toEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
    expect(input.settings).toEqual(service.settings)
  })

  it('gives the add defaults for everything a sparse HTTP or TCP service lacks', () => {
    const http = toServiceInput(toFormValues(makeService()))
    expect(http.check).toMatchObject({ type: 'http', method: 'GET', url: 'https://example.com/health', query_params: [], headers: [], json_rules: [], json_rule_mode: 'any', certificate_check: { enabled: false }, ignore_certificate_errors: false })
    expect(http.check).not.toHaveProperty('body')
    expect(http.settings).toEqual({ check_interval_seconds: 60, timeout_seconds: 10, retry_count: 2, retry_interval_seconds: 10 })
    expect(http.alerts_enabled).toBe(true)
    const tcp = toServiceInput(toFormValues(makeTcp()))
    expect(tcp.check).toEqual({ type: 'tcp', host: 'db.internal', port: 5432 })
    expect(tcp.settings).toEqual(http.settings)
  })
})

describe('toTestInput (FR-104)', () => {
  it('gives an HTTP form the save’s check and only the timeout, none of the other settings', () => {
    const service = makeRichService()
    const values = toFormValues(service)
    const input = toTestInput(values)
    expect(input).toEqual({ check: toServiceInput(values).check, settings: { timeout_seconds: 7 } })
    expect(Object.keys(input).sort()).toEqual(['check', 'settings'])
    expect(Object.keys(input.settings ?? {})).toEqual(['timeout_seconds'])
  })

  it('gives a TCP form the TCP check and the timeout, none of the HTTP keys', () => {
    const values = { ...toFormValues(makeTcp()), timeout: ' 4 ' }
    expect(toTestInput(values)).toEqual({
      check: { type: 'tcp', host: 'db.internal', port: 5432 },
      settings: { timeout_seconds: 4 },
    })
  })
})

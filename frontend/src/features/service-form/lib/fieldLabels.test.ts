import { describe, expect, it } from 'vitest'
import { FIELD_IDS, fieldId } from './fieldIds'
import { fieldLabel } from './fieldLabels'

describe('fieldLabel', () => {
  it.each([
    ['name', 'Name'],
    ['check.method', 'Method'],
    ['check.url', 'URL'],
    ['check.host', 'Host'],
    ['check.port', 'Port'],
    ['unhealthy_message', 'Unhealthy message'],
    ['recovery_message', 'Recovery message'],
    ['settings.check_interval_seconds', 'Check interval'],
    ['settings.timeout_seconds', 'Timeout'],
    ['settings.retry_count', 'Retries'],
    ['settings.retry_interval_seconds', 'Retry interval'],
  ] as const)('maps %s to %s with its target', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
  })

  it.each(['check.unknown', 'toString'])('maps %s to itself with no target', (path) => {
    expect(fieldLabel(path)).toEqual({ label: path, target: null })
  })

  it('maps check.type to Type with no target', () => {
    expect(fieldLabel('check.type')).toEqual({ label: 'Type', target: null })
  })

  it('gives the host and the port their own input ids', () => {
    expect(fieldId('check.host')).toBe('service-host')
    expect(fieldId('check.port')).toBe('service-port')
  })
})

describe('fieldLabel of the Request group’s rows and body', () => {
  it.each([
    ['check.query_params[2].name', 'Query parameter 3 name'],
    ['check.query_params[0].value', 'Query parameter 1 value'],
    ['check.headers[0].value', 'Header 1 value'],
    ['check.headers[4].name', 'Header 5 name'],
    ['check.body.content', 'Body'],
    ['check.headers[10].name', 'Header 11 name'],
    ['check.query_params[19].name', 'Query parameter 20 name'],
    ['check.headers[20].value', 'Header 21 value'],
  ] as const)('maps %s to %s with itself as the input', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
  })

  it.each([
    ['check.query_params', 'Query parameters'],
    ['check.headers', 'Headers'],
    ['check.body.type', 'Body type'],
  ])('maps %s to %s with no input', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: null })
  })

  it.each([
    'check.headers[01].name',
    'check.headers[-1].name',
    'check.headers[].name',
    'check.headers[1].other',
    'check.query_params[0]',
    'check.body',
  ])('maps the near miss %s to itself with no input', (path) => {
    expect(fieldLabel(path)).toEqual({ label: path, target: null })
  })

  it('maps the id of each row input and the body text', () => {
    expect(fieldId('check.query_params[1].name')).toBe('service-query-1-name')
    expect(fieldId('check.headers[3].value')).toBe('service-header-3-value')
    expect(fieldId('check.body.content')).toBe('service-body-content')
    expect(fieldId('check.url')).toBe('service-url')
  })
})

describe('the bare settings path', () => {
  it('is the Timing group: labelled Timing, with no input', () => {
    expect(fieldLabel('settings')).toEqual({ label: 'Timing', target: null })
  })
})

describe('FIELD_IDS', () => {
  it('has a distinct id for every target, including the message text areas and the four timing inputs', () => {
    expect(FIELD_IDS.unhealthy_message).toBeTruthy()
    expect(FIELD_IDS.recovery_message).toBeTruthy()
    expect(FIELD_IDS['settings.timeout_seconds']).toBeTruthy()
    expect(new Set(Object.values(FIELD_IDS)).size).toBe(Object.keys(FIELD_IDS).length)
  })
})

describe('fieldLabel of the rules and the certificate options', () => {
  it.each([
    ['check.json_rules[2].field', 'Rule 3 field path', 'service-rule-2-field'],
    ['check.json_rules[0].failing_value', 'Rule 1 failing value', 'service-rule-0-kind'],
    ['check.certificate_check.min_days_left', 'Minimum days left', 'service-cert-days'],
  ] as const)('maps %s to %s with an input', (path, label, id) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
    expect(fieldId(path)).toBe(id)
  })

  it.each([
    ['check.json_rules', 'Health rules'],
    ['check.json_rule_mode', 'Mark unhealthy when'],
    ['check.certificate_check.enabled', 'Check certificate expiry'],
    ['check.ignore_certificate_errors', 'Ignore certificate errors'],
  ])('maps %s to %s with no input', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: null })
  })

  it.each(['check.json_rules[01].field', 'check.json_rules[1].other', 'check.json_rules[]'])(
    'maps the near miss %s to itself with no input',
    (path) => {
      expect(fieldLabel(path)).toEqual({ label: path, target: null })
    },
  )
})

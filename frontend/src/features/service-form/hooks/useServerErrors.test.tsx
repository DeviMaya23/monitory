import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FieldError } from '../../../lib/api/services'
import { fieldError } from '../../../test/fixtures'
import { useServerErrors } from './useServerErrors'

function setup(errors: readonly FieldError[] | null) {
  return renderHook((props: { errors: readonly FieldError[] | null }) => useServerErrors(props.errors), {
    initialProps: { errors },
  })
}

const THREE = [
  fieldError('name', 'Name is too long here.', 'too_long'),
  fieldError('check.url', 'URL needs a scheme.', 'invalid_format'),
  fieldError('check.method', 'Method is not allowed.'),
]

describe('useServerErrors', () => {
  it('has nothing without a response', () => {
    const { result } = setup(null)
    expect(result.current.entries).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.errorFor('name')).toBeNull()
  })

  it('gives the error of check.url to the URL field and not to the others', () => {
    const { result } = setup([fieldError('check.url', 'URL needs a scheme.')])
    expect(result.current.errorFor('check.url')).toBe('URL needs a scheme.')
    expect(result.current.errorFor('name')).toBeNull()
    expect(result.current.errorFor('check.method')).toBeNull()
  })

  it('lists the entries in the order sent, with labels and targets', () => {
    const { result } = setup(THREE)
    expect(result.current.count).toBe(3)
    expect(
      result.current.entries.map(({ label, message, target }) => ({
        label,
        message,
        target,
      })),
    ).toEqual([
      { label: 'Name', message: 'Name is too long here.', target: 'name' },
      { label: 'URL', message: 'URL needs a scheme.', target: 'check.url' },
      {
        label: 'Method',
        message: 'Method is not allowed.',
        target: 'check.method',
      },
    ])
  })

  it('clearing a field removes only its error and its entry, and the count follows', () => {
    const { result } = setup(THREE)
    act(() => result.current.clearField('check.url'))
    expect(result.current.errorFor('check.url')).toBeNull()
    expect(result.current.errorFor('name')).toBe('Name is too long here.')
    expect(result.current.errorFor('check.method')).toBe('Method is not allowed.')
    expect(result.current.entries.map((entry) => entry.label)).toEqual(['Name', 'Method'])
    expect(result.current.count).toBe(2)
  })

  it('clearing the last one empties the summary', () => {
    const { result } = setup(THREE)
    act(() => result.current.clearField('check.url'))
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(1)
    act(() => result.current.clearField('check.method'))
    expect(result.current.entries).toEqual([])
    expect(result.current.count).toBe(0)
  })

  it('keeps the first of two errors for one path on the field and both in the summary', () => {
    const { result } = setup([fieldError('name', 'First.'), fieldError('name', 'Second.')])
    expect(result.current.errorFor('name')).toBe('First.')
    expect(result.current.entries.map((entry) => entry.message)).toEqual(['First.', 'Second.'])
    expect(result.current.count).toBe(2)
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(0)
  })

  it('lists a path with no field in the summary with no target, and editing does not remove it', () => {
    const { result } = setup([fieldError('check.unknown', 'Not a value.'), fieldError('name', 'Needed.')])
    expect(result.current.entries[0]).toMatchObject({
      label: 'check.unknown',
      message: 'Not a value.',
      target: null,
    })
    act(() => result.current.clearField('name'))
    expect(result.current.entries.map((entry) => entry.label)).toEqual(['check.unknown'])
    expect(result.current.count).toBe(1)
  })

  it('gives the four timing paths to their fields, and the bare settings to the group as Timing with no target', () => {
    const { result } = setup([
      fieldError('settings.timeout_seconds', 'Timeout range.', 'out_of_range'),
      fieldError('settings.retry_count', 'Retries range.', 'out_of_range'),
      fieldError('settings', 'Too long.', 'check_budget_exceeded'),
    ])
    expect(result.current.errorFor('settings.timeout_seconds')).toBe('Timeout range.')
    expect(result.current.errorFor('settings.retry_count')).toBe('Retries range.')
    expect(result.current.errorFor('settings.check_interval_seconds')).toBeNull()
    expect(result.current.groupError()).toBe('Too long.')
    expect(result.current.entries.map(({ label, target }) => ({ label, target }))).toEqual([
      { label: 'Timeout', target: 'settings.timeout_seconds' },
      { label: 'Retries', target: 'settings.retry_count' },
      { label: 'Timing', target: null },
    ])
  })

  it('editing a timing field removes its entry and the group error; editing another field removes only its own', () => {
    const { result } = setup([
      fieldError('settings.timeout_seconds', 'Timeout range.', 'out_of_range'),
      fieldError('settings', 'Too long.', 'check_budget_exceeded'),
      fieldError('name', 'Needed.'),
    ])
    act(() => result.current.clearField('name'))
    expect(result.current.groupError()).toBe('Too long.')
    act(() => result.current.clearTiming('settings.timeout_seconds'))
    expect(result.current.groupError()).toBeNull()
    expect(result.current.errorFor('settings.timeout_seconds')).toBeNull()
    expect(result.current.count).toBe(0)
  })

  it('has no group error without one', () => {
    const { result } = setup([fieldError('name', 'Needed.')])
    expect(result.current.groupError()).toBeNull()
  })

  it('a new response starts with nothing cleared, even with the same errors', () => {
    const { result, rerender } = setup(THREE)
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(2)
    rerender({ errors: [...THREE] })
    expect(result.current.count).toBe(3)
    expect(result.current.errorFor('name')).toBe('Name is too long here.')
    rerender({ errors: null })
    expect(result.current.count).toBe(0)
  })

  describe('the TCP fields and the type change', () => {
    const TCP = [
      fieldError('check.host', 'Enter a host.', 'required'),
      fieldError('check.port', 'Must be between 1 and 65535.', 'out_of_range'),
    ]

    it('maps the host and the port to their labels and inputs, and check.type to Type with no input', () => {
      const { result } = setup([...TCP, fieldError('check.type', 'Bad type.', 'invalid_value')])
      expect(result.current.entries.map(({ label, target }) => ({ label, target }))).toEqual([
        { label: 'Host', target: 'check.host' },
        { label: 'Port', target: 'check.port' },
        { label: 'Type', target: null },
      ])
      expect(result.current.errorFor('check.host')).toBe('Enter a host.')
      expect(result.current.errorFor('check.port')).toBe('Must be between 1 and 65535.')
    })

    it('clearing the host removes only its entry', () => {
      const { result } = setup(TCP)
      act(() => result.current.clearHost())
      expect(result.current.errorFor('check.host')).toBeNull()
      expect(result.current.errorFor('check.port')).toBe('Must be between 1 and 65535.')
      expect(result.current.count).toBe(1)
    })

    it('clearing the port removes only its entry', () => {
      const { result } = setup(TCP)
      act(() => result.current.clearPort())
      expect(result.current.errorFor('check.port')).toBeNull()
      expect(result.current.errorFor('check.host')).toBe('Enter a host.')
      expect(result.current.count).toBe(1)
    })

    it('clearing every check path removes them all, an unknown one included, and keeps name, timing and the messages', () => {
      const { result, rerender } = setup([
        fieldError('check.method', 'M.'),
        fieldError('check.url', 'U.'),
        fieldError('check.query_params[0].name', 'Q.'),
        fieldError('check.headers', 'H.'),
        fieldError('check.body.content', 'B.'),
        fieldError('check.json_rules[0].field', 'R.'),
        fieldError('check.json_rule_mode', 'RM.'),
        fieldError('check.certificate_check.min_days_left', 'C.'),
        fieldError('check.host', 'Host.'),
        fieldError('check.port', 'Port.'),
        fieldError('check.type', 'T.'),
        fieldError('check.unknown', 'X.'),
        fieldError('name', 'Name.'),
        fieldError('settings.timeout_seconds', 'Timeout.'),
        fieldError('unhealthy_message', 'Unhealthy.'),
        fieldError('recovery_message', 'Recovery.'),
      ])
      act(() => result.current.clearCheck())
      expect(result.current.entries.map((entry) => entry.label)).toEqual([
        'Name',
        'Timeout',
        'Unhealthy message',
        'Recovery message',
      ])
      rerender({ errors: [fieldError('check.host', 'Again.')] })
      expect(result.current.errorFor('check.host')).toBe('Again.')
    })
  })

  describe('the Request group’s rows and body', () => {
    const ROWS = [
      fieldError('check.query_params[1].name', 'Q name.'),
      fieldError('check.query_params', 'Too many queries.'),
      fieldError('check.headers[0].value', 'H value.'),
      fieldError('check.headers[2].name', 'H name.'),
      fieldError('check.headers', 'Too many headers.'),
      fieldError('check.body.type', 'Bad type.'),
      fieldError('check.body.content', 'Too long.'),
      fieldError('name', 'Needed.'),
    ]

    it('maps each path to its label and input, and the bare paths to a label with no input', () => {
      const { result } = setup(ROWS)
      expect(result.current.entries.map(({ label, target }) => ({ label, target }))).toEqual([
        { label: 'Query parameter 2 name', target: 'check.query_params[1].name' },
        { label: 'Query parameters', target: null },
        { label: 'Header 1 value', target: 'check.headers[0].value' },
        { label: 'Header 3 name', target: 'check.headers[2].name' },
        { label: 'Headers', target: null },
        { label: 'Body type', target: null },
        { label: 'Body', target: 'check.body.content' },
        { label: 'Name', target: 'name' },
      ])
      expect(result.current.errorFor('check.headers[2].name')).toBe('H name.')
      expect(result.current.errorFor('check.headers[1].name')).toBeNull()
      expect(result.current.bareError('check.headers')).toBe('Too many headers.')
      expect(result.current.bareError('check.body.type')).toBe('Bad type.')
    })

    it('clearing a row’s path removes only that row’s entry', () => {
      const { result } = setup(ROWS)
      act(() => result.current.clearField('check.headers[0].value'))
      expect(result.current.errorFor('check.headers[0].value')).toBeNull()
      expect(result.current.errorFor('check.headers[2].name')).toBe('H name.')
      expect(result.current.errorFor('check.query_params[1].name')).toBe('Q name.')
      expect(result.current.count).toBe(7)
    })

    it('clearing a list’s own path removes only its entry', () => {
      const { result } = setup(ROWS)
      act(() => result.current.clearList('headers'))
      expect(result.current.bareError('check.headers')).toBeNull()
      expect(result.current.errorFor('check.headers[0].value')).toBe('H value.')
      expect(result.current.bareError('check.query_params')).toBe('Too many queries.')
      expect(result.current.count).toBe(7)
    })

    it('clearing all rows of a list removes its rows and its own entry, and leaves the other list and the body', () => {
      const { result } = setup(ROWS)
      act(() => result.current.clearRows('headers'))
      expect(result.current.entries.map((entry) => entry.label)).toEqual([
        'Query parameter 2 name',
        'Query parameters',
        'Body type',
        'Body',
        'Name',
      ])
    })

    it('clearing the body content removes its entry only; changing the type removes both body entries', () => {
      const { result } = setup(ROWS)
      act(() => result.current.clearField('check.body.content'))
      expect(result.current.errorFor('check.body.content')).toBeNull()
      expect(result.current.bareError('check.body.type')).toBe('Bad type.')
      expect(result.current.count).toBe(7)
      act(() => result.current.clearBodyType())
      expect(result.current.bareError('check.body.type')).toBeNull()
      expect(result.current.count).toBe(6)
    })

    it('a new response starts with nothing cleared', () => {
      const { result, rerender } = setup(ROWS)
      act(() => result.current.clearRows('headers'))
      act(() => result.current.clearBodyType())
      rerender({ errors: [...ROWS] })
      expect(result.current.count).toBe(8)
    })
  })
})

describe('the rules and the certificate options', () => {
  const ALL = [
    fieldError('check.json_rules', 'Too many rules.', 'too_many'),
    fieldError('check.json_rules[0].field', 'Rule 0 needs a field.', 'required'),
    fieldError('check.json_rules[1].failing_value', 'Rule 1 needs a value.', 'required'),
    fieldError('check.headers[0].name', 'Header 0 is bad.'),
    fieldError('check.certificate_check.enabled', 'Needs https.', 'requires_https_url'),
    fieldError('check.certificate_check.min_days_left', 'Must be 1 or more.', 'out_of_range'),
    fieldError('check.ignore_certificate_errors', 'Needs https.', 'requires_https_url'),
    fieldError('check.json_rule_mode', 'Bad mode.', 'invalid_value'),
  ]
  const labels = (result: { current: ReturnType<typeof useServerErrors> }) =>
    result.current.entries.map((entry) => entry.label)

  it('maps the paths to labels and inputs, and shows the paths with no input as bare messages', () => {
    const { result } = setup(ALL)
    expect(result.current.entries.map(({ label, target }) => ({ label, target }))).toEqual([
      { label: 'Health rules', target: null },
      { label: 'Rule 1 field path', target: 'check.json_rules[0].field' },
      {
        label: 'Rule 2 failing value',
        target: 'check.json_rules[1].failing_value',
      },
      { label: 'Header 1 name', target: 'check.headers[0].name' },
      { label: 'Check certificate expiry', target: null },
      {
        label: 'Minimum days left',
        target: 'check.certificate_check.min_days_left',
      },
      { label: 'Ignore certificate errors', target: null },
      { label: 'Mark unhealthy when', target: null },
    ])
    expect(result.current.bareError('check.json_rules')).toBe('Too many rules.')
    expect(result.current.bareError('check.json_rule_mode')).toBe('Bad mode.')
  })

  it('clearing a rule’s field path removes only that entry', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearField('check.json_rules[0].field'))
    expect(labels(result)).not.toContain('Rule 1 field path')
    expect(labels(result)).toContain('Rule 2 failing value')
    expect(result.current.count).toBe(7)
  })

  it('clearing a rule’s failing value removes only that entry', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearField('check.json_rules[1].failing_value'))
    expect(labels(result)).not.toContain('Rule 2 failing value')
    expect(labels(result)).toContain('Rule 1 field path')
    expect(result.current.count).toBe(7)
  })

  it('clearing all rules removes the list’s entry and every rule row, and leaves the request rows and the certificate entries', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearRuleRows())
    expect(labels(result)).toEqual([
      'Header 1 name',
      'Check certificate expiry',
      'Minimum days left',
      'Ignore certificate errors',
      'Mark unhealthy when',
    ])
  })

  it('adding a rule removes only the list’s own entry', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearRulesList())
    expect(result.current.bareError('check.json_rules')).toBeNull()
    expect(result.current.count).toBe(7)
    expect(labels(result)).toContain('Rule 1 field path')
  })

  it('clearing the days leaves the switch entries', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearField('check.certificate_check.min_days_left'))
    expect(labels(result)).not.toContain('Minimum days left')
    expect(labels(result)).toContain('Check certificate expiry')
    expect(labels(result)).toContain('Ignore certificate errors')
  })

  it('turning the expiry switch off removes its entry and the days’; the ignore entry stays', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearExpiryOff())
    expect(labels(result)).not.toContain('Check certificate expiry')
    expect(labels(result)).not.toContain('Minimum days left')
    expect(labels(result)).toContain('Ignore certificate errors')
  })

  it('clearing the mode or one switch removes only its own entry', () => {
    const { result } = setup(ALL)
    act(() => result.current.clearBare('check.json_rule_mode'))
    act(() => result.current.clearBare('check.ignore_certificate_errors'))
    expect(labels(result)).not.toContain('Mark unhealthy when')
    expect(labels(result)).not.toContain('Ignore certificate errors')
    expect(labels(result)).toContain('Check certificate expiry')
  })

  it('editing the URL removes the two requires_https_url entries, the days entry and the URL’s own', () => {
    const { result } = setup([fieldError('check.url', 'Bad URL.'), ...ALL])
    act(() => result.current.clearUrl())
    expect(labels(result)).toEqual([
      'Health rules',
      'Rule 1 field path',
      'Rule 2 failing value',
      'Header 1 name',
      'Mark unhealthy when',
    ])
  })

  it('a new response starts with nothing cleared', () => {
    const { result, rerender } = setup(ALL)
    act(() => result.current.clearRuleRows())
    act(() => result.current.clearUrl())
    rerender({ errors: [...ALL] })
    expect(result.current.count).toBe(8)
  })
})

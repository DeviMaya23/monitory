import { describe, expect, it } from 'vitest'
import { parseRulePath, ruleInputId, rulePath, ruleParts } from './jsonRules'

describe('ruleParts', () => {
  it('sends the text untrimmed, in order, and the booleans for true and false', () => {
    expect(
      ruleParts({
        json_rules: [
          { field: ' a.b ', kind: 'text', text: ' down ' },
          { field: 'x', kind: 'true', text: 'typed before' },
          { field: 'y', kind: 'false', text: 'typed before' },
          { field: 'z', kind: 'text', text: '' },
        ],
        json_rule_mode: 'all',
      }),
    ).toEqual({
      json_rules: [
        { field: ' a.b ', failing_value: ' down ' },
        { field: 'x', failing_value: true },
        { field: 'y', failing_value: false },
        { field: 'z', failing_value: '' },
      ],
      json_rule_mode: 'all',
    })
  })

  it('sends no rules as an empty list and passes the mode through', () => {
    expect(ruleParts({ json_rules: [], json_rule_mode: 'any' })).toEqual({
      json_rules: [],
      json_rule_mode: 'any',
    })
  })
})

describe('rule ids and paths', () => {
  it('maps rule i to its three ids and two paths', () => {
    expect([ruleInputId(4, 'field'), ruleInputId(4, 'kind'), ruleInputId(4, 'text')]).toEqual([
      'service-rule-4-field',
      'service-rule-4-kind',
      'service-rule-4-text',
    ])
    expect(rulePath(4, 'field')).toBe('check.json_rules[4].field')
    expect(rulePath(4, 'failing_value')).toBe('check.json_rules[4].failing_value')
  })

  it('reads a rule path back, and refuses near misses', () => {
    expect(parseRulePath('check.json_rules[12].failing_value')).toEqual({
      index: 12,
      part: 'failing_value',
    })
    expect(parseRulePath('check.json_rules[012].field')).toBeNull()
    expect(parseRulePath('check.json_rules')).toBeNull()
  })
})

import type { ServiceFormValues } from '../lib/formValues'

/** What a rule's failing value is: typed text, or the boolean `true` or `false`. */
export type RuleKind = 'text' | 'true' | 'false'
export type RuleMode = 'any' | 'all'
/** The two parts of a rule that have a server path of their own. */
export type RulePart = 'field' | 'failing_value'

export type RuleValue = { field: string; kind: RuleKind; text: string }

export const RULES_TEXT = {
  legend: 'Health rules',
  optional: '(optional)',
  description:
    'The response is parsed as JSON. A rule matches when the value at the field path equals the failing value.',
  empty: 'No JSON rules. Any 2xx response counts as healthy.',
  add: 'Add rule',
  headField: 'Field path',
  headKind: 'Failing value',
  headText: 'Text',
  noText: 'Not needed for true/false',
  hintLead: 'Path example:',
  hintExample: 'checks.db.status',
  modeLabel: 'Mark unhealthy when',
} as const

export const RULE_KIND_OPTIONS: readonly { value: RuleKind; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
]

export const RULE_MODE_OPTIONS: readonly { value: RuleMode; text: string }[] = [
  { value: 'any', text: 'Any rule matches' },
  { value: 'all', text: 'All rules match' },
]

export const DEFAULT_RULE_KIND: RuleKind = 'text'
export const DEFAULT_RULE_MODE: RuleMode = 'any'

export const RULE_MODE_ID = 'service-rule-mode'
/** The id of the message about the rules as a whole. */
export const RULES_ERROR_ID = 'service-rules-error'

/** The element id of a rule's input (`field`, `text`) or of its kind's trigger (`kind`). */
export const ruleInputId = (index: number, part: 'field' | 'kind' | 'text') => `service-rule-${index}-${part}`

/** The server `field` paths. */
export const RULES_PATH = 'check.json_rules'
export const RULE_MODE_PATH = 'check.json_rule_mode'
export const rulePath = (index: number, part: RulePart) => `check.json_rules[${index}].${part}` as const

const RULE_PATH = /^check\.json_rules\[(0|[1-9]\d*)\]\.(field|failing_value)$/

/** The rule and part a server path names; null when it is not a rule row path. */
export function parseRulePath(path: string): { index: number; part: RulePart } | null {
  const match = RULE_PATH.exec(path)
  if (match === null) return null
  return { index: Number(match[1]), part: match[2] as RulePart }
}

/** The labels of a rule's controls: the summary's, and the accessible names (`n` counts from 1). */
export const ruleLabel = (index: number, part: RulePart) =>
  `Rule ${index + 1} ${part === 'field' ? 'field path' : 'failing value'}`
export const ruleKindName = (index: number) => `Rule ${index + 1} failing value type`
export const ruleTextName = (index: number) => `Rule ${index + 1} failing text`
export const ruleRemoveName = (index: number) => `Remove rule ${index + 1}`

type RuleParts = Pick<ServiceFormValues, 'json_rules' | 'json_rule_mode'>

/**
 * The rules as `createService` takes them (FR-44, FR-47): in order, the path and the text as
 * typed, `true` and `false` as booleans. The server trims the path and refuses what is wrong.
 */
export function ruleParts({ json_rules, json_rule_mode }: RuleParts) {
  return {
    json_rules: json_rules.map(({ field, kind, text }) => ({
      field,
      failing_value: kind === 'text' ? text : kind === 'true',
    })),
    json_rule_mode,
  }
}

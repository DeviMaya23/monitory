import type { HttpMethod } from '../../../lib/api/services'
import { DEFAULT_CERT_DAYS } from './certificateOptions'
import { DEFAULT_RULE_MODE, type RuleMode, type RuleValue } from './jsonRules'
import { DEFAULT_BODY_TYPE, type BodyType } from './requestRows'
import { DEFAULT_SERVICE_TYPE, type ServiceType } from './serviceType'
import { TIMING_DEFAULTS } from './timingGroup'

/** What the form holds: every value on the screen, as typed. The two messages are sent as typed. */
export type ServiceFormValues = {
  name: string
  /** The kind of service; only its own fields are sent, the others stay in the form. */
  type: ServiceType
  /** The TCP host and port, as typed. */
  host: string
  port: string
  method: HttpMethod
  url: string
  /** The query parameter and header rows, as typed. */
  query_params: { name: string; value: string }[]
  headers: { name: string; value: string }[]
  /** The body's type and text; the text is kept while the type is `none`, and not sent. */
  body_type: BodyType
  body_content: string
  /** The JSON rules as typed; the text is kept while the kind is `true` or `false`, and not sent. */
  json_rules: RuleValue[]
  json_rule_mode: RuleMode
  /** The certificate-expiry switch, its days as typed, and the ignore-errors switch. */
  cert_enabled: boolean
  cert_days: string
  ignore_cert_errors: boolean
  alerts_enabled: boolean
  unhealthy_message: string
  recovery_message: string
  /** The four timing values, as typed (FR-41, FR-51, FR-53, FR-57). */
  check_interval: string
  timeout: string
  retries: string
  retry_interval: string
}

/** The method a new service starts with. */
export const DEFAULT_METHOD: HttpMethod = 'GET'

/** What a new service's form starts with, and what an edit form shows for the other type's values. */
export const ADD_DEFAULT_VALUES: ServiceFormValues = {
  name: '',
  type: DEFAULT_SERVICE_TYPE,
  host: '',
  port: '',
  method: DEFAULT_METHOD,
  url: '',
  query_params: [],
  headers: [],
  body_type: DEFAULT_BODY_TYPE,
  body_content: '',
  json_rules: [],
  json_rule_mode: DEFAULT_RULE_MODE,
  cert_enabled: false,
  cert_days: DEFAULT_CERT_DAYS,
  ignore_cert_errors: false,
  alerts_enabled: true,
  unhealthy_message: '',
  recovery_message: '',
  ...TIMING_DEFAULTS,
}

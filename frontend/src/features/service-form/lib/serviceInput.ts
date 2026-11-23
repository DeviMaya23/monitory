import type { Service, ServiceInput, ServiceTestInput } from '../../../lib/api/services'
import { certificateParts, DEFAULT_CERT_DAYS } from './certificateOptions'
import { ADD_DEFAULT_VALUES, type ServiceFormValues } from './formValues'
import { ruleParts, type RuleValue } from './jsonRules'
import { requestParts } from './requestRows'
import { tcpCheck } from './serviceType'
import { readWholeNumber, TIMING_DEFAULTS } from './timingGroup'

/** The check `createService`, `updateService` and `testServiceCheck` take, from the form's values. The one place it is built. */
export function toCheckInput(values: ServiceFormValues): ServiceInput['check'] {
  const { type, host, port, method, url } = values
  return type === 'tcp'
    ? // The form has checked the port; the fallback only satisfies the types.
      tcpCheck(host, readWholeNumber(port) ?? 0)
    : {
        type: 'http',
        method,
        url,
        ...requestParts(values),
        ...ruleParts(values),
        ...certificateParts(values),
      }
}

/** The body `testServiceCheck` takes: the check and the timeout, nothing else (FR-104). */
export function toTestInput(values: ServiceFormValues): ServiceTestInput {
  return { check: toCheckInput(values), settings: { timeout_seconds: Number(values.timeout.trim()) } }
}

/** The body `createService` and `updateService` take, from the form's values. */
export function toServiceInput(values: ServiceFormValues): ServiceInput {
  const { name, alerts_enabled, shown_on_public_view, unhealthy_message, recovery_message } = values
  return {
    name,
    check: toCheckInput(values),
    alerts_enabled,
    shown_on_public_view,
    unhealthy_message,
    recovery_message,
    settings: {
      check_interval_seconds: Number(values.check_interval.trim()),
      timeout_seconds: Number(values.timeout.trim()),
      retry_count: Number(values.retries.trim()),
      retry_interval_seconds: Number(values.retry_interval.trim()),
    },
  }
}

const text = (value: number | undefined, fallback: string) => (value === undefined ? fallback : String(value))

/**
 * The form's values for a saved service, the inverse of `toServiceInput` for what the form edits.
 * The other type's values are the add defaults; every value the form holds is read.
 */
export function toFormValues(service: Service): ServiceFormValues {
  const { check, settings } = service
  const base: ServiceFormValues = {
    ...ADD_DEFAULT_VALUES,
    name: service.name,
    type: check.type,
    alerts_enabled: service.alerts_enabled ?? true,
    shown_on_public_view: service.shown_on_public_view ?? false,
    unhealthy_message: service.unhealthy_message ?? '',
    recovery_message: service.recovery_message ?? '',
    check_interval: text(settings?.check_interval_seconds, TIMING_DEFAULTS.check_interval),
    timeout: text(settings?.timeout_seconds, TIMING_DEFAULTS.timeout),
    retries: text(settings?.retry_count, TIMING_DEFAULTS.retries),
    retry_interval: text(settings?.retry_interval_seconds, TIMING_DEFAULTS.retry_interval),
  }
  if (check.type === 'tcp') return { ...base, host: check.host, port: String(check.port) }
  return {
    ...base,
    method: check.method,
    url: check.url,
    query_params: (check.query_params ?? []).map(({ name, value }) => ({ name, value })),
    headers: (check.headers ?? []).map(({ name, value }) => ({ name, value })),
    body_type: check.body?.type ?? ADD_DEFAULT_VALUES.body_type,
    body_content: check.body?.type === 'none' ? '' : (check.body?.content ?? ''),
    json_rules: (check.json_rules ?? []).map(
      ({ field, failing_value }): RuleValue =>
        typeof failing_value === 'string'
          ? { field, kind: 'text', text: failing_value }
          : { field, kind: failing_value ? 'true' : 'false', text: '' },
    ),
    json_rule_mode: check.json_rule_mode ?? ADD_DEFAULT_VALUES.json_rule_mode,
    cert_enabled: check.certificate_check?.enabled ?? false,
    cert_days: text(check.certificate_check?.min_days_left, DEFAULT_CERT_DAYS),
    ignore_cert_errors: check.ignore_certificate_errors ?? false,
  }
}

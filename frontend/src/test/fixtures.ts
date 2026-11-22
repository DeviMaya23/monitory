import { ApiError, type ProblemBody } from '../lib/api/ApiError'
import type { PublicDashboard, PublicService } from '../lib/api/publicDashboard'
import type { FieldError, Service, ServiceList } from '../lib/api/services'
import type { SessionInfo } from '../lib/api/session'
import type { EmailTarget, TargetList, WebhookTarget } from '../lib/api/targets'

export const sessionInfo: SessionInfo = { csrf_token: 'csrf-1', expires_at: '2026-12-16T10:00:00Z' }

/** An `ApiError` as `apiRequest` throws it for a problem response. */
export function problem(status: number, code: ProblemBody['code'], detail?: string, errors?: FieldError[]): ApiError {
  return new ApiError(status, { title: 'Problem', status, code, detail, errors }, null)
}

/** A `422 validation_failed` with the given field errors. */
export function validationProblem(...errors: FieldError[]): ApiError {
  return problem(422, 'validation_failed', undefined, errors)
}

/** One field error; the code defaults to `invalid_value`. */
export function fieldError(field: string, message: string, code: FieldError['code'] = 'invalid_value'): FieldError {
  return { field, code, message }
}

type FailureReason = NonNullable<Service['state']['last_failure_reason']>

/** A healthy HTTP service; pass overrides for any field. The id follows the name. */
export function makeService(overrides: Partial<Service> & { name?: string } = {}): Service {
  const name = overrides.name ?? 'API gateway'
  return {
    id: `id-${name}`,
    name,
    check: { type: 'http', method: 'GET', url: 'https://example.com/health' },
    alerts_enabled: true,
    shown_on_public_view: true,
    paused: false,
    target_count: 0,
    alert_delivery_failed: false,
    state: {
      status: 'healthy',
      last_checked_at: '2026-11-15T14:31:52Z',
      last_status_change_at: '2026-11-12T08:14:03Z',
      last_failure_reason: null,
    },
    ...overrides,
  }
}

/** An unhealthy HTTP service with the given reason. */
export function makeUnhealthy(reason: FailureReason | null, overrides: Partial<Service> = {}): Service {
  return makeService({
    name: 'Billing webhook',
    state: {
      status: 'unhealthy',
      last_checked_at: '2026-11-15T14:31:40Z',
      last_status_change_at: '2026-11-15T14:29:40Z',
      last_failure_reason: reason,
    },
    ...overrides,
  })
}

/** A service that has not been checked yet. */
export function makeUnchecked(overrides: Partial<Service> = {}): Service {
  return makeService({
    name: 'New service',
    state: { status: 'not_yet_checked', last_checked_at: null, last_status_change_at: null, last_failure_reason: null },
    ...overrides,
  })
}

/** A TCP service. */
export function makeTcp(overrides: Partial<Service> = {}): Service {
  return makeService({ name: 'Postgres', check: { type: 'tcp', host: 'db.internal', port: 5432 }, ...overrides })
}

/** An HTTP service with every setting non-default: headers, a query row, a JSON body, two rules, certificate options, timing, alerts off and messages. */
export function makeRichService(overrides: Partial<Service> = {}): Service {
  return makeService({
    id: '0190-rich',
    name: 'Edge cache',
    check: {
      type: 'http',
      method: 'POST',
      url: 'https://edge.example.com/health',
      query_params: [{ name: 'region', value: 'eu' }],
      headers: [
        { name: 'Authorization', value: 'Bearer abc123-secret' },
        { name: 'X-Trace', value: 'on' },
      ],
      body: { type: 'json', content: '{"ping":1}' },
      json_rules: [
        { field: 'checks.db.status', failing_value: 'down' },
        { field: 'maintenance', failing_value: false },
      ],
      json_rule_mode: 'all',
      certificate_check: { enabled: true, min_days_left: 30 },
      ignore_certificate_errors: true,
    },
    settings: { check_interval_seconds: 120, timeout_seconds: 7, retry_count: 3, retry_interval_seconds: 4 },
    alerts_enabled: false,
    unhealthy_message: 'Edge is down',
    recovery_message: 'Edge is back',
    shown_on_public_view: true,
    ...overrides,
  })
}

/** A paused service whose stored state is unhealthy with a reason. */
export function makePaused(overrides: Partial<Service> = {}): Service {
  return makeUnhealthy({ code: 'timed_out' }, { name: 'Paused one', paused: true, ...overrides })
}

export function makeServiceList(...services: Service[]): ServiceList {
  return services
}

/** An email target; pass overrides for any field. The id follows the address. */
export function makeEmailTarget(overrides: Partial<EmailTarget> = {}): EmailTarget {
  const address = overrides.address ?? 'ops@example.com'
  return { id: `t-${address}`, type: 'email', name: 'Ops mailbox', address, last_delivery_failed: false, ...overrides }
}

/** A webhook target; pass overrides for any field. The id follows the URL. */
export function makeWebhookTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  const url = overrides.url ?? 'https://hooks.example.com/alerts'
  return { id: `t-${url}`, type: 'webhook', name: 'Chat hook', url, last_delivery_failed: false, ...overrides }
}

export function makeTargetList(...targets: TargetList): TargetList {
  return targets
}

/** A healthy public-view row; pass overrides for any field. */
export function makePublicService(overrides: Partial<PublicService> = {}): PublicService {
  return { name: 'API gateway', status: 'healthy', last_checked_at: '2026-11-15T14:31:52Z', ...overrides }
}

export function makePublicDashboard(...services: PublicService[]): PublicDashboard {
  return { services }
}

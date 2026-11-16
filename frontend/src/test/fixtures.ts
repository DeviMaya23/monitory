import { ApiError, type ProblemBody } from '../lib/api/ApiError'
import type { Service, ServiceList } from '../lib/api/services'
import type { SessionInfo } from '../lib/api/session'

export const sessionInfo: SessionInfo = { csrf_token: 'csrf-1', expires_at: '2026-12-16T10:00:00Z' }

/** An `ApiError` as `apiRequest` throws it for a problem response. */
export function problem(status: number, code: ProblemBody['code'], detail?: string): ApiError {
  return new ApiError(status, { title: 'Problem', status, code, detail }, null)
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

/** A paused service whose stored state is unhealthy with a reason. */
export function makePaused(overrides: Partial<Service> = {}): Service {
  return makeUnhealthy({ code: 'timed_out' }, { name: 'Paused one', paused: true, ...overrides })
}

export function makeServiceList(...services: Service[]): ServiceList {
  return services
}

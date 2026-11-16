# Task: list and delete services API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can read every service with its current state and delete a service through the API: `listServices` and `deleteService` become real. After this task the dashboard has data to show and a service added with `createService` can be seen and removed. Deleting removes the service with its state and alert list in one step, and then tells the scheduler seam to stop the service; the scheduler itself is a later task.

Requirements covered:

- FR-9, FR-62: every service, ordered by name ignoring case, with name, type, current status, last check time, last status change time, the failure reason when unhealthy, whether alerts are on, whether it is shown on the public view.
- FR-61, in part: the failure reason is returned with its code and the status code or rule field that goes with it. Producing a reason is the scheduler's job.
- FR-77, FR-112, in part: `paused` is returned and the stored status is returned unchanged; the screen shows a paused service as paused. Pausing itself is milestone 3.
- FR-86, in part: `alert_delivery_failed` is computed from the targets. Nothing sets a target's flag until milestone 2, so it is false in practice.
- FR-8, FR-70: a service can be deleted; it and its state and alert list are gone, and it no longer appears in the list.
- FR-71, in part: after the delete commits, the scheduler is told to stop the service (the seam). Stopping a timer comes with the scheduler.
- NFR-8: both operations sit behind the policy router's gate, and `deleteService` behind the CSRF check.

Out of scope:

- The dashboard and the delete dialog. `dashboard-screen` builds the dashboard against a mock; the delete dialog is a later frontend task. FR-72 (the confirmation) is the dialog.
- `getService`, `updateService`, `pauseService`, `resumeService`, `testServiceCheck`. Other tasks. Their 501 stubs stay.
- Running checks, writing a state, stopping a real timer or a running attempt (the scheduler task). The wired scheduler stays the do-nothing placeholder; this task only gives it a `Stop` method.
- Anything that writes `service_states` or `targets`. Only the check-result and delivery-outcome usecases will; tests here insert rows directly.
- Pagination, filtering and sorting options. The contract has none: the list is bounded by the service limit and ordered by name.

## Prerequisite

`create-service-api` is merged. This task builds on what it adds, and the builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `domain.ServiceView`.
- `usecase.ServiceService`, with its repository and scheduler interfaces, and `worker.NoopScheduler`.
- `repository.ServiceRepository` with `Create`.
- `handler.ServiceService`, `handler/services.go` (`CreateService`), and `handler/service_mapping.go` with the function that maps a `domain.ServiceView` to an `api.Service` (its name was left to that task's builder: find it in the merged code and use it).
- The handler test double of `handler.ServiceService` in `handler/helpers_test.go` and the fakes of the repository and scheduler in `usecase/fakes_test.go` (names likewise).

## Role and ownership

Role: Backend.

You may change `backend/**`. You may not change `backend/migration/**` (the tables exist), `backend/internal/api/**` (generated), `backend/go.mod`, `backend/go.sum`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/list-and-delete-services-api.plan.md`), `.env.example`, the `Makefile` or anything outside `backend/`. No dependency and no configuration key is added.

Shared files this task touches, all owned by this task while it runs:

- `backend/internal/usecase/service.go`, `backend/internal/usecase/service_repository.go` (new, see "Structure"), `backend/internal/usecase/service_test.go`, `backend/internal/usecase/fakes_test.go`
- `backend/internal/repository/service.go`, `backend/internal/repository/service_test.go`
- `backend/internal/handler/server.go` (the `ServiceService` interface), `backend/internal/handler/services.go`, `backend/internal/handler/services_test.go`, `backend/internal/handler/service_mapping.go`, `backend/internal/handler/service_mapping_test.go`, `backend/internal/handler/helpers_test.go`, `backend/internal/handler/router_test.go`
- `backend/internal/worker/noop_scheduler.go`
- `backend/internal/domain/service_view.go`, only if scanning the list query needs a tag or the repository needs its own row type (a row type inside `repository/` is preferred)

`cmd/server/main.go` and `handler/problem.go` do not change: the service usecase is already wired, and `domain.ErrNotFound` is already mapped to 404.

Tasks that may run at the same time: frontend tasks only (`dashboard-screen` and the later add-service and delete-dialog screens). They share no file with this one (`frontend/**` against `backend/**`). No other backend task runs beside this one; the scheduler task waits for this one.

## Operations used

From `docs/openapi.yaml`. Both are 501 stubs in `backend/internal/handler/stubs.go` today. Types come from the generated package `backend/internal/api`, never hand-written; only `handler/` imports it.

| Operation | Method and path | Access | Responses this task produces |
|---|---|---|---|
| `listServices` | `GET /api/services` | gated | 200 `ServiceList`; 401 `unauthenticated`; 500 `internal_error` |
| `deleteService` | `DELETE /api/services/{serviceId}` | gated, needs `X-CSRF-Token` | 204 with no body; 401 `unauthenticated`; 403 `csrf_failed`; 404 `not_found`; 500 `internal_error` |

`serviceId` is any string. An id that does not exist, including one that is not a UUID, is `404 not_found`. Neither operation takes a body, a query parameter or a header beyond the CSRF token.

## Behavior

### What exists

- The policy router already answers 401 without a session and, for `deleteService`, 403 without the CSRF token. Handlers never check them.
- `create-service-api` saves services and their state rows (see "Prerequisite"). `domain.ServiceView` holds a `Service`, its `ServiceState`, `TargetCount` and `AlertDeliveryFailed`.
- `domain.ErrNotFound` exists and `handler/problem.go` maps it to `404 not_found`, title `Not found`.
- `service_states` and `targets` have `ON DELETE CASCADE` foreign keys to `services`, and every connection has `foreign_keys` on (`platform/database`). `targets` has no writer yet.
- `usecase.Scheduler` has one method, `Start(service domain.Service)`; `worker.NoopScheduler` implements it and does nothing.
- `TestRouter_UnimplementedOperationAnswers501` in `handler/router_test.go` asserts that `GET /api/services` answers 501.

### listServices

Answers `200` with a JSON list (never `null`; no services is `[]`) of every service, in this order: `ORDER BY name_key, id` (`docs/data-model.md`). The order is that of the database query; neither the usecase nor the handler sorts. `name_key` is the lower-cased name (`domain.ServiceNameKey`) and SQLite compares it by the bytes of its UTF-8 text, so case is ignored and names that start with a non-ASCII letter come after every ASCII name: `Apple`, `apple2`, `banana`, `cherry`, `Äpfel` is the order, and locale-aware ordering is not provided (decided by the user). Two services cannot have equal `name_key` (unique index), so the `id` tie-break never decides an order; it is in the SQL because the data model says so, and the verifier checks it by reading.

Each item is an `api.Service`, built by the same function `createService` uses (`handler/service_mapping.go`; do not write a second one), with:

- every saved setting as `createService` returns it (the full `check`, `settings`, `alerts_enabled`, the two messages, `shown_on_public_view`), saved header values included: the contract returns them in full;
- `id`; `paused` as saved;
- `state`: `status` as stored (a paused service keeps its stored status; the screen decides what to show); `last_checked_at` and `last_status_change_at` as RFC 3339 in UTC, or `null` (present, not omitted); `last_failure_reason` as `null` unless the status is `unhealthy`;
- `last_failure_reason` for an unhealthy service: `code` as stored; `http_status` only when the code is `non_2xx_status` and the stored status is not null; `json_rule_field` only when the code is `json_rule_matched` and the stored field is not null; the generated type omits an unset field, so they are absent otherwise, never `0` or `""`. The schema also allows an unhealthy row with no failure code (the usecases never write one); it is returned with `last_failure_reason` `null`, not an invented code;
- `target_count`: how many targets the service has in `targets`; `alert_delivery_failed`: true when at least one of them has `last_delivery_failed`. Both are computed in the query, never stored.

The data is read consistently in one query (not an explicit transaction: the connections take the write lock when a transaction begins, `platform/database`), so a list never shows a service with another service's state. A service that was deleted while the list is being built is simply absent. There is no paging: the service limit (`MAX_SERVICES`, 50 by default) bounds the list. Times are returned by the repository in UTC (`.UTC()` if the driver gives another zone).

The usecase passes the repository's result through; nothing is filtered, and no check is run.

### deleteService

The router has checked the session and the CSRF token. Then:

1. The repository deletes the service with one `DELETE` of the `services` row by id (one statement; no explicit transaction is needed, and no second statement deletes the state or the targets). The state row and the service's targets go with it through the cascade (FR-70). If no row was deleted, it returns `domain.ErrNotFound` and nothing else changed.
2. After the `DELETE` has returned without error, the usecase calls `Scheduler.Stop` with the service id, once (FR-71, seam). It never calls it before the `DELETE` returns, when the id was not found, or when the delete failed.
3. The handler answers `204` with no body.

Deleting the same id twice: the first is 204, the second is 404. Two concurrent deletes of the same id: exactly one is 204, the other 404, and `Stop` is called once.

Logging: on success the handler logs one info line, message `service deleted`, with the attribute `service_id` and nothing else. Nothing else in this task logs.

### Errors

| Error | Where it comes from | Answer |
|---|---|---|
| `domain.ErrNotFound` | repository (`deleteService`) | 404, code `not_found`, title `Not found` (already mapped) |
| any other error | anywhere | 500 `internal_error`; the text is logged by the existing error handler and never in the body |

### Known gaps

- **The service is not stopped for real.** `Scheduler.Stop` goes to the do-nothing scheduler until the scheduler task, so a check already scheduled for a deleted service cannot exist yet because none is scheduled. The verifier does not flag this. The backlog tracks it.
- **`target_count` and `alert_delivery_failed` are always 0 and false in the running app** until milestone 2 can add targets. The repository tests insert targets directly to prove the computation.
- **A service row without a state row** is not reachable (they are inserted in one transaction); the list query need not handle it.
- **The list is not cached or limited**; the cost of 50 services with their counts is accepted.
- **Non-ASCII names sort after ASCII names** (byte order of the lower-cased name). Decided by the user.
- **The contract's `ServiceList` has `maxItems: 50`** while `MAX_SERVICES` is configurable and has no ceiling. With a limit above 50 the list could exceed the contract. This is an existing mismatch, not this task's to resolve.

## Structure

By `ARCHITECTURE.md`; follow `create-service-api` as the example. Names marked "new" are fixed by this file; others are the builder's choice.

- `usecase/service_repository.go` (new file): `usecase.ServiceRepository` moves here from `usecase/service.go`, because it now has more than two methods (`ARCHITECTURE.md`, "Interfaces"). It gains `List(ctx) ([]domain.ServiceView, error)` and `Delete(ctx, id string) error`. `usecase.Scheduler` stays in `service.go` (two methods, used only there) and gains `Stop(serviceID string)`; it returns nothing.
- `usecase/service.go`: `ServiceService` gains `ListServices(ctx) ([]domain.ServiceView, error)` and `DeleteService(ctx, id string) error`.
- `repository/service.go`: `ServiceRepository` gains `List` and `Delete` as described. The counts and the flag come from `targets` in the same query.
- `worker/noop_scheduler.go`: `NoopScheduler` gains `Stop` and still does nothing.
- `handler/server.go`: `handler.ServiceService` gains the two methods.
- `handler/services.go`: `ListServices` and `DeleteService` on `*Server`; `stubs.go` is not edited. The list is mapped with the function in `handler/service_mapping.go`; an empty result is an empty list, not nil.
- `handler/helpers_test.go` and `usecase/fakes_test.go`: the doubles gain the new methods.

## Dependencies

None. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Usecase tests use the fakes; repository tests run against a real SQLite file (`testutil.NewDB`); every handler response passes `testutil.AssertConforms` for its operation. No integration test (build tag `integration`) is needed.

**Repository (`repository/service_test.go`)**

- `List` on an empty database returns an empty, non-nil list.
- `List` returns every service with its state and settings, as `Create` saved them: an HTTP service with every field set and a TCP service, including the lists in their order (FR-9, FR-62).
- Order: services named `banana`, `Apple`, `cherry`, `Äpfel` and `apple2` (inserted in a scrambled order) come back as `Apple`, `apple2`, `banana`, `cherry`, `Äpfel`; two services inserted in different orders give the same list (FR-9).
- State: a service whose state row is `healthy` with times, one `unhealthy` with `non_2xx_status` and 503, one `unhealthy` with `json_rule_matched` and its field, one `unhealthy` with `timed_out`, and one `not_yet_checked` (the test writes the state rows directly with `domain.ServiceState` and gorm, using times in a non-UTC zone) come back with those values; times come back in UTC; the not-checked one has null times and no failure (FR-61, FR-112).
- `paused` true is returned as true and the stored status is unchanged (FR-77).
- `target_count` and `alert_delivery_failed`: a service with no targets has 0 and false; with three targets none failed, 3 and false; with three targets one of which has `last_delivery_failed`, 3 and true; each service gets its own counts when several have targets (the test inserts `targets` rows directly) (FR-86).
- `Delete` removes the service, its state row and its targets (rows counted before and after), leaves another service with its state and targets untouched, and `List` no longer returns it (FR-70).
- `Delete` of an unknown id returns `domain.ErrNotFound` and removes nothing; deleting the same id twice returns nil and then `ErrNotFound`.
- Ten goroutines deleting the same id: exactly one returns nil and nine return `ErrNotFound`.
- Closing the database and opening the same file again after a delete shows the service still gone and the others still there (NFR-1).

**Usecase (`usecase/service_test.go`)**

- `DeleteService` calls the repository once, then `Scheduler.Stop` once with the id, and the fakes' recorded events show that order (FR-71, seam).
- `DeleteService` returning `ErrNotFound` from the repository comes back unchanged (`require.ErrorIs`) and `Stop` is not called; any other repository error comes back and `Stop` is not called, compared with a baseline in which the same call, succeeding, does call `Stop` (FR-71).
- Calling `DeleteService` twice for the same id, with a fake repository that deletes the first time and returns `ErrNotFound` the second, returns nil then `ErrNotFound` and `Stop` was called once in total (the usecase half of "two deletes call `Stop` once", FR-71).
- No test for `ListServices` (pure delegation, `TESTING.md`).

**Handler (`handler/services_test.go` and `handler/service_mapping_test.go`, with the spy of `handler.ServiceService`)**

- `listServices` 200: an empty result is the JSON `[]`, not `null`; two services come back in the order the spy gave, with every field mapped: id, name, check (HTTP and TCP shapes), settings, flags, messages, `paused`, `target_count`, `alert_delivery_failed` (FR-9, FR-62).
- State mapping: a healthy service has times in UTC (a spy time in another zone is rendered in UTC) and `last_failure_reason` `null` present; a not-yet-checked service has the two times `null` present; an unhealthy service with `non_2xx_status` has `http_status` and no `json_rule_field`; with `json_rule_matched` it has `json_rule_field` and no `http_status`; with `timed_out` it has neither key (FR-61, FR-112).
- A paused unhealthy service keeps its stored status and failure reason in the response (FR-77).
- An unhealthy service from the spy with no failure reason gets `last_failure_reason` `null`; a `non_2xx_status` with no status code and a `json_rule_matched` with no field return the code and omit the missing field (FR-61).
- The mapping is the one `createService` uses: the same domain service gives the same `check`, `settings` and flags in the `createService` 201 and in the `listServices` item (one test builds both).
- An unexpected error from the spy is 500 `internal_error` and its text is not in the body.
- `deleteService` 204 has an empty body and no `Set-Cookie`; the spy received the path id; `ErrNotFound` is 404 `not_found` with title `Not found`; an unexpected error is 500 and its text is not in the body (FR-8).
- The success path of `deleteService` writes one log line `service deleted` with `service_id` and no other attribute (the id is in the line, nothing else of the service is).
- A `deleteService` without the CSRF token is 403 `csrf_failed` and the spy is not called; without a session it is 401 and the spy is not called; a `listServices` without a session is 401 and the spy is not called (NFR-8). The existing gate and CSRF tables in `router_test.go` run against the real operations and pass.

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` is empty.
- Nothing outside the allowed paths changed.

Tests this task changes on purpose: `TestRouter_UnimplementedOperationAnswers501` in `handler/router_test.go` pinned `GET /api/services` as unimplemented, which is now real. It is changed to use `GET /api/services/a-service` (`getService`, which stays a stub until milestone 3) and asserts the same thing: 501 with code `not_implemented`. The default spy that `newRouter` installs answers `listServices` with an empty list and `deleteService` with success, so the gate and CSRF tables keep running against all operations. No other assertion is removed or loosened.

## Verifier checks

- **By reading `repository/service.go`:** the delete is one `DELETE` statement and relies on the cascade, with no separate delete of the state or targets; the list query orders by `name_key` then `id` in SQL and is one query that also computes the counts and the flag; the only write to `service_states` anywhere in the file is the state-row insert inside `Create` (from `create-service-api`), and nothing writes `targets`.
- **By reading `usecase/service.go`:** `Stop` is called only after `Delete` returned without error, never earlier, never on an error path; there is no sorting or filtering in the usecase or the handler.
- **By reading `handler/`:** there is one function that maps a service to `api.Service`, used by `createService`, `listServices` and nowhere duplicated; an empty list is built as an empty slice; the handler does not check the session or the CSRF token.
- **Layering:** no `api` type in `usecase/`, `repository/` or `domain/`; `repository/` tests do not import `usecase/` or `handler/`.
- **Inputs to try:** 50 services with targets on some; a name with mixed case and one starting with a non-ASCII letter; a delete of an id like `../x`, an empty-looking id (`%20`) and a very long id (all 404 or 404 from routing, never 500); two deletes at once; a delete of a service that has targets, one failed, then a list (the others unchanged).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- Something this file lists under "Prerequisite" is not on the default branch.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.

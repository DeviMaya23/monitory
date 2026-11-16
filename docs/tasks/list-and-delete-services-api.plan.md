# Plan: list and delete services API

Branch: feat/list-and-delete-services-api

## Repository (`backend/internal/repository/service.go`, tests in `service_test.go`)

- [x] `List` on an empty database returns an empty, non-nil list: `TestServiceList_EmptyIsNonNilEmptyList`
- [x] `List` returns HTTP and TCP services as `Create` saved them: `TestServiceList_ReturnsServicesAsCreated`
- [x] Order by name ignoring case, non-ASCII last, insertion-order independent: `TestServiceList_OrdersByNameIgnoringCase`
- [x] State values, UTC times, null times for not-yet-checked: `TestServiceList_ReturnsStateAndFailureReason`
- [x] `paused` true returned, stored status unchanged: `TestServiceList_PausedKeepsStoredStatus`
- [x] `target_count` / `alert_delivery_failed` per service: `TestServiceList_CountsTargetsPerService`
- [x] `Delete` removes service, state, targets; others untouched; list omits it: `TestServiceDelete_RemovesServiceStateAndTargets`
- [x] `Delete` unknown id is `ErrNotFound`; twice gives nil then `ErrNotFound`: `TestServiceDelete_UnknownIDAndRepeat`
- [x] Ten concurrent deletes: one nil, nine `ErrNotFound`: `TestServiceDelete_ConcurrentDeletesOneWins`
- [x] Delete survives reopening the database: `TestServiceDelete_SurvivesReopeningTheDatabase`

## Usecase (`backend/internal/usecase/service.go`, `service_repository.go`, tests in `service_test.go`)

- [x] `DeleteService`: repository once, then `Stop` once with id, in order: `TestDeleteService_StopsTheSchedulerOnceAfterTheDelete`
- [x] `ErrNotFound` / other error come back, no `Stop`, against a success baseline: `TestDeleteService_FailedDeleteDoesNotStopTheScheduler`
- [x] Two deletes: nil then `ErrNotFound`, `Stop` once: `TestDeleteService_SecondDeleteIsNotFoundAndStopsNothing`
- [x] No `ListServices` test (pure delegation, per task)

## Handler (`backend/internal/handler/services.go`, `service_mapping.go`; tests in `services_test.go`, `service_mapping_test.go`, `router_test.go`)

- [x] `listServices` 200: empty is `[]`; two services in spy order, all fields mapped: `TestListServices_EmptyResultIsAnEmptyList`, `TestListServices_ReturnsEveryServiceInTheOrderGiven`
- [x] State mapping (UTC, null times, null reason, `http_status` / `json_rule_field` / neither): `TestToAPIService_StateMapping` in `service_mapping_test.go` (rows: UTC times, null times, each failure code)
- [x] Paused unhealthy keeps status and reason: `TestToAPIService_StateMapping` (paused row)
- [x] Unhealthy with no code is `null`; missing status/field omitted: `TestToAPIService_StateMapping` (rows)
- [x] Same mapping as `createService` (one test builds both): `TestListServices_MapsTheSameWayAsCreateService`
- [x] Unexpected list error is 500, text hidden: `services_test.go`
- [x] `deleteService` 204 empty body, no `Set-Cookie`, spy got path id, 404, 500 hidden: `services_test.go`
- [x] `deleteService` logs `service deleted` with `service_id` only: `services_test.go`
- [x] 403 without CSRF, 401 without session, list 401, spy not called: `services_test.go`; gate and CSRF tables in `router_test.go` run against the real operations
- [x] `TestRouter_UnimplementedOperationAnswers501` changed to `GET /api/services/a-service`

## Repo-wide

- [x] `make check` passes (run, passed; frontend dependencies installed first with `npm ci`)
- [x] `git diff main -- backend/go.mod backend/go.sum` is empty
- [x] Nothing outside allowed paths changed
- [x] Integration tests (`make test-integration`): not applicable to this task's code; not run: no test in the repository carries the `integration` build tag and this task touches none (the task file says none applies); `make test-integration` also needs Docker

## Judgment calls

- The state mapping is tightened in the shared `toAPIState`: a failure reason is returned only when the status is `unhealthy` and a code is stored, and `http_status` / `json_rule_field` only with their own code. The task requires this for the list; `createService` is unaffected because a new service has no failure.
- Handler state-mapping tests go through the router with the spy (the handler tests are in the external `handler_test` package), in `service_mapping_test.go`.
- The list query is one raw SQL statement (`services.*, service_states.*` joined, with a subquery count and an `EXISTS`) scanned into a row type inside `repository/`, as the task prefers; the domain types needed no new tags.
- `fakeServices.List` in `usecase/fakes_test.go` is only a minimal stub so the fake satisfies the interface; no usecase test uses it (the task says none for `ListServices`).
- A delete of an unusual id (`../x`, `%20`, a very long id) is handled by the same path as any unknown id: the repository finds no row and returns `ErrNotFound`; I did not add a handler test for each of them.

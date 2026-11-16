# Plan: list and delete services API

Branch: feat/list-and-delete-services-api

## Repository (`backend/internal/repository/service.go`, tests in `service_test.go`)

- [ ] `List` on an empty database returns an empty, non-nil list: `TestServiceList_EmptyIsNonNilEmptyList`
- [ ] `List` returns HTTP and TCP services as `Create` saved them: `TestServiceList_ReturnsServicesAsCreated`
- [ ] Order by name ignoring case, non-ASCII last, insertion-order independent: `TestServiceList_OrdersByNameIgnoringCase`
- [ ] State values, UTC times, null times for not-yet-checked: `TestServiceList_ReturnsStateAndFailureReason`
- [ ] `paused` true returned, stored status unchanged: `TestServiceList_PausedKeepsStoredStatus`
- [ ] `target_count` / `alert_delivery_failed` per service: `TestServiceList_CountsTargetsPerService`
- [ ] `Delete` removes service, state, targets; others untouched; list omits it: `TestServiceDelete_RemovesServiceStateAndTargets`
- [ ] `Delete` unknown id is `ErrNotFound`; twice gives nil then `ErrNotFound`: `TestServiceDelete_UnknownIDAndRepeat`
- [ ] Ten concurrent deletes: one nil, nine `ErrNotFound`: `TestServiceDelete_ConcurrentDeletesOneWins`
- [ ] Delete survives reopening the database: `TestServiceDelete_SurvivesReopeningTheDatabase`

## Usecase (`backend/internal/usecase/service.go`, `service_repository.go`, tests in `service_test.go`)

- [ ] `DeleteService`: repository once, then `Stop` once with id, in order: `TestDeleteService_StopsTheSchedulerOnceAfterTheDelete`
- [ ] `ErrNotFound` / other error come back, no `Stop`, against a success baseline: `TestDeleteService_ErrorsDoNotStopTheScheduler`
- [ ] Two deletes: nil then `ErrNotFound`, `Stop` once: `TestDeleteService_SecondDeleteIsNotFoundAndStopsNothing`
- [ ] No `ListServices` test (pure delegation, per task)

## Handler (`backend/internal/handler/services.go`, `service_mapping.go`; tests in `services_test.go`, `service_mapping_test.go`, `router_test.go`)

- [ ] `listServices` 200: empty is `[]`; two services in spy order, all fields mapped: `TestListServices_*` in `services_test.go`
- [ ] State mapping (UTC, null times, null reason, `http_status` / `json_rule_field` / neither): `TestToAPIService_State*` in `service_mapping_test.go`
- [ ] Paused unhealthy keeps status and reason: `service_mapping_test.go`
- [ ] Unhealthy with no code is `null`; missing status/field omitted: `service_mapping_test.go`
- [ ] Same mapping as `createService` (one test builds both): `services_test.go`
- [ ] Unexpected list error is 500, text hidden: `services_test.go`
- [ ] `deleteService` 204 empty body, no `Set-Cookie`, spy got path id, 404, 500 hidden: `services_test.go`
- [ ] `deleteService` logs `service deleted` with `service_id` only: `services_test.go`
- [ ] 403 without CSRF, 401 without session, list 401, spy not called: `services_test.go`; gate and CSRF tables in `router_test.go` run against the real operations
- [ ] `TestRouter_UnimplementedOperationAnswers501` changed to `GET /api/services/a-service`

## Repo-wide

- [ ] `make check` passes
- [ ] `git diff main -- backend/go.mod backend/go.sum` is empty
- [ ] Nothing outside allowed paths changed
- [ ] Integration tests (`make test-integration`): not applicable to this task's code; outcome: TBD

## Judgment calls

(filled in at the end)

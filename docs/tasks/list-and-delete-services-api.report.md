# Verification report: list and delete services API

Branch: `verify/list-and-delete-services-api` (the builder's work from `feat/list-and-delete-services-api` at `41c7996`, plus one test row added by the verifier)

Result: **no Blocking findings.** `make check` passes (run, passed). One test gap was found and closed with a test row; no source was changed.

## Criteria

"Real?" asks whether the named test would fail if the behavior were removed. Yes means a mutation or a reading shows it fails; the mutation numbers refer to "Mutation checks run" below.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| R1 | `List` on an empty database is an empty, non-nil list | `TestServiceList_EmptyIsNonNilEmptyList` | Yes: `make(..., len(rows))` is the reason it is non-nil; `assert.NotNil` fails on nil | Met |
| R2 | `List` returns services and settings as `Create` saved them (HTTP full, TCP, list order) (FR-9, FR-62) | `TestServiceList_ReturnsServicesAsCreated` | Yes: whole-struct `assert.Equal` on `Service` | Met |
| R3 | Order `Apple, apple2, banana, cherry, Äpfel`, three insertion orders (FR-9) | `TestServiceList_OrdersByNameIgnoringCase` | Yes: M1 fails | Met |
| R4 | State values, UTC, null times for not-checked (FR-61, FR-112) | `TestServiceList_ReturnsStateAndFailureReason` | Yes: M11 fails (non-UTC zone input) | Met |
| R5 | `paused` returned, stored status unchanged (FR-77) | `TestServiceList_PausedKeepsStoredStatus` | Yes: a mapping that rewrote status for paused would fail the status assertion | Met |
| R6 | `target_count` and `alert_delivery_failed` per service (FR-86) | `TestServiceList_CountsTargetsPerService` | Yes: M5, M6 fail | Met |
| R7 | `Delete` removes service, state and targets, others untouched, list omits it (FR-70) | `TestServiceDelete_RemovesServiceStateAndTargets` | Yes: M12 (foreign keys off) fails | Met |
| R8 | Unknown id is `ErrNotFound`, nothing removed; twice gives nil then `ErrNotFound` | `TestServiceDelete_UnknownIDAndRepeat` | Yes: M2 fails | Met |
| R9 | Ten goroutines: one nil, nine `ErrNotFound` | `TestServiceDelete_ConcurrentDeletesOneWins` | Yes: M2 fails | Met |
| R10 | Close and reopen: service still gone, others there (NFR-1) | `TestServiceDelete_SurvivesReopeningTheDatabase` | Partly: it would catch a delete that was not committed; it cannot fail from a bug in the code under test that a plain read also shows. Fine for what it asks | Met |
| U1 | Repository once, then `Stop` once with the id, events in order (FR-71) | `TestDeleteService_StopsTheSchedulerOnceAfterTheDelete` | Yes: M3 fails | Met |
| U2 | `ErrNotFound` and other errors come back, no `Stop`, success baseline (FR-71) | `TestDeleteService_FailedDeleteDoesNotStopTheScheduler` | Yes: M3 and M4 fail; the baseline subtest proves `Stop` is observable | Met |
| U3 | Two deletes: nil then `ErrNotFound`, `Stop` once | `TestDeleteService_SecondDeleteIsNotFoundAndStopsNothing` | Yes: M3 and M4 fail | Met |
| U4 | No `ListServices` test | none (by design) | n/a | Met |
| H1 | 200: empty is `[]`, not `null`; two services in spy order, every field mapped (FR-9, FR-62) | `TestListServices_EmptyResultIsAnEmptyList` (nil and empty subtests), `TestListServices_ReturnsEveryServiceInTheOrderGiven` | Yes: M9 fails; the second compares the whole JSON | Met |
| H2 | State mapping: UTC times, null times present, `http_status` or `json_rule_field` or neither (FR-61, FR-112) | `TestToAPIService_StateMapping` | Yes: M8 and M11 fail | Met |
| H3 | Paused unhealthy keeps status and reason (FR-77) | `TestToAPIService_StateMapping` (paused row) | Yes: a mapping that nulled the reason or status for paused fails the JSON compare | Met |
| H4 | Unhealthy with no code gives `null`; code without its detail omits the detail (FR-61) | `TestToAPIService_StateMapping` (three rows) | Yes: an invented code or a `0` / `""` fails the JSON compare | Met |
| H5 | Same mapping as `createService` (one test builds both) | `TestListServices_MapsTheSameWayAsCreateService` | Yes: it compares the 201 body with the list item as maps | Met |
| H6 | Unexpected error is 500 `internal_error`, text hidden | `TestListServices_UnexpectedErrorHidesItsText` | Yes: the error handler is the thing under test, and the assertions are on the body | Met |
| H7 | `deleteService` 204 empty body, no `Set-Cookie`, spy got the id; 404 with title; 500 hidden (FR-8) | `TestDeleteService_Answers204WithAnEmptyBody`, `TestDeleteService_ErrorsMapToTheirCodes` | Yes | Met |
| H8 | One log line `service deleted` with `service_id` only | `TestDeleteService_LogsOneLineWithTheIDOnly` | Yes: M10 fails | Met |
| H9 | 403 without CSRF, 401 without session (delete), 401 (list), spy not called; gate and CSRF tables pass against real operations (NFR-8) | `TestDeleteService_GateFailuresNeverReachTheSpy` (with a baseline), `TestListServices_WithoutASessionIs401AndNeverReachesTheSpy`, `TestRouter_Gate` and the CSRF table (built from the contract's operation list) | Yes: the gate lives in the router, and the baseline subtest shows the spy is reachable | Met |
| H10 | `TestRouter_UnimplementedOperationAnswers501` moved to `GET /api/services/a-service`, same assertions | `router_test.go` | Yes: diff shows only the path changed | Met |
| W1 | `make check` passes | run | n/a | Met |
| W2 | `go.mod` and `go.sum` unchanged | `git diff main -- backend/go.mod backend/go.sum` is empty | n/a | Met |
| W3 | Nothing outside the allowed paths changed | the diff from `main` is `backend/internal/**` and the plan file only | n/a | Met |

## Plan check

Read after the criteria were judged.

- Every criterion above is in the plan. None is missing.
- Every ticked item names a test that exists and, by the mutations below, checks the behavior.
- Plan against diff: they agree. The plan's judgment calls match what the diff does: the tightened `toAPIState` (a reason only for `unhealthy` with a stored code, and `http_status` / `json_rule_field` only with their own code), the raw-SQL list query scanned into a row type inside `repository/`, and the minimal `fakeServices.List`.
- One gap in the plan's claim, not the code: the plan says the state mapping, including "a reason is returned only when the status is `unhealthy`", is covered. The "unhealthy" half of that condition was not covered by any test (M7 survived). See Findings; a test row now covers it.
- The plan marks the integration tests "not run, none apply". Confirmed: no file in `backend/` carries the `integration` build tag.

## Rule checks

- **Dependencies:** none added; `go.mod`, `go.sum` and `frontend/` untouched. No config key or migration touched.
- **`repository/service.go`, by reading:** the delete is one `DELETE` of `services` by id and relies on the cascade; `List` is one raw statement that orders `services.name_key, services.id` in SQL and computes the count and the flag with subqueries; the only write to `service_states` is the insert inside `Create`; nothing writes `targets`. The `SELECT services.*, service_states.*` has no column-name clash (the tables share no column name), so the scan is not ambiguous.
- **`usecase/service.go`, by reading:** `Stop` follows a successful `Delete` and nothing else; no sorting or filtering in the usecase or the handler.
- **`handler/`, by reading:** `toAPIService` is the only mapper, used by `CreateService` and `ListServices`; the empty list is `make(api.ServiceList, 0, len(views))`; handlers never check the session or the CSRF token.
- **Layering:** `internal/api` is imported only under `handler/`; `repository/` tests import `domain`, `repository` and `testutil` only; `usecase/` tests use the fakes. `usecase.ServiceRepository` moved to `service_repository.go` as the task says.
- **Logging:** one `service deleted` line with `service_id`; nothing else in the diff logs.
- **Layer boundary for time:** the repository returns times in UTC (`utc()` helper, `.UTC()` on `CreatedAt` / `UpdatedAt`).
- Frontend rules: not applicable (backend-only task).

## Mutation checks run

Each run broke the source, ran the repository, usecase and handler tests, and reverted.

| # | Break | Result |
|---|---|---|
| M1 | `ORDER BY services.id` instead of `name_key, id` | `TestServiceList_OrdersByNameIgnoringCase` fails |
| M2 | `Delete` never returns `ErrNotFound` | `TestServiceDelete_UnknownIDAndRepeat`, `TestServiceDelete_ConcurrentDeletesOneWins` fail |
| M3 | `Stop` before `Delete` | the three `DeleteService` tests fail |
| M4 | `Stop` also after a failed delete | the failed-delete and second-delete tests fail |
| M5 | `alert_delivery_failed` never true | `TestServiceList_CountsTargetsPerService` fails |
| M6 | `target_count` always 0 | `TestServiceList_CountsTargetsPerService`, `TestServiceDelete_RemovesServiceStateAndTargets` fail |
| M7 | drop the `unhealthy` condition in `toAPIState` | **survived** with the builder's tests; killed by the row the verifier added (see Findings) |
| M8 | `http_status` / `json_rule_field` returned for every code | `TestToAPIService_StateMapping` fails |
| M9 | list built as a nil slice | `TestListServices_EmptyResultIsAnEmptyList` fails |
| M10 | extra attribute on the delete log line | `TestDeleteService_LogsOneLineWithTheIDOnly` fails |
| M11 | times not converted to UTC in the repository | `TestServiceList_ReturnsStateAndFailureReason` fails |
| M12 | `foreign_keys(0)` in `platform/database` | `TestServiceDelete_RemovesServiceStateAndTargets` fails |

## Inputs tried on the built app

Run against the built binary (`REQUIRE_HTTPS=false`, a temp database), with `curl`.

- Empty database: `GET /api/services` gives `[]`.
- Five services named `banana`, `Apple`, `cherry`, `Äpfel`, `apple2` come back as `Apple, apple2, banana, cherry, Äpfel`; the item has every field, with `last_checked_at`, `last_status_change_at` and `last_failure_reason` present as `null`.
- `DELETE` without CSRF is 403 `csrf_failed`; without a session 401; with both 204 and no body; again 404 `not_found`.
- Ids `../x`, `..%2Fx`, `%20`, empty, 100,000 characters, `%00`, `a%2Fb`, `' OR 1=1`: all 404, none 500.
- Twelve concurrent deletes of one id: one 204, eleven 404, one `service deleted` log line.
- 50 services (the limit; the 51st create is 409): list is 200 with 50 items in 6 ms.
- With targets inserted directly (foreign keys on): `cherry` with two targets, one failed, lists `2 / true`; `svc1` with one lists `1 / false`. Deleting `cherry` gives 204; the list has 48 items; `cherry`'s targets are gone and `svc1`'s target remains.
- Not tried: a running attempt or timer being stopped (scheduler task).

## Integration tests

Not run: no test in the repository carries the `integration` build tag, and this task touches no code that has one (`make test-integration` also needs Mailpit through Docker). No criterion depends only on integration tests.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, fixed by the verifier.** No test covered the `Status == unhealthy` half of the failure-reason condition in `toAPIState` (mutation M7 survived). Reason: the repository cannot produce a failure code on a non-unhealthy row (the table's CHECK forbids it), so only a spy row can show it. Added the row "a stray failure code on a healthy service is not returned" to `TestToAPIService_StateMapping`; it fails under M7 and passes on the unchanged source. Matters when: a later task (pause, check results) writes a failure code that stays on a row after a status change and the guard is the only thing hiding it. Done, no action.
2. **Decision needed.** `ServiceList` has `maxItems: 50` in the contract while `MAX_SERVICES` has no ceiling, so a larger limit can return more items than the contract allows (the task file lists this as an existing mismatch). Matters when: the admin sets `MAX_SERVICES` above 50, or the frontend client validates responses against the schema.
3. **Report only.** The `id` tie-break in `ORDER BY` cannot be tested: `name_key` is unique. Confirmed by reading only, as the task says.

## Docs or specs that no longer match

- None for `docs/openapi.yaml`, `docs/requirements.md` or `STACK.md`: no dependency was added and the contract is implemented as written. No version was adopted.
- `docs/tasks/backlog.md`: the rows "FR-8, FR-72 | `deleteService` (built in `list-and-delete-services-api`)" and "FR-71" already describe what remains; the user may want to check that the milestone 3 row "FR-61 | `listServices`" still reads right now that `listServices` returns the reason (the mapping is done; producing all seven reasons is the scheduler's).
- `docs/tasks/dashboard-screen.md` says a real server answers 501 for `listServices` until a backend task merges (lines 26 and 198); once this merges that note is out of date.

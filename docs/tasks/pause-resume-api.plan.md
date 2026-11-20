# Plan: pause and resume API

Branch: `feat/pause-resume-api` (fast-forwarded to `origin/main` at 39ff7dd, which has `update-service-api` merged as #39).
Prerequisite checked on that code: `Scheduler.Restart`, `ServiceService.editMu`, `Get`/`Update` of both repositories, `serviceSpy` exist.

Files: R = `backend/internal/repository/service_test.go`, RS = `repository/service_state_test.go`, U = `usecase/service_test.go`, UC = `usecase/check_result_test.go`, H = `handler/services_test.go`, RT = `handler/router_test.go` (not touched).

## Repository

- [x] `SetPaused(true)` unpaused: changed, Paused, updated_at = given, Get agrees, state and other columns unchanged. R `TestServiceSetPaused_...`
- [x] `SetPaused(true)` again: changed false, updated_at kept; `SetPaused(false)` changed true, state kept; again false. R
- [x] Unknown id: ErrNotFound for both values. R
- [x] State `Update` on a paused service: ErrServicePaused, apply not called, row unchanged; unpaused baseline writes; no service row ErrNotFound. RS
- [x] Existing state repository tests pass unchanged. RS

## Usecase

- [x] Pause: SetPaused(true, clock time) then Stop once (events `set-paused`, `stop`). U
- [x] Pause, changed false: no scheduler call. U
- [x] Resume changed: Restart once with the view's service and firstCheckAt = clock time; no Start/Stop (events `set-paused`, `restart`). U
- [x] Resume, changed false: no scheduler call. U
- [x] ErrNotFound and other error unchanged from both, no scheduler call. U
- [x] Serialization: 50 rounds pause+resume; 50 rounds resume+delete; 50 rounds resume+update after a pause. U
- [x] StartChecks skips paused; UpdateService leaves paused unscheduled. U (existing tests checked/extended)
- [x] RecordCheckResult with ErrServicePaused: nil, state unchanged, no alert, healthy and unhealthy; unpaused baseline. UC

## Handler

- [x] Both: 200 mapped, spy gets id, 404, 500 hidden, one log line with service_id and service_name only. H
- [x] 401 without session and 403 without CSRF for each, spy not reached. H
- [x] 501 router test untouched. RT

## Repo-wide

- [x] `make check` passes: run, passed (lint, openapi-lint, tests with -race, builds; usecase and repository also run 3 times under -race, passed)
- [x] Integration tests (`make test-integration`): not run: Docker is not running here, and the task touches no integration-tagged code (the Mailpit tests cover the mailer only)
- [x] Nothing outside the allowed paths changed.

## Judgment calls

- The gate criterion ("a test shows both sit behind it") is met in `services_test.go` (`TestPauseAndResumeService_GateFailuresNeverReachTheSpy`), as the task lists it under Handler; `router_test.go` is not in my paths and was not changed.
- The existing tests `TestStartChecks_StartsEveryServiceThatIsNotPaused` and `TestUpdateService_PausedServiceIsNotScheduled` already had a paused case with a baseline; I added nothing for them.
- `setPaused` takes the clock once and uses that one UTC time for both the repository call and `Restart`'s `firstCheckAt`.
- `SetPaused` writes with a map update of `paused` and `updated_at` only, selected by id, after a read of `id, paused` in the same transaction.
- The "no service row" case of `ServiceStateRepository.Update` shares the missing-row path; the schema's foreign key means a state row cannot exist without a service row, so it is shown by the existing missing-id and deleted-service tests and not by a separate test.
- Serialization tests check each scheduler call directly follows its own write, and that the last scheduler call agrees with the stored flag. Mutation check done: without the mutex in `setPaused`, all three serialization tests fail.
- A `make check` needed `npm ci` in `frontend/` first (a fresh worktree); no file changed by it.

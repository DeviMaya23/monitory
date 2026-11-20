# Plan: pause and resume API

Branch: `feat/pause-resume-api` (fast-forwarded to `origin/main` at 39ff7dd, which has `update-service-api` merged as #39).
Prerequisite checked on that code: `Scheduler.Restart`, `ServiceService.editMu`, `Get`/`Update` of both repositories, `serviceSpy` exist.

Files: R = `backend/internal/repository/service_test.go`, RS = `repository/service_state_test.go`, U = `usecase/service_test.go`, UC = `usecase/check_result_test.go`, H = `handler/services_test.go`, RT = `handler/router_test.go` (read only; the gate test is where the operations are listed, see judgment calls).

## Repository

- [ ] `SetPaused(true)` unpaused: changed, Paused, updated_at = given, Get agrees, state and other columns unchanged. R `TestServiceSetPaused_...`
- [ ] `SetPaused(true)` again: changed false, updated_at kept; `SetPaused(false)` changed true, state kept; again false. R
- [ ] Unknown id: ErrNotFound for both values. R
- [ ] State `Update` on a paused service: ErrServicePaused, apply not called, row unchanged; unpaused baseline writes; no service row ErrNotFound. RS
- [ ] Existing state repository tests pass unchanged. RS

## Usecase

- [ ] Pause: SetPaused(true, clock time) then Stop once (events `set-paused`, `stop`). U
- [ ] Pause, changed false: no scheduler call. U
- [ ] Resume changed: Restart once with the view's service and firstCheckAt = clock time; no Start/Stop (events `set-paused`, `restart`). U
- [ ] Resume, changed false: no scheduler call. U
- [ ] ErrNotFound and other error unchanged from both, no scheduler call. U
- [ ] Serialization: 50 rounds pause+resume; 50 rounds resume+delete; 50 rounds resume+update after a pause. U
- [ ] StartChecks skips paused; UpdateService leaves paused unscheduled. U (existing tests checked/extended)
- [ ] RecordCheckResult with ErrServicePaused: nil, state unchanged, no alert, healthy and unhealthy; unpaused baseline. UC

## Handler

- [ ] Both: 200 mapped, spy gets id, 404, 500 hidden, one log line with service_id and service_name only. H
- [ ] 401 without session and 403 without CSRF for each, spy not reached. H
- [ ] 501 router test untouched. RT

## Repo-wide

- [ ] `make check` passes: not yet run
- [ ] Integration tests (`make test-integration`): not yet run
- [ ] Nothing outside the allowed paths changed.

## Judgment calls

(filled at the end)

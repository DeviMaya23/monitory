# Plan: delivery outcome

Branch: `feat/delivery-outcome`. Paths are under `backend/internal/` unless stated.

## Repository (`repository/target.go`, `repository/target_test.go`)

- [x] `SetDeliveryFailed(true/false)` is read back by `List`; same value twice is no error (FR-86) — `TestTargetRepository_SetDeliveryFailed` (subtest "sets, clears and repeats without error")
- [x] Only that column changes; service row and `service_states` unchanged (FR-84) — same test, subtest "writes the one column and nothing of the service"
- [x] Other targets of the service keep their own value — subtest "other targets keep their value"
- [x] Unknown id, another service's id, a deleted target: `ErrNotFound`, nothing changed — subtest "no row, another service's target and a deleted target are ErrNotFound"
- [x] `Update` after `SetDeliveryFailed(true)` keeps the mark; existing tests unchanged — subtest "Update keeps the mark"
- [x] Through `ServiceRepository.List`, `AlertDeliveryFailed` follows the marks — subtest "the service list notice follows the marks" (in `repository/target_test.go`)

## Usecase (`usecase/delivery_outcome.go`, `delivery_outcome_test.go`)

- [x] delivered true → `SetDeliveryFailed(…, false)` once; false → `true` once (FR-86) — `TestDeliveryOutcome_DeliveredClearsAndFailureSetsTheMark`
- [x] `ErrNotFound` → nil; other error → returned wrapped (`errors.Is`) — `TestDeliveryOutcome_Errors`
- [x] `DeliveryFlagWriter` has one method (the fake has only that one) — fake in `delivery_outcome_test.go`

## Delivery loop (`worker/alert_dispatcher.go`, `alert_dispatcher_test.go`)

- [x] First-attempt success: one report `delivered` true — `TestOutcome_SuccessAtOnce`
- [x] Fail, fail, succeed: one report, true, after the third attempt — `TestOutcome_FailFailSucceed`
- [x] Always failing, Retries 3: one report false after attempt 4; none before; none after a long advance — `TestOutcome_AlwaysFailing`
- [x] Retries 0 + failure: one report false at once — `TestOutcome_ZeroRetriesFailsAtOnce`
- [x] Superseded reports nothing; success after hand-off true; last-attempt failure after hand-off false — `TestOutcome_Superseded`
- [x] Abandoned (Close in wait; Close in failing attempt) nothing; success after Close true, context not cancelled, Close waits for the recorder — `TestOutcome_Abandoned`, `TestOutcome_SuccessAfterCloseIsRecorded`
- [x] Email and webhook both report; unknown type and Dispatch after Close report nothing — `TestOutcome_EmailAndWebhook`, `TestOutcome_NothingForUnknownTypeOrAfterClose`
- [x] Blocked recorder holds up neither Dispatch, other targets, other services; Close waits — `TestOutcome_BlockedRecorder`
- [x] Recorder error: one `alert outcome not saved` warn with ids, status, delivered; no reason; no second call — `TestOutcome_RecorderError`
- [x] No secret in any line (address, URL, header, target name, service name, message) — `TestOutcome_LogsHoldNoSecret` (also `TestOutcome_RecorderError`)
- [x] Racing Dispatch and Close under `-race`: all goroutines (recorder calls included) ended at Close — `TestOutcome_RacingDispatchesAndClose`
- [x] Every existing test passes with only its setup changed (constructor takes a recorder) — `newRetryDispatcher` and the direct call in `TestDispatch_RacingCloseNeverSendsAfterCloseReturned`

## Wiring (`backend/cmd/server/main.go`)

- [x] `usecase.NewDeliveryOutcomeService(targetRepo)` passed to `worker.NewAlertDispatcher`; close order unchanged — read by the verifier

## Repo-wide

- [x] `make check` passes — outcome: run, passed (exit 0: lint, openapi-lint, Go tests with `-race`, frontend tests, builds)
- [x] No change to migrations, `go.mod`, `go.sum`, `.env.example`, config, handler, or files outside the allowed paths — `git diff --stat main`
- [x] Integration tests (`make test-integration`): no integration test covers code this task touches (Mailpit tests are in `adaptor/mailer`) — not run: the touched packages (`repository`, `usecase`, `worker`, `cmd/server`) have no `integration`-tagged tests (only `adaptor/mailer` has), and the task file says none applies

## Judgment calls

- **No write-timeout constant.** "Structure" lists "the write timeout constant" in `worker/alert_dispatcher.go`, but "Behavior" and the verifier checks say the task adds no deadline or timeout literal. I followed Behavior and added none.
- **Wrapping text.** The usecase wraps a non-`ErrNotFound` error as `record delivery outcome: %w`; the wording was not fixed.
- **`UpdateColumn` for the write.** The repository uses GORM's `UpdateColumn` so no hook or automatic `updated_at` can touch another column; `Target.UpdatedAt` has no auto-update anyway.
- **Fake name.** The recorder fake is `fakeOutcomes`, because `fakeRecorder` already exists in `worker/check_runner_test.go`.
- **Helpers.** `newRetryDispatcher` keeps its signature and builds a succeeding fake; the new `newRecordingDispatcher` takes the recorder a test holds, so no existing test body changed.
- **Real 50 ms waits.** Two tests ("Close waits for the recorder") assert that `Close` has *not* returned by watching for 50 ms of real time, as existing tests in this file do for contexts; they can only pass wrongly (never fail wrongly) if the machine stalls.
- **Mutation checks run locally** (not committed): cancellable context for the write, a report on a superseded sequence, inverted `delivered`, the report under the mutex. Each failed a named test.
- **Frontend dependencies** were installed with `npm ci` so `make check` could run; nothing under `frontend/` changed.

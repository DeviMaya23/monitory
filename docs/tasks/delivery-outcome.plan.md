# Plan: delivery outcome

Branch: `feat/delivery-outcome`. Paths are under `backend/internal/` unless stated.

## Repository (`repository/target.go`, `repository/target_test.go`)

- [ ] `SetDeliveryFailed(true/false)` is read back by `List`; same value twice is no error (FR-86) — `TestTargetRepository_SetDeliveryFailed` (subtest "sets, clears and repeats")
- [ ] Only that column changes; service row and `service_states` unchanged (FR-84) — same test, subtest "writes one column only"
- [ ] Other targets of the service keep their own value — subtest "other targets keep their value"
- [ ] Unknown id, another service's id, a deleted target: `ErrNotFound`, nothing changed — subtest "not found"
- [ ] `Update` after `SetDeliveryFailed(true)` keeps the mark; existing tests unchanged — subtest "update keeps the mark"
- [ ] Through `ServiceRepository.List`, `AlertDeliveryFailed` follows the marks — subtest "service list notice" (in `repository/target_test.go`)

## Usecase (`usecase/delivery_outcome.go`, `delivery_outcome_test.go`)

- [ ] delivered true → `SetDeliveryFailed(…, false)` once; false → `true` once (FR-86) — `TestDeliveryOutcome_RecordSetsOrClearsTheMark`
- [ ] `ErrNotFound` → nil; other error → returned wrapped (`errors.Is`) — `TestDeliveryOutcome_Errors`
- [ ] `DeliveryFlagWriter` has one method (the fake has only that one) — fake in `delivery_outcome_test.go`

## Delivery loop (`worker/alert_dispatcher.go`, `alert_dispatcher_test.go`)

- [ ] First-attempt success: one report `delivered` true — `TestOutcome_SuccessAtOnce`
- [ ] Fail, fail, succeed: one report, true, after the third attempt — `TestOutcome_FailFailSucceed`
- [ ] Always failing, Retries 3: one report false after attempt 4; none before; none after a long advance — `TestOutcome_AlwaysFailing`
- [ ] Retries 0 + failure: one report false at once — `TestOutcome_ZeroRetriesFailsAtOnce`
- [ ] Superseded reports nothing; success after hand-off true; last-attempt failure after hand-off false — `TestOutcome_Superseded`
- [ ] Abandoned (Close in wait; Close in failing attempt) nothing; success after Close true, context not cancelled, Close waits for the recorder — `TestOutcome_Abandoned`, `TestOutcome_SuccessAfterCloseIsRecorded`
- [ ] Email and webhook both report; unknown type and Dispatch after Close report nothing — `TestOutcome_EmailAndWebhook`, `TestOutcome_NothingForUnknownTypeOrAfterClose`
- [ ] Blocked recorder holds up neither Dispatch, other targets, other services; Close waits — `TestOutcome_BlockedRecorder`
- [ ] Recorder error: one `alert outcome not saved` warn with ids, status, delivered; no reason; no second call — `TestOutcome_RecorderError`
- [ ] No secret in any line (address, URL, header, target name, service name, message) — `TestOutcome_LogsHoldNoSecret`
- [ ] Racing Dispatch and Close under `-race`: all goroutines (recorder calls included) ended at Close — `TestOutcome_RacingDispatchesAndClose`
- [ ] Every existing test passes with only its setup changed (constructor takes a recorder) — `newRetryDispatcher` and the direct call in `TestDispatch_RacingCloseNeverSendsAfterCloseReturned`

## Wiring (`backend/cmd/server/main.go`)

- [ ] `usecase.NewDeliveryOutcomeService(targetRepo)` passed to `worker.NewAlertDispatcher`; close order unchanged — read by the verifier

## Repo-wide

- [ ] `make check` passes — outcome: (to fill)
- [ ] No change to migrations, `go.mod`, `go.sum`, `.env.example`, config, handler, or files outside the allowed paths — `git diff --stat main`
- [ ] Integration tests (`make test-integration`): no integration test covers code this task touches (Mailpit tests are in `adaptor/mailer`) — not run: (to fill)

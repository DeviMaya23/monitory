# Plan: delivery retry

Branch: `feat/delivery-retry`. Source: `backend/internal/worker/alert_dispatcher.go`; tests: `backend/internal/worker/alert_dispatcher_test.go` (T = that file); wiring: `backend/cmd/server/main.go`.
Integration tests (`make test-integration`): not run: the task touches no code with integration tests (worker and main wiring only; the task file says none applies).

## The sequence
- [x] Success at once: one call, Pending 0, one `alert delivered` attempts 1, no attempt-failed line — T `TestSequence_SuccessAtOnce`
- [x] Fail, fail, succeed (Retries 3, 7 s; 7 s − 1 ns leaves one call) — T `TestSequence_FailFailSucceed`
- [x] Always failing, Retries 3: 4 calls at 0/7/14/21 s, then `failed` attempts 4, 3 attempt-failed lines — T `TestSequence_AlwaysFailing`
- [x] Interval from policy (45 s) — T `TestSequence_IntervalComesFromThePolicy`
- [x] Retries 0: one call, no timer, `failed` attempts 1 — T `TestSequence_ZeroRetriesFailsAtOnce`
- [x] Email and webhook each, and both together — T `TestSequence_EmailAndWebhook`
- [x] Independence (FR-83): waiting target does not delay another; two failing retry on one tick — T `TestSequence_TargetsAreIndependent`
- [x] No secrets in any line; each has service_id, target_id, status — T `TestSequence_LogsHoldIdsOnly`

## Close
- [x] Close while waiting: abandoned, no reason, Pending 0, prompt, no later call — T `TestClose_WhileWaiting`
- [x] Close while an attempt is blocked (cancel, waits, abandoned whatever error; success after Close is delivered with attempts) — existing `TestClose_*` tests, setup only changed, plus `TestClose_LaterAttemptIsCancelled`
- [x] Second Close and Dispatch after Close unchanged — existing `TestClose_SecondCallAndDispatchAfterClose`

## Newer alert rule
- [x] Waiting sequence superseded by a second Dispatch (same and opposite status): no advance, timer stopped, no more calls, new targets retried — T `TestSupersede_WaitingSequence`
- [x] Other service unaffected — T `TestSupersede_OtherServiceIsNotAffected`
- [x] Attempt in progress not cancelled; success delivered / failure superseded / last attempt failed — T `TestSupersede_AttemptInProgress`
- [x] Attempt 1 always made — T `TestSupersede_FirstAttemptIsAlwaysMade`
- [x] Wake-up re-check (superseded; closed) via a gate in the fake clock wrapper — T `TestSupersede_RecheckAfterWakeUp`
- [x] Ended sequence logs nothing on a newer alert — T `TestSupersede_EndedSequenceLogsNothing`
- [x] Two Dispatches in a row supersede the first only — T `TestSupersede_SecondDispatchIsNotSuperseded`

## Races
- [x] Dispatch for one/several services with Close under -race — T `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` (setup only) and `TestDispatch_RacingDispatchesAndClose`

## Replaced and changed on purpose
- [x] `TestDispatch_EmailTargetIsSentOnceWithoutRetry` and the webhook once test run with Retries 0
- [x] Deadlines on blocking waits and a Close-under-deadline cleanup, so the three hang mutations fail by assertion

## Wiring and repo-wide
- [x] `main.go` passes `clock.Real{}` and `RetryPolicy` from config
- [x] `make check` passes (see the report); no change outside allowed paths. `make test-integration`: not run: no integration tests cover this code

## Judgment calls
- The two "once, without retry" tests (`TestDispatch_EmailTargetIsSentOnceWithoutRetry`, `TestDispatch_WebhookTargetIsSentOnceWithoutRetry`) already run with `Retries` 0 through `newDispatcher`'s default; their assertions are unchanged and the names were kept.
- Existing standalone `d.Close()` calls in tests became `closeWithin(t, d)` (Close under a 2 s deadline that fails the test); no assertion changed.
- The wake-up re-check test holds the sequence inside the log write of `alert delivery attempt failed` (a hook on the test's log buffer), since the timer is created before that line. It repeats 40 times because Go picks randomly between ready channels; the mutation "no re-check" was seen failing it.
- `Dispatch` with an empty target list still supersedes the service's earlier alert (the rule is "a later call of Dispatch for the same service").
- The supersede record is a per-Dispatch struct holding a channel closed on replacement; sequences hold a pointer to it. It is created and replaced under the mutex; reading a closed channel needs no lock.
- Mutations I ran by hand: no re-check, no supersede check after a failure, no cancel in `Close`, one retry too many, fixed 30 s, timer not stopped. Each failed at least one test by assertion (the no-cancel one after the tests' own 2 s deadlines, not by hanging).
- `npm ci` was run in `frontend/` only so `make check` could lint it; no tracked file changed.

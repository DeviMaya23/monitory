# Plan: delivery retry

Branch: `feat/delivery-retry`. Source: `backend/internal/worker/alert_dispatcher.go`; tests: `backend/internal/worker/alert_dispatcher_test.go` (T = that file); wiring: `backend/cmd/server/main.go`.
Integration tests: none apply (no adaptor/mailer code touched). Outcome: not run: the task touches no code with integration tests.

## The sequence
- [ ] Success at once: one call, Pending 0, one `alert delivered` attempts 1, no attempt-failed line — T `TestSequence_SuccessAtOnce`
- [ ] Fail, fail, succeed (Retries 3, 7 s; 7 s − 1 ns leaves one call) — T `TestSequence_FailFailSucceed`
- [ ] Always failing, Retries 3: 4 calls at 0/7/14/21 s, then `failed` attempts 4, 3 attempt-failed lines — T `TestSequence_AlwaysFailing`
- [ ] Interval from policy (45 s) — T `TestSequence_IntervalComesFromThePolicy`
- [ ] Retries 0: one call, no timer, `failed` attempts 1 — T `TestSequence_ZeroRetriesFailsAtOnce`
- [ ] Email and webhook each, and both together — T `TestSequence_EmailAndWebhook`
- [ ] Independence (FR-83): waiting target does not delay another; two failing retry on one tick — T `TestSequence_TargetsAreIndependent`
- [ ] No secrets in any line; each has service_id, target_id, status — T `TestSequence_LogsHoldIdsOnly`

## Close
- [ ] Close while waiting: abandoned, no reason, Pending 0, prompt, no later call — T `TestClose_WhileWaiting`
- [ ] Close while an attempt is blocked (cancel, waits, abandoned whatever error; success after Close is delivered with attempts) — existing `TestClose_*` tests, setup only changed, plus `TestClose_LaterAttemptIsCancelled`
- [ ] Second Close and Dispatch after Close unchanged — existing `TestClose_SecondCallAndDispatchAfterClose`

## Newer alert rule
- [ ] Waiting sequence superseded by a second Dispatch (same and opposite status): no advance, timer stopped, no more calls, new targets retried — T `TestSupersede_WaitingSequence`
- [ ] Other service unaffected — T `TestSupersede_OtherServiceIsNotAffected`
- [ ] Attempt in progress not cancelled; success delivered / failure superseded / last attempt failed — T `TestSupersede_AttemptInProgress`
- [ ] Attempt 1 always made — T `TestSupersede_FirstAttemptIsAlwaysMade`
- [ ] Wake-up re-check (superseded; closed) via a gate in the fake clock wrapper — T `TestSupersede_RecheckAfterWakeUp`
- [ ] Ended sequence logs nothing on a newer alert — T `TestSupersede_EndedSequenceLogsNothing`
- [ ] Two Dispatches in a row supersede the first only — T `TestSupersede_SecondDispatchIsNotSuperseded`

## Races
- [ ] Dispatch for one/several services with Close under -race — T `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` (setup only) and `TestDispatch_RacingDispatchesAndClose`

## Replaced and changed on purpose
- [ ] `TestDispatch_EmailTargetIsSentOnceWithoutRetry` and the webhook once test run with Retries 0
- [ ] Deadlines on blocking waits and a Close-under-deadline cleanup, so the three hang mutations fail by assertion

## Wiring and repo-wide
- [ ] `main.go` passes `clock.Real{}` and `RetryPolicy` from config
- [ ] `make check` passes; no change outside allowed paths

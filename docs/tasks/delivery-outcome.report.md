# Verification report: delivery outcome

Verifier branch: `verify/delivery-outcome` (built on the builder's `feat/delivery-outcome`, commit `bb1b2c9`).

Verdict: **no Blocking findings.** Every acceptance criterion is met. 20 mutation checks each failed a named test. The integration tests were not run (see "Integration tests").

`make check`: run, passed (exit 0: gofmt, golangci-lint with the integration tag, ESLint, Stylelint, shellcheck, Go tests with `-race`, Vitest, builds, contract lint). The frontend dependencies were missing, so I ran `npm ci` first. Nothing tracked changed.

## Criteria

"Real?" asks whether the test would fail if the behavior were removed. Yes means a mutation (M-number, listed below) was killed by it, or the test is a compile-time check.

### Repository (`repository/target_test.go`, `TestTargetRepository_SetDeliveryFailed`)

| # | Criterion | Test (subtest) | Real? | Status |
|---|---|---|---|---|
| R1 | `true` is read back by `List`, `false` clears it, the same value twice is no error (FR-86) | "sets, clears and repeats without error" | Yes: the read-back differs from the default without the write; the write and the second `NoError` are asserted directly | Met |
| R2 | Only the column changes: name, type, value, value_key, headers, created_at, updated_at; service and `service_states` rows unchanged (FR-84) | "writes the one column and nothing of the service" (compares the raw row before and after, with a baseline that the column did change) | Yes (M7: writing `updated_at` fails it) | Met |
| R3 | Other targets of the service keep their own value | "other targets keep their own value" | Yes: would fail on a filter that wrote every target of the service. I did not run that mutation | Met |
| R4 | Unknown id, another service's id and a deleted target are `ErrNotFound` and change nothing | "no row, another service's target and a deleted target are ErrNotFound" | Yes (M8) | Met |
| R5 | `Update` after `SetDeliveryFailed(true)` keeps the mark; existing tests pass unchanged | "Update keeps the mark" and the existing `TestTargetRepository_Update`. The diff of both test files only adds lines | Yes (M6 fails both) | Met |
| R6 | `ServiceRepository.List`: `AlertDeliveryFailed` is true with any marked target, stays true while a second one remains, false when none | "the service list notice follows the marks" | Yes: the assertions go false to true to true to false against real SQLite | Met |

### Usecase (`usecase/delivery_outcome_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| U1 | `delivered` true calls `SetDeliveryFailed(…, false)` once, false calls it with `true` (FR-86) | `TestDeliveryOutcome_DeliveredClearsAndFailureSetsTheMark` | Yes (M14) | Met |
| U2 | `ErrNotFound` returns nil; any other error returned wrapped (`errors.Is`) | `TestDeliveryOutcome_Errors` | Yes (M9, M15) | Met |
| U3 | `DeliveryFlagWriter` has one method | The spy has one method and is passed to the constructor | Yes, at compile time: a second interface method breaks the build. Nothing fails at run time | Met |

### Delivery loop (`worker/alert_dispatcher_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| W1 | First-attempt success: one report with the service id, target id and `true`; none before the attempt returns (FR-86) | `TestOutcome_SuccessAtOnce` | Yes (M3b); the "none before" step is asserted while the send is blocked | Met |
| W2 | Fail, fail, succeed: one report, `true`, none after the first two | `TestOutcome_FailFailSucceed` | Yes (M4, M3b) | Met |
| W3 | Always failing, `Retries` 3: none after attempts 1 to 3, one `false` after the fourth, none after a long advance | `TestOutcome_AlwaysFailing` | Yes (M3, M4, M5) | Met |
| W4 | `Retries` 0 and failure: one `false` at once | `TestOutcome_ZeroRetriesFailsAtOnce` | Yes (M3, M5) | Met |
| W5 | Superseded: nothing; a success after the hand-off is `true`; a last-attempt failure after it is `false` | `TestOutcome_Superseded` (3 subtests, plus a baseline that the newer sequence reports) | Yes (M1, M1b, M3) | Met |
| W6 | Abandoned: `Close` during a wait, and during an attempt that errors, report nothing. A success after `Close` is `true`, the recorder's context is live, `Close` waits for the call | `TestOutcome_Abandoned`, `TestOutcome_SuccessAfterCloseIsRecorded` | Yes (M2, M2b, M10, M13) | Met |
| W7 | Email and webhook both report; unknown type and `Dispatch` after `Close` report nothing | `TestOutcome_EmailAndWebhook`, `TestOutcome_NothingForUnknownTypeOrAfterClose` | Yes (M16). The dropped-after-`Close` half: `Dispatch` returns before any goroutine starts, so no report is possible. I did not mutate it | Met |
| W8 | A blocked recorder does not hold up `Dispatch`, another target or another service; `Close` waits | `TestOutcome_BlockedRecorder` | Yes (M11, M13) | Met |
| W9 | Recorder error: one `alert outcome not saved` warn with `service_id`, `target_id`, `status`, `delivered`, no `reason`; the delivery's own line unchanged; no second call; no panic | `TestOutcome_RecorderError` (delivered and failed) | Yes (M12, M12b) | Met |
| W10 | No line holds the address, URL, header, target name, service name or message | `TestOutcome_LogsHoldNoSecret`, `TestOutcome_RecorderError` (database text) and the existing log tests | Yes for the new line (M12 puts the database text in the log and `TestOutcome_RecorderError` fails). The test asserts the secrets on its own lines, not "across every test" literally | Met |
| W11 | Racing `Dispatch` and `Close` under `-race`: every goroutine, recorder calls included, has ended at `Close` | `TestOutcome_RacingDispatchesAndClose` (30 rounds) | Yes (M13 fails it) | Met |

### Replaced and changed, wiring, repo-wide

| # | Criterion | Evidence | Real? | Status |
|---|---|---|---|---|
| X1 | Every existing `alert_dispatcher_test.go` test passes with only its setup changed | The diff of that file removes two lines, both constructor calls. All existing tests pass | n/a | Met |
| X2 | Recorder built from the shared `targetRepo`, passed to the dispatcher; close order unchanged | `cmd/server/main.go:107,126-129`: `usecase.NewDeliveryOutcomeService(targetRepo)`. The diff is that one line, so the defers are unchanged. A scratch test (below) ran the real usecase, repository and dispatcher together | n/a (no test of `main`) | Met |
| X3 | `make check` passes | Run, passed | n/a | Met |
| X4 | No change to a migration, `go.mod`, `go.sum`, `.env.example`, config, handler or any file outside the allowed paths | `git diff --name-only 9aea46b..HEAD`: `main.go`, `repository/target(_test).go`, `usecase/delivery_outcome(_test).go`, `worker/alert_dispatcher(_test).go`, and the plan file | n/a | Met |

Requirements: FR-86 (R1, R6, U1, W1 to W4), FR-84 (R2, U-by-construction), FR-85 in part (W5, W6), FR-111 in part (W6, W11). No criterion depends only on an integration test.

## Plan check

I read the plan only after judging the criteria above.

- **Missing criteria:** none. Every criterion of the task file has a ticked plan item.
- **Ticked items without a test:** none. Every named test exists and checks the behavior (mutations killed them).
- **Plan versus diff:**
  - The plan says the `Update keeps the mark` subtest is in `repository/target_test.go`, and it is. The plan also lists the existing tests as unchanged, and they are.
  - The judgment call "no write-timeout constant" matches the diff. The task file's "Structure" lists a "write timeout constant", which conflicts with its own "Behavior" and "Verifier checks", and the builder followed "Behavior". I agree.
  - The plan says the builder ran four mutations. I ran 20.
  - The plan's integration entry (not run, none apply) matches what I found.

## Rule checks

- **Layering:** `usecase/delivery_outcome.go` imports `context`, `errors`, `fmt` and `domain`. `worker/alert_dispatcher.go` imports the standard library, `domain` and `pkg/clock` only. `repository/target.go` imports no `usecase` or `worker`. Only `cmd/server` ties them together. OK.
- **Where the rule lives:** `!delivered` (success clears, failure sets) is only in the usecase. The worker only picks which endings are reported. OK.
- **One column:** the `UPDATE` is `UpdateColumn("last_delivery_failed", failed)`, filtered by `id` and `service_id`. `Update` still selects only its six columns. Grep of non-test code for `last_delivery_failed` and `LastDeliveryFailed`: the only writer is `SetDeliveryFailed`, and the rest are reads (`service.go` query, handler mapping, generated types, the domain field). OK.
- **FR-84 by construction:** the usecase holds one interface with one method, and the repository method touches `targets` only. The dispatcher has no status logic. The scratch test showed the `service_states` row unchanged after failed and successful outcomes. OK.
- **Goroutines and locks:** no `go` statement was added. The report runs in the sequence's own counted goroutine, outside `d.mu`. The context is `context.WithoutCancel(d.ctx)`. No timeout or deadline literal. OK.
- **Logs:** the new line carries `service_id`, `target_id`, `status` (from `log.With`) and `delivered`. No error text. The existing lines are unchanged. OK.
- **Time:** no `time.Now`, `Sleep`, `After` or `NewTimer` in the three changed source files. OK.
- **Dependencies:** `go.mod` and `go.sum` unchanged; no pinned version changed; no config key added. OK.
- **Test files:** no new `_edge` or `_regress` files. The usecase fake is in its own file, as the task says. The worker tests import no `repository` or `adaptor`. The repository tests import `domain`, `repository`, `testutil` only. OK.
- **Frontend:** not touched.

## Mutation checks run

All reverted afterwards (`git status` clean). "Killed by" lists the failing tests.

| M | Mutation | Killed by |
|---|---|---|
| M1 | Report `false` on the superseded branch after a failed attempt | `TestOutcome_Superseded` ("a failure with retries left reports nothing") |
| M1b | Same, on the superseded check after wake-up | `TestOutcome_Superseded` (waiting sequence) |
| M2 | Report on the abandoned branch after an attempt | `TestOutcome_Abandoned` ("Close during an attempt that returns an error") |
| M2b | Report on the abandoned branch after wake-up | `TestOutcome_Abandoned` ("Close during a wait") |
| M3 | Final failure reports `delivered` true | `TestOutcome_AlwaysFailing`, `_ZeroRetriesFailsAtOnce`, `_Superseded`, `_EmailAndWebhook`, `_RecorderError` |
| M3b | Success reports `false` | `TestOutcome_SuccessAtOnce`, `_FailFailSucceed`, `_Superseded`, `_SuccessAfterCloseIsRecorded`, `_EmailAndWebhook`, `_NothingForUnknownTypeOrAfterClose` |
| M4 | Report after every failed attempt | `TestOutcome_FailFailSucceed`, `_AlwaysFailing`, `_Superseded`, `_Abandoned` |
| M5 | Report before the last attempt's result | `TestOutcome_AlwaysFailing`, `_ZeroRetriesFailsAtOnce`, `_Abandoned`, `_EmailAndWebhook`, `_RecorderError` |
| M6 | `Update` also writes `last_delivery_failed` | `TestTargetRepository_Update`, `TestTargetRepository_SetDeliveryFailed/Update_keeps_the_mark` |
| M7 | `SetDeliveryFailed` also writes `updated_at` | `.../writes_the_one_column_and_nothing_of_the_service` |
| M8 | `service_id` dropped from the filter | `.../no_row,_another_service's_target_and_a_deleted_target_are_ErrNotFound` |
| M9 | `ErrNotFound` treated as an error | `TestDeliveryOutcome_Errors/a_deleted_target_or_service_is_dropped` |
| M10 | The write uses the cancellable dispatcher context | `TestOutcome_SuccessAfterCloseIsRecorded` |
| M11 | Recorder called under `d.mu` | `TestOutcome_BlockedRecorder` |
| M12 | Database error text added to the log line | `TestOutcome_RecorderError` |
| M12b | `delivered` field dropped from the log line | `TestOutcome_RecorderError` |
| M13 | Recorder called in an untracked goroutine | `TestOutcome_SuccessAfterCloseIsRecorded`, `_BlockedRecorder`, `_RecorderError`, `_LogsHoldNoSecret`, `_RacingDispatchesAndClose` |
| M14 | Usecase passes `delivered` instead of `!delivered` | `TestDeliveryOutcome_DeliveredClearsAndFailureSetsTheMark` |
| M15 | Usecase wraps with `%v` instead of `%w` | `TestDeliveryOutcome_Errors/any_other_error_is_returned_wrapped` |
| M16 | Report for an unknown target type | `TestOutcome_NothingForUnknownTypeOrAfterClose` |

(M9's first attempt did not compile because of an unused import; the row is the rerun, which compiled and was killed.)

## Cases tried beyond the task file

Scratch tests, not committed (the file was removed and `git status` is clean).

- **Real layers wired** (usecase, repository, dispatcher, fake clock): a webhook-only list that always fails sets the mark after the last attempt, and `ServiceRepository.List` shows `AlertDeliveryFailed` true. Then an email target with no SMTP account fails and is marked. After a later success the webhook targets are cleared and the service still shows the notice (the email target stays marked). The `service_states` row is unchanged throughout. Passed under `-race`.
- **Concurrent writes:** 100 `SetDeliveryFailed` flips racing 100 `Update` calls on one target in real SQLite: no error, and the final write took effect. Passed under `-race`.
- **Edges:** an empty service and target id, and a target whose service was deleted (cascade), return `ErrNotFound`.
- **Flakiness:** `TestOutcome*` ran 15 times under `-race`: all passed.
- **Deleted target's outcome:** returns nil and writes nothing (U2, R4).
- **An edit of a marked target:** still marked (R5).

Not tried: a stop at every possible point of a sequence beyond the ones in W5 and W6 (the existing `TestSupersede_*` and `TestClose_*` tests cover the rest); a failing database write against real SQLite (the usecase and the worker test it with fakes, and the task does not retry).

## Integration tests

Not run. `make test-integration` could not start its Mailpit: port 1025 is already held by another session's container (`alert-dispatch-builder-mailpit-1`, not mine), and I did not stop it or reuse it. I removed the container and network that my attempt created.

The only `integration`-tagged file is `adaptor/mailer/mailer_integration_test.go`. This task touches none of that package, so no criterion depends on an integration test. `make check` already lints the tagged files.

## Findings

### Blocking

None.

### Non-blocking

1. **Real 50 ms waits in two tests.** Category: test quality. `TestOutcome_SuccessAfterCloseIsRecorded` and `TestOutcome_BlockedRecorder` assert that `Close` has not returned by waiting 50 ms of real time. The builder disclosed this and the file already does the same elsewhere. A stalled machine can only make them pass wrongly, never fail. Matters when: the CI machine is slow enough that the goroutine would not have run in 50 ms, so a regression of "Close waits for the recorder" could pass unseen. The M11 and M13 mutations were still caught on this machine.
2. **Over-long doc comment.** Category: cosmetic. The `deliver` doc comment in `worker/alert_dispatcher.go` has a line well over 100 columns (the builder appended a sentence). gofmt and the linter accept it. Report only: no trigger.
3. **The task file contradicts itself on a "write timeout constant".** Category: decision needed. "Structure" lists one, and "Behavior" and "Verifier checks" forbid a timeout. The builder added none. Matters when: the task file is reused as a template for a similar task. Fix the line in the task file.
4. **Known gaps from the task file, unchanged:** a failed write is only logged, two sequences for one target are not ordered, and a superseded or abandoned sequence writes nothing. Report only: the task file already says so and names no trigger beyond the end-to-end journeys.

## Docs or specs that no longer match

- `docs/tasks/backlog.md` line 69 ("Left out of `alert-dispatch`: … writes no delivery outcome (`last_delivery_failed` is never set) …"): the outcome part is done once this merges. The remaining parts (retry and the webhook sender) were done earlier. The line can be trimmed to the mailer-reasons remark.
- `docs/tasks/alert-list-screen.md` line 23 ("`Target.last_delivery_failed` is always false until delivery exists"): no longer true after this merge. It is a task file that is already merged, so it only matters as history.
- `docs/openapi.yaml`, `docs/requirements.md`, `docs/data-model.md` and `ARCHITECTURE.md`: they already match (FR-84 to FR-86, "only the delivery-outcome usecase writes it", the loop reports final outcomes to a usecase). No change.
- `STACK.md`: no dependency was added and no version adopted. No change.
- `docs/tasks/delivery-outcome.md`: see non-blocking finding 3.
- What the verifier cannot prove: the dashboard row and the alert list showing the notice live. The frontend reads the column, and the milestone 2 end-to-end journeys are what prove it. I did not run the built app: no part of the change is reachable from the UI until an alert fails for real, and the scratch test above covers the same path through the real usecase and repository.

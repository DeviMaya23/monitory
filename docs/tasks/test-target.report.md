# Verifier report: test target

**Branch:** `verify/test-target` (the session's branch, reset onto `feat/test-target` at `bbec590`; one verifier commit on top: one added test and this report).
**Result:** no Blocking findings. One test was too weak and was fixed in this branch (see Mutation checks).

## `make check`

Run. Lint, contract lint, builds and every Go test with `-race` passed. The first run failed once in the frontend: `TargetDialog.test.tsx` "adds a header row…" timed out at 5000 ms while the machine was loaded (the handler package took 59 s). Alone, the file passed (58/58). This diff changes no frontend file. I ran `npm ci` in `frontend/` first, because `eslint` was not installed; no tracked file changed. Final status: passed, with that one flaky timeout (Non-blocking, test quality, below).

## Integration tests

**Not run:** ports 1025 and 8025 are held by another worktree's Mailpit (`alert-dispatch-builder-mailpit-1`), and `mailer_integration_test.go` hardcodes both and clears the whole mailbox through the API. I did not stop that container or run against it. The integration tests that exist for this code are `adaptor/mailer/mailer_integration_test.go`; none covers the test status. No criterion depends only on it: every mailer criterion is asserted against the fake SMTP server in `mailer_test.go`, which ran.

## Criteria

"Real?" = would the test fail if the behavior were removed (checked by the mutations listed below unless marked "read").

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| U1 | Email: one send, trimmed address, exact alert, no webhook, delivered (FR-107) | `target_tester_test.go` `TestTestTarget_Email` | Yes (no-normalize, status, name, swap-type mutants killed) | Met |
| U2 | Webhook: trimmed URL, headers in order and trimmed, same alert, no email (FR-107) | `TestTestTarget_Webhook` | Yes | Met |
| U3 | Failed send is a result with the exact text; each reason; one attempt (FR-107, FR-85) | `TestTestTarget_FailedDeliveryIsAResult` (8 reasons, both types) | Yes (error-instead-of-result, delivered-true, retry mutants killed) | Met |
| U4 | Alert name is the saved name, not the request's `name` | `TestTestTarget_AlertNameIsTheServicesSavedName` | Yes (request-name mutant killed) | Met |
| U5 | Invalid input: same field errors as `createTarget`, nothing sent, `Find` not called (FR-108, FR-82, FR-89, FR-110) | `TestTestTarget_InvalidInputSendsNothing` (10 rows, compared with `CreateTarget`) plus `TestTestTarget_LimitsAreTheConfiguredOnes` at the limits | Yes (skip-validation, find-before-validate killed) | Met |
| U6 | `alerts_enabled` false still sends | `TestTestTarget_AlertsOffStillSends` | Yes as a pin of a decision; nothing in the source reads the flag, so only a future change can break it | Met |
| U7 | Missing service returns `ErrNotFound`; other `Find` error wrapped; nothing sent | `TestTestTarget_FindErrors` | Yes (two mutants killed) | Met |
| U8 | Ended context returns the context error, not a result | `TestTestTarget_EndedContextIsAnErrorNotAResult` (with a live-context baseline) | Yes (drop-ctx-check killed) | Met |
| U9 | Nothing saved: constructor has finder, two senders, clock, limits (FR-108) | read | n/a | Met: `usecase/target_tester.go:34-47`; the interfaces have no write method; no `SetDeliveryFailed`, `Dispatch` or `RecordDeliveryOutcome` in the new code |
| U10 | NFR-7: markup and quote unchanged; constant has no markup | `TestBuildTestAlert_NameIsPlainText`, `TestTestAlertMessage` | Yes (name-escaped mutant killed) | Met |
| U11 | Constant exact; builder deterministic, no other field filled | `TestTestAlertMessage`, `TestBuildTestAlert` | Yes (msg-const, copy-fields killed). The UTC part was **not real** before this round: `clock.Fake` converts to UTC itself, so dropping `.UTC()` survived. Fixed by `TestTestTarget_AlertTimeIsUTCEvenWhenTheClockIsNot` | Met (after the added test) |
| U12 | Default messages and existing alert tests unchanged | existing tests, all pass | n/a | Met |
| M1 | Subject `Test alert for API`, four-line body, one trailing `\n`, 14:05 UTC (FR-107, FR-93) | `mailer_test.go` `TestSendEmail_TestAlert` | Yes (subject and body mutants killed) | Met |
| M2 | Markup and quote unchanged (NFR-7) | `TestSendEmail_TestAlertNameIsPlainText` | Yes as a guard; the mailer has no escaping to remove, and the test would catch one being added | Met |
| M3 | CR and LF become spaces; no `Bcc` header | `TestSendEmail_TestAlertNameIsOneLine` | Yes in intent; exercised through the existing `oneLine`, so removing it for all statuses is also caught by the older tests | Met |
| M4 | Existing unhealthy and healthy cases unchanged | existing tests | n/a | Met |
| S1 | Status `test` arrives as `test` with the other three keys; markup round trip (FR-107, NFR-7) | `sender_test.go` `TestSendWebhook_TestStatus` | Partly guards: the sender writes `string(alert.Status)`, so it passes for any status, and the test is what would catch a fixed status. Not run as a mutant (`sender.go` is unchanged) | Met |
| H1 | 200 `{"delivered":true}`, no `failure_reason`; spy got id and input | `handler/target_tests_test.go` `TestTestTarget_Email` | Yes (reason-when-ok mutant killed) | Met |
| H2 | Webhook headers mapped in order | `TestTestTarget_WebhookHeaders` | Yes | Met |
| H3 | `Delivered:false` plus reason: 200 with that reason | `TestTestTarget_FailedDeliveryIs200WithTheReason` | Yes (always-delivered mutant killed) | Met |
| H4 | 422 with both errors in order, 404, 500; all conform | `TestTestTarget_Errors` | Yes (swallow-error killed) | Met |
| H5 | 401, 403, 413, 415, 400; spy not called (NFR-8) | `TestTestTarget_RouterRules` (6 rows) | Yes; the gate and CSRF are the router's, and the same rows would fail if the operation were left out of the gate | Met |
| H6 | Log: one `target test sent` line with `service_id`, `type`, `delivered`; no address, URL, header, reason | `TestTestTarget_LogsOutcomeWithoutSecrets` | Yes (log-reason, log-address killed) | Met |
| H7 | Route no longer answers 501 | H1 (200) | Yes; also seen live | Met |
| W1 | Wiring: built from `serviceRepo`, same mailer and sender, real clock, limits, passed to `NewServer` | read `cmd/server/main.go:109-141` | n/a | Met: `mail` and `sender` are the instances built at lines 109 and 120 and given to `NewAlertDispatcher` at 126; no second mailer or client |
| R1 | `make check` passes | run | n/a | Met (see above) |
| R2 | No change to `go.mod`, `go.sum`, `.env.example`, config, migration, `stubs.go`, generated API, or files outside the paths | `git diff ac98e72 HEAD --name-only` | n/a | Met: only the allowed backend paths and the plan file |

## Plan check

Read after the code review of the criteria.

- Every criterion above has a plan line. None missing.
- Every ticked item has a test that exists and checks the behavior, except for name drift: the plan names `TestTestTarget_FailedDelivery`, `_NameIsTheServices`, `_InvalidInput`, `_ContextEnded`, `TestBuildTestAlert_PlainText` and `TestSendEmail_TestAlertNameOneLine`; the code has `_FailedDeliveryIsAResult`, `_AlertNameIsTheServicesSavedName`, `_InvalidInputSendsNothing`, `_EndedContextIsAnErrorNotAResult`, `_NameIsPlainText` and `_NameIsOneLine`. Handler names also differ slightly (`_Failed` vs `_FailedDeliveryIs200WithTheReason`, `_Log` vs `_LogsOutcomeWithoutSecrets`). Cosmetic.
- The plan ticks "UTC" inside `TestBuildTestAlert`; that assertion could not fail (see U11).
- The plan's `make test-integration` line says "not run: ports held by another worktree", the same as I found. Matches.
- Plan judgment calls match the diff: the interface names, the `find the service to test: %w` wrap, validation before everything including a cancelled context, and the handler logging `input.Type`.
- The plan says "rebased onto default, main had nothing new". `git log` shows the branch's base `ac98e72` is on `main`'s history; I did not re-check whether `main` has moved since.

## Rule checks

- **Dependencies:** `go.mod` and `go.sum` unchanged; no new import path beyond the standard library, testify (already used) and in-repo packages. Pinned versions unchanged. Frontend: untouched.
- **Layering:** `usecase/target_tester.go` imports `context`, `errors`, `fmt` and `domain` only. `handler/target_tests.go` imports `internal/api` only (plus `context`); no `adaptor`, `repository` or `worker`. Only `cmd/server/main.go` names the mailer, sender and usecase together.
- **FR-108 by construction:** see U9.
- **One validation:** the usecase calls `ValidateTargetInput` and `normalizeTargetInput`; there is no copy. Note `ValidateTargetInput` normalizes internally and then the usecase normalizes again before sending; harmless.
- **Same delivery:** see W1.
- **Logs and errors:** `handler/target_tests.go` has one log call, with `service_id`, `type` and `delivered`. `FailureReason` is the adaptor error's text. Live run showed no address or URL in the log (0 matches).
- **Time:** `git grep` finds no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in the new non-test code; the time comes from the injected clock.
- **Test files and imports (TESTING.md):** new tests are in the matching `_test.go` files; the handler tests use the spy and no repository; the usecase tests use no repository or adaptor. My added test is in `target_tester_test.go`. No `_edge` or `_regress` files.
- **Handler checks:** the missing-body guard mirrors `createTarget`; see the Non-blocking finding about it.
- **Frontend rules:** not applicable (no frontend change).

## Mutation checks run

Each mutant was applied to the source, the package's tests were run, and the source was restored (`git checkout`).

| Mutant | Result |
|---|---|
| skip validation | killed (`TestTestTarget_InvalidInputSendsNothing`) |
| `Find` before validation | killed (same test, `Find` count) |
| send without normalizing | killed (`TestTestTarget_Email`, `_Webhook`) |
| return the error on a failed send | killed (`_FailedDeliveryIsAResult`) |
| `Delivered: true` on a failed send | killed (same) |
| retry once after a failed email send; same for webhook | killed (both, "one attempt") |
| drop the context check | killed (`_EndedContextIsAnErrorNotAResult`) |
| return a non-`ErrNotFound` error for a missing service | killed (`_FindErrors`) |
| unwrap the other `Find` error (`%v`) | killed (`_FindErrors`) |
| status `unhealthy` instead of `test` | killed (`TestBuildTestAlert`, Email, Webhook, name test) |
| request `name` as the service name | killed (`TestBuildTestAlert`, Email, Webhook) |
| change the message constant | killed (`TestTestAlertMessage`) |
| route the email target to the webhook sender | killed |
| escape `<` in the name | killed (`_NameIsPlainText`, `_AlertNameIsTheServicesSavedName`) |
| **drop `.UTC()` in `buildTestAlert`** | **survived** with the builder's tests; killed after I added `TestTestTarget_AlertTimeIsUTCEvenWhenTheClockIsNot` |
| mailer subject reads "is unhealthy" for a test | killed (`TestSendEmail_TestAlert*`) |
| mailer body status reads "Unhealthy" for a test | killed (`TestSendEmail_TestAlert`) |
| mailer time without `.UTC()` | killed (`TestSendEmail_TimeIsUTCWithoutSeconds`, older test) |
| handler always answers `delivered: true` | killed (`_FailedDeliveryIs200WithTheReason`) |
| handler adds `failure_reason` when delivered | killed (`TestTestTarget_Email`) |
| handler logs the reason / the address | killed (`_LogsOutcomeWithoutSecrets`) |
| handler ignores the usecase error | killed (`TestTestTarget_Errors`) |
| handler drops the `Body == nil` guard | **survived** (see Non-blocking) |

Not run as mutants: "send through the dispatcher" and "write `last_delivery_failed` or a status" (nothing in the usecase can: no such dependency exists, shown by the constructor); "404 for a validation failure or the reverse" (that mapping is the existing `handler/problem.go`, covered by `TestTestTarget_Errors` rows for each error).

## Edge cases tried (beyond the task file's table)

A throwaway test (deleted, not committed) wired the real usecase to the real mailer and webhook sender against `testutil.TargetServer`, with a 200 ms webhook timeout:

| Input | Result |
|---|---|
| email, no SMTP configured | `delivered` false, `no SMTP account configured` |
| webhook to a 500 / a 302 redirect | `the webhook answered with status 500` / `...302` (redirect not followed) |
| webhook to a closed port | `could not connect to the webhook` |
| webhook that answers after 1 s | `the webhook did not answer in time` |
| header value with CR LF | `a custom header is not valid` |
| URL of exactly 2,048 characters / 2,049 | sent (connect failed) / `validation_failed` |
| name of 50 / 51 multibyte characters | sent / `validation_failed` (counted in characters) |
| address holding `\r\nBcc:` | `validation_failed`, nothing sent |
| context cancelled before / deadline hit during the send | the context error, not a result |

A live run of the built binary (`go build ./cmd/server`, temp SQLite file, port 18091, no SMTP, signed in with the session and CSRF token, a real service created) gave: email → 200 `{"delivered":false,"failure_reason":"no SMTP account configured"}`; webhook to a closed port → 200, `could not connect to the webhook`; webhook to the app's own `/api/health` → 200, `the webhook answered with status 404`; bad address → 422 with the field error; unknown service id → 404 `not_found`; `{"name":"x"}` → 422 `type` required; no CSRF header → 403 `csrf_failed`; `listTargets` after all of these → `[]` (nothing saved); the log had three `target test sent` lines and no address or URL. The binary was stopped by its own PID.

Concurrent writes do not apply: the operation writes nothing. A JSON body of `null` gives an empty input and so a 422 from the real usecase (the spy test shows 200, as the spy accepts anything).

**Cannot prove:** delivery to a real SMTP provider or a real webhook, and the dialog showing the result (`target-test-row`, then the milestone's journeys).

## Findings

### Blocking

None.

### Non-blocking

1. **The UTC conversion in `buildTestAlert` was not covered** (test quality). Fixed in this branch: `TestTestTarget_AlertTimeIsUTCEvenWhenTheClockIsNot` in `target_tester_test.go`. Matters when: a later edit drops `.UTC()` and the mailer or sender stops converting. Today both convert themselves, so no output would change.
2. **`request.Body == nil` guard in `TestTarget` has no test that depends on it** (test quality, report only). The router answers an empty body with 400 first, and a JSON `null` decodes to an empty struct, so the guard looks unreachable; it copies the other handlers. Matters when: a change to the router stops rejecting an empty body, which would make a nil dereference.
3. **A `TargetDialog` frontend test timed out once under load** (test quality). Matters when: CI runs on a slow runner; the test passed alone. Outside this task.
4. **Plan test names differ from the real names** (cosmetic). Matters when: someone searches the plan for a test name.
5. **`buildTestAlert` has no direct test** (test quality). The builder's tests reach it through `TestTarget`, as the plan explains. Matters when: a second caller of `buildTestAlert` appears.
6. **`alerts_enabled` false still sends is pinned only by a test of a decision** (decision needed, report only). Settled by the task file.

## Docs or specs that no longer match

- `docs/openapi.yaml`: nothing; `testTarget`, `TargetTestResult` and the `test` status already match what is built.
- `docs/requirements.md`, `STACK.md`: nothing; no dependency or version added.
- `docs/design/README.md`: the test alert's email subject, body and message are generated text the board does not show. The task file says the user may have them listed under additions; it is not listed yet.
- `docs/tasks/backlog.md` line 71 says "The test-alert wording (FR-107) is in `test-target`": still true. The `targets-api` line about CR and LF headers stays open: the test now shows `a custom header is not valid`, but the header is still saved.
- `docs/manual-checks.md`: nothing changes. The milestone 2 mailbox check waits for the rest of milestone 2.

# Verification report: create-service API

Verifier branch: `verify/create-service-api` (the builder's `feat/create-service-api` at `88f4f80`, plus one added test, see "Findings").

**Result: no Blocking findings.** 4 Non-blocking findings: N1 fixed by a test added on this branch, N2 resolved by the user's confirmation.

## Checks run

- `make check`: passed. The first run failed only because `frontend/node_modules` was missing (`eslint: command not found`); after `npm ci` it passed, and passed again after my test was added (`go test -race ./internal/repository`, `golangci-lint`, `gofmt` also clean).
- Integration tests: no file in the repo carries the `integration` tag and this task touches none, so no criterion depends on them. I ran `go test -race -tags integration ./...` without starting Mailpit: run, passed. No database version is printed by it (SQLite files only). `make test-integration` itself was not run: nothing in it applies to this task.
- Live run of the built binary (see "Live run" below): run.

## Acceptance criteria

"Real?" = would the named test fail if the behavior were removed? "Yes (M)" means I confirmed it with a mutation listed further down.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | `NewID`: 36 chars, v7, RFC 4122 variant, two differ | `domain.TestNewID_IsAVersion7UUIDAndUnique` | Yes (M: v4 fails it) | Met |
| 2 | Valid minimal HTTP and TCP have no errors (FR-6, FR-33) | `TestValidateServiceInput/valid minimal http`, `/valid tcp` | Yes, they pin "no error"; the rejecting cases pin the other side | Met |
| 3 | Name: required, limit/one past, characters, trimmed (FR-59) | `TestValidateServiceInput/name …` (limit 10, multi-byte, whitespace, trimmed) | Yes (M: bytes instead of characters fails) | Met |
| 4 | `check.type` required / `invalid_value`, hides other `check.*` | `…/type absent`, `/type ftp hides other check errors` | Yes | Met |
| 5 | Method: nine pass, empty, `get`, `FETCH` (FR-36) | `…/method …` | Yes | Met |
| 6 | URL: required, `   `, format, spaces, scheme case, limit with params, multi-byte (FR-38, FR-74) | `…/url …` (limit 30) | Yes (M: params ignored in length fails) | Met |
| 7 | Query params: limit, `too_many`, indexed empty name (FR-38) | `…/query params …`, `/query param with empty name has its index` | Yes | Met |
| 8 | Headers: rows, name, value limits, empty value (FR-38) | `…/header …`, `/headers …` | Yes | Met |
| 9 | Body: none default, `xml`, byte limit, multi-byte bytes, over-long with `none` (FR-37, FR-38) | `…/body …` (limit 16 bytes) | Yes (M: skipping the limit for `none` fails) | Met |
| 10 | JSON rules: limit, field, failing value, string and bool, mode (FR-44, FR-47, FR-69, FR-74) | `…/json rule …` (limit 2) | Yes | Met |
| 11 | Certificate options (FR-34, FR-50, FR-64, FR-74) | `…/certificate …`, `/ignore certificate errors …` | Yes (M: minimum 0 allowed; ignore-errors rule removed, both fail) | Met |
| 12 | TCP host and port 0/absent/65536/1/65535 (FR-74) | `…/tcp …` | Yes (M: bound 65536 fails) | Met |
| 13 | Settings: defaults, one below/above each, exact messages (FR-57) | `TestValidateServiceInput_Settings` (non-default Min/Max), `TestCreateService_AbsentSettingsTakeTheConfiguredDefaults` | Yes | Met |
| 14 | Budget: equal passes, +1 fails, retry 0, silent when out of range (FR-56) | `TestValidateServiceInput_Budget` | Yes (M: `>=` and dropped retry term both fail) | Met |
| 15 | Messages: 500/501, trimmed, absent (FR-65) | `…/messages …` | Yes (M: untrimmed count fails) | Met |
| 16 | Trimming (FR-12, FR-59) | `…/… of spaces is required`, `…/… counted after trimming`, `TestCreateService_SavesTrimmedNamesAndLocations`, `…SavesATrimmedHost` | Yes (M: removing the trim fails) | Met |
| 17 | Several problems at once, in order, each once (FR-12) | `…/everything wrong at once` | Yes | Met |
| 18 | Usecase: HTTP view, UUIDv7, `NameKey`, defaults, flags, clock (FR-6, FR-20, FR-68) | `TestCreateService_SavesAnHTTPServiceAndReturnsItNotYetChecked` | Yes (M: alerts default, `NameKey` fail) | Met |
| 19 | TCP saved, no method/URL (FR-33) | `…SavesATCPServiceWithoutHTTPColumns` | Yes | Met |
| 20 | Trimmed fields saved, query values and `failing_value` kept, caller's input untouched (FR-59) | `…SavesTrimmedNamesAndLocations` | Yes | Met |
| 21 | Everything given saved as given (FR-35, FR-37, FR-44, FR-47) | `…SavesEverythingGiven`, `…DropsWhatTheTypeDoesNotKeep` | Yes (M: public view ignored, body kept with `none` both fail) | Met |
| 22 | Repository receives `MaxServices` | `…PassesTheConfiguredServiceLimitToTheRepository` | Yes (the value is asserted, fixture limit is non-default 3) | Met |
| 23 | Scheduler once, after the write (FR-67 seam) | `…StartsTheSchedulerOnceAfterTheWrite` | Yes (M: Start before Create fails) | Met |
| 24 | Rejected input: nothing saved, no start, against a baseline (FR-12) | `…RejectedInputSavesNothingAndStartsNothing` | Yes (M: validation bypass fails) | Met |
| 25 | Sentinels unchanged, no start (FR-59, FR-60) | `…RepositorySentinelsComeBackUnchangedAndStartNothing` | Yes (fails under the Start-before-Create mutation) | Met |
| 26 | Repo: full HTTP round trip (FR-35, FR-37, FR-44) | `TestServiceCreate_RoundTripsEveryFieldOfAnHTTPService` | Yes | Met |
| 27 | Repo: TCP round trip (FR-33) | `…RoundTripsATCPService` | Yes | Met |
| 28 | Repo: state row | `…WritesTheStateRowNotYetChecked` | Yes (M) | Met |
| 29 | Repo: reopen keeps data (NFR-1) | `…SurvivesReopeningTheDatabase` | Yes (it reopens the same file) | Met |
| 30 | Repo: case and Unicode clash, trailing space accepted (FR-59) | `…NameClashIgnoresCaseButNotSpaces` | Yes (M: no classification fails) | Met |
| 31 | Repo: limit 2, duplicate at limit, lowered limit (FR-60) | `TestServiceCreate_ServiceLimit` | Yes (M: `>` fails) | Met |
| 32 | Repo: concurrency, limit and same name (FR-59, FR-60) | `TestServiceCreate_Concurrent` | **Partly.** The builder's two subtests passed in about 60% of runs with the transaction removed. My added subtest fails on that mutant 15 of 15 runs | Met, with the added test |
| 33 | Repo: other failure is no sentinel, nothing left | `…OtherFailuresAreNotSentinelsAndLeaveNothing` | Yes | Met |
| 34 | Handler: 201 shape HTTP and TCP, `null`s present, `[]`, no `Location` (FR-6) | `TestCreateService_Answers201WithTheSavedService` | Yes (conformance plus field checks; live run agrees) | Met |
| 35 | Request reaches spy as domain input; `null` = absent (FR-35, FR-44) | `TestToServiceInput_HTTPCheckWithEveryField`, `…TCPCheck`, `…AbsentAndNullAreTheSame` | Yes | Met |
| 36 | `check` missing / no type / `ftp` reach the spy | `TestToServiceInput_ShapesThatAreValidationErrorsReachTheUsecase` | Yes (M: missing check as 400 fails) | Met |
| 37 | The 400 shapes and the pass-through shapes | `…ShapesThatDoNotFitTheContractAre400`, `…ShapesThatAreValidationErrors…` | Yes (M: number rule value accepted fails) | Met |
| 38 | Other type's properties dropped | `…PropertiesOfTheOtherTypeAreDropped` | Yes | Met |
| 39 | 409 for both sentinels, titles, no `errors`/`detail` (FR-59, FR-60) | `TestCreateService_ErrorsMapToTheirCodes` | Yes (M: row removed fails) | Met |
| 40 | 422 with several fields in order (FR-12) | `…ValidationErrorIsAll422Fields` | Yes | Met |
| 41 | 500 hides the text | `…UnexpectedErrorHidesItsText` | Yes | Met |
| 42 | One log line, `service_id` and `service_name` only | `…LogsOneLineWithTheIDAndNameOnly` | Yes (M: extra attribute fails) | Met |
| 43 | Binding and gate failures: 400, 415, 413 boundary, 401, 403 (FR-38, NFR-8) | `…BindingAndGateFailuresNeverReachTheSpy` | Yes: the gate and CSRF rows run against the real router with `createService` | Met |
| 44 | Both sentinels mapped; gate/CSRF tables still pass against real `createService` | `TestCreateService_ErrorsMapToTheirCodes`, `router_test.go` tables (they enumerate the contract's operations) | Yes | Met |
| 45 | `make check` passes | — | — | Met |
| 46 | `go.mod`/`go.sum` show only the `google/uuid` change | `git diff main...HEAD -- backend/go.mod backend/go.sum` | n/a | Met: `uuid v1.6.0` moved from indirect to direct; `go` directive unchanged; `go.sum` untouched |
| 47 | Nothing outside the allowed paths changed | `git diff --name-only` | n/a | **Met, by the user's request.** `docs/data-model.md` and `docs/tasks/create-service-api.md` changed. See finding N2 |

## Plan check (`create-service-api.plan.md`, read after the table)

- Every criterion in the task file appears in the plan; none is missing.
- Every ticked item has a test that exists and, by the mutation checks, checks the behavior, except the concurrency item (row 32 above).
- Differences between plan and diff:
  - The plan ticks "Nothing outside allowed paths changed", but the diff changes two docs outside the plan file. The plan's own judgment call 4 explains it (a user request to trim whitespace). I cannot confirm that request from the repo. See N2.
  - Judgment call 3 says "`false` failing value counts as present". The diff agrees (`json rule false failing value is present`), and the live run keeps `true` the boolean and `"true"` the string apart.
  - The plan says the integration tests were not run because the task says none applies. That matches what I found.
- No other plan/diff difference.

## Rule checks

- **Dependencies:** only `github.com/google/uuid` v1.6.0, as listed; no other manifest line changed; `go` directive unchanged.
- **Layering:** no `api` import in `usecase/`, `repository/` or `domain/` (grep); `usecase/` and `handler/` do not import `platform/config` (grep); `main.go` is the only place that maps `cfg.Limits` (`serviceLimits`); repository tests import no `usecase` or `handler`; usecase tests import no `repository`, `worker` or `adaptor`; handler tests import no `repository`.
- **No literal limits:** the only literals in `service_validation.go` and `service.go` are the port bounds (1, 65535), the minimum days (1) and `domain.MessageMaxLength`.
- **Messages:** each string of the wording table appears once in `usecase/service_validation.go`; the "Use N characters or fewer." family is one helper; no other user-facing text was added.
- **Nothing saved on a rejection:** validation finishes before `Create`; `Create` is called once; the scheduler is called only after it returns nil (read, and mutation M13/M14).
- **One transaction:** the count, the service insert, the name-clash query and the state insert are in one `Transaction`; no read-then-insert for the name; the name error is returned only when the `name_key` exists after a duplicate-key failure; a duplicate id with a new name returns the raw error.
- **Union decoding:** `check: []`, `"http"`, `{"type":5}` give 400; `null`, missing, `{}`, `{"type":"http","url":null}` give 422 as the task says; body `null` gives 422 on `name` and `check.type` (all in tests and the live run).
- **Logging:** one `service added` line; the live server log held 50 such lines and nothing with a URL or rule value.
- **Test files:** no `_edge`/`_regress` files; test files match source files. The only deviation is cosmetic (N4).

## Mutation checks run

Each was applied to the source, the named test run, and the source restored (`git status` clean afterwards except my added test).

| Mutation | Result |
|---|---|
| Limit `>=` to `>` (FR-60) | killed: `TestServiceCreate_ServiceLimit` |
| Name clash returned as raw error (FR-59) | killed: `…NameClashIgnoresCaseButNotSpaces` |
| State row not written | killed: `…WritesTheStateRowNotYetChecked` |
| Budget `>` to `>=` (FR-56) | killed: `…Budget/equal to the interval passes` |
| Budget without the retry-interval term | killed: `…Budget/one second over …` |
| URL length ignores query parameters (FR-38) | killed: `…/url plus a parameter one past the limit` |
| Body limit skipped for `none` | killed: `…/body over the limit with type none` |
| Ignore-certificate-errors rule dropped (FR-64) | killed |
| Minimum days `<1` to `<0` (FR-34) | killed: `…/certificate minimum 0` |
| Message counted untrimmed (FR-65) | killed |
| Name counted in bytes (FR-59) | killed |
| TCP port upper bound 65535 to 65536 | killed |
| Scheduler started before the write (FR-67) | killed: `…StartsTheSchedulerOnceAfterTheWrite` and the sentinels test |
| Validation errors ignored (FR-12) | killed: `…RejectedInputSavesNothingAndStartsNothing` |
| `alerts_enabled` default false (FR-20) | killed |
| `shown_on_public_view` ignored (FR-27) | killed |
| Name not trimmed | killed |
| `NameKey` not lower case | killed |
| Body content kept with type `none` | killed |
| `NewID` returns v4 | killed |
| Number `failing_value` accepted | killed: `…ShapesThatDoNotFit…/rule value is a number` |
| `ErrServiceNameTaken` mapping removed | killed: `…ErrorsMapToTheirCodes/name taken` |
| Extra log attribute | killed |
| Missing `check` becomes 400 | killed |
| **Transaction removed from `Create`** | **survived** the builder's concurrency tests in about 60% of runs (first run passed). With my added subtest it is killed 15 of 15 |

Two mutants first failed to compile (unused variable) and were redone as valid mutants; both were killed.

## Live run

Built `cmd/server`, ran it on a temp SQLite file with `REQUIRE_HTTPS=false`, signed in, and sent requests with curl. Observed:

- `"  Web  "` with URL `" https://example.com "` saves as `Web` and `https://example.com`; then `web` and `"WEB "` both give 409 `service_name_taken`.
- Body `null` gives 422 on `name` and `check.type`. `check: []` gives 400. `{"type":"http","url":null}` gives 422 on `check.method` and `check.url`. `type: "HTTP"` gives 422 `invalid_value`.
- `port: 70000` gives 422, `port: 1.5` gives 400, `port: 65535` is saved.
- Rules `"true"` (string) and `true` (boolean) are saved and returned as different types; `body: {}` saves as `none`; `settings: {}`, `settings: null` and a whitespace-only `unhealthy_message` all save with defaults and `""`.
- A TCP check that also carried `url` and `headers` saved only host and port.
- Budget: interval 30, timeout 10, retries 2 gives 422 `check_budget_exceeded` with the computed 50 and 30.
- A name of 100 `é` (the limit, 200 bytes) was saved; 101 gave `too_long`.
- Ten concurrent identical creates: one 201, nine 409. Then 60 distinct creates: 43 were accepted, the rest 409, and the table held exactly 50 services and 50 state rows with no orphan; the next create gave 409 `service_limit_reached`.
- The server log had 50 `service added` lines and no URL or other request text.

## Findings

### Blocking

None.

### Non-blocking

**N1. Test quality (fixed on this branch): the concurrency test could pass without the transaction.**
Removing the `Transaction` wrapper left `TestServiceCreate_Concurrent` passing in about 60% of runs, because ten goroutines rarely overlap between the count and the insert. Matters when: someone refactors `Create` out of its transaction and CI happens to pass. I added a subtest in `repository/service_test.go`, "creates released together never pass the limit, round after round" (20 goroutines behind a start barrier, 10 fresh databases, limit 5 with 4 saved). It passes on the real code (about 4 s with `-race` for the repository package) and fails on the mutant 15 of 15 runs.

**N2. Resolved: the builder edited docs it does not own, at the user's request.**
The diff changes `docs/tasks/create-service-api.md` and `docs/data-model.md`. ROLES.md says a builder edits only its plan, and the task file lists "Nothing outside the allowed paths changed" as a criterion. The plan (judgment call 4) says the user asked for whitespace trimming and for these docs to be updated. The user has since confirmed that they asked for the trimming and the doc updates, so nothing is reverted. I verified the code against the edited task file (trimming is specified there and tested). The edited task file also repeats one sentence ("A value at its limit passes and one past it is rejected.", twice in a row). Cosmetic leftover: the repeated sentence in the task file. Matters when: the task file is next edited by the drafter.

**N3. Test quality: the handler suite takes about 30 s.**
`newRouter` parses the contract for every case (plan, judgment call 11). Matters when: later tasks add more handler cases to the same helper, and CI time grows with each. Not fixed here: `helpers_test.go` is shared.

**N4. Cosmetic, report only: small tidy-ups.** `CreateService` and `ValidateServiceInput` each call `normalizeServiceInput`, so the input is trimmed twice (harmless). `TestCreateService_AbsentSettingsTakeTheConfiguredDefaults` sits in `service_validation_test.go` although it tests the usecase (the task names `service_test.go`). No concrete trigger.

## Docs or specs that no longer match

- **`STACK.md`:** add `github.com/google/uuid` v1.6.0 (a direct dependency now; the table row "IDs: UUIDv7, generated by the app" does not name the library).
- **`docs/data-model.md`:** already edited by the builder ("trimmed of surrounding whitespace"); the user asked for it (N2).
- **`docs/tasks/create-service-api.md`:** edited by the builder for trimming; its "Names are saved trimmed" gap and the URL row now differ from the task as first drafted. Also at the user's request (N2).
- **`docs/requirements.md` and `docs/openapi.yaml`:** nothing out of date. Neither says anything about trimming; FR-59 only says the name is unique ignoring case.
- **`docs/tasks/backlog.md`:** nothing to change; the FR-67 row (first check waits on the scheduler task) still stands.

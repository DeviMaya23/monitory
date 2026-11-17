# Verification report: targets API

Branch: `verify/targets-api` (the builder's work from `feat/targets-api` at `243b088`, plus two test changes by the verifier in `backend/internal/repository/target_test.go`)

Result: **no Blocking findings.** The code matches the task file; every mutation that changes behavior is caught by a named test. Two test gaps were found and closed with test changes; no source was changed. One thing is not clean: `make check` fails at `lint-md` on a file this branch did not touch (N1).

## `make check`

Run on `243b088` after `npm ci` in `frontend/` (a fresh checkout has no installed dependencies; `node_modules/` is ignored).

| Step | Result |
|---|---|
| `lint-backend` (gofmt, golangci-lint with the `integration` tag) | passed, 0 issues |
| `lint-frontend`, `lint-css`, `lint-shell` | passed |
| `lint-md` | **failed**: `docs/tasks/delete-service-dialog.md:80`, two MD038 errors. The file is not in this branch's diff (`git diff main...HEAD` lists backend files and the plan only). See N1 |
| `openapi-lint` | passed |
| `test` (Go with `-race`, then Vitest: 18 files, 271 tests) | passed |
| `build` (frontend, `go build ./...`) | passed |

`make -k check` was used to see every step, since `lint-md` stops the plain run before the rest. After the verifier's test edits: `make lint-backend` passed and `go test -race -count=1 ./...` passed in every package.

Integration tests: **not run.** No file in the repository carries the `integration` build tag, so `make test-integration` has nothing to run, and this task touches no code that has such a test. No criterion depends only on an integration test.

## Criteria

"Real?" asks whether the named test would fail if the behavior were removed. "Yes (Mn)" means mutation Mn, listed under "Mutation checks run", made it fail. "Yes (read)" means I judged it by reading and did not mutate.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| V1 | A valid email and a valid webhook with headers give no errors (FR-81) | `TestValidateTargetInput_Valid` | On its own no: a validator that returned nothing would pass. The rejection tests below give it meaning | Met |
| V2 | `type` empty is `required` "Choose a type."; `ftp` is `invalid_value`; no other field reported (FR-81) | `TestValidateTargetInput_Type` | Yes (read): whole-slice `Equal` with every other field wrong, so dropping the early return adds errors | Met |
| V3 | `name`: 50 pass, 51 `too_long`, 50 multi-byte pass, empty passes (FR-80, FR-87) | `TestValidateTargetInput_Name` | Yes (M23); multi-byte row fails a byte count by reading (`é` is 2 bytes) | Met |
| V4 | Address: each accepted and rejected example, empty, limit and one past, too long beats invalid, trim (FR-82, FR-110) | `TestValidateTargetInput_Address` (18 rows, limit 30) | Yes (M12 hardcoded 254, M24 order, M9 trim) | Met |
| V5 | URL: accepted and rejected examples, empty, limit and one past (FR-89, FR-110) | `TestValidateTargetInput_URL` (limit 40) | Yes (M13 scheme check removed, M14 hardcoded 2048) | Met |
| V6 | Headers: row count at and past the limit, empty name at `headers[1].name`, name and value at and past limit, empty value, errors together in order (FR-92) | `TestValidateTargetInput_Headers` (3 rows, name 10, value 20) | Yes (M17 hardcoded 20, M25 off by one) | Met |
| V7 | A header sent with an email target is ignored | `TestValidateTargetInput_EmailIgnoresHeaders` | Yes (read): five bad rows are given, and `Empty` is asserted | Met |
| V8 | The refactored service header rule: existing service tests pass unchanged | `TestValidateServiceInput` (file untouched) | Yes (M25 also failed it, so it does reach the shared helper) | Met |
| U1 | `CreateTarget` saves the row: new id, service id, trimmed values, `value_key`, `[]` headers for an email, `last_delivery_failed` false, times from the clock (FR-14, FR-81, FR-88) | `TestCreateTarget_SavesTheRow` | Yes (M3b, M9, M10, M16, M27) | Met |
| U2 | Invalid input is `ValidationError`, repository not called; validation before the service lookup | `TestCreateTarget_InvalidInputSavesNothing`, `TestCreateTarget_InvalidInputForUnknownServiceIsValidation` | Yes (M28, M42); the first has a baseline that saves | Met |
| U3 | Limit 3: third saved, fourth and a duplicate to a full list are `ErrAlertListFull`, create after delete saved (FR-19) | `TestCreateTarget_Limit` | The cap rule here is the fake's own; the usecase's part is passing the configured limit, and that fails if it is a literal (M37). The real rule is covered at the repository (M5, M8, M33) | Met |
| U4 | Same address in another case is `ErrTargetDuplicate`; same URL in another case accepted; same address on another service accepted; the same text as email and as webhook are two contacts (FR-88, FR-18) | `TestCreateTarget_Duplicates` | Yes (M3b, M4b) for the first three. The fourth is not tested at this layer, see N5 | Partly met |
| U5 | `UpdateTarget` replaces name, type, value, `value_key`, headers; keeps id, `created_at`, `last_delivery_failed`; sets `updated_at` (FR-15, FR-86) | `TestUpdateTarget_ReplacesFields` | Yes (M26 for `updated_at`, M3b for the key). "Keeps" is the fake's own rule here; the real one is at the repository (M6, M7) | Met |
| U6 | Update to a contact in the list is `ErrTargetDuplicate` and unchanged; own contact and another case of it succeed; full list succeeds; invalid input saves nothing | `TestUpdateTarget_DuplicateOwnContactFullListAndInvalid` | Yes (M3b, M42) | Met |
| U7 | `ErrNotFound` for update and delete (unknown service, unknown target, other service's target), and for list and create (unknown service) (FR-16, FR-17) | `TestTargets_NotFound` | This is the fake's rule passed through. The real rule is at the repository (M1, M2, M32, M34) | Met |
| U8 | `ListTargets` keeps the repository's order and returns an empty non-nil list | `TestListTargets` | Partly: `z@` is created before `a@`, so a sort by value fails it; a sort by id or `created_at` gives the same order and would pass | Met |
| R1 | `List`: only the service's targets, by `created_at` then `id`, every field, headers in order, `last_delivery_failed`; none is empty non-nil; unknown service `ErrNotFound`; no targets is not `ErrNotFound` (FR-17) | `TestTargetRepository_List` (3 subtests) | Yes (M31 order, M32 unknown service, M38 scope). The non-nil part does not fail when removed (M39): gorm's `Find` returns an empty non-nil slice by itself, and the handler builds the list with `make` | Met |
| R2 | `Create` saves email and webhook with headers, comes back unchanged; unknown service `ErrNotFound`, nothing written (FR-14) | `TestTargetRepository_Create` | Yes (M34) | Met |
| R3 | Cap at 3: fourth is `ErrAlertListFull`, count stays 3; duplicate to a full list is `ErrAlertListFull`; other service not counted (FR-19) | `TestTargetRepository_CreateCap` | Yes (M5, M8, M33) | Met |
| R4 | Duplicate: same type and value; email case; URL case is not; email and webhook of the same text; other service (FR-88, FR-18) | `TestTargetRepository_CreateDuplicate` | Yes (M3, M4, M18). Type being part of the index is the migration's; not mutated | Met |
| R5 | Concurrency under `-race`: 2 rows, limit 3, ten different contacts leave exactly 3; ten of the same contact leave one (FR-19, FR-88) | `TestTargetRepository_ConcurrentCreate` | **As the builder left it: no.** With the transaction removed it failed in about 1 run in 40 (M11b). Fixed by the verifier (N2); now fails in 20 of 20 single runs without the transaction | Met, after the fix |
| R6 | `Update` replaces the editable fields, returns the stored row, keeps `id`, `service_id`, `created_at`, `last_delivery_failed`; type change works; other service's, unknown target and unknown service are `ErrNotFound`, nothing changed; a taken contact is `ErrTargetDuplicate`, row unchanged; own contact is not a duplicate (FR-15, FR-86) | `TestTargetRepository_Update` | Yes (M2, M6, M7, M19, M43) | Met |
| R7 | `Delete` removes one row; twice is nil then `ErrNotFound`; another service's id is `ErrNotFound` and the row stays; concurrent deletes leave one success (FR-16) | `TestTargetRepository_Delete` | Yes (M1, M15) | Met |
| R8 | Deleting a service empties its targets (FR-70) | `TestTargetRepository_ServiceDeleteRemovesItsTargets` | Yes (M40, foreign keys off) | Met |
| H1 | Each operation answers its status and body, conforming to the contract: 200 list, 201, 200, 204 empty (FR-14 to FR-17) | `TestListTargets_Answers200WithTheList`, `TestListTargets_NoTargetsIsAnEmptyList`, `TestCreateTarget_Answers201WithTheSavedTarget`, `TestUpdateTarget_Answers200WithTheStoredTarget`, `TestDeleteTarget_Answers204WithAnEmptyBody` | Yes (M29, M30). Each calls `AssertConforms`. The 204 test asserts status and an empty body; the mutation I tried for it did not build, so it is by reading | Met |
| H2 | 422 with `field`, `code`, `message` for `address`, `url`, `headers[0].name`; 400 for a number address and non-JSON; nothing saved | `TestCreateAndUpdateTarget_ValidationErrorsAre422`, `TestCreateAndUpdateTarget_MalformedBodiesAre400AndNeverReachTheSpy` | Yes (M41 for the 400). The 422 test checks the mapping of a `ValidationError` the spy returns; the validator itself is V1 to V7 | Met |
| H3 | `ErrNotFound` is 404 for all four; `ErrAlertListFull` and `ErrTargetDuplicate` are 409 for create; `ErrTargetDuplicate` 409 for update (FR-19, FR-88) | `TestTargets_ErrorsMapToTheirCodes` (7 subtests), `TestTargets_UnexpectedErrorHidesItsText` | Yes (M21, M35) | Met |
| H4 | Mapping both ways: webhook with headers, email, missing name is `""`, missing headers none, a header with an email dropped | `TestToTargetInput`, `TestToAPITarget` | Yes (M22, M29, M30) | Met |
| H5 | The success log line has `service_id` and `target_id` and never the address, URL, name or a header | `TestTargets_SuccessLogsOneLineWithIDsOnly` (three subtests) | Yes (M20) | Met |
| H6 | The router's every-operation tests include the four operations (NFR-8) | `TestRouter_Gate`, `TestRouter_CSRF`, `TestTargets_GateFailuresNeverReachTheSpy` | Yes (read). `operations(t)` reads the paths from the contract. Confirmed by running them: `listTargets`, `createTarget`, `updateTarget`, `deleteTarget` each show their 401 subtests, and the three that send data show the 403 subtests | Met |
| W1 | `make check` passes | run | n/a | **Not met** as run; the only failure is outside this diff (N1) |
| W2 | `git diff go.mod go.sum` is empty | `git diff main...HEAD -- backend/go.mod backend/go.sum` is empty | n/a | Met |
| W3 | Nothing outside the allowed paths changed | `git diff --name-only main...HEAD`: 20 backend files, all on the allowed list, and the plan | n/a | Met |

## Plan check

Read after the criteria pass.

- **Every criterion is in the plan.** All 8 validation, 8 usecase, 8 repository, 6 handler and 4 repo-wide items of the task file have a line. None is missing.
- **Plan and diff agree on files and on the `make check` result.** The plan's note that only `lint-md` fails on `delete-service-dialog.md:80` matches what I got. The plan's judgment calls match the code (the `targetResponse` wrapper, the `Update` read-then-write, the extracted `validateHeaderRows`).
- **Ticked items name tests that do not exist.** The behavior is tested in each case, under another name:

| Plan says | The test is |
|---|---|
| `TestCreateTarget_SavesRow` | `TestCreateTarget_SavesTheRow` |
| `TestCreateTarget_Invalid` | `TestCreateTarget_InvalidInputSavesNothing` |
| `TestUpdateTarget_Replaces` | `TestUpdateTarget_ReplacesFields` |
| `TestUpdateTarget_Duplicate` "and siblings" | `TestUpdateTarget_DuplicateOwnContactFullListAndInvalid` |
| `TestTargetRepository_ServiceDeleteCascades` | `TestTargetRepository_ServiceDeleteRemovesItsTargets` |
| `TestTargets_Success*` | `TestListTargets_Answers200WithTheList` and four more |
| `TestTargets_Create_Rejected` | `TestCreateAndUpdateTarget_ValidationErrorsAre422`, `..._MalformedBodiesAre400AndNeverReachTheSpy` |
| `TestTargets_Errors` | `TestTargets_ErrorsMapToTheirCodes` |
| `TestTargets_LogHasNoContact` | `TestTargets_SuccessLogsOneLineWithIDsOnly` |

  The plan admits "test names differ a little". See N4.

- **A ticked item that overstates.** "Concurrency under `-race`: cap leaves exactly 3; same contact leaves one" is ticked, but as written the test did not fail without the transaction (R5, N2).
- **One criterion is knowingly not done as written:** the usecase test for "the same text as an email and as a webhook" (U4). The plan's reason is correct and is recorded under N5.
- **Plan versus diff:** no difference in what changed. The plan's file list is the diff's.

## Rule checks

By reading the diff (`git diff main...HEAD`).

| Rule | Result |
|---|---|
| `usecase/` imports neither `repository/` nor `api/` | Pass. `target.go`, `target_repository.go` and `target_validation.go` import `context`, `net/mail`, `strings`, `unicode/utf8` and `domain` only |
| `repository/` and `domain/` do not import `api/` | Pass. `repository/target.go` imports `gorm` and `domain`; `domain/` files add no import of `api` |
| Only `handler/` imports `api/`; `main.go` holds no rule | Pass. `targetLimits` in `main.go` copies six fields from `cfg.Limits` into `domain.TargetLimits`, as `serviceLimits` does |
| The usecase does not call the scheduler | Pass. No `scheduler` or `worker` text in `usecase/target*.go` |
| Test imports (`TESTING.md`) | Pass. Repository tests import `domain`, `repository`, `testutil`; usecase tests use `fakes_test.go`; handler tests use `targetSpy` and not `repository` |
| No hardcoded limits | Pass. A search of the non-test files of this task for 5, 50, 254, 2048, 20, 128 and 4096 finds none (the 50 is `domain.TargetNameMaxLength`). Mutations M12, M14, M17, M37 show that the tests would catch a literal |
| Caps and duplicates by the database | Pass. `Create` counts and inserts in one `db.Transaction`; the duplicate rule is `gorm.ErrDuplicatedKey` turned into `ErrTargetDuplicate`; there is no `SELECT` for an existing contact. The count comes before the insert (M5). Atomicity depends on `_txlock=immediate` in `platform/database` (every write transaction takes the lock when it begins) |
| A target of another service is never touched | Pass. `Update` (read and write) and `Delete` filter on `id` and `service_id`; `List` and the count filter on `service_id`. Tried through the running app: `PUT` and `DELETE` with service B's id and service A's target id gave 404 and A's target kept its address (M1, M2 show the tests catch a dropped filter) |
| Nothing secret in the log or in an error | Pass. The only log calls are the three `Info` lines with `service_id` and `target_id`. The task adds no `fmt.Errorf` or `errors.New`; repository errors are the driver's or sentinels. The running app's log after all my requests held the service name (existing behavior) and ids only, and no `ERROR` lines |
| Order of checks | Pass, tried through the running app: a full list with a duplicate is 409 `alert_list_full`; an invalid body for an unknown service is 422; an unknown service with a valid body is 404; an edit of a target in a full list is 200 |
| Dependencies | Pass. `go.mod` and `go.sum` unchanged; `net/mail` is the standard library; no version adopted |
| Generated code, migrations, `.env.example`, `frontend/` | Unchanged |
| Existing tests | Pass. `TestRouter_UnimplementedOperationAnswers501` uses `GET /api/services/a-service`; the target stubs stay in `stubs.go`, shadowed |

## Mutation checks run

Each: the line was changed, the named tests were run with `-race`, and the file was reverted with `git checkout` (the tree held no source change afterwards). "Killed" means at least one test failed.

| # | Change | Tests run | Result |
|---|---|---|---|
| M1 | `Delete` without the `service_id` filter | `TestTargetRepository_Delete` | Killed (other service's id) |
| M2 | `Update` without the `service_id` filter, read and write | `TestTargetRepository_Update` | Killed |
| M3, M3b | `value_key` of an email not lower-cased | repository duplicates; usecase create and update | Killed |
| M4, M4b | `value_key` of a URL lower-cased | repository duplicates; usecase duplicates | Killed |
| M5 | Count after the insert (and `>`) | `CreateCap`, `ConcurrentCreate` | Killed (duplicate to a full list) |
| M6 | `Update` also writes `last_delivery_failed` | `TestTargetRepository_Update` | Killed |
| M7 | `Update` also writes `created_at` | `TestTargetRepository_Update` | Killed |
| M8 | Cap with `>` instead of `>=` | `CreateCap`, `ConcurrentCreate` | Killed |
| M9 | No trim (`strings.TrimSpace` made a copy) | validation and create tests | Killed (address, name, headers rows) |
| M10 | An email target's headers `nil` | `TestCreateTarget_SavesTheRow` | Killed |
| M11 | Count read through `r.db` instead of `tx` | `ConcurrentCreate`, 5 runs | **Survived; an equivalent mutant.** `_txlock=immediate` serializes whole transactions, so a read on another connection still sees the committed rows. Not a test gap |
| M11b | `Create` with no transaction at all | `ConcurrentCreate` | **Survived as the builder wrote it** (9 of 9 runs passed, then 39 of 40). Killed in 20 of 20 single runs after the verifier's fix (N2) |
| M12, M14, M17 | Literal 254, 2048 and 20 in place of the configured limit | address, URL, header tests | Killed |
| M13 | Scheme check dropped (FR-89) | `TestValidateTargetInput_URL` | Killed |
| M15 | `Delete` treats zero rows as success | `TestTargetRepository_Delete` | Killed (three subtests) |
| M16 | An email's `value` saved lower-cased | `TestCreateTarget_SavesTheRow` | Killed |
| M18, M19 | The duplicate error not turned into the sentinel, on create and on update | duplicate, concurrent and update tests | Killed |
| M20 | The "target added" log line also carries the value | `TestTargets_SuccessLogsOneLineWithIDsOnly` | Killed |
| M21, M35 | Problem row for duplicate carries the other code; the `alert_list_full` row removed | `TestTargets_ErrorsMapToTheirCodes` | Killed |
| M22 | An email target keeps headers in the mapping | `TestToTargetInput` | Killed |
| M23 | Name limit with `>=` | `TestValidateTargetInput_Name` | Killed |
| M24 | Address too-long case removed | `TestValidateTargetInput_Address` | Killed |
| M25 | Header row limit with `>=` | target headers and `TestValidateServiceInput` | Killed (both) |
| M26, M27 | `updated_at` not set on update; `created_at` not set on create | usecase tests | Killed |
| M28, M42 | Validation skipped on create; on update | usecase tests | Killed |
| M29, M30 | The API item drops an empty `name`; drops empty `headers` | handler tests | Killed |
| M31, M32, M38 | List ordered by `id` only; unknown service returns an empty list; list not scoped | `TestTargetRepository_List` | Killed |
| M33, M34 | The cap counts other services; `Create` ignores an unknown service | repository tests | Killed |
| M37 | The usecase passes a literal cap of 5 | `TestCreateTarget_Limit` | Killed |
| M39 | List of none left as a nil slice | `TestTargetRepository_List` | Survived; equivalent (gorm returns an empty non-nil slice, and the handler uses `make`) |
| M40 | Foreign keys off | `TestTargetRepository_ServiceDeleteRemovesItsTargets` | Killed |
| M41 | Mapping ignores a wrong-typed field | `TestCreateAndUpdateTarget_MalformedBodies...` | Killed |
| M43 | `Update` without `Select` (zero values skipped) | `TestTargetRepository_Update` | Killed by the verifier's new subtest only (N3) |
| M36 | A failing 204 handler | `TestDeleteTarget_...` | Not run: the mutant did not compile; the test is judged by reading |

## Live run

The built binary (`go build ./cmd/server`) was run on `127.0.0.1:18741` with a temp SQLite file, `REQUIRE_HTTPS=false`, default limits, signed in with curl, and stopped afterwards (my own process, by its pid). Results, all as the task file says:

- Create: an email with spaces and mixed case is saved trimmed with its case; the same address in another case is 409 `target_duplicate`; the same address on a second service is 201; a webhook with padded URL and headers is saved trimmed, in order; the same URL in another case is 201; a webhook with `headers: null` is saved with `[]`.
- List: items carry `name` `""` and `headers` `[]` where there are none; an unknown service is 404.
- Validation, each with the default configuration: a 51-character name is 422 and 50 is 201; an address of 255 characters is 422 "Use 254 characters or fewer." and 254 is 201; a URL of 2049 is 422 and 2048 is 201; 21 headers is 422 `too_many`; a 129-character header name and a 4097-character header value are 422 on `headers[0].name` and `headers[0].value`; an empty header name is 422; `Name <a@example.com>` is 422; `{}` and `null` are 422 "Choose a type."; `EMAIL`, a number `type`, an array body and a string body are 422, 400, 400, 400; a number `address` and text that is not JSON are 400. 50 emoji (200 bytes) is 201 and 51 is 422. `http://` alone is 201.
- Order of checks: 6th target in a list of 5 is 409 `alert_list_full`; a duplicate sent to that full list is 409 `alert_list_full`; an edit in the full list is 200; invalid body for an unknown service is 422; valid body for an unknown service is 404.
- Update: its own contact in another case is 200; an empty name clears the name; email to webhook and back works, and the headers of the email come back `[]`; a contact held by another target is 409 `target_duplicate`.
- Delete: 204, then 404.
- Another service's target: `PUT` and `DELETE` through service B's id are 404 and the target is unchanged.
- Gate: 401 without a session, 403 without the CSRF token, 415 without a JSON content type.
- Concurrency: with 4 of 5 targets, two simultaneous creates gave one 201 and one 409, and the list held 5; eight simultaneous creates of one contact gave one 201 and seven 409.
- Restart on the same file: the stored targets were still there.
- Deleting the service: its target list then answers 404.

## Findings

### Blocking

None.

### Non-blocking

**N1. `make check` is red on `lint-md`, from a file outside this task.** Category: decision needed.
`docs/tasks/delete-service-dialog.md:80` has two MD038 errors (spaces inside a code span), from the drafter's commit `59daeb8` on `main`. The criterion "`make check` passes" is not literally met on this branch, but the cause is a task file that the builder and the verifier may not edit, and the same file is identical on `main`, so the step would fail on `main` too. The builder reported it in the plan.
Reproduce: `make lint-md`.
Matters when: CI runs `make check` or `lint-md` on this pull request, or on any other, before the Drafter fixes the line: it fails with no relation to the change.

**N2. The concurrency test did not prove the transaction (fixed by the verifier).** Category: test quality.
With `Create` run without a transaction, `TestTargetRepository_ConcurrentCreate` passed in 9 of 9 runs and failed once in 40. Cause: the goroutines started one by one and each opened its own connection, so the count and the insert of different calls rarely overlapped. Fixed in `repository/target_test.go`: the helper now fills the pool with idle connections and holds every goroutine at a gate. Result: the real code passes 20 of 20 runs; the no-transaction mutant fails in 20 of 20 single runs. The source was correct.
Matters when: a later change touches the transaction in `Create` and relies on this test to notice; fixed, so nothing further is needed.

**N3. No test for an edit that clears the name or the headers (added by the verifier).** Category: test quality.
`Update` writes with `Select(...)`, so a zero value is written. Without it, an emptied name or header list would silently keep the old one; the builder's tests never edited to empty. The live run showed the behavior is right. Added a subtest in `TestTargetRepository_Update`; it fails under M43.
Matters when: someone replaces `Select(...).Updates(struct)` with a plain `Updates(struct)`; fixed, so the test now catches it.

**N4. The plan names tests that do not exist.** Category: test quality (cosmetic).
Nine ticked lines name a test under a name the code does not have (table under "Plan check"). The behavior is tested under another name each time.
Matters when: a reviewer searches for a test by the plan's name to see the evidence and finds nothing.

**N5. The usecase has no test for "the same text as an email and as a webhook".** Category: test quality.
The task file lists it for the usecase tests. The builder skipped it, saying no text passes both validators; that is right (a URL must start with `http://` or `https://`, and an address that `net/mail` accepts and returns unchanged cannot contain `://`). The repository covers the rule through the unique index, which includes `type` (R4).
Matters when: the URL prefix rule (FR-89) or the address rule (FR-82) is loosened so one text can pass both.

**N6. A webhook header name or value with CR or LF is saved.** Category: latent bug.
The task file checks length only (FR-92), so `X: a\r\nB: c` was saved and returned. Already in `docs/tasks/backlog.md` on `main` (a row added after this branch was cut); no new row needed.
Matters when: the webhook sender (FR-90, FR-91) sends the saved headers.

Report only, no trigger: the usecase tests for the cap, `ErrNotFound` and "keeps `last_delivery_failed`" exercise the fake's own rules, which the real repository must match; the repository tests cover the real rules. This follows `TESTING.md` (usecase with fakes) and needs no change.

## Docs or specs that no longer match

- **`docs/openapi.yaml`:** `TargetList` has `maxItems: 5` while `MAX_TARGETS_PER_SERVICE` has no ceiling. A known gap, already a loose end in `docs/tasks/backlog.md` (`targets-api`) and not new.
- **`STACK.md`:** nothing to record. No dependency was added and no version adopted; `net/mail` is the Go standard library.
- **`ARCHITECTURE.md`:** not wrong, but it does not mention a gotcha this task hit. The generated `CreateTarget201JSONResponse` and `UpdateTarget200JSONResponse` are defined types of `api.Target`, which lose its `MarshalJSON`, and answered only `{id, last_delivery_failed}`; the builder added a `targetResponse` wrapper in `handler/targets.go`. Matters when: a later operation's response body is itself a `oneOf` (only `Target` is today); the wrapper would be needed again. Report only.
- **`docs/tasks/backlog.md`:** the Milestone 2 row for the alert list screen (FR-14 to FR-19 and others, "built in `targets-api`") stays correct: it is the screen only, and the task file left it out. The three other Milestone 2 rows that mention `listTargets` (FR-83 to FR-86, FR-107) are unaffected.
- **`docs/manual-checks.md`, `docs/data-model.md`, `docs/requirements.md`:** match the work.
- **Branch state:** `main` has one commit this branch lacks (`docs: update backlog`, adds the N6 row). It touches no file of this task.

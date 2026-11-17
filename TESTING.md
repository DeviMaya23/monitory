# Testing

> Applies to all implementation agents.

---

## Test profile

From `docs/requirements.md` section 8.

- **Top failure modes:** (1) an outage the admin is not told about; (2) data loss after a restart or upgrade; (3) a break-in to the admin login.
- **High-risk paths (get the deepest tests):** (1) the check-to-alert chain: add a service, first check, status change, alert delivered or the failure noticed (FR-67, FR-21, FR-24, FR-85, FR-86); (2) restart and upgrade keep services, alert lists, settings and state (NFR-1, FR-111); (3) first start and sign-in (FR-102, FR-1, FR-101).
- **Milestones:** 1 basic monitoring; 2 alerting; 3 full check settings; 4 public view and health endpoint; 5 release hardening. Each ends with its end-to-end journeys passing.

## Tiers

| Tier | When | Who writes | Who runs | What |
|---|---|---|---|---|
| Per task | every task | the builder | builder, verifier, CI | unit, repository and integration tests matched to the task's risk |
| Contract conformance | every task that adds or changes an operation | the builder | builder, verifier, CI | responses and frontend mocks validated against `docs/openapi.yaml` |
| End-to-end | the last task of each milestone | that task's builder | agents and CI: the Chromium smoke subset on pull requests. CI: the full suite in three browsers on `main`, nightly and on demand (`e2e-full.yml`) | the milestone's journeys through the real binary |
| Manual | at each milestone and before release | the user | the user | `docs/manual-checks.md` |

Feature tasks write no end-to-end tests. Every bug found by hand leaves a trap behind: a test that fails without the fix, in the existing test file for that code.

Never weaken a test to make it pass: fix the cause, or stop and report.

## Commands

| Command | Needs | Runs |
|---|---|---|
| `make check` | nothing extra | lint, unit and repository tests with the race detector, builds, contract lint. The definition of done |
| `make test-integration` | Docker (Mailpit) | Go tests tagged `integration` |
| `make test-e2e-smoke` | Docker (Mailpit), Playwright's Chromium | the smoke subset |
| `make test-e2e` | Docker, three Playwright browsers | the full suite. CI runs it (`e2e-full.yml`); locally it is optional, and WebKit does not work on macOS 14 (Playwright's build there is frozen) |

Agents report each as "run, passed", "run, failed", or "not run: <reason>"; never "written, not run" when a runnable path exists.

---

## Time

- Usecase, worker and memstore tests use the fake clock. No `time.Sleep` and no waiting on real timers. A test advances the clock and asserts.
- A criterion about a duration (a retry wait, a lockout, a rate-limit window, NFR-5, NFR-6) is tested by advancing the fake clock by exactly that duration and by one step less.
- Adaptor tests against a local stub server may use real deadlines of at most 200 ms to exercise a timeout.
- "Nothing happened" (no alert sent, no check run, nothing written) is asserted against a recorded baseline: show the same setup does produce the event when the condition is reversed.

---

## Backend

### Philosophy

Test usecase behaviour, not structure. A test that only verifies a method was called, or that an error passed through unchanged, tests implementation, not correctness.

### Layer coverage

| Layer | Test type |
|---|---|
| `usecase/` | Unit tests with fakes |
| `handler/` | Unit tests with usecase spies, plus contract conformance |
| `repository/` | Tests against a real SQLite file only; no unit tests with a mocked database |
| `memstore/` | Unit tests with the fake clock, including concurrent access |
| `worker/` | Unit tests with the fake clock and fake usecases |
| `adaptor/probe`, `adaptor/webhook` | Tests against in-process stub servers (`httptest`, a TCP listener) |
| `adaptor/mailer` | Integration tests against Mailpit (`integration` tag); refusals against an in-process fake SMTP server |
| `platform/config` | Unit tests: every required key, every default, every invalid value |

### Test files

One test file per source file: `check.go` is tested in `check_test.go`, its integration tests in `check_integration_test.go`. Edge cases and regressions are rows in a table or subtests in that file, named for the behaviour they pin. Never create `_edge`, `_regress` or `_bugfix` files.

When a source file grows too big to read, split the source by concern and move its tests with it. Do not split only the tests.

### Test imports

Tests keep the same dependency direction as the code.

- `repository/` tests import `domain`, `repository` and `testutil`. Never `usecase` or `handler`.
- `usecase/` tests use the fakes in `fakes_test.go`. Never `repository`, `worker` or `adaptor`.
- `handler/` tests use per-handler usecase doubles. Never `repository`.
- `worker/` tests use fakes of the interfaces the worker defines. Never `repository` or `adaptor`.

A behaviour that spans layers is split at the seam. Do not wire real layers together to check both at once; that is what the end-to-end tier is for.

### Repository tests

`testutil.NewDB(t)` creates a SQLite file in the test's temp directory and applies every migration. Each test gets its own file. Never use an in-memory database.

Always test:

- **Query correctness:** the right records and fields, and the contract's ordering (services by name ignoring case; targets by when added).
- **Constraints:** service name unique ignoring case; no duplicate contact in one alert list; the expected error is returned.
- **Caps under concurrency:** two concurrent inserts at the limit (50 services, 5 targets) leave exactly the limit.
- **Cascades:** deleting a service removes its targets and state.
- **Persistence:** close the database, reopen the same file, and the data and state are there (NFR-1).
- **Migrations:** every up applies to an empty file and every down reverses it.

Do not test infrastructure failures by closing the connection: that tests the driver.

### What to test in usecases

**Always, for the check-to-alert chain:** every status transition, including the first check (FR-24), retries exhausted and a retry succeeding (FR-54), recovery (FR-55), paused (FR-76), alerts off and turned on while unhealthy (FR-20, FR-25), an empty alert list, restart with an unchanged and a changed status (FR-111), and each failure reason with its precedence (FR-61).

**Happy path:** only if the usecase assembles or transforms something. **Error path:** only if the usecase adds behaviour (mapping to a sentinel, a side effect). **Do not test:** pure delegation, error pass-through, logging.

**Validation:** every limit is tested at the limit and one past it, with a non-default configured value, so a hardcoded limit fails.

### Test doubles

**Use a fake** when the test needs pre-state in a dependency AND asserts post-state. Assert the outcome, not the call graph. **Use a value-return spy** for everything else, and where what got called is the behaviour (a test that must not write).

A double implements only the narrow interface the consumer defines.

| Double | Location |
|---|---|
| Fakes of repository interfaces, the scheduler, the alert sender | `usecase/fakes_test.go` |
| Spies of usecases for handlers and workers | inline in `*_test.go` |
| Fake clock | `pkg/` beside the clock |
| Stub target server (scripted status, body, delay, redirects, certificate) and stub webhook receiver | `testutil/` |

### Table-driven tests

Use a table when there are 3 or more scenarios, identical setup, and cases differ only in inputs, outputs or expected errors. Otherwise use individual `t.Run` blocks.

### Assertion quality

- Assert the result, not just the error.
- Failure cases assert the specific error: `require.ErrorIs` for sentinels.
- Use `require` / `assert` from testify throughout.

### Security-critical packages

Tested directly and in depth: the policy router (gate, CSRF, request size, scheme and client address), sign-in and lockout, the session store. Minimum cases: every gated operation is refused without a session and every public one answers without it; a gated write without the CSRF token is refused; forwarding headers are ignored when `TRUST_PROXY` is off; a locked account refuses the correct password; a session ends at 30 days and at sign-out; the cookie's `Secure` flag follows `REQUIRE_HTTPS`.

### Handler tests

Always test:

- The happy path, asserting the status code and the body shape.
- Each distinct error mapping to a `code` in `docs/openapi.yaml`, asserting the `application/problem+json` shape.
- Binding failures: malformed body, wrong content type, a body over the size limit.
- A new operation appears in the gate's test.

**Contract conformance:** every handler test passes its response through `testutil.AssertConforms(t, operationID, response)`, which validates status, headers and body against `docs/openapi.yaml`.

---

## Frontend

### Philosophy

Test logic that lives in your code. Do not test pass-through, third-party library behaviour, markup or styling.

| Shape | Unit test? |
|---|---|
| Pure logic (field-path-to-input mapping, failure-reason wording, time formatting) | Yes |
| Hook with state, effects or orchestration (auto refresh, the session redirect, row lists) | Yes |
| Component with branching UI logic (a dialog that closes on success and stays open on error, keyboard handling) | Yes |
| Presentational component (props in, markup out) | No |
| Thin API wrapper over generated types | No |

### Test setup

- Vitest with Testing Library (jsdom). Test files are colocated (`useThing.ts` + `useThing.test.ts`).
- Mock API calls at the wrapper boundary with value-return spies. Mock data is typed with the generated types, so a mock that drifts from the contract fails the type check.
- Use fake timers for time-driven behaviour (the 5-minute refresh, countdowns).
- `user-event` hangs under Vitest's fake timers: in a test that uses them, fire events with `fireEvent`; other tests use `user-event`.
- Hand-rolled widgets are a finding: a test file for a custom dialog, switch, select, tooltip or menu that does not use the `components/ui/` wrapper is reported.

---

## End-to-end

Playwright, in `e2e/`. The suite starts the real binary with a temp SQLite file, Mailpit and the stub target server, all on local ports. Journeys assert on what the admin sees and on the mail Mailpit received. Journeys tagged `@smoke` run in Chromium only.

## Manual checks

`docs/manual-checks.md` lists what no automated test covers, including NFR-2 and NFR-3. The user runs it. Agents do not tick its boxes.

# Task: backend test hardening

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Three loose ends from verifier reports, which the user chose to track. All are about tests, and none changes what the product does:

1. **The handler test suite is slow.** The `create-service-api` verifier measured about 30 s for the `handler` package and named the cause: every `newRouter` call in `handler/helpers_test.go` builds a router, and building a router parses the embedded contract again. The drafter's check on the default branch (`go test -race -count=1 ./internal/handler/`) took 63.6 s, and a CPU profile put 35% of it in `api.GetSwagger()` (about 143 ms a call), from three callers: `operationRules` in `handler/router.go` (called by `NewRouter`, 19%), `testutil.AssertConforms` in `testutil/conformance.go` (15%, every conformance assertion) and the test helper `operations` (negligible, three calls). Memoizing the first and the third alone brought the suite to about 31 s; memoizing `AssertConforms`' read as well brought it to about 3.4 s. Every later task adds cases, so CI time grows with each. After this task each of the three callers reads the contract once per process.
2. **Some probe and test-server tests can fail on a loaded runner with no code change.** They assert a wall-clock upper bound, or need a response within a short real deadline: `TestTargetServer_DelayAndRedirect` expects an answer in under 100 ms, and `TestCheckHTTP_Timeout` expects an answer delayed 20 ms to arrive within a 200 ms timeout. After this task no test in `adaptor/probe/http_test.go` or `testutil/target_server_test.go` that the audit below covers fails because a machine was slow; a timeout is still tested by a response that is later than the timeout, which cannot flake the same way.
3. **The Mailpit integration test clears someone else's mailbox.** `TestMailpit_DeliversTheAlert` sends `DELETE /api/v1/messages` to whichever Mailpit answers on `localhost:8025`, which can be another worktree's, and then asserts that the mailbox holds exactly one message. Two worktrees that run integration or end-to-end tests at the same time break each other. After this task the test uses its own recipient address, finds its own message, and removes only that one.

No behavior of the product changes.

Requirements covered: none of the FR or NFR list. Items 2 and 3 are test reliability (`TESTING.md`: adaptor tests may use real deadlines of at most 200 ms); item 1 is test speed. Each item has criteria below that fail if the change is undone.

Out of scope:

- **`adaptor/probe/tcp_test.go`, `adaptor/probe/tcp.go` and `testutil/smtp_server_test.go`.** Not part of the audit: the TCP tests mostly use a stub dial and a fake clock, and the SMTP server's tests only use lower bounds and deadlines that must expire. One known case: `tcp_test.go` asserts `assert.WithinDuration(..., 40*time.Millisecond)` on a stub's recorded deadline against `time.Now()` (around line 219), which can fail on a loaded runner. The builder reports it and any other it sees; it does not change those files.
- **Any change of what `NewRouter` builds or enforces**: the middleware order, the gate, CSRF, the body rules, the routes. Only where the contract is read from changes.
- **A different way to build the router in tests** (a shared router across tests, parallel tests): each test still builds its own router with its own spies, because they carry state.
- **The end-to-end suite and `e2e/support/mailpit.ts`.** It already uses a unique address per journey; this task brings the Go test in line with it.
- **Mailpit's configuration, `docker-compose.yml`, the Makefile** and the integration-test command.
- **The other backlog findings about tests** (they stay where they are).

## Prerequisite

`create-service-api`, `http-probe`, `alert-dispatch`, `test-service-check-api`, `worker-test-hardening` and `mail-failure-reasons` are merged (they are, at the time of drafting). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `handler/router.go` with `NewRouter` and `operationRules`, which calls `api.GetSwagger()`; `handler/helpers_test.go` with `newRouter`, `routerOptions` and `operations` (which calls `api.GetSwagger()`); the router tests in `router_test.go` that use them; `testutil/conformance.go` with `AssertConforms` and `findOperation`, which calls `api.GetSwagger()`.
- `adaptor/probe/http_test.go` with `TestCheckHTTP_Timeout`, `longTimeout`, `run` and `get`; `testutil/target_server_test.go` with `TestTargetServer_DelayAndRedirect`, and `testutil.Route` with `Delay`.
- `adaptor/mailer/mailer_integration_test.go` (build tag `integration`) with `TestMailpit_DeliversTheAlert`.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/handler/router.go`, `backend/internal/handler/helpers_test.go`, and one new file `backend/internal/handler/rules_test.go` (package `handler`, an internal test).
- `backend/internal/testutil/conformance.go`.
- `backend/internal/adaptor/probe/http_test.go`.
- `backend/internal/testutil/target_server_test.go`.
- `backend/internal/adaptor/mailer/mailer_integration_test.go`.

You may not change anything else: not `adaptor/probe/tcp.go` or `tcp_test.go`, `adaptor/probe/http.go`, `testutil/target_server.go`, `testutil/smtp_server.go` and `smtp_server_test.go`, the mailer's other files, `backend/internal/api/**` (generated), `docs/openapi.yaml`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `docker-compose.yml`, `.env.example`, `frontend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/backend-test-hardening.plan.md`). No configuration key is added.

Shared files this task touches, owned by this task while it runs: `handler/router.go`, `handler/helpers_test.go` and `testutil/conformance.go`. No other backend task is open; the tasks that may run at the same time are the frontend group's, which touch no file above.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented or changed; the router serves what it served.

## Behavior

### 1. Read the contract once (`handler/router.go`, `handler/helpers_test.go`)

**Reproduce first.** Before any change, the builder records in the plan the wall time of `go test -race -count=1 ./internal/handler/` and, from a CPU profile of one run (`-cpuprofile`), how much of it is `api.GetSwagger()` (the contract decode and load) and from which callers. The drafter saw about 35% on three callers (above). If `GetSwagger` is below a fifth of the time, the builder stops and reports what is (see "Stop and ask when"): the premise is then wrong and the fix below does not apply.

The change, when the premise holds:

- `operationRules` computes its two maps once per process and returns the same maps on every later call. A `sync.OnceValues` (or a `sync.Once` with variables) around the existing body; the error is returned as before and is not cached in a way that hides it (the contract is embedded, so it cannot fail at run time; the existing wrapped message `load the embedded contract: …` stays).
- The two maps are read-only after they are built: `policyRouter` reads them and nothing writes them. The builder checks that by reading and states it in the plan; if anything writes them, it stops.
- `testutil/conformance.go`: `AssertConforms` gets the contract from a package-level `sync.OnceValues(api.GetSwagger)` (or equivalent) instead of calling `api.GetSwagger()` on each call; the error is returned to the first and every later caller, which fails its test with `require.NoError` as today. The spec is then shared by every conformance assertion, including parallel ones, so the builder checks by reading `AssertConforms`, `findOperation` and kin-openapi's response validation (`openapi3filter.ValidateResponse`) that nothing writes to the spec or its operations; if something does, it stops. Each package keeps its own memoized read; no shared package or helper is added.
- `NewRouter` is otherwise unchanged: same signature, same order of middleware, same routes, same errors.
- `operations(t)` in `helpers_test.go` reads the contract once per test binary run: the slice and the error are built inside a `sync.OnceValues` that takes no `*testing.T`, and every call then runs `require.NoError(t, err)` and `require.NotEmpty(t, ops)` on the caller's own `t` (so a failure fails the caller's test, never a later one). It returns the same slice on every call; callers only range over it (the builder checks that no caller appends to it or changes an element; if one does, that caller gets a copy). Its name, signature and result are unchanged, so no other test file changes.
- `newRouter` is otherwise unchanged.

### 2. Tests that do not depend on the speed of the machine

The rule the builder applies: an assertion that an operation was **at least** as slow as a scripted delay, or that a response **later than the timeout** timed out, cannot fail on a slow machine; an assertion that something was **fast enough**, or that a response arrived **within** a real deadline of a few hundred milliseconds, can. The second kind is replaced.

- **`testutil/target_server_test.go`, `TestTargetServer_DelayAndRedirect`:** keep the check that a scripted delay is observed (`slow >= 100 ms`). Remove the check that the route without a delay answered in under 100 ms (`fast < 100 ms`) and the measurement behind it. The assertion left still fails if the server ignores the delay (the response comes back at once), which is the property the test exists for. The redirect assertions are unchanged.
- **`adaptor/probe/http_test.go`, `TestCheckHTTP_Timeout`:** the healthy case (a route delayed 20 ms, checked with a 200 ms timeout) uses `longTimeout` (2 s) instead of 200 ms. The failing case (a route delayed 150 ms, checked with 50 ms) stays: a response that is later than the timeout is a timeout however slow the machine is. Nothing else in the test changes.
- **The audit.** The builder reads every test in `adaptor/probe/http_test.go` (and the helpers it uses) and `testutil/target_server_test.go` for the second kind, and applies the same rule: a real deadline that the healthy path must meet becomes `longTimeout`; an upper bound on elapsed time is removed or becomes a lower bound where a lower bound proves the same thing. `TESTING.md`'s limit of 200 ms for a real deadline is for exercising a timeout (the failing cases); a deadline a healthy path must meet is `longTimeout`. Three tests the drafter found beyond the two above: `TestCheckHTTP_JSONBodyReadInsideTimeout` (a check without rules must be healthy within 150 ms while its body is delayed 3 times the timeout), `TestTestHTTP_StalledBodyWithoutRules` (headers must arrive within 150 ms of a stalled body) and the "baseline returns a result" case of `TestCheckHTTP_CallerContext` (100 ms delay, 500 ms timeout). Where raising the timeout to `longTimeout` would change what a test proves (the first two depend on the body being later than the timeout), the builder does not change that test: the plan lists it with the reason, and the report names it as left, for the user to decide. A test whose expected outcome is a failure because a response is later than a deadline (`TestCheckHTTP_TimeoutCoversRedirects`' failing case, `/late500`, the stalled listeners at 100 ms) stays as it is, and the plan lists each test it read, in one line, with its decision. No `time.Sleep` is added, no timeout is raised above what a healthy path needs, no assertion is deleted that is not an upper bound on speed.

### 3. The Mailpit test uses its own address (`mailer_integration_test.go`)

- The test no longer sends `DELETE /api/v1/messages`.
- It sends to a recipient address no other run can have: a fixed local part with a random suffix (`integration-<16 hex characters from crypto/rand>@example.com`, made once per test).
- It finds its message through Mailpit's search (`GET /api/v1/search?query=to:<address>`) and asserts that exactly one message matches, by the length of the `messages` array of the response. It does **not** assert on `total`: in Mailpit's list and search responses `total` counts the whole mailbox (the existing test used it because it cleared the mailbox first), and the count of matches is a separate field (`messages_count`). `docker-compose.yml` uses `axllent/mailpit:latest`, so the builder confirms the query form and both field names against the running image if Docker is available, and says in the plan which it used; if it cannot run Mailpit, it uses `len(messages)` and says the query form is unverified. Then the same assertions as today on that message (sender, the single recipient, subject, text).
- Mailpit has accepted the message when the SMTP send returns, so the test does not poll or sleep; if the search can answer before the message is listed, the builder reports that and does not add a sleep (see "Stop and ask when").
- The test removes only its own message: `DELETE /api/v1/messages` with the body `{"IDs":["<the id>"]}`. It does so at the end of the test body, asserts the 200, and asserts that a search for the address then returns no message; it also registers the same delete with `t.Cleanup` (ignoring its result) for the case where an earlier assertion failed. The cleanup uses its own context (`context.WithTimeout(context.Background(), 5*time.Second)`), because `t.Context()` is cancelled before cleanups run; the request helper therefore takes the context and an optional body as parameters.
- The rest of the test, the `normalize` helper and the build tag are unchanged.

### Known gaps

- The integration test is still not run by `make check`; the builder runs it if Docker is available and says so. The change is small enough that the verifier checks the request shapes by reading.
- The tests of the audit's second group (`TestCheckHTTP_JSONBodyReadInsideTimeout`, `TestTestHTTP_StalledBodyWithoutRules`) keep their real deadlines if raising them changes the scenario; they can still fail on a very slow machine, and the report says so.
- Another run that uses the same address cannot exist, but a Mailpit that receives mail from other senders at the same time is now harmless: the search matches the one recipient.
- The handler suite stays one process-wide parse plus one router build per case; it is faster, not instant.

## Structure

- `handler/router.go`: the memoized `operationRules`. `handler/helpers_test.go`: the memoized `operations`.
- `handler/rules_test.go` (new, package `handler`): the test of the cache (below). It is an internal test because `operationRules` is unexported.
- The probe and test-server changes are edits of existing tests.
- `mailer_integration_test.go`: a small helper for the random address and for the two Mailpit calls the test makes, inside the file.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

All run under `-race`; none but the last group is an integration test; no `time.Sleep` is added.

**Contract read once**

- `handler/rules_test.go`: two calls of `operationRules` return maps that are the same maps (the same map header, compared with `reflect.ValueOf(m).Pointer()`) and equal contents, for `public` and for `bodyRequired`; the test fails if the memoization is removed (a fresh map each call).
- The contents are as before, spelled out literally in the test, in the key form `METHOD /echo/:path` that `routeKey(method, echoPath(path))` makes: `public` is exactly `POST /api/session`, `GET /api/public/dashboard` and `GET /health` (`receiveAlert` also says `security: []` but lives under `webhooks:`, which `spec.Paths` does not hold, so it is not in the map); `bodyRequired` is exactly `POST /api/session`, `POST /api/services`, `PUT /api/services/:serviceId`, `POST /api/service-tests`, `POST /api/services/:serviceId/targets`, `PUT /api/services/:serviceId/targets/:targetId`, `POST /api/services/:serviceId/target-tests` and `PUT /api/settings/public-view` (the existing router tests `TestRouter_PublicOperationsAreExactlyTheContracts`, the gate test and the body tests pass unchanged and are the proof that the router behaves as before).
- `go test -race ./internal/handler/` passes unchanged except for `helpers_test.go` and `rules_test.go`; the wall time before and after is in the plan, and the builder reports both. The expected result is under 10 s; a result above 20 s means a caller was missed (the builder profiles again and reports).
- `testutil/conformance.go`: by reading, `AssertConforms` makes no call to `api.GetSwagger()` outside the memoized one; every existing test that uses it passes unchanged (the handler suite and the testutil tests).

**Timing-independent tests**

- By reading: `TestTargetServer_DelayAndRedirect` has no upper bound on elapsed time; `TestCheckHTTP_Timeout`'s healthy case uses `longTimeout`; the plan lists the tests the audit read, each with its decision.
- By running: the `adaptor/probe` and `testutil` packages pass `-count=30` under `-race`, and `-count=3` while the machine is loaded with one busy loop per CPU core (for example `yes > /dev/null` started once per `sysctl -n hw.ncpu` core and stopped afterwards; the builder checks that none is left running). The plan states the load and the result; a single failure is a finding to report, not to retry away.
- By mutation, the tests that remain still fail for the property they test: make `testutil.TargetServer` ignore `Route.Delay`, and `TestTargetServer_DelayAndRedirect` fails; make the probe ignore its timeout, and `TestCheckHTTP_Timeout` fails (its 150 ms route against 50 ms).

**Mailpit test** (integration test; written, run only if Docker is available)

- By reading: no `DELETE /api/v1/messages` without an `IDs` body remains in the file; the address has a random part; the search and the cleanup use only that address and that id.
- By running (if Docker is available): the test passes against Mailpit, and passes when a second message to another address is in the mailbox before it starts (the builder sends one with `curl` or a small Go call and states it in the plan); that message is still in the mailbox afterwards.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** `router.go` differs from the default branch only in how `operationRules` gets its maps; `NewRouter`'s body is unchanged; nothing writes the two maps; `operations` is memoized with its signature and result type unchanged and no caller changes the slice or its elements; no test file other than `helpers_test.go`, `rules_test.go`, `http_test.go`, `target_server_test.go` and `mailer_integration_test.go` changed; no `time.Sleep` added; no assertion was removed except upper bounds on elapsed time; no timeout was raised above what a healthy path needs.
- **Mutation checks** (restore after each): remove the memoization of `operationRules` and see `rules_test.go` fail; make `AssertConforms` call `api.GetSwagger()` each time again and see the handler suite's time return (the report states it; no test fails); make `TargetServer` ignore `Delay` and see its test fail; make the probe ignore its timeout and see `TestCheckHTTP_Timeout` fail; change the Mailpit test's search to another address and see it fail (if Docker is available).
- **Inputs to try:** run `go test -race -count=3 ./internal/handler/` (a cached router rule must not leak state between cases: the gate and body tests are order-independent); run the handler tests with `-shuffle=on`; run the probe tests with `-cpu=1`.
- **Run it:** the handler, probe and testutil packages three times under `-race`; the integration test if Docker is available.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- `api.GetSwagger()` is under a fifth of the handler suite's time (the premise of item 1), a map of `operationRules` is written after it is built, or the shared spec is written during `AssertConforms`' validation. Report what the time is spent on; do not change anything else to make the suite faster.
- Mailpit's search answers before a message it has accepted is listed (the test would then need a wait): report it, do not add a sleep.
- You think you need a change outside your paths (`tcp_test.go`, `testutil/target_server.go`, generated code, a dependency, the Makefile), or a configuration key.
- The merged code differs from "Prerequisite" (a renamed helper or test).
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and `make test-integration` if Docker is available: this task touches an integration test), commit in small steps (the contract cache, the timing tests, the Mailpit test, separately), push your branch (never the default branch), and finish with a short report: branch name, what changed, the handler suite's time before and after and where the time was (by caller), the tests the audit read and what it decided for each, how the load was made and the result of the loaded runs, which tests ran and whether the integration test ran (with the Mailpit version if it did), dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.

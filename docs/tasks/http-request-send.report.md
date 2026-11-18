# Verification report: http request send

Branch: `verify/http-request-send` (built from builder branch `feat/http-request-send`, commit `e897810`)

Verdict: **1 Blocking finding** (a criterion the standard library cannot meet; see B1). Everything else is met. No pull request opened.

## Checks run

- `make check`: **passed** (before and after my added tests). The frontend needed `npm ci` first (no tracked file changed).
- Integration tests (`make test-integration`): **not run**. The only integration-tagged tests in the repo are the mailer's (`adaptor/mailer/mailer_integration_test.go`); this task touches `domain/check.go`, `adaptor/probe`, `worker/check_runner*`, none of which has an integration test. No criterion depends only on an integration test.
- Not provable by me (per the task file): behaviour against real servers and proxies, the body being sent inside the timeout, `CONNECT` and `TRACE`. The app was not run live: this task serves no HTTP operation and changes no wiring, so the probe tests against `testutil.TargetServer` are the evidence.

## Acceptance criteria

All tests are in `backend/internal/adaptor/probe/http_test.go` (probe) and `backend/internal/worker/check_runner_test.go` (runner). "Real?" = would fail if the behaviour were removed (mutation results below).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Query params: order, after own query, bare `?`, trailing `&`, 20, duplicates, empty value, no params, fragment (FR-35, FR-38) | `TestCheckHTTP_QueryParams/*` | Yes (sort, drop-query, fragment mutations fail rows) | Met |
| Query params: `&`, `=`, space, non-ASCII stay in one parameter | `TestCheckHTTP_QueryParams/special characters stay inside one parameter` | Yes (skip-encoding mutation fails it) | Met |
| Headers: canonical name, values as saved, none given leaves only `User-Agent` | `TestCheckHTTP_Headers/*` | Yes (drop-UA mutation fails) | Met |
| Headers: two of one name in order; saved `User-Agent` replaces default | `TestCheckHTTP_Headers/two with one name…`, `…saved User-Agent replaces…` | Yes | Met |
| Headers: **two saved `User-Agent` arrive as two values, no `Monitory`** | `TestCheckHTTP_Headers/two saved User-Agents, no default; the library writes only the first` | The test pins one value (`A`), not the criterion | **Partly met** (B1) |
| Headers: saved `Content-Type` replaces default; two saved `Content-Type` arrive as two, no default | `…Content-Type replaces…`, `…two saved Content-Types…` | Yes (ignore-saved-CT mutation fails both) | Met |
| Headers: 4,096-char value and 20 headers whole | `…a long value and twenty headers arrive whole` | Yes (20 headers x 4,096) | Met |
| Body: json/text/form content types and exact bytes | `TestCheckHTTP_Body/{json,text,form}` | Yes (all-json mutation fails `text`) | Met |
| Body: none, empty type, unknown type send no body and no `Content-Type` | `TestCheckHTTP_Body/no body for type {"",none,xml}` | Yes (none-with-content-type mutation fails) | Met |
| Body: json with empty content is an empty body with its type | `…json with empty content…` | Yes | Met |
| Body: 65,536 bytes; non-ASCII + line break byte for byte | `…64 KB arrives whole`, `…non-ASCII and a line break…` | Yes | Met |
| Body: POST, PUT, PATCH, DELETE, GET each carry it (FR-36) | `TestCheckHTTP_Body/body with {M}` | Yes (POST-only mutation fails the other four) | Met |
| Attempt unchanged: 200 healthy, 500 `non_2xx_status`, delay gives `timed_out` with a body | `TestCheckHTTP_RequestOutcome` | Yes for timeout and status; FR-41 for the body is by reading (below) | Met |
| CR/LF in a value and empty name give `could_not_connect`, nothing sent | `TestCheckHTTP_RefusedHeader/*` (with a healthy baseline) | Yes | Met |
| Redirects (FR-58): two 302 hops, all three requests carry saved headers | `…RedirectsCarrySavedRequest/two 302 hops on one host` | Guard only, as the task says | Met |
| Redirect to another host name delivers `Authorization`, `Cookie`, `X-Api-Key` | `…/a different host name still gets them` (127.0.0.1 to localhost) | Yes: the "no re-set on redirect / first request only" mutation fails it | Met |
| Saved `Content-Type` on the body-less GET after 302 after POST; no `Content-Type` without one | `…/302 after POST is a GET…`, `…without a saved Content-Type sends none` | Yes | Met |
| Default `User-Agent` on every hop; saved one on every hop | `…saved…requireSaved`, `…/a saved User-Agent is on every hop` | Yes (drop-UA mutation fails) | Met |
| 307 after POST repeats method, body, saved headers | `…/307 after POST…` | Yes | Met |
| Chain longer than the limit still fails `too_many_redirects` | `…/a chain over the limit still fails` | Yes (unchanged policy) | Met |
| Concurrency: two checks, different headers, one prober, `-race` | `TestCheckHTTP_ConcurrentHeaders` (20 checks, redirects included) | Yes (shared-state mutation fails it) | Met |
| Existing tests pass unchanged | diff of the test files has 0 deleted lines | n/a | Met |
| Runner: four fields equal the service's, first attempt and every retry (FR-35) | `TestRun_PassesSavedRequest` (3 attempts) | Yes (dropping `Headers` or `BodyContent` fails it) | Met |
| Runner: none given gives the unchanged three-field check, nil lists | `TestRun_NoSavedRequestStaysEmpty`, existing `TestRun_HealthyFirstAttempt` | Yes (nil/empty asserted) | Met |
| Runner: TCP, missing method/URL as before | existing tests, unchanged | n/a | Met |
| `make check` passes | run | n/a | Met |
| No change to `go.mod`, `go.sum`, `.env.example`, config, `main.go`, migrations, files outside allowed paths | `git diff main...HEAD --stat`: only the five allowed files and the plan | n/a | Met |

Requirement IDs: FR-35 (query, headers, body, runner tests), FR-37 (body-type rows), FR-36 in part (method rows), FR-38 in part (20 params, 20 headers x 4,096, 64 KB), FR-58 in part (redirect tests), FR-41 in part (by reading).

## Plan check (`http-request-send.plan.md`)

- Every criterion of the task file appears in the plan; none is missing.
- Every ticked item has a test that exists and checks the behaviour (confirmed by the mutation runs). The one exception is the ticked headers item, which the plan itself marks as a deviation (two saved `User-Agent`): the test that exists pins the library's behaviour, not the criterion. This is B1.
- Plan and diff agree. The judgment calls it lists (context-carried headers, delete-then-add in `applyHeaders`, fragment cut only when params are given, four extra tests) match the code. "Mutation checks were not run by the builder" is true; they are below.

## Rule checks

- **Dependencies:** none added; `go.mod` and `go.sum` unchanged; `adaptor/probe` imports `domain` and the standard library only; `worker` imports `domain` and `pkg/clock` only. Pinned versions unchanged.
- **Layering:** the runner only maps (plain assignment, no copy). The prober only builds and sends. No health decision was added.
- **One client, no sharing:** the client is built once (`httpClient()` under `sync.Once`); the redirect policy reads the saved headers from the request in flight (`req.Context()`), so there is no state shared between checks. Confirmed by the shared-state mutation.
- **Logs:** no logging in the probe or the runner; nothing saved reaches a log.
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in the changed source (the runner's existing `clock.NewTimer` is untouched).
- **FR-41 by reading:** `reqCtx` is derived from `probeCtx` (the check's deadline); connecting, sending the body, redirects and the response share it. No new context deadline or timer.
- **Contract, config, migrations:** untouched. Not a frontend task.

## Mutation checks run

Each was applied to the source, the package tests run with `-race`, and the source reverted (`git status` clean afterwards).

| Mutation | Result |
|---|---|
| Sort the parameters | Fails `QueryParams/not sorted`, `/twenty whole and in order` |
| Drop the existing query when appending | Fails `QueryParams/after the URL's own query`, `/query ending in ampersand`, `/fragment dropped` |
| Skip encoding | Fails `QueryParams/special characters stay inside one parameter` |
| Send the body only for POST | Fails `Body/body with PUT, PATCH, DELETE, GET` |
| `application/json` for every type | Fails `Body/text` |
| Ignore a saved `Content-Type` | Fails both `Headers/…Content-Type…` subtests |
| Do not set the saved headers again on a redirect (also covers "first request only") | Fails `Redirects/a different host name…`, `/302 after POST…` |
| Share a header set between concurrent checks (package variable) | Fails `TestCheckHTTP_ConcurrentHeaders` |
| Drop the `User-Agent` default | Fails `Headers/none given…`, `Headers/values as saved…`, five redirect subtests |
| Send a `none` body type with a content type | Fails `Body/no body for type …`, `Headers/none given…` |
| Do not delete library copies before adding saved headers | Fails the headers, redirect and concurrency tests (doubled values) |
| Runner drops `Headers`; runner drops `BodyContent` | Each fails `TestRun_PassesSavedRequest` |
| Keep the fragment | Fails `QueryParams/fragment dropped` rows |
| "Send a different body on retry" | Not applicable: the runner builds one `HTTPCheck` for all attempts; `TestRun_PassesSavedRequest` compares all three attempts to one value |

All mutations were caught by at least one named test.

## Extra cases tried

I added three subtests (they pass), as rows in the existing files:

- `Headers/authorization and Authorization together arrive as two values in order`
- `Redirects/308 after POST repeats a 64 KB body and the saved headers`
- `Redirects/a POST chain of four 307 hops with the limit 3 fails`

Already covered by the builder and checked: URL with query and fragment plus params, a parameter name with `&`, a 64 KB body, a GET with a body, a redirect to another host name with `Authorization`, 307 and 302 after POST, 20 headers of 4,096 characters, a header with CR (`could_not_connect`).

## Findings

### Blocking

**B1. Two saved `User-Agent` headers cannot both be sent (acceptance criterion not met).**
The criterion (Headers) and Behavior step 3 say two saved `User-Agent` headers arrive as two values with no `Monitory`. `net/http` writes a single `User-Agent` line (the first value), so the receiver sees only the first. The builder found this and pinned the real behaviour in `…/two saved User-Agents, no default; the library writes only the first`, which contradicts the criterion's text. This is a task-file defect rather than a code bug: the standard library cannot do it without a custom transport, which the task does not allow.
- Reproduce: `CheckHTTP` with `Headers: nv("User-Agent","A","User-Agent","B")`, `GET`, read the receiver's `User-Agent`: `["A"]`, expected `["A","B"]`.
- To clear it: the user relaxes the criterion and the "every saved header of that name is sent" sentence for `User-Agent` (the code and test then match), or asks for a custom transport. I did not change source.

### Non-blocking

- **Decision needed:** the task's Known gaps list library-controlled headers (`Host`, `Content-Length`, `Transfer-Encoding`, `Trailer`) but not that `User-Agent` is single-valued. Matters when: the task text is reused by `http-json-rules` or `testServiceCheck` and someone relies on multiple `User-Agent` values. (Resolved by the B1 edit.)

## Docs or specs that no longer match

- `docs/tasks/http-request-send.md`: the Headers criterion and Behavior step 3 on two saved `User-Agent` headers (B1).
- `docs/tasks/backlog.md` line 26 (FR-37, FR-38 row): says the check sending the saved values "is `http-request-send`"; after merge it should say it does.
- `docs/openapi.yaml`, `docs/requirements.md`: no change needed.
- `STACK.md`: no version adopted (no dependency added; Go `1.27.4` unchanged).

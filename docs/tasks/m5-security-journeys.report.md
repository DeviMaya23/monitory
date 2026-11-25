# Verification report: m5-security-journeys

Branch: `verify/m5-security-journeys` (the builder's branch is `feat/m5-security-journeys`; this branch starts at its head `8b3357d` and adds only this report).

Verdict: **no Blocking findings.** Source is untouched by this work (`e2e/**` and the plan file only). Every journey is a real test: each of the 17 mutations I could build made at least the named journey fail.

## Commands run

| Command | Result |
|---|---|
| `make check` (after `npm ci` in `frontend/` and `e2e/`; a fresh worktree has no installed dependencies) | passed (exit 0): gofmt, golangci-lint 0 issues, eslint, stylelint, shellcheck, Go tests with `-race`, 1469 frontend tests, build |
| `npx playwright test sign-in-lockout sign-in-https proxy-trust --project=chromium`, `--workers=1`, `--workers=4`, default, and twice more in a row | 11 passed every time |
| same specs, `--project=firefox` | 11 passed |
| same specs, `--project=webkit` | **not usable here**: 8 passed; the 3 tests that open a page (journey 1, journey 3 lock, journey 4) time out with `browserContext.newPage: Page.overrideSetting: Unknown setting: PushAPIEnabled`. The M1 spec `sign-in.spec.ts` (`@smoke`) fails the same way in WebKit on this machine, so it is the installed WebKit build (`webkit_mac14_special-2251`, Playwright 1.64.1), not this task. The 8 that pass are the API-only journeys |
| smoke: `make test-e2e-smoke` | `make` could not start Mailpit (port 1025 held by another session's container `m3-e2e-journeys-builder-mailpit-1`; I did not touch it). I ran the target's second line, `cd e2e && npx playwright test --project=chromium --grep @smoke`, after `make build`, against that Mailpit: 9 passed |
| whole suite, Chromium (`npx playwright test --project=chromium`) | 101 passed |
| integration tests: `cd backend && go test -race -tags integration ./...` (not `make test-integration`, same Mailpit port reason; used the other session's Mailpit) | run, passed. No database version is printed (SQLite is embedded, the run prints none). Nothing outside `e2e/` changed, so no criterion depends on them |

## Criteria

"Real?" = would the test fail if the behavior were removed? Yes means I saw it fail in a mutation (see "Mutation checks run") or reasoned it from the assertion where noted.

| # | Criterion | Test (file) | Real? | Status | Evidence |
|---|---|---|---|---|---|
| 1a | J1 steps 2 to 8 with exact statuses, texts, headers: 4 wrong 401s, fifth through the form is 401 and shows the error text, sixth (right credentials) shows the locked banner, disabled button, focus, countdown, API 429 with exact body, `Retry-After` range, no cookie, same answer for wrong credentials, refusal does not extend the lock, session survives, no session created (FR-2, FR-1) | `sign-in-lockout.spec.ts` `M5 journey 1 five wrong attempts lock …` | Yes: lock at 4 and at 6, right creds not refused, refusal extends the lock, locked answer differs by which part was wrong, wrong username not counted: all fail it | Met | all steps present in the test; the `Retry-After` poll fails when refusals extend the lock |
| 1b | Right credentials accepted at the start, so "refused" is the lock | same, step 1 (`signIn` before the failures) | Yes: if a lock never engaged the step 4 banner would not show; baseline itself would fail on a changed password | Met | |
| 2 | J2 every status in steps 1 to 7, in order (FR-2) | `M5 journey 2 what counts …` | Yes: lock at 4/6, no reset, wrong username not counted, an empty field counted: each fails it. The step 5 `401` discriminates (empty-counts mutant fails there) | Met | |
| 3a | J3 lock test: banner before restart, none after, button enabled, sign-in works (FR-114) | `M5 journey 3 a restart clears the lock` | Partly proven: it fails when the lock is wrong (lock4, lock6, right-creds mutants) but I could not build a "lock survives restart" mutant (see mutation list); the lock is in process memory, so the test would fail only if state were persisted | Met | banner is asserted before the restart |
| 3b | J3 count test: 4 wrong, restart, 4 wrong 401, fifth 401, then 429 (FR-114) | `M5 journey 3 a restart clears the failed-attempt count` | Yes against wrong thresholds; same note on persistence as 3a | Met | |
| 4 | J4 steps 1 to 5, detail compared exactly (FR-97, FR-99) | `sign-in-https.spec.ts` `M5 journey 4 …` | Yes: check after validation, check after credentials, forwarded proto read with trust off: each fails it | Met | text equals `httpsRequiredDetail` in `handler/problem.go:22` character for character; banner title equals `SignInForm.tsx:80` |
| 5a | J5 require on, trust on: all attributes, `Secure` true, header cases (FR-98, FR-99) | `M5 journey 5 the cookie is Secure when require HTTPS is on` | Yes: cookie never Secure fails it | Met | |
| 5b | J5 require off, trust on: not `Secure` whatever the scheme (FR-98) | `M5 journey 5 the cookie is not Secure when require HTTPS is off, whatever the scheme` | Yes: cookie always Secure, and Secure-follows-request, both fail it | Met | |
| 5c | J5 require off, trust off: not `Secure` | `M5 journey 5 the cookie is not Secure with the default environment` | Yes against always-Secure. It does **not** catch "forwarded proto read while trust is off" (with require off, Secure follows the setting either way); journey 4 step 4 does | Met | task file listed this test for that mutant; see N1 |
| 6 | J6 trust off ignores forwarding headers: 3x `404`, fourth `429` with code, range, content type (FR-99, FR-32) | `proxy-trust.spec.ts` `M5 journey 6 …` | Yes: trust applied while off fails it | Met | |
| 7 | J7 trust on, default header: last entry counted, own counter per address, no header uses the connecting address | `M5 journey 7 …` | Yes: first entry counted fails it | Met | `1.1.1.1, 203.0.113.7` is refused |
| 8 | J8 `CLIENT_IP_HEADER=X-Real-IP` decides the address | `M5 journey 8 …` | Yes: header hard-coded to X-Forwarded-For fails it | Met | |
| 9 | Repo-wide: smoke passes; new specs pass in Chromium; Firefox and WebKit reported | see "Commands run" | n/a | Met (WebKit: not usable on this machine, reason above) | |
| 10 | Repo-wide: `make check` passes; nothing outside `e2e/` changed | `git diff --name-only 0e1401e HEAD`: the plan file and four files under `e2e/` | n/a | Met | |

Requirement IDs in the task goal: FR-2 (J1, J2, J3), FR-1 in part (J1 step 6), FR-114 in part (J3), FR-97 (J4), FR-98 (J5), FR-99 (J4 to J8), FR-32 in part (J6 to J8): each has a journey, and each journey's test names the IDs.

## Plan check (read after the criteria)

- Every criterion above has a ticked line in `m5-security-journeys.plan.md`; none missing. Every ticked item has an existing test that checks the behavior.
- Plan vs diff: the diff is the plan. Differences:
  - The plan's integration line says "not run: nothing outside `e2e/` changed". I ran them: passed (above). Not a defect.
  - The plan says the existing `public-dashboard` journeys fail in WebKit the same way; I confirmed it with `sign-in.spec.ts`. Same cause.
  - Judgment calls 1 to 6 in the plan match what the diff does. Call 1 (Mailpit port held) I met too and handled the same way.

## Rule checks

- **Diff rules:** only `e2e/**` and the plan file; `package.json`, lockfile, `playwright.config.ts`, `app.ts`, `fixtures.ts` unchanged; no new `waitForTimeout` (the one in `helpers.ts:179` is the existing `settle`); polls use `expect.poll`; no CSS-class selectors in the new specs (the countdown is found by `getByText(/^Try again in /)`); no `retries`; every wrong credential differs from the admin's (`not-the-password`, `not-the-admin`); `PUBLIC_RATE_LIMIT_PER_MINUTE` set only in `proxy-trust.spec.ts` (and the existing M4 spec); `REQUIRE_HTTPS` and `TRUST_PROXY` set only through `appOverrides`; `appEnv()` still passes only explicit values (the app is started with `env -i`-style explicit env).
- **Texts:** `Sign-in locked` (`handler/session.go:26`), `HTTPS required` and the detail (`handler/problem.go:22,42`), `Username or password is incorrect.`, `Too many failed attempts.`, `Sign-in requires HTTPS` (`SignInForm.tsx:72,93,80`), `This status page isn’t available` and `It has been turned off.` (`PublicDashboard.tsx:100-101`): all equal their source. No difference found.
- **Dependencies:** none added; no pinned version changed.
- **CONVENTIONS.md:** no source code in the diff, so layer boundaries, data scoping and transactions are not touched. Test code is by role and visible text. Writes over HTTP are only the unauthenticated sign-in the task allows.
- **Frontend rules** (component library, design code): not applicable, no frontend change.
- **ROLES.md / TESTING.md prerequisite:** both already allow a milestone's closing end-to-end work to be more than one task.

## Mutation checks run

Applied to `backend/` in this worktree, test run in Chromium, then `git checkout -- backend` (nothing committed; `git status` clean after each).

| Mutation | Journeys that failed |
|---|---|
| lock after 4 failures (`MaxFailedSignIns = 4`) | 1, 2, 3 (both) |
| lock after 6 failures | 1, 2, 3 (both) |
| correct sign-in does not reset the count | 2 |
| wrong username not counted (`username != a.username` returns before the lockout) | 1, 2 |
| empty field counts as a failure | 2 |
| lock not applied to the right credentials | 1, 2, 3 (both) |
| refused attempt extends the lock | 1 (step 6 poll) |
| locked answer differs when the username is wrong | 1 (step 6) |
| HTTPS check after validation | 4 (step 3, `{}`) |
| HTTPS check after credentials | 4 (step 3, wrong credentials) |
| `X-Forwarded-Proto` read while trust is off | 4 (step 4) only: 5c and 6 do not catch it (N1) |
| cookie always `Secure` | 5b, 5c |
| cookie never `Secure` | 5a |
| `Secure` follows the request's scheme | 5b |
| first `X-Forwarded-For` entry counted | 7 |
| address always from `X-Forwarded-For` | 8 |
| trust applied while off (`if trustProxy \|\| true`) | 6 |

Not run: **`Set-Cookie` on the 429** (the generated 429 response type has no cookie header, so the mutation does not compile; the assertion `set-cookie` is undefined is in journey 1 step 6, and it would fail on any added header); **lockout survives a restart** (a persisted count is not possible in this build, as the task file allows to skip); **malformed body counts as a failure** (400 comes from the router, before the use case; the same assertion pattern as the empty field, which was killed).

## Cases tried beyond the task file

Against the built binary with explicit environment, by hand with `curl`:

- 12 concurrent wrong sign-ins: exactly 5 `401` and 7 `429`, so the count at the boundary is exact under concurrency. Right credentials afterwards: `429`.
- `TRUST_PROXY=true`, limit 3: `X-Forwarded-For: 9.9.9.9`, with a trailing comma, with a trailing comma and space, and plain all count as one address (3 pass, fourth `429`); a non-IP value (`garbage`) is counted as an address of its own (3 pass, then `429`); no header counts the connecting address (3 pass, then `429`); two `X-Forwarded-For` header lines use the last entry of the last line. Nothing wrong found. (One early run looked off, 2 passes and then `429`. It came from a second script of mine hitting the same port at the same time; rerun clean on separate ports, it is as above.)
- Exact limits: the fifth failure is `401`, the sixth is refused; `Retry-After` bounds 600 to 900 are inclusive in the test and the real first value is within them.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Journey 5's third test and journey 6 do not catch "forwarded proto read while trust is off".** Category: test quality. Only journey 4 step 4 catches it (the task file lists 5's third test and journey 6 for this mutant; with `REQUIRE_HTTPS=false` the cookie's `Secure` follows the setting whatever the scheme, and journey 6 counts addresses, not schemes). Matters when: journey 4 step 4 is changed or removed, or `REQUIRE_HTTPS` stops being the only input of the cookie flag.
- **N2. WebKit cannot run page-opening tests on this machine** (`PushAPIEnabled`). Category: decision needed (environment). Matters when: the user runs `make test-e2e` here and reads three browsers as green, or CI's WebKit image differs from the local one. Journeys 1, 3 (lock) and 4 are the new tests that need it.
- **N3. `signInApi` and `signInRaw` return the type `PublicApiResult`.** Category: cosmetic. Matters when: a helper in a third spec reuses the name; report only until then.

## Docs or specs that no longer match

- `docs/manual-checks.md`, "Production": "Sign-in over plain HTTP is refused, and the cookie is marked `Secure` (FR-97, FR-98)". The refusal and the cookie flags are now proven through the real binary by journeys 4 and 5; what stays manual is the part the task names (a browser keeping a `Secure` cookie over real HTTPS, behind Fly.io's proxy and `Fly-Client-IP`). The user may want to narrow the line to that. No change is required for correctness.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: nothing out of date. No dependency or version was adopted (`@playwright/test` stays `1.64.1`).

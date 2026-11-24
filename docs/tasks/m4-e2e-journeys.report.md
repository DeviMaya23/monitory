# Verification report: m4-e2e-journeys

Branch: `verify/m4-e2e-journeys` (the builder's `feat/m4-e2e-journeys` plus one test fix and this report).

Result: **no Blocking findings.** One test gap found and fixed (finding N1).

Process note: the verifier's first read of `m4-e2e-journeys.plan.md` happened in the same command as the diff of `e2e/support`, before the criteria table was drafted. The table below was still built from the task file and the spec files, and the code was judged against the task file.

## Commands

| Command | Result |
|---|---|
| `make check` | run, passed (exit 0). Frontend dependencies had to be installed first (`cd frontend && npm ci`) |
| `cd e2e && npm ci && npm run typecheck` | passed |
| `--list` / `--grep @smoke` | 7 M4 tests listed; smoke lists the 7 M1 to M3 smoke tests, journey 1 and the first test of journey 3, and nothing else |
| M4 journeys, `--workers=4` | 7 passed, 1.2 min |
| M4 journeys, `--workers=1` | 7 passed, 3.1 min |
| Whole Chromium project (default workers), with the test fix | 90 passed, 3.1 min. Slowest: journey 5 (1.1 min), journey 2 (about 49 s), journey 1 (about 25 s) |
| Integration tests (`make test-integration`) | not run: the diff changes no Go code and no file with integration tests; no criterion depends on them. The Go integration tests were left to the earlier tasks. No database version printed |
| `make test-e2e-smoke` | not run: Docker's Mailpit was already up from a sibling worktree, so the direct Chromium command was used |

The whole project ran once here (the builder reports two passes). Journey 5 alone also passed once more after the fix.

## Criteria

"Real?" = would the test fail if the behaviour were removed. Evidence for "yes" is the mutation checks below.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Harness: typecheck passes | `npm run typecheck` | n/a | met |
| Harness: `--list` and `@smoke` as specified | `--list`, `--grep @smoke` | n/a | met |
| Harness: parallel tests get their own app, stubs, visitor | `visitor` fixture in `fixtures.ts` (per test, built on `app`); ran at 1 and 4 workers | yes: the limit is per app, journey 5 passes in parallel | met |
| Harness: M1 to M3 still pass | full run, 90 passed | yes | met |
| Harness: no Mailpit, `alerts: false` | grep of the new specs | n/a | met |
| J1: FR-28, FR-63, FR-112 name, word, time | `M4 journey 1` | yes (m1, m3, m4) | met |
| J1: FR-40 no URL, id or other field, in page and API | `M4 journey 1` key-set check, text checks | yes (m5: an extra key fails it) | met |
| J1: FR-113 not chosen | `M4 journey 1` (the `d-` service) | yes (m1) | met |
| J1: order ignoring case | `M4 journey 1` `[x, a, B]` | yes (m4) | met |
| J1: NFR-7 markup as text | `M4 journey 1` (`getByRole`/names, no `b` in the row) | yes (m12: names as HTML fails it) | met |
| J2: FR-27, FR-68 new service hidden, then chosen | `M4 journey 2` steps 1 and 2 | yes (m1) | met |
| J2: FR-77, FR-78 paused hidden, state kept; resumed returns | `M4 journey 2` steps 4 and 5 | yes (m2) | met |
| J2: FR-113 not yet checked hidden, admin status read before and after | `M4 journey 2` step 3 | yes (m3) | met |
| J3: FR-26, FR-29 off by default, 404 body, switch both ways | `M4 journey 3` steps 1 to 3 | yes (m6) | met |
| J3: NFR-1 setting stored (on, restart, still on) | `M4 journey 3` step 3 | yes by reading: Off is the default, so only an On after restart proves storage. No mutation of the repository was run | met |
| J3: the `Open` link | `M4 journey 3` step 4 | yes by reading (href, target, new page content) | met |
| J4: FR-30 Refresh, FR-112 summary | `M4 journey 4` step 1 | yes by reading | met |
| J4: FR-31 five-minute update, no request at 4:00, one at 5:30 | `M4 journey 4` step 2 | yes (m14) | met |
| J4: FR-29 unavailable replaces list and does not return by itself | `M4 journey 4` step 3 | partly: a baseline exists (the update at step 2), but the "does not come back" half was not mutated | met |
| J5: FR-32 429 with `Retry-After`, ranges only | `M4 journey 5` step 2 | yes (m7, m9a, m9b) | met |
| J5: a refused request does not extend the window | `M4 journey 5` step 2 | **No in the builder's version** (m8 survived: both reads are 60 right after the window starts). Yes after the fix (m8b) | met after fix (N1) |
| J5: countdown shown and goes down; page refreshes itself at zero | `M4 journey 5` steps 3 and 5 | yes (m13, m10b) | met |
| J5: admin API and health not limited | `M4 journey 5` step 4 | yes by reading (baseline: the limit is on at that moment) | met |
| J5: a new window, then 200, 200, 429 | `M4 journey 5` step 6 | yes (m10b fails earlier at step 5) | met |
| J6: counters not stored; view still on after restart | `M4 journey 6` | partly: a persisted counter would fail it, but no such mutant was built. It cannot catch a limiter that never ends a window (journey 5 does) | met |
| J7: FR-96 health 200, only `{status: ok}`, no cookie | `M4 journey 7` | yes (m11b) | met |
| J7: FR-4 other API refused without session | `M4 journey 7` step 4 | yes by reading | met |
| Journeys: every "not listed" has a baseline | all | read: J1 (not chosen vs chosen), J2 steps 2/4/5/3, J3, J4 | met |
| Journeys: the 429 is the real server's with limit 3 | `M4 journey 5` | yes | met |
| Repo-wide: `make check` | run | n/a | met |
| Repo-wide: Chromium passes twice in a row | one full run here plus the builder's two | n/a | met |
| Repo-wide: only `e2e/**` and the plan changed | `git diff --name-only origin/main...HEAD` | n/a | met |

## Plan check

- Every criterion of the task file appears in the plan, in the Harness, Journeys and Repo-wide lists. No ticked item names a test that does not exist.
- The plan says `--workers=1` was not run; it was run here and passed.
- Plan versus diff: the plan lists `createService` as a helper and the diff has it; the plan's `waitForStatus` timeout argument is in the diff and leaves the default at 30 s. The plan says journey 1's admin-link check covers Add service, Services, Settings, Sign out; the test does. No difference found.
- The plan's integration-test line ("not run") matches the diff (no Go changes).
- Two judgment calls are worth a look: `visitorRefresh` accepts the Refresh button being gone, and journey 4's "moment" is an in-page one-second timer on the running clock (so `settle` stays the only fixed wait). Both fit the task file.

## Rule checks

- Only `e2e/**` and the plan file changed; `package.json`, the lockfile and `playwright.config.ts` are not in the diff; no dependency was added; `retries: 0` unchanged.
- `waitForTimeout` appears only in `settle`. No `.locator('.…')` class selectors (tag locators `b` and `time` and the `label` filter are structural). No test writes over HTTP. Every public read uses `visitor.request`; the admin's `page.request` is used only for `GET /api/services`.
- `PUBLIC_RATE_LIMIT_PER_MINUTE` is set only by `public-rate-limit.spec.ts` (journeys 5 and 6). `appEnv()` passes only explicit values; the override is merged on restart too.
- Quoted texts match their sources: `PublicDashboard.tsx` (title, text, summary, loading, empty state, `Updated`), `PublicBanner.tsx` (`Too many requests.`, `Try again in … second(s).`), `PublicRow.tsx` (`Last checked`), `usePublicView.ts` (toasts), `problem.go` and `public_view.go` (`Public view unavailable`, `Too many requests`), `failureReason.ts` (`Returned an HTTP error`). No difference.
- Frontend-only rules (component library, design code) do not apply. No backend convention applies to a test-only diff.

## Mutation checks run

Each in the working tree, reverted with `git checkout` afterwards (the tree was clean at the end; the frontend bundle was rebuilt after the three frontend ones).

| # | Mutation | Journey that failed |
|---|---|---|
| m1 | the repository ignores `shown_on_public_view` | journey 2 (step 1) |
| m2 | drops the `paused` condition | journey 2 (step 4) |
| m3 | lists a not-yet-checked service | journey 2 (step 3) |
| m4 | orders by `name`, not `name_key` | journey 1 |
| m5 | extra field in an `api.PublicService` item | journey 1 (key-set check) |
| m6 | handler answers 200 with the view off | journey 3 |
| m7 | limiter not applied | journey 5 |
| m8 | a refused request extends the window | **survived** the builder's journey 5; fails after the fix (m8b) |
| m9a, m9b | `Retry-After` missing, `Retry-After` 0 | journey 5 (both) |
| m10b | the limiter never ends a window | journey 5, step 5 |
| m11a | `/health` gated | every test fails at app start (the harness probes `/health`), so journey 7's own assertion is not what catches it |
| m11b | `/health` returns an extra field | journey 7 |
| m12 | the page renders names as HTML | journey 1 |
| m13 | the page does not refresh at zero | journey 5, step 5 |
| m14 | the automatic update removed | journey 4, step 2 |

An earlier, cruder version of m10 (a window of 1000 times the length) failed the `Retry-After <= 60` range check instead, which is also correct but not the intended step; m10b is the one that counts. An earlier m14 did not build (unused import) and was discarded; the second attempt is the one reported.

## Other attempts to break it

- Concurrent requests: 12 parallel requests to a binary started with limit 3 (view off): exactly 3 were counted (3 `404`, 9 `429`). The boundary (request 3 allowed, 4 refused) is covered by journeys 5 and 6. `Retry-After` right after the window starts reads 60, inside the tested range.
- `--workers=1` and `--workers=4` both pass; the shell environment cannot change the limit (read from `appEnv()`, which passes only explicit values).

## Findings

### Blocking

None.

### Non-blocking

**N1. Journey 5 could not catch a window that a refused request extends (test quality). Fixed in this branch.**
The fourth and fifth `Retry-After` are read at once, when both read 60 with or without the bug, so `second <= first` passes (mutation m8 survived). I added to `public-rate-limit.spec.ts` a poll (500 ms steps, at most 10 s) that waits for `Retry-After` to fall below the first value while the visitor keeps being refused. Mutation m8b now fails it; the real server passes.
Matters when: the limiter's refusal path is edited (the task file's listed mutation "a refused request extends the window").

**N2. Journey 7 does not isolate "health requires a session" (test quality, report only).** The harness's readiness probe uses `/health`, so a gated health fails every test at start-up, not at journey 7's assertion. The failure is loud, so only the message is less clear.

**N3. Journey 6 alone cannot show that a limiter never ends a window (test quality, report only).** A restart empties memory whatever the limiter does; journey 5 step 5 covers it.

**N4. Journey 2 step 5 asserts `toContain(n)` and not the exact list (cosmetic, report only).** Step 3 leaves `pending-<s>` listed, so the list after the resume is `[n, p]` sorted; the weaker form still shows the row returned.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing. The work changes no product behaviour.
- `STACK.md`: no versions adopted (no dependency added; `@playwright/test` 1.64.1 and the others are unchanged).
- `docs/manual-checks.md`: "At each milestone" becomes due once this merges (it is milestone 4's last task). Nothing in it is out of date.
- `docs/tasks/backlog.md`: the milestone 4 table is already empty; nothing to remove. FR-99 with `TRUST_PROXY` stays a milestone 5 row.
- The task file says the fifth `Retry-After` check shows that a refused request does not extend the window; as written it cannot (N1). This is for the user to know when the task file is next read; no doc change is needed since the test now does it.

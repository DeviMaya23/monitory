# Verification report: public dashboard screen

Branch: `verify/public-dashboard-screen` (the builder's work, `feat/public-dashboard-screen` at `97ae9ee`, plus the tests this report adds).
Result: **no Blocking findings.**

`make check`: passed (backend lint 0 issues, 641 frontend tests, builds). The first run after adding tests hit a 5 s timeout in `alert-list/TargetDialog.test.tsx`, a file this task does not touch; it passes alone and on the rerun (see N4).
Integration tests: not run. The task changes `frontend/src/` only and no integration test covers frontend code. No criterion depends only on integration tests.
Live run: the built binary (`go build ./cmd/server`, temp database, `REQUIRE_HTTPS=false`, own port) served `/status` as the SPA shell (200 `text/html`) and `GET /api/public/dashboard` answered `501 not_implemented`, as the task says. I did not drive the page in a browser, so the screen was verified through the component tests (real hook, mocked wrapper) and by reading the CSS, not by eye. The server was stopped afterwards.

## Acceptance criteria

"Real?" = would the named test fail if the behavior were removed. Mutation numbers refer to the table further down.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | Wrapper: GET `/api/public/dashboard`, no body, returns body; 404 and 429 `Retry-After: 23` as `ApiError` (FR-29, FR-32) | `lib/api/publicDashboard.test.ts` (3 tests) | Yes: asserts path, method, absent body, `status`/`code`/`retryAfter` | Met |
| 2 | `formatTime` and its test moved unchanged; old files gone | `lib/formatTime.test.ts`; `git diff -M` shows two 100 % renames; old path gone | Yes (a changed behavior fails the unchanged tests) | Met |
| 3 | loading+fetching; 200 `list`; `[]` `empty` (FR-28) | hook `state › is loading before the first answer…` | Yes (M8) | Met |
| 4 | First load failure (network, 500, 404 other code, 404 no body) `could-not-load`, `rateLimit` null; `refresh()` refetches, stays `could-not-load` in flight | hook `state › is could-not-load…` (4 rows) | Yes (M4, M8) | Met |
| 5 | Failed refresh keeps data, `refreshFailed`, next success clears; `lastSuccessAt` (FR-30) | hook `a failed refresh…`; added `a refresh failing twice and then succeeding…` | Yes (M11) | Met |
| 6 | Refetch at exactly `REFRESH_INTERVAL_MS` (−1 ms: none), again, after a failure, moves with the constant (FR-31) | hook `the automatic refresh (FR-31)` (2 tests) | Yes (M1) | Met |
| 7 | Server order kept | hook `keeps the rows in the order…`, component List test | Yes (M10) | Met |
| 8 | 404 `public_view_unavailable` first load and on refresh: `unavailable`, no services, no further refetch (FR-29) | hook `unavailable (FR-29)` (2 tests) | Yes (M3, M4, M9) | Met |
| 9 | 429 `Retry-After: 23`: 23, 22 after 1 s, no call at 22 s, one at 23 s, success clears, new refusal `5` restarts (FR-32) | hook `counts down from Retry-After…` | Yes (M5, M12) | Met |
| 10 | 429 over data keeps data; 429 on first load `could-not-load` with `rateLimit` | hook `keeps data under a 429…` | Yes (M11) | Met |
| 11 | 429 with no usable header (null, 0): `{ secondsLeft: null }`, no call before the interval | hook `with %s has no countdown…` (2 rows) | Yes (M5) | Met |
| 12 | Success clears `rateLimit`; no later call from the old countdown; unmount makes no call | hook `makes no call from an old countdown…`, `does not call after a manual success…` | Yes (M7) | Met |
| 13 | Interval held during a countdown (3600; 23 then resume a full interval later) | hook `holds the automatic update back…` | Yes (M2) | Met |
| 14 | 429 remembered while the refetch at zero / manual Retry is in flight; bodyless and other-code 429 take the same path | hook `remembers %s while the refetch at zero…` (3 rows), `remembers a 429 with no usable header…` | Yes (M9) | Met |
| 15 | Every state has `h1` | Loading, List, Empty, Unavailable tests and the No-admin-chrome table (loading, list, empty, unavailable, could-not-load) | Yes | Met |
| 16 | Loading: 4 hidden skeleton rows, status text, disabled busy Refresh with spinner and `Refreshing…`, meta, foot line, no summary | `PublicDashboard.test › Loading` | Yes | Met |
| 17 | List: rows, order, status words, label, `time` `datetime`/text, `ul` named, three summary texts, meta, foot (FR-28, FR-63, FR-94) | `List › shows one row per service…`, `reads "%s" in the summary` | Yes (M14, M18) | Met |
| 18 | Constant mocked: 2 min, 90 000 ms, 80 000 ms; same count in `Refreshes every N min` | `List › with the interval at %d ms…` | Yes (M22) | Met |
| 19 | Only name, status, last check rendered; no link, button or heading in a row (FR-40, FR-63) | `List › renders nothing but…` | Yes (M19) | Met |
| 20 | `<b>x</b>` as text; 100-char name in full (NFR-7) | `List › renders names as text…` | Yes (M17) | Met |
| 21 | Empty block, refresh block, foot line; no summary, no rows (FR-28) | `Empty` | Yes | Met |
| 22 | Unavailable: message only, no Refresh, meta, summary, foot, banner, `aria-live`; no refetch after an interval (FR-29) | `Unavailable › shows only the message…` | Yes (M15, M16, M3) | Met |
| 23 | Unavailable replaces a list (FR-29) | `Unavailable › replaces a list…` | Yes (M4) | Met |
| 24 | Refresh click: one call, disabled+busy+`Refreshing…`, rows kept, enabled after (FR-30) | `Refresh and failures › Refresh requests once…` | Yes | Met |
| 25 | Failed refresh banner, `Showing status from`, `Retry` in the live region, rows and summary kept, Retry disabled in flight, banner removed on success | `a failed refresh shows the banner…` | Yes (M21) | Met |
| 26 | Could not load (first load 500): banner, no second line, nothing else, meta, Retry then list | `a failed first load shows the banner…` | Yes (M8) | Met |
| 27 | 429 over rows: texts, `span.tabular`, Refresh disabled without `aria-busy`, rows/summary/foot stay, 22 after 1 s, one request at 23 s, banner gone, Refresh enabled (FR-32) | `Too many requests › over rows…` | Yes (M13, M2, M12) | Met |
| 28 | `Retry-After: 1` reads `1 second` | `says "1 second"…` | Yes (M20) | Met |
| 29 | 429 over nothing: banner alone, meta, Refresh disabled, `0 seconds` while refetching, clears on success | `over nothing…` | Yes (M23, M13) | Met |
| 30 | 429 without usable header: `in a moment`, Refresh enabled, no call at 23 s or 60 s, click requests once | `without a usable header…` | Yes (M5) | Met |
| 31 | No admin chrome in any state | `No admin chrome` (5 states) and App route tests | Partly: asserts no Sign out button and no link at all; "no top bar" is only asserted through those (App test also checks no brand link). A top bar with neither would pass | Met |
| 32 | Route: `/status` without sign-in, never `getSession`; signed in and signed out show the same page; a 401 shows could-not-load, no navigation | `App.test › /status …` (4 tests) | Yes for routing (placing the route inside `SessionProvider` calls `getSession` and fails). The 401 test mocks the wrapper, so it does not exercise `apiRequest`'s 401 handler (N5) | Met |
| 33 | Admin routes unchanged | the rest of `App.test.tsx`, unchanged | Yes | Met |
| 34 | `make check` passes | run twice, both passing (one flake, N4) | n/a | Met |
| 35 | Only allowed paths changed; `package.json`, lockfile, `alert-list/**`, `service-form/**` untouched | `git diff main...HEAD --name-only`: only `frontend/src/**` and the plan file; no package file | n/a | Met |

Requirement IDs: FR-28, FR-29, FR-30, FR-31, FR-32 (page side), FR-40, FR-63, FR-94, FR-113 (page shows exactly the server's rows, no filtering in the code), NFR-7: all met on the rows above.

## Plan check

Read after the criteria were judged.

- Every acceptance criterion has a plan item; none is missing. The plan has one extra line (repo-wide integration tests: not applicable), which is correct.
- Every ticked item has a test that exists and checks the behavior (verified by mutation, below). One exception: the plan ticks "429 with Retry-After 23 … single call at 23 s", but nothing proved the call is made **once**, only that it is made. See M6 and N1.
- The plan names the flake in `TargetDialog.test.tsx`; I saw it too.
- Plan versus diff: the judgment calls listed match the code (one `useQuery`, per-answer 1 s timer, `.pub .tabular` rule, skeleton rows in `ul.pub-list`, index keys, tests through the real hook). One thing the plan does not mention: the page shows the refresh-failed and 429 banners over **Empty** (the task asks for it), but no test covers it; I added one (`a failed refresh over the empty state…`).
- The plan says `request.ts` is mocked in `App.test.tsx`; it is not (the wrapper `./lib/api/publicDashboard` is). Wording only.

## Rule checks

- **Dependencies:** `package.json` and `package-lock.json` unchanged. Nothing new imported beyond `@tanstack/react-query`, `react-router`, `lucide-react` (installed: 5.107.1, 8.5.1, 1.73.0). All eight Lucide icons exist and are used under the task's names.
- **Layers (ARCHITECTURE.md):** the component imports nothing from `app-shell/` or another feature; the page imports only this feature; `formatTime` comes from `lib/`; types come from `schema.d.ts` through the wrapper; `/status` is outside the `SessionProvider` group in `App.tsx` and the only `App.tsx` change is the import and that line.
- **Promotion:** `git diff -M` shows two 100 % renames; the only edits in `features/service-list/` are the three import lines.
- **CONVENTIONS:** no `dangerouslySetInnerHTML`; every name is a React text child; the row reads only `name`, `status`, `last_checked_at`; no lint-suppression comments; no hand-written dialog, switch, toast or select (none needed); icons Lucide only; status shown by icon, word and badge shape; server data stays in TanStack Query (the hook's `useState` holds only the remembered 429/404 answer and a clock, as the task requires, not server rows); no limit is a literal (interval comes from `REFRESH_INTERVAL_MS`).
- **Hook, by reading (task's Verifier checks):** interval is the constant, `false` only when unavailable or a countdown above 0; state derived with `isFetched`; timer cleared on unmount and when the answer changes (effect cleanup), and cleared at zero so it cannot fire twice (M6, now tested); `refetch` is stable so the effect does not re-run at zero.
- **CSS, by reading:** `.pub*` rules match `docs/design/public.css` value for value; `.refresh-meta` is scoped as `.pub-refresh .refresh-meta` and sets `width: auto; order: 0` in the 640 px block (specificity 0,2,0 beats the dashboard's `.refresh-meta`, 0,1,0); the dashboard's global rule is not redefined; the name has `overflow-wrap: anywhere`; the row moves status and time under the name at 640 px; the skeleton's inline sizes became classes and the pill uses `--radius-pill`; remaining literal pixels (760, 136, 80, 20, 72, 32, 640) are board values with no token. Stylelint passes in `make check`. No design markup or component code was copied.
- **Keyboard, by reading the DOM:** order is Refresh (header), then the banner's Retry; disabled buttons use `disabled`; buttons use the shared `.btn` (shared focus outline). Not asserted by a test (N3).
- **Contract:** every field read exists on `PublicService`; the wrapper adds no header or parameter; only the two named answers get special handling (any 429 takes the 429 path, as the task says).

## Mutation checks run

Each: break the source, run `src/features/public-dashboard` and `App.test.tsx`, confirm failure, revert (`git checkout`). Script kept outside the repo.

| # | Mutation | Result |
|---|---|---|
| M1 | `refetchInterval` literal 300000 instead of the constant | Killed (`moves with the constant`) |
| M2 | interval not held during a countdown | Killed (`holds the automatic update back…`) |
| M3 | interval not held when unavailable | Killed (both `unavailable` hook tests, component test) |
| M4 | any 404 treated as unavailable | Killed (`404 with another code`, `without a problem body`) |
| M5 | `Retry-After` of 0 counted as usable | Killed |
| M6 | no `clearInterval` at zero (refetch every second while in flight) | **Survived** in the builder's tests. Killed after I added `fires the refetch at zero once per answer…` (it needs rows on screen: without data TanStack de-duplicates the repeat call) |
| M7 | timer not cleared on unmount / state change | Killed |
| M8 | `isFetched` dropped (first-load failure shows loading) | Killed |
| M9 | 429 not remembered | Killed |
| M10 | rows sorted in the hook | Killed |
| M11 | `refreshFailed` ignores a 429 | Killed |
| M12 | countdown never ticks | Killed |
| M13 | Refresh not disabled in a countdown | Killed |
| M14 | summary text ignores the singular | Killed |
| M15 | foot line shown in Unavailable | Killed |
| M16 | `aria-live` region in Unavailable | Killed |
| M17 | name rendered as HTML (NFR-7) | Killed |
| M18 | `datetime` reformatted instead of the received string | Killed |
| M19 | an extra field (`url`) rendered in the row (FR-63) | Killed |
| M20 | `1 second` plural | Killed |
| M21 | banner Retry not disabled in flight | Killed |
| M22 | meta minutes floored instead of rounded | Killed |
| M23 | 429 banner hidden when there are no rows | Killed |

## Cases tried beyond the task file

Added as tests in the existing test files (all pass):

- 50 services with 100-character names, in order, summary `25 of 50 services unhealthy` (`PublicDashboard.test.tsx`).
- `{ services: [] }` after a list: Empty block, no rows, no summary.
- A failed refresh over the Empty state: banner above the Empty block, foot line kept.
- A refresh failing twice then succeeding (hook).
- The refetch at zero fires once while it is still in flight (hook).

Already covered by the builder and confirmed by mutation: `Retry-After` 1, 23, 3600; a 429 followed by a manual success; two 429s in a row; 404 with another code. A non-numeric `Retry-After` is parsed to `null` by `request.ts` (its own test, `reads Retry-After %j`), and the page then takes the no-usable-header path (criterion 30).

Not exercised: a real browser at 360 px width (NFR-3); that is `docs/manual-checks.md`.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Test quality (fixed here).** The task asks that the refetch at zero cannot fire twice for one answer; no builder test caught removing the `clearInterval` (M6). Added `fires the refetch at zero once per answer…` to `usePublicDashboard.test.tsx`; it fails under M6.
- **N2. Latent bug, report only.** The countdown uses `setInterval`; browsers throttle it in a hidden tab (about once a minute), so a hidden tab that hit a 429 refreshes later than zero. The shown time is computed from timestamps, so it is correct when the tab returns. No concrete trigger beyond a visitor with the page in a background tab.
- **N3. Test quality, report only.** Tab order (Refresh, then Retry) and the focus outline are not asserted by any test. Matters when: someone reorders the header and banner markup.
- **N4. Test quality.** `alert-list/TargetDialog.test.tsx > adds a header row…` times out at 5 s when the machine is loaded (it failed once in one of my three `make check` runs and once in the builder's); passes alone. Outside this task's paths. Matters when: CI runs on a busy runner and a merge is blocked by a red check; give that test a longer timeout or lighten it in its own task.
- **N5. Test quality, report only.** The `/status` 401 test mocks `getPublicDashboard`, so it shows the page's reaction but not that the real `apiRequest` calls no 401 handler there. Today no handler is set on `/status`; `SessionProvider` is not mounted.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing; the page matches both.
- `STACK.md`: adopts no new dependency. Installed versions the page relies on: `@tanstack/react-query` 5.107.1, `react-router` 8.5.1, `lucide-react` 1.73.0 (`STACK.md` names them without pins; the user records adopted versions if wanted).
- `docs/design/README.md`, "Additions that are built": does not yet list the states this task added beyond the board (first load failing with `Couldn’t load service status.` and Retry; the 429 banner over nothing and `Try again in a moment.`; `Try again in 1 second.`; `Refreshes every {N} min`; `1 of 1 service unhealthy`; `Try again in 0 seconds.`; the automatic update held during a countdown). The task file says the user adds these.
- `docs/tasks/backlog.md`, milestone 4 row for `getPublicDashboard` ("Left out of `public-dashboard-screen`, which builds the page"): the page is now built; the backend half is what is left.
- `docs/manual-checks.md`, "Open the public dashboard" (browsers) and the narrow-screen and keyboard sections: due only once the backend `getPublicDashboard` merges, since the real server still answers 501.

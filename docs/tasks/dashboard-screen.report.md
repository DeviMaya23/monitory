# Verification report: dashboard screen

Branch: `verify/dashboard-screen` (the session's branch, reset onto `feat/dashboard-screen` at `4de66ad`). Verifier changes: two rows in `useServiceList.test.tsx`, this report. No source changed.

**Verdict: 1 Blocking finding. No pull request opened.**

- `make check`: run, passed (exit 0; 157 frontend tests, 0 lint issues). A fresh worktree needed `npm ci` first.
- Integration tests: not run. The task touches no Go code and no code that has integration tests (`adaptor/mailer` is untouched), and the task file says none apply. No criterion depends on them.
- Built app: not run. `listServices` is not on the server yet (the real server answers 501), so the real app only shows "Could not load". Everything below was tried in Vitest/jsdom, and the CSS was checked by reading.
- Note on order: I read the plan a little before the criteria table was finished. The table was built from the tests and source, not from the plan.

## Criteria

"Real?" = the named test would fail if the behavior were removed. **Yes (mutation)** means I broke the code and watched it fail. **Yes (read)** means the assertion obviously depends on the behavior.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | Seven codes, 503, json field, two null cases, unknown (FR-61) | `failureReason.test.ts` (table + 3 tests) | Yes (M1) | Met |
| 2 | Times: today / this year / other year, midnight edges, other zone, later day, later year, invalid string, `datetime` is the ISO string (FR-94) | `formatTime.test.ts`; `datetime` in `ServiceList.test.tsx` "shows Never and —" | Yes (M9). Tests only run `en-GB`, so they cannot see the locale bug (finding B1) | Partly met: fails for locales with non-Latin digits (B1) |
| 3 | `loading` → `list` / `empty` (FR-9) | `useServiceList.test.tsx` "state" | Yes (read) | Met |
| 4 | First load fails → `could-not-load`; `refresh()` recovers; stays `could-not-load` in flight | `useServiceList.test.tsx` it.each (network, 500) | Yes (M11, M17) | Met |
| 5 | Failed refresh keeps data, sets flag, next success clears it, last-success time (FR-95) | `useServiceList.test.tsx` "a failed refresh" | Yes (read; M17 also trips it) | Met |
| 6 | Refetch at exactly `REFRESH_INTERVAL_MS`, again after, after a failure, follows a mocked constant (FR-95) | `useServiceList.test.tsx` "the automatic refresh" | Yes (M4, M4b) | Met |
| 7 | Server order kept | `useServiceList.test.tsx` "keeps the rows in the order" | Yes (read: the data is never sorted, so any added sort would reorder `b, C, a`) | Met |
| 8 | Loading: 5 skeleton rows, busy list, status, Refresh disabled + busy + spinner, heading line, meta | `ServiceList.test.tsx` "Loading" | Yes (read) | Met |
| 9 | Could not load: heading line, meta, banner, no rows, no empty block | `ServiceList.test.tsx` "Could not load" ×2 | Yes (M11) | Met |
| 10 | List rows, badge words, chips, order (FR-9, FR-62) | `ServiceList.test.tsx` "shows one row per service…" | Yes (read) | Met |
| 11 | Paused: `Paused`, no reason, Public flag text (FR-77, FR-112) | `ServiceList.test.tsx` "a paused service…" | Yes (M2, M3) | Met |
| 12 | Failure reason shown / not shown / null reason (FR-61, FR-62) | `ServiceList.test.tsx` "an unhealthy unpaused…" | Yes (M2 trips this on the paused row; the healthy and null-reason cases are only read-checked) | Met |
| 13 | Delivery notice, paused or not, plain text (FR-86) | `ServiceList.test.tsx` "shows Alert delivery failed…" | Yes (M5) | Met |
| 14 | `Never`, `—`, `time` with `datetime` and formatted text (FR-62, FR-94) | `ServiceList.test.tsx` "shows Never and —…" | Partly: expected text is computed with the same `formatTime`, so it proves wiring, not wording. Wording is pinned in `formatTime.test.ts` | Met |
| 15 | Alerts / Public flags, hidden text, absent defaults (FR-62) | `ServiceList.test.tsx` "shows the Alerts and Public flags…" | Yes (M12) | Met |
| 16 | `—` has `aria-label="None"` | same file, `getByLabelText('None')` | Yes (read) | Met |
| 17 | Minute count rounds to nearest (90,000 → 2, 80,000 → 1) | `ServiceList.test.tsx` "with the interval at…" | Yes (M13) | Met |
| 18 | Heading line `1 service` / `7 services` / `No services`; meta `Updated` + `auto every 5 min`; 2 min mocked | `ServiceList.test.tsx` it.each, meta tests, Empty | Yes (read) | Met |
| 19 | Empty: exact title and text, two links to `/services/new` | `ServiceList.test.tsx` "Empty" | Yes (read) | Met |
| 20 | Refresh: one call, disabled + spinner + busy, rows kept, enabled again (FR-95) | `ServiceList.test.tsx` "Refresh calls listServices once…" | Yes (read) | Met |
| 21 | Failed refresh banner, last-success time, rows kept, Retry disabled in flight, cleared on success; could-not-load banner has no second line | `ServiceList.test.tsx` "a failed refresh…", "Could not load" | Yes (read; M11) | Met |
| 22 | 401 on refresh → sign-in form with notice, `['services']` gone (FR-4) | `App.test.tsx` "a 401 on a refresh…" | Yes (M14) | Met |
| 23 | No row actions, switch, `Open` link, row links; only the Add service links | `ServiceList.test.tsx` "has no row buttons…" | Yes (read) | Met |
| 24 | `/` shows the dashboard; other routes keep placeholders | `App.test.tsx` "signed in: / shows the dashboard", it.each without `/`; the signed-out gate table still has `/` | Yes (read) | Met |
| 25 | Markup in name and failure field renders as text (NFR-7) | `ServiceList.test.tsx` "renders names and failure fields as text" | Yes (M10) | Met |
| 26 | Success toast gone at 5,000 ms and not 4,999; error toast announced via `role="alert"` and stays | `Toast.test.tsx` | Yes (M7, M8) | Met |
| 27 | Dismiss removes; action shows, called once, removes the toast | `Toast.test.tsx` "dismiss and action" | Yes (read) for Dismiss and the action's `onClick`. Not mutated | Met |
| 28 | 403 `csrf_failed` toast + `Reload` calls `location.reload` once; stays signed in; button enabled (NFR-8) | `SessionProvider.test.tsx`, `App.test.tsx` | Yes (M6) | Met |
| 29 | 500 / network error toast, no action | `SessionProvider.test.tsx`, `App.test.tsx` | Yes (read) | Met |
| 30 | 401 and 204 show no toast and end on the form (FR-3) | `SessionProvider.test.tsx` (204 and 401 both assert no toast); `App.test.tsx` 401 | Yes (read) | Met |
| 31 | `make check` passes | run by me | n/a | Met |
| 32 | Nothing outside `frontend/src/**` and the plan changed; `package.json` and the lockfile unchanged | `git diff --stat main...HEAD` | n/a | Met |

## Plan check

Compared `docs/tasks/dashboard-screen.plan.md` against the task file and the diff.

- **Criteria missing from the plan:** none. Every criterion has a ticked item.
- **Ticked items without a real test:** none. Every ticked item has a test that checks the behavior.
- **Plan and diff differences:**
  - The App-level sign-out test is named "a 401 unauthenticated and a 204…" but only drives the 401. The 204 no-toast assertion is in `SessionProvider.test.tsx`, so the plan's "401 and 204" item is covered, just not where the test name says. Cosmetic.
  - The plan is silent on the Retry banner and the locale handling of `formatTime`. B1 lives in that gap.
- **Judgment calls:** the plan's judgment calls match the diff. The toast closes after the action runs, the skeleton markup follows the board, and the tests use the viewer's default locale for row times.

## Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged. No new imports beyond STACK.md. `@base-ui/react` (1.9.0) is already installed. Only `Toast.tsx`, `Dialog.tsx` and `Switch.tsx` import Base UI, and only `Toast.tsx` imports its toast.
- **CONVENTIONS.md (layers and data):** `ServiceList.tsx` imports nothing from `app-shell/` or another feature. `lib/api/services.ts` is a thin wrapper over generated types. Types come from `schema.d.ts`. Nothing outside `frontend/src/**` changed. No backend, transaction or data-scoping rules apply.
- **Verifier checks in the task file:**
  - Hook reads: the interval is `REFRESH_INTERVAL_MS`. Data is not copied into component state. State derives from `isFetched`.
  - `dangerouslySetInnerHTML`: none in source.
  - Colours: no literal colours in `service-list.css`.
  - Pixel values: every px value (96, 20, 70, 80, 40, 10) matches the board's skeleton styles. The rest are 1px borders and the board's grid and 640px values.
  - Name wrapping: `overflow-wrap: anywhere` and `white-space: normal`, no ellipsis.
  - 640px layout: the card layout has the labelled check/change and no `actions` area.
  - Column header words: correct.
  - `.svc--paused` background: present.
  - Dead controls: rows contain no button or link. The only links are the two `Add service`.
  - Tab order: Add service, Refresh, Retry, all native, using `disabled`.
  - Icons: Lucide only.
  - Contract: every field read exists on `Service`. The fixtures are typed with the generated types.
- **Hand-written widgets and design copying:** no hand-written toast, dialog or switch. The CSS copies board values and rules only, with no board markup or component code. `!important` and the link hover from the board's delivery notice were correctly left out.

## Mutation checks run

Each was broken in source, the named test run, then reverted with `git checkout`.

| # | Break | Result |
|---|---|---|
| M1 | `Timed out` wording changed | failureReason test failed |
| M2 | Reason shown for paused service (FR-77) | paused-row test failed |
| M3 | Badge ignores `paused` (FR-112) | paused-row test failed |
| M4 / M4b | Interval `+1 ms` / hard-coded 300000 | both interval tests / "moves with the constant" failed |
| M5 | Delivery notice hidden when paused (FR-86) | delivery test failed |
| M6 | `csrf_failed` handled as generic (NFR-8) | both csrf tests failed |
| M7 | Error toast times out | error-toast test failed |
| M8 | Success toast 5,001 ms | exact-5,000 test failed |
| M9 | `formatTime` ignores the day | 3 formatTime tests failed |
| M10 | Name rendered as HTML (NFR-7) | NFR-7 test failed |
| M11 | `could-not-load` derived from `status` | 3 tests failed |
| M12 | `alerts_enabled` default off | flags test failed |
| M13 | `Math.floor` for minutes | 90,000 ms test failed |
| M14 | Session end keeps other queries (FR-4) | 3 tests failed |
| M15 | `refetchOnWindowFocus: true` | **survived** the builder's tests; caught after my new test |
| M16 | `refetchIntervalInBackground: false` | **survived**; caught after my new test |
| M17 | `retry: 3` | 8 tests failed |

## Findings

### Blocking

**B1. `formatTime` shows the wrong format for locales with non-Latin digits (FR-94).**

- *Where:* `frontend/src/features/service-list/lib/formatTime.ts`, `dayIn()`. It reads the year, month and day parts with `Number(part.value)`. With Arabic-Indic or Persian digits that is `NaN`, so `then.year !== today.year` is always true and every time takes the "other year" branch.
- *Reproduce:* call `formatTime('2026-11-15T14:31:52Z', new Date('2026-11-15T14:35:00Z'), 'ar-EG', 'UTC')`.
- *Expected:* the time alone (hour, minute, second), per the task's "same calendar day" rule.
- *Actual:* `١٥ نوفمبر ٢٠٢٦، ٠٢:٣١ م`, the full date with the year and no seconds. `fa-IR` gives `۲۴ آبان ۱۴۰۵، ۱۴:۳۱` for a time that is today.
- *Impact:* the viewer's default locale is the task's stated behavior, so an admin whose browser is `ar-EG` or `fa-IR` sees dates on every row, and never seconds.
- *Not covered by tests:* `formatTime.test.ts` only runs `en-GB`. The row tests compare against `formatTime` itself.
- *Fix suggestion:* compare the day parts in a numeric-digit locale (for example `en-CA` or `-u-nu-latn`), or compare `formatToParts` strings, and keep display in the viewer's locale. Then add a row to `formatTime.test.ts` for `ar-EG`. I did not commit a failing test, to keep the branch green.

### Non-blocking

1. **Test quality. Focus and background refresh were unpinned.** Matters when: someone "tidies" the query options and a refetch on focus or a stalled background refresh ships. *Fixed here:* two rows added in `useServiceList.test.tsx`, both caught by M15 and M16.
2. **Test quality. Test name vs content.** `App.test.tsx` "a 401 unauthenticated and a 204 show no toast" only drives the 401. Matters when: someone trusts the name and removes the `SessionProvider` 204 assertion. Cosmetic.
3. **Test quality. Row times compared against `formatTime`.** The tests pass in any locale, which is also why they can't see B1. Matters when: the row stops calling `formatTime` correctly but still in a way the helper agrees with. Report only.
4. **Cosmetic. Skeleton rows lack the `svc__status` and `svc__flags` classes.** Only affects the skeleton's placement in the 640px card layout. Matters when: someone adds a visual regression test at 360px. Report only.

### Tried and held

- A list of 50 services with a 100-character unbroken name rendered all 50 rows, and the heading line read `50 services`. The CSS wraps the name (`overflow-wrap: anywhere`, `minmax(0, 1fr)`).
- Failure on refresh twice and then success: the banner and the 50 rows stayed through both failures, and the banner cleared on the success.
- Sign-out failing twice in a row: two toasts, the button enabled between them.
- Boundaries checked in `formatTime` (en-GB, UTC): 23:59:59 on the 14th when now is the 15th gives the same-year format; midnight gives time-only; Dec 31 vs Jan 1 gives the other-year format.

## Docs or specs that no longer match

- **`STACK.md`:** nothing new adopted; no dependency or version changed. The user may note that the Base UI toast (`@base-ui/react` 1.9.0) is now used through `components/ui/Toast.tsx`.
- **`docs/openapi.yaml`, `docs/requirements.md`:** no edits needed. The screen reads only fields that already exist on `Service`.
- **`docs/tasks/backlog.md`:** the row actions, Edit link, delivery-failed link and public switch are already listed as left out of this task (line 76). After B1 is fixed nothing else is due.
- **`docs/manual-checks.md`:** nothing becomes due. "After the first front-end slice" was a one-time check and is already ticked. "At each milestone" waits for the milestone's last task.

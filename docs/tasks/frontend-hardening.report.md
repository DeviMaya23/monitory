# Verification report: frontend hardening

Branch: `verify/frontend-hardening` (the builder's `feat/frontend-hardening` at `32b7de6`, plus two verifier tests).

Result: **no Blocking findings.** One test gap found and closed by a verifier test (finding N1).

- `make check`: run, passed (after `npm ci` in `frontend/`; the lockfile did not change). Frontend: 85 files, 1467 tests before my additions; lint, `tsc -b`, build and Go build clean.
- Integration tests: **not run: this task changes only `frontend/src/`**. `make test-integration` covers Go code under the `integration` tag (the mailer against Mailpit); none of it is touched, and no criterion depends on it.
- Built app: **not run**. The task says the verifier has no browser. The item 1 measurements are the builder's (see Rule checks) and I did not reproduce them.

## Criteria

"Real?" = would the named test fail if the behaviour were removed? Where I ran the mutation, the row says so.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | Toast viewport is a descendant of `[data-portal-host]` | `Toast.test.tsx` › placement › renders the viewport inside the portal host | Yes. Mutation M1 (portal removed) fails it | Met |
| 2 | Existing Toast tests unchanged and passing | `Toast.test.tsx` (existing rows; diff only adds a `describe`) | Yes (unchanged asserts); none use `user-event` under fake timers in the new row (it renders only) | Met |
| 3 | Measured in headless Chrome: four edges and `elementFromPoint` | none (not committed, by design); numbers in the plan | Not testable in jsdom; not reproduced by me | Partly met: numbers are reported (1120 px: 16/16; 360 px: 12/12/12; `.dialog-layer` / `.dialog` on top), unverified |
| 4 | `describedBy` sets `aria-describedby` on the radiogroup, absent without it | `RadioGroup.test.tsx` › is described by the given element…; › has no aria-describedby without the prop | Yes for the first (M2 fails it). The "without" row is the guard against always-on | Met |
| 5 | Type group has description `Changing type swaps the fields below.` on Add and Edit | `TypeField.test.tsx` › describes the radiogroup with the hint | Yes (M2 fails it). Both forms use `TypeField`, so one test through it is the allowed form | Met |
| 6 | Target dialog's radiogroup has no `aria-describedby` | `TargetDialog.test.tsx` › has a type radiogroup without a description | Partly: passes today because the prop is not passed; fails only if someone adds it. Fine as a guard | Met |
| 7 | Active observer: refetched, kept, `onSaved` once | `useSaveService.test.tsx` › refetches it, and keeps it cached… | Yes (M3 fails it) | Met |
| 8 | Failed refetch does not change the outcome | › a failed refetch changes nothing about the save | Alone: **could pass without the behaviour** (M8 survived, see N1). With my added test › does not wait for the refetch, M8 fails | Met (after N1) |
| 9 | No observer: removed | › removes it when no list is mounted | Yes (M4 fails it) | Met |
| 10 | `not-found`: active refetched, inactive removed | › not-found: refetched…; › not-found: removed… | Yes (M3, M4) | Met |
| 11 | Guard, `onScreen`, classification keep existing tests | existing rows, unchanged in the diff | Yes | Met |
| 12 | App: save finishing after leaving refreshes the dashboard (FR-95) | `App.test.tsx` › a save that finishes after the admin has gone back to the dashboard refreshes the list | Yes (M3 fails it). The mock returns the old list until the save resolves, as the task asks | Met |
| 13 | 422 with `name`, `url`, `headers[0].value`: Email drops the last two, title `1 field needs fixing…`, no `Webhook URL` or header entries | `TargetDialog.test.tsx` › Email drops the Webhook URL and header entries…; `useTargetServerErrors.test.tsx` › email drops url, headers… | Yes (M5, M6, M9 fail them) | Met (FR-74) |
| 14 | 422 with `name`, `address`: Webhook drops `address`, keeps `name` | `TargetDialog.test.tsx` › Webhook drops the address entry…; hook › webhook drops address… | Yes (M5, M6, M9) | Met |
| 15 | Only inactive-type entries: summary disappears | › removes the whole summary when only the other type's entries were left… | Yes (M5, M9) | Met |
| 16 | Focus stays on the Type radio | asserted in both dialog tests (Email and Webhook) | Yes in the sense that it is asserted; focus loss is not mutated (the dialog never moves focus) | Met |
| 17 | Editing a field still clears its own entry | existing tests, unchanged | Yes | Met |
| 18 | Back and Forward: Forward asks, Discard completes to `/services/s1/alerts`, no second question | `App.test.tsx` › Discard changes completes a Forward to the alert list… | Yes (M7 fails it, and the two Back rows) | Met |
| 19 | `make check` passes | run by me | n/a | Met |
| 20 | Nothing outside `frontend/src/` changed; `package.json` and lockfile unchanged | `git diff origin/main...HEAD --stat`: only `frontend/src/**` and the plan | n/a | Met |

Requirement IDs: NFR-4 (in part) is criteria 4–6; FR-95 is 7–12; FR-74 (in part) is 13–17.

## Plan check

I read `frontend-hardening.plan.md` only after the criteria table.

- Every criterion of the task file is in the plan. Nothing missing.
- Every ticked item has a test that exists and checks the behaviour. Two ticks are looser than the criterion text: "Existing Toast tests unchanged" is true (the diff only adds a `describe`), and the item 1 measurement is a claim I cannot check.
- Plan against diff: matches. Judgment calls in the plan are accurate: `describedBy`; `void …refetchQueries(…).catch(() => {})`; `clearType('email')` also sets the shared `headers` flag; the toast test renders no toast; brand link used to leave the form; `npm ci` run.
- One plan sentence is garbled ("the form is unchanged-to-guard only on dirty; none appeared"). The App test's form is saved at the moment of leaving, so no prompt is expected. Cosmetic.

## Rule checks (by reading the diff)

- **Dependencies:** none added. `package.json`, `package-lock.json`, `schema.d.ts`, `backend/`, `e2e/`, `docs/openapi.yaml` unchanged. `@base-ui/react` stays 1.9.0.
- **Portal:** `ToastBridge` wraps `BaseToast.Viewport` in `BaseToast.Portal container={getPortalHost()}`. No `createPortal`. `ToastProvider` is otherwise unchanged.
- **CSS:** `.portal-host` is still `position: fixed; inset: 0; z-index: 40`. `.toast-viewport` is `z-index: 5` (below the select layer at 10 and the dialog layer at 20). Position and the mobile rule (line 605) are unchanged. The comment is rewritten as the task says (holds dialogs, selects and toast; 5 < 10 < 20; why the viewport lives in the host). `portalHost.ts` comment updated. `.portal-host * { pointer-events: auto }` now also covers the viewport, which has no size when empty, so it blocks nothing.
- **`aria-describedby`:** on the Base UI `RadioGroup` element only, and only when `describedBy` is passed (React drops `undefined`). Not on a radio (asserted).
- **`useSaveService`:** the check is `query.isActive()` on the cached query found by exact key, not a flag from a component. The refetch is `void …`, not awaited, with a `.catch` guard, outside the failure path. The refresh comes before `onSaved` in both the success and the `not-found` paths. In-flight guard, `onScreen`, classification untouched. `useService.ts` line 37 still removes, as the task says.
- **Target errors:** `clearType(next)` is a function of the hook, takes `'email' | 'webhook'`, filters by path (`url`, `headers` flag via `isHeadersPath`, `address`), and keeps the errors array uncopied (it records dropped paths in the per-response `Edited`). The dialog calls it from `onValueChange` beside `clearErrors`.
- **Lint and safety:** no `eslint-disable`, no `dangerouslySetInnerHTML`, no new dependency. No hand-written replacement for a library widget; no design-board code copied; no new visible text.
- **Conventions:** server data stays in TanStack Query; no layer or data-scoping rule applies (frontend only).
- **Measurements (item 1):** present in the plan (not in a separate hand-back that I can see): 1120 px on a 1659 px page scrolled to the top: bottom 16, right 16; 360 px: bottom 12, left 12, right 12; with a dialog open, `elementFromPoint` at the toast's centre returned `.dialog-layer` (1120) and `.dialog` (360). I could not run them, so they are reported, not verified.

## Mutation checks run

Each was applied to the source, the named tests run, then reverted with `git checkout`.

| # | Mutation | Result |
|---|---|---|
| M1 | Viewport rendered outside `BaseToast.Portal` | Descendant test failed |
| M2 | `aria-describedby` dropped | `RadioGroup` and `TypeField` description tests failed |
| M3 | Always `removeQueries` | Active-observer, failed-refetch and not-found-refetch hook tests, and the App test failed |
| M4 | Never remove when inactive | Both "removed" tests, plus the existing "drops the list on success even when the form has left" failed |
| M5 | `clearType` filters the wrong way round | 7 tests failed (hook and dialog, both types) |
| M6 | `clearType` also drops `name` | 5 tests failed (the `name` assertions) |
| M7 | `Discard changes` does `blocker.reset()` instead of `proceed()` | The new Forward test and both Back rows failed |
| M8 | Refetch awaited inside the `try` | **Survived** against the builder's tests (all 9 passed). Failed once I added a test (N1) |
| M9 | Dialog does not call `clearType` | 3 dialog tests failed |
| M10 | `onSaved` before the refresh (the task's order rule) | Failed only with my added test |
| M11 | `.toast-viewport` raised above the dialog layer | Not run: no test can catch it (task says the measured `elementFromPoint` result is the evidence, which I did not reproduce) |

## Findings

### Blocking

None.

### Non-blocking

**N1. The "not awaited, before `onSaved`" rule had no test** (test quality; fixed in this branch).
The task requires "the refetch is started and not awaited" and says mutation M8 must fail the failed-refetch test. It did not: `refetchQueries` never rejects by default, so awaiting it inside the `try` still gives `saved: true` and `failure: null`. The mutation also reorders nothing the tests could see. Reproduce: in `useSaveService.ts` make `refreshList` async, `await` the refetch and `await refreshList()`; the original 9 tests pass.
I added a row to `useSaveService.test.tsx` (› does not wait for the refetch: onSaved and saved come while it is still pending, after it started): the refetch's promise stays pending, and `onSaved` must have run once with the query function already called. M8 and M10 now fail it.
Matters when: someone awaits the refetch (a slow dashboard request would then hold the form open, and `onSaved` would be skipped if the form unmounted meanwhile).

**N2. "Switching to the type already chosen changes nothing" had no test** (test quality; row added).
Base UI does not call `onValueChange` for the selected radio, so the behaviour is the library's. I added `TargetDialog.test.tsx` › choosing the type that is already chosen changes nothing, as a guard. It would fail only if the handler were wired to a click instead of the value change.
Matters when: the radio group is replaced or its change event is rewired.

**N3. Item 1 is verified only by the builder's measurement** (decision needed: report only).
The z-index order and the window placement cannot be tested in jsdom, and the end-to-end proof is planned for `m5-e2e-journeys` (a known gap in the task file). Until then the CSS (`z-index: 5` against 10 and 20) is guarded by nothing automated.
Matters when: report only. (The trigger would be a stacking change in `components.css`; `m5-e2e-journeys` is the planned guard.)

**N4. The failed-refetch criterion test cannot tell a swallowed error from one that never happened** (test quality).
It asserts `saved` and `failure` only. The `.catch(() => {})` guard is unreachable today (default `throwOnError: false`). Cosmetic and harmless.
Matters when: report only.

## Inputs I tried beyond the task file

- A `422` with only the bare `headers` path, then a switch to Email: dropped (hook test), the summary disappears.
- A `headers[3].name` entry: dropped on Email (hook test).
- An unknown path (`type`): kept after both switches.
- Email, Webhook, Email in a row: the dropped entries stay dropped; a later response starts fresh (hook test).
- Boundary: one entry left reads `1 field needs fixing…`, three read `3 fields need fixing…`; none removes the summary.
- A save finishing while the admin is on the Edit form of another service: nothing observes `servicesQueryKey` there (only `useServiceList` does), so the list is removed and the dashboard loads fresh on mount. Correct under the rule.
- A save finishing while the dashboard's own refresh is in flight: `refetchQueries` cancels and restarts it, so a pre-save response cannot overwrite the new list. Read from the library's default (`cancelRefetch`), not tested.

## Docs or specs that no longer match

- `STACK.md`: nothing to add; no dependency or version was adopted. `@base-ui/react` 1.9.0 is unchanged.
- `docs/openapi.yaml`, `docs/requirements.md`: no change needed.
- `docs/manual-checks.md`, "Keyboard (NFR-4)": the toast now sits at the end of `body`, after `#root` (a known gap in the task). The keyboard check should include reaching and dismissing a toast. No line says so today. For the user to decide.
- `docs/design/README.md`: no board changes; nothing out of date.

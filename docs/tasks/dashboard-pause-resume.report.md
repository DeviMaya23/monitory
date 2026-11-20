# Verification report: dashboard pause and resume

Verifier branch: `verify/dashboard-pause-resume` (started from `feat/dashboard-pause-resume` at `41287c4`; only tests and this report are added).

**Result: no Blocking findings.** `make check` passes. Every acceptance criterion is met, and the mutation checks all fail a named test except one (finding N1).

## Commands run

| Command | Result |
|---|---|
| `make check` | run, passed (exit 0): lint, Go tests with race detector, 47 frontend files / 804 tests, builds. Needed `npm ci` first in this fresh worktree; `package.json` and the lockfile are unchanged. |
| `make test-integration` | not run: the task changes only `frontend/**`; no backend code and no code with integration tests. No integration test exists for any criterion here, so no criterion depends on one. |
| Built app, live run | not run: the server answers `501` for `pauseService` and `resumeService` until `pause-resume-api` merges, so there is nothing real to run against. Everything below is mock-based. |

## Acceptance criteria

"Real?" = would the named test fail if the behavior were removed. "yes (M#)" means a mutation check confirmed it (see Mutation checks); "yes (read)" means I judged it by reading the assertions only.

`SL` = `features/service-list/components/ServiceList.test.tsx`, `HK` = `hooks/usePauseService.test.tsx`, `CA` = `lib/servicesCache.test.ts`, `API` = `lib/api/services.test.ts`.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | `pauseService('abc')` → `POST /api/services/abc/pause`, `resumeService('x/y')` → `/x%2Fy/resume`, no body, resolves with the answer (FR-75, NFR-8) | API: `pauseService and resumeService › pauseService sends one POST…`, `resumeService encodes the id…` | yes (read): asserts exact method, path and arguments. The `apiRequest` mock means CSRF is not exercised here; that is `apiRequest`'s own test | Met |
| 2 | Replace: same position, others untouched, load time kept, unknown id and no cache change nothing | CA: `replaceInList › puts the given service at the same position…`, `works for the first and the last row`, `keeps the time of the last real load`, `leaves the list as it is for an id that is not in it`, `creates nothing when no list is cached` | yes (M3, M4) for position and load time; yes (read) for unknown id and no cache | Met |
| 3 | Remove: takes the service out, keeps order and load time | CA: `removeFromList › takes the service out, keeps the order and the load time`, `creates nothing…` | yes (M3, M17) | Met |
| 4 | Each cancels a list request in flight first | CA: `replaceInList › cancels a list request in flight…`, `removeFromList › cancels a list request in flight first`; SL: `a refresh that arrives while a pause is in flight…` | yes (M2): all three fail without `cancelQueries` | Met |
| 5 | `toggle` picks pause or resume by `paused`; in-flight lock per id; other id not blocked; unlocks after answer | HK: `toggle › pauses an unpaused service by its id and resumes a paused one`, `while a request is in flight sends nothing…` | yes (M5, M8) | Met |
| 6 | 200 replaces the cached row and shows the right toast with the answer's name | HK: `a 200 › replaces the cached row…` (name `renamed` from the answer), `shows the resume toast after a resume` | yes (M4, M6) | Met |
| 7 | 404 removes the row + "already deleted"; 403 shows the toast with Reload that calls `window.location.reload` once; 401 no toast; 500 and network error show the action's failure toast; row unchanged after failures other than 404 | HK: `failures › a 404…`, `a 403…`, `a 401…`, `a 500/a network error…`, `unlocks the id after a failure…` | yes for 404, Reload, 401, 500 (M9, M10, M11, M13). **Partly**: a 403 with a different code is not tested (M16 survived, N1) | Met |
| 8 | Every row has `Pause {name}` / `Resume {name}`, label hidden from assistive technology (paused and TCP row too); Tab order button → Alerts → Delete (FR-75, NFR-4) | SL: `names every row's button by its action and service…` (uses `user-event` Tab); `has a Pause or Resume and a Delete button per row…` | yes (M12, M15) | Met |
| 9 | Pause: one request with the id, no dialog; `aria-disabled` while pending, second click and Enter do nothing, other row works; on 200 shows Paused, no reason, the flag, the answer's times, `Resume Billing`, toast, focus (FR-75, FR-77, FR-78) | SL: `a pause sends one request…`, `the row keeps its state until the server answers…` | yes (M1, M5, M7, M14) | Met |
| 10 | Resume: `resumeService` sent, stored status and reason from the answer, `Pause {name}` again, toast, focus (FR-79) | SL: `a resume sends resumeService…` | yes (M5, M6, M14) | Met |
| 11 | Name with markup shows as text in the button name and both toasts (NFR-7) | SL: `shows a name with markup as text…` | yes (read): asserts the literal text and `document.querySelector('b')` is null. I could not mutate this (see Mutation checks) | Met |
| 12 | Failures on the dashboard: 403 (Reload, row as before, button usable again); 500 (row as before, toast per action); 404 (row gone, count down, toast; last row → Empty) | SL: `a 403 shows the toast with Reload…`, `a 500 on %s…`, `a 404 removes the row…` | yes (M8, M9, M10, M11) | Met |
| 13 | A list refresh arriving during a pause does not bring the old row back | SL: `a refresh that arrives while a pause is in flight…` | yes (M2) | Met |
| 14 | Replaced tests: "one Delete button per row" now allows Pause/Resume, still fails on Edit, switch, Open link, name link; mock gains the two functions; nothing else loosened | SL: `has a Pause or Resume and a Delete button per row…`; diff of `ServiceList.test.tsx` | yes (M15). The only removed assertions are the `/Pause/` and `/Resume/` names from the "no button" loop, as the task says. `App.test.tsx` is unchanged and does not count row buttons | Met |
| 15 | Existing delete tests still pass with the refactored `useDeleteService`, unchanged | `useDeleteService.test.tsx`, SL `Delete (FR-8, FR-72)` | yes (M2, M3, M17 fail them). The diff of `useDeleteService.ts` only swaps in the shared function | Met |
| 16 | `make check` passes | run | n/a | Met |
| 17 | Nothing outside allowed paths changed; `package.json` and the lockfile unchanged | `git diff 77da83f..HEAD --stat`: `frontend/src/features/service-list/**`, `pages/DashboardPage.tsx`, `lib/api/services{,.test}.ts`, the plan file. No `package*.json`, `schema.d.ts`, `styles/`, `components/ui/`, `backend/`, docs other than the plan | n/a | Met |

Requirement IDs: FR-75, FR-77, FR-78, FR-79 are covered by rows 9–10 (the real hooks through the dashboard composition); FR-76 (screen half) by the pause toast in rows 6 and 9; NFR-4 by row 8 and row 9's focus assertions; NFR-7 by row 11; NFR-8 (screen half) by row 1 (POST through `apiRequest`) and the 403 case in rows 7 and 12.

## Plan check (`dashboard-pause-resume.plan.md`, read after the table above)

- Every acceptance criterion of the task file has a ticked item in the plan. None missing.
- Every ticked item names a test that exists, and I confirmed each by mutation or by reading it.
- The plan's claim that the refresh-while-pending test needed a 50 ms real tick to be meaningful is true: with `cancelQueries` removed (M2) that test fails.
- The plan lists 5 mutation checks; the task file lists 14. I ran the full list (below).
- Plan and diff agree: the shared `changeList` helper, the `Set` plus ref in the hook, and the extra `if (!toggling)` guard in `ServiceRow` are all in the diff as the plan says. One small difference: the plan does not mention that `services.test.ts` now imports from `../../test/fixtures` on a second line (see N3).
- Plan says Prettier warns on 22 existing files and `make check` does not run Prettier; true, left alone.

## Rule checks (by reading the diff)

- **Dependencies:** none added or changed; `package.json` and lockfile untouched; no version adopted.
- **Row changes only from the server's answer:** `usePauseService.ts` writes the cache only in `onSuccess` and the 404 branch of `onError`. M1 (an optimistic write) fails 10 tests.
- **Cache change:** `changeList` cancels first, reads `dataUpdatedAt`, and sets with `updatedAt`. `useDeleteService` calls the shared `removeFromList` and kept its toasts.
- **Status and code, never message text:** `toOutcome` checks `status` and `code` only.
- **The lock is `aria-disabled`, not `disabled`:** yes (M7). One `<button>` element serves both states, with `aria-label` and the visible label chosen by `service.paused`; the click handler returns early while `toggling`.
- **Name as text:** the name appears only as JSX text and in `aria-label`; no `dangerouslySetInnerHTML` in the diff (CONVENTIONS rule 8).
- **Imports:** no import from `features/service-form`, `alert-list` or `sign-in`; icons `Pause` and `Play` from Lucide; no Base UI import outside `components/ui`; no hand-written replacement for a library component (the toast is the existing one).
- **Strings defined once:** the delete flow and the pause flow both spell `That service was already deleted.` and the Reload message. Each is a literal in its own hook. Same wording, so no visible drift today (N2).
- **CSS:** no CSS changed; no literal colour or pixel value in the new JSX.
- **Hooks (CONVENTIONS "Component and hook granularity"):** one hook for the concern, a colocated test written with it, a semantic mutator (`toggle`), exported flow type. Server data stays in TanStack Query; the in-flight id set is local UI state.
- **No design code copied:** no board markup in the diff; the texts match the board.
- **Contract:** both calls are `POST` on the contract's paths; handled statuses are those the contract lists; the 200 body is typed as `Service`.
- **Keyboard:** a real `button`, so Enter and Space work (both exercised: Enter in row 9, Space in the added test); Tab order is button, Alerts, Delete (row 8); focus is kept because the element is not remounted (M14).

## Mutation checks run

Each change was made in the source, the five affected test files were run, then the file was reverted with `git checkout`. Working tree was clean afterwards. "Failed" lists examples of the tests that caught it.

| # | Break | Result |
|---|---|---|
| M1 | Replace the row before the answer (optimistic write) | caught: 10 tests (`a 403 shows the toast with Reload, keeps the row…`, `a 500…`, `a 401 shows no toast and keeps the row`, …) |
| M2 | Skip the list-request cancellation | caught: 4 tests (`a refresh that arrives while a pause is in flight…`, both cache cancel tests, `useDeleteService` `cancels a list request that started before the delete…`) |
| M3 | Drop `dataUpdatedAt` | caught: 7 tests (`keeps the time of the last real load`, delete tests, `a 200 › replaces the cached row…`) |
| M4 | Replace the row at the end of the list | caught: 6 tests (`puts the given service at the same position…`, `the row keeps its state until the server answers…`) |
| M5 | Swap `pauseService` and `resumeService` | caught: 15 tests |
| M6 | Pause toast after a resume | caught: 5 tests |
| M7 | Lock is `disabled` instead of `aria-disabled` | caught: 3 dashboard tests (focus is lost) |
| M8 | Lock stays on after a failure | caught: 9 tests |
| M9 | Remove the row on a 500 | caught: 4 tests |
| M10 | Keep the row on a 404 | caught: 2 hook and dashboard tests |
| M11 | Drop the Reload action | caught: 2 tests |
| M12 | Button name without the service name | caught: 11 tests |
| M13 | A 401 shows a toast | caught: `a 401 shows no toast and keeps the row` |
| M14 | Remount the button on state change (focus lost) | caught: 2 dashboard tests |
| M15 | Move the button after Delete in the Tab order | caught: 2 dashboard tests |
| M16 | Treat any 403 as `csrf_failed` | **not caught** (92/92 passed) — N1 |
| M17 | `useDeleteService` stops removing on 204 | caught: 8 tests |

Not run: "show the name as HTML". The names reach the DOM through JSX text and `aria-label` (an attribute cannot carry HTML), and the toast message is rendered by `components/ui/`, which this task may not change; mutating it would test the toast component, not this task. Row 11's assertions (`document.querySelector('b')` is null, literal `<b>x</b>` text found) are what guards it.

## Cases tried beyond the task file

Added as subtests in `ServiceList.test.tsx` (describe `Pause and Resume`); all pass against the unchanged source:

- Two rows paused at the same time and answered in the reverse order: both end Paused with their own toast, order unchanged.
- Space on an idle button sends the pause; Space and Enter while pending send nothing.
- A name of exactly 100 characters containing curly and straight quotes is whole in the button name and the toast.
- A 401 on the dashboard: no toast, row unchanged, button unlocked.
- A network error on a resume shows the resume failure toast and keeps the row.

Already covered by the builder's tests, so not repeated: first, middle and last rows (cache test and dashboard), a pause answered after a refresh, a 404 on the only row, a double click while pending.

Cannot be proved by the verifier: the look at 360 px (label shown beside the icon), the look of an `aria-disabled` button while pending (no style is drawn for it), and the behavior against a real server.

## Findings

### Blocking

None.

### Non-blocking

**N1. A 403 with a code other than `csrf_failed` is not tested as a generic failure** — test quality.
M16 (treat any 403 as `csrf_failed`) passes all 92 tests. The contract lists only `403 csrf_failed` for these operations, so the code is correct today.
Matters when: the server adds another 403 code to pause or resume (for example a role or permission code), which would then be shown as "request wasn't accepted, Reload". A row in `usePauseService.test.tsx` `it.each` would pin it.

**N2. The delete flow and the pause flow each spell the 404 and 403 toasts** — latent bug.
`useDeleteService.ts` and `usePauseService.ts` both hold the text `That service was already deleted.` and `The request wasn’t accepted. Reload and try again.` The task asks for a shared cache module only, so this is within the task.
Matters when: someone rewords one toast and not the other.

**N3. Duplicate import line in `services.test.ts`** — cosmetic.
`makeService` is imported from `../../test/fixtures` on its own line next to the existing `problem` import. Lint passes.
Matters when: report only.

**N4. The `inFlight` ref guard in the hook and the `toggling` guard in `ServiceRow` overlap** — report only.
Each is covered (the hook test fails without the ref guard), and React flushes discrete events between clicks, so the ref covers a case the browser cannot produce today. No trigger.

**N5. No visible sign of the lock while a request is in flight** — UX.
The task lists this as a known gap; the board draws none.
Matters when: the real server is slow enough that an admin clicks and sees nothing for seconds (the manual check against the real backend).

## Docs or specs that no longer match

- **`STACK.md`:** nothing to record; no dependency was added and no version adopted.
- **`docs/openapi.yaml`, `docs/requirements.md`:** no change needed; the screen follows both.
- **`docs/tasks/backlog.md` line 52:** says the failed-action toasts for row actions "come with ... `dashboard-pause-resume`". They are now built here (403, 404, generic failure), so that sentence can be dropped when this merges. The line about `SERVICES_KEY` duplicating `servicesQueryKey` still holds.
- **`docs/manual-checks.md`:** the "Pause and resume it." line (under "Before release", Browsers) is still not runnable until `pause-resume-api` merges. No wording is out of date.

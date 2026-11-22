# Verifier report: data router and the unsaved-changes prompt

Branch: `verify/leave-prompt-data-router` (the session's branch, reset to the builder's tip `7fada3e` of `feat/leave-prompt-data-router`, plus the two test rows and this report). Task file: `docs/tasks/leave-prompt-data-router.md`.

Verdict: **no Blocking findings.** Every criterion is met. `make check` passes. 11 of 11 mutations failed at least one named test.

Process note: I opened the plan in the same step as the diff, before I had mapped criteria to tests. The criteria table below was built from the task file and the test names only, and the code is judged against the task file.

## 1. `make check`

Passed (exit 0): backend lint (`0 issues`), frontend lint, vitest `60 files, 1145 tests passed`, build. A fresh checkout needed `npm ci` in `frontend/` first. After my two added tests the two touched files pass, and lint and `tsc -b` are clean on them.

## 2. Acceptance criteria

"Real?" = the named test fails if the behavior is removed. "Mutation" refers to section 5.

| # | Criterion | Test (file > name) | Real? | Status |
|---|---|---|---|---|
| G1 | Nothing registered: `confirmLeave` runs `proceed` once, at once | `hooks/useLeaveGate.test.tsx` > confirmLeave > runs proceed once, at once, when nothing is registered | Yes. A gate that never ran `proceed` would fail it | Met |
| G2 | `ask` false: `proceed` once and `ask` got it. `ask` true: `proceed` not run | same file > "…nothing to ask, passing it the proceed" and "leaves proceed to the registered side when the ask takes over" | Yes | Met |
| G3 | After unmount `proceed` runs at once. After re-render the new `ask` is called | same file > "runs proceed at once after the registering component unmounts", "calls the latest ask after a re-render" | Yes. Mutation M7 fails the first | Met |
| U1 | Unchanged arrives. Changed is blocked with `dialogOpen`. Keep closes and the next attempt asks again. Discard arrives | `useLeaveGuard.test.tsx` > "lets a pristine form go", "stops a changed form… asks again next time", "Discard changes arrives at the target" | Yes. M4 fails the Keep test | Met |
| U2 | Push with `{leaveWithoutAsking:true}` passes. Same target without it is blocked. POP to an entry with the state is blocked | > "lets a push through whose state is leaveWithoutAsking…", "asks for a POP to an entry that carries the state" | Yes. M5 and M6 each fail one | Met |
| U3 | Not blocked in flight, after `markSaved()`, or for search/hash-only changes | > "does not ask while a request is in flight", "does not ask after markSaved", `it.each` search/hash | Yes. M1 and M3 fail them. The `markSaved` row alone does not catch M2, the synchronous test does | Met |
| U4 | `markSaved()` plus navigate in one handler: no dialog | > "reads markSaved at once…" | Yes. M2 fails it (and 31 form tests) | Met |
| U5 | Sign-out ask: changed opens the dialog and not `proceed`. Keep never calls it. Discard calls once. Unchanged or saving calls at once | `useLeaveGuard.test.tsx` > asking before Sign out (3 tests, incl. "calls proceed at once, with no dialog, while saving") | Yes. The unchanged case is covered by the pristine/`asks` path and the App test | Met |
| U6 | Outside a provider the hooks do nothing and `confirmLeave` runs `proceed` | `useLeaveGate.test.tsx` > outside a provider; `useLeaveGuard.test.tsx` > "outside a provider the sign-out runs proceed at once" | Yes. M9 fails both | Met |
| U7 | A second navigation keeps the dialog open and Discard goes to the second target. A navigation during the sign-out question: Discard navigates and the sign-out `proceed` is never called | > "replaces the pending navigation…", "a navigation while the question is open replaces it…", "a sign-out ask while the navigation question is open does nothing more" | Yes. M11 fails the second | Met |
| U8 | Unload prompt armed only while true, removed on unmount | `useUnloadPrompt.test.tsx` (harness test), plus "the unload prompt follows the guard" | Yes (listener assertions). Not mutated | Met |
| S1 | Existing leaving criteria on the new router: Cancel and back link untouched go at once. Typed name opens the question with Keep focused. Keep and Esc keep values. Discard goes to `/`. Cancel disabled while saving. Back link at once while saving. No dialog after a 201. Banner link goes at once. POP onto the banner entry asks | `AddServiceForm.test.tsx` > leaving (all of the above), "the banners > 409 service_limit_reached… leaves with no dialog" | Yes. M1 fails the saving test, M5 and M8 fail the banner test, M10 fails every 201 test | Met |
| A1 | Brand link: changed asks, page stays, Discard ends on the dashboard. Untouched goes at once | `App.test.tsx` > the brand link (2 tests) | Yes | Met |
| A2 | Back and Forward, changed: each asks. Keep keeps location and values. Discard completes. Untouched moves at once | > Back and Forward (2 tests) | Yes. M4 fails the first. Only Back is discarded, Forward is only kept (see N1) | Met |
| A3 | Sign out: asks, Keep, Discard calls once, ends on sign-in with no second question (FR-3). Failing `signOut`: form stays and the brand link asks again. Untouched calls at once | > Sign out (3 tests) | Yes. M8 fails 5 tests | Met (FR-3) |
| A4 | Keyboard (NFR-4): Enter on Sign out and the brand link opens the question with Keep focused. Enter on Keep closes and focus returns. Esc closes. Backdrop closes | > the keyboard (NFR-4), 3 tests | Yes for Enter/Esc/backdrop. The focus-return assertion passes in jsdom | Met (NFR-4, jsdom only) |
| A5 | Back while saving arrives at once | > "Back while saving arrives at once, with no question" | Yes. M1 fails it | Met |
| A6 | A `401` on a changed form ends on sign-in with the notice and no dialog (FR-4) | > "a 401 on a changed form ends on the sign-in form with the notice and no question (FR-4)" | Yes: it asserts no `dialog` and no `alertdialog`. It would fail if the guard blocked or the dialog stayed mounted. No source mutation of the unmount order was run (see section 5) | Met (FR-4) |
| A7 | Signed-out gate still sends `/services/new` to sign-in. Other tests pass on the new router | > "signed out: %s ends on the sign-in form…" and the rest of the file | Yes | Met |
| R1 | `make check` passes | section 1 | n/a | Met |
| R2 | Nothing outside the allowed paths changed. `package.json` and the lockfile unchanged | `git diff 14a01c6..HEAD --name-only`: only the 19 paths allowed by the task, plus the plan. `package.json`, lockfile, `backend/`, `e2e/`, `docs/` (other than the plan) untouched | n/a | Met |

## 3. Plan check

- Every criterion is in the plan, and every ticked item has a test that exists and checks the behavior (spot-checked each by name and by mutation).
- Plan vs diff: the plan describes the diff correctly. The judgment calls it lists match the code: `markSavedRef` filled by an effect, `AdminLayout` split into a gate plus `Shell`, no session prop and no change to `AddServicePage`.
- The plan says mutation checks were run on five guard behaviors. I ran those and the other four from the task list (section 5).
- The plan says the focus return after Keep passed in jsdom and nothing was dropped. Confirmed.
- No difference found that matters.

## 4. Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged. `react-router` stays at 8.5.1. No import beyond the task's list.
- **`useLeaveGuard.ts`:** one rule (`asks()` = changed, not saving, not saved) is used by the blocker and by the sign-out ask. "Saved" is read from `savedRef` at navigation time. It returns `markSaved`, `keepEditing` and `discard`, with no raw setters. The registration is removed on unmount (`useRegisterLeaveAsk`). Nothing disarms the guard on Discard.
- **Components:** `features/service-form/` imports nothing from `app-shell/`. Only `components/ui/Dialog.tsx` (and the other wrappers) import Base UI. No `window.confirm`. "Discard unsaved changes" appears in `DiscardDialog` for the service form; the other copy is `alert-list`'s own `TargetDiscardDialog`, which is out of scope. `AdminLayout` is the only caller of `confirmLeave`.
- **`App.tsx` and `main.tsx`:** same paths and nesting as before (root `ToastProvider` over the session layout, `/status` outside it). `BrowserRouter` is gone. The router is created once at module level in `main.tsx`.
- **Conventions:** no `eslint-disable`. One hook per concern with colocated tests (`useLeaveGate`, `useUnloadPrompt`, `useLeaveGuard`). The three-file split matches `sessionContext`/`useSession`/`SessionProvider`. No hand-written dialog and no design markup copied (`DiscardDialog` changed by one comment).
- **Test files:** my additions are rows in the existing files. No `_edge` or `_regress` files.
- **e2e:** `e2e/**` is unchanged. The only Sign out in the journeys (`e2e/journeys/sign-in.spec.ts:30`) follows a sign-in with no form, so no changed form meets the question. No finding.

## 5. Mutation checks run

Each was applied to the source, run against `useLeaveGuard.test.tsx`, `useLeaveGate.test.tsx`, `App.test.tsx` and `AddServiceForm.test.tsx`, and reverted (`git status` clean afterwards).

| # | Mutation | Result |
|---|---|---|
| M1 | Blocker ignores `saving` | 3 failed (guard "in flight", App "Back while saving", form "while saving") |
| M2 | `savedRef` replaced by state | 32 failed, including "reads markSaved at once" |
| M3 | Drop the pathname comparison | 2 failed (search, hash) |
| M4 | `Keep editing` does not reset the blocker | 14 failed |
| M5 | Drop the `POP` condition | 2 failed (guard POP test, banner test) |
| M6 | Remove `state` from the banner link | 1 failed (banner test) |
| M7 | Registration left after unmount | 1 failed |
| M8 | `signOut` called without `confirmLeave` | 5 failed |
| M9 | Context default throws outside a provider | 222 failed (the two named tests and every form test) |
| M10 | The form does not call `markSaved()` on success | 31 failed |
| M11 | Discard also runs the sign-out `proceed` when a navigation is pending | 1 failed |

Not run: unmounting the form after the redirect for the `401` case. The criterion's test passes and asserts no dialog, but it would not distinguish a broken unmount order from an unrelated pass. See N2.

## 6. Cases beyond the task file

Added as rows in existing files (both pass, no source change needed):

- `useLeaveGuard.test.tsx`: a push whose state is `{leaveWithoutAsking:false}`, `{leaveWithoutAsking:'true'}`, a bare string or an unrelated object still asks. The exception is strict.
- `AddServiceForm.test.tsx` > leaving: a double click on the back link with a changed form opens one dialog, and Discard goes to `/`.

Also tried through existing tests and reading: Keep then the same exit again; Back while saving; a `401` on a changed form; a changed form then a successful save (no dialog, M10); a failed save then an exit (asks again); a sign-out question open when Back is pressed. No defect found. A same-path navigation with a different search or hash is let through, as the task says.

## 7. Integration tests

None apply. No backend code changed and the frontend has no integration-tested code. Result: **not run**, because `make test-integration` covers backend code that this task does not touch. No criterion depends only on an integration test.

## 8. What I could not prove

The browser's own history behavior (Back, Forward, tab close) and the focus return after Back and Forward in a real browser. Everything above is jsdom with a memory router. I did not run the built app.

## Findings

### Blocking

None.

### Non-blocking

- **N1 (test quality).** In "Back and Forward", `Discard changes` is only exercised for Back. Forward is asked and kept but never discarded. Matters when: someone changes how a pending `POP` forward is proceeded (for example by moving the `leaveWithoutAsking` rule). Cheap to add a row if wanted.
- **N2 (test quality).** The `401` test proves no dialog in the page, but nothing pins the reason (the form unmounts in the commit that redirects). Matters when: `AdminLayout` or the 401 handler changes so the form stays mounted for a render after the session ends. The task's fallback (a guard prop from `useSession()`) is then the fix.
- **N3 (latent bug, report only).** If `confirmLeave` were called twice while the sign-out question is open, the second `proceed` replaces the first (`signOutProceed.current`). Not reachable: the dialog is modal and the Sign out button is behind it. No trigger known.
- **N4 (cosmetic, report only).** `useRegisterLeaveAsk` re-registers on every render because the guard passes a new closure each time. Harmless: the provider keeps one ref.

## Docs or specs that no longer match

- `STACK.md` line 43 ("Routing | react-router, browser history"): this work adopts the data router (`createBrowserRouter`, `createMemoryRouter`, `RouterProvider`, `useBlocker`) on `react-router` 8.5.1. The user records the adopted version and the data-router choice here.
- `docs/design/README.md` line 44 ("Discard unsaved changes?" on both forms): the Add form now asks on every exit. The Edit form has none until `edit-service-screen`, as the task's "Known gaps" says. It is accurate once that task merges; nothing to change now.
- `docs/openapi.yaml` and `docs/requirements.md`: nothing out of date. No request changed.

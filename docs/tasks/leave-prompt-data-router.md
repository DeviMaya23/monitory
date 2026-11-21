# Task: data router and the unsaved-changes prompt

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The app moves from `BrowserRouter` to a data router so that react-router's `useBlocker` can stop a navigation. The Add service form then asks "Discard unsaved changes?" when a changed form is left by any exit: the top-bar brand link, the browser's Back and Forward, any other link, the form's Cancel and back link (which go through the same blocker now), and Sign out (which is not a navigation, so it asks through a small shared registration). Today the form asks only for Cancel and the back link and leaves the other exits silent. The Edit form (`edit-service-screen`) reuses the same guard.

Requirements covered:

- FR-12, in part (no requirement names the prompt; the board and `docs/design/README.md` list "Discard unsaved changes?" on both forms under "Additions that are built"): a changed form is not left by accident. Proven by the criteria below.
- NFR-4, in part: the question is reachable and answerable from the keyboard on every exit, focus starts on `Keep editing`.

Out of scope:

- **The Edit form** and its prompt: `edit-service-screen` builds the screen and calls the guard this task changes.
- **Esc on the form** (the board lists it among the exits): still not built; Esc outside the dialog does nothing, as today.
- **The notification target dialog** (`features/alert-list`): a dialog, not a route; it keeps its own guard.
- **A session that ends** (a `401`): the board says the leave question is not shown then. This task keeps that: see "Behavior".
- **Restoring typed values after a session ends** (the board's open question 5): not built.
- **A prompt for any other page.** Only the service form uses the guard.
- **Changing what makes the form "changed"**, or the wording of the question: unchanged (`edit-service-screen` changes how "changed" is computed).

## Prerequisite

`service-form-json-and-cert-rows` and `service-form-type-tcp` are merged. They change `useLeaveGuard.ts`, `AddServiceForm.tsx` and their tests, which this task changes next. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/service-form/hooks/useLeaveGuard.ts` returning `changed`, `dialogOpen`, `cancel`, `backLinkProps`, `keepEditing`, `discard`, and taking `saving`, `saved` and `onLeave` besides the form's values; `features/service-form/components/DiscardDialog.tsx` (props `open`, `onKeep`, `onDiscard`); `AddServiceForm.tsx` using them; `useCreateService.ts` returning `saving` and `saved`.
- `frontend/src/App.tsx` with the default export `App` (a `Routes` tree, `ToastProvider` outermost, `SessionProvider` in a layout route, `AdminLayout`, the public page outside the session layout); `frontend/src/main.tsx` with `BrowserRouter`; `app-shell/AdminLayout.tsx` with the Sign out button calling `useSession().signOut`.
- The installed `react-router` 8.5.1 exports `createBrowserRouter`, `createMemoryRouter`, `RouterProvider`, `useBlocker` and the type `RouteObject`. If one is missing or works differently from this file, stop and ask.

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/app-shell/AdminLayout.tsx` (the Sign out button and the provider), `frontend/src/features/service-form/**`, `frontend/src/pages/AddServicePage.tsx` (only if the fallback in "Behavior" is needed), the new files named under "Structure" in `frontend/src/hooks/`, `frontend/src/components/` and `frontend/src/test/`, and the two tests that render `App`: `frontend/src/features/alert-list/components/AlertList.test.tsx` and `TargetDialog.test.tsx` (only their inline App renders, so they use the new router; nothing else in `features/alert-list/`). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/leave-prompt-data-router.plan.md`). Do not change `features/service-list/**`, `features/sign-in/**`, `features/public-dashboard/**` or `components/ui/**`.

Shared files this task touches, all owned by this task while it runs: `main.tsx`, `App.tsx`, `App.test.tsx`, `AdminLayout.tsx`, everything under `features/service-form/`, and the render helper of the two alert-list tests. `target-dialog-test-flake` also changes `features/alert-list/components/TargetDialog.test.tsx`: it is merged first (it is ready and small), and the builder checks that before starting. Tasks that may run at the same time: any backend task. The frontend tasks `edit-service-screen`, `service-name-link` and `service-test-panel` wait for this one (they change `App.tsx` and `service-form` too).

## Operations used

None. No request changes.

## Behavior

### What exists

- `main.tsx` renders `QueryClientProvider` around `BrowserRouter` around `App`. `App` is a `Routes` tree: `ToastProvider` outermost, a layout route with `SessionProvider`, `/sign-in`, then the `AdminLayout` routes (`/`, `/services/new`, `/services/:serviceId`, `/services/:serviceId/alerts`, `*`), and `/status` outside the session layout.
- `useLeaveGuard` opens the discard dialog from `cancel()` and from the back link's `onClick`, and calls `onLeave` (navigate to `/`) on Discard. The brand link, Back/Forward and Sign out leave a changed form without asking.
- Tests render `<MemoryRouter><App/></MemoryRouter>` (`App.test.tsx`, `AlertList.test.tsx`, `TargetDialog.test.tsx`) or a `MemoryRouter` with a small `Routes` (`AddServiceForm.test.tsx`).

### The data router

- `App.tsx` exports the route table as data (`appRoutes`, a `RouteObject[]`) with the same tree and the same elements as today: the root route's element is `ToastProvider` around an `Outlet`, so a toast still outlives a route change; the session layout, the gate and the public page are as they are. The default export `App` goes.
- `main.tsx` creates the browser router from `appRoutes` once (`createBrowserRouter`) and renders `RouterProvider` inside `QueryClientProvider` and `StrictMode`. Nothing else changes in it.
- Tests build their router with `createMemoryRouter(appRoutes, { initialEntries, initialIndex })`. A shared helper in `frontend/src/test/` renders it with a query client (see "Structure").
- Every route, redirect and `Navigate` behaves as before. A navigation through a data router updates the screen asynchronously, so tests wait with `findBy…` or `waitFor` where they used to read at once.

### The guard

`useLeaveGuard` keeps what it has (the changed rule and its inputs, the unload prompt armed while changed, not saving and not saved) and changes how the question is asked:

- **Navigation.** It calls `useBlocker` with a function. A navigation is blocked when the form is changed, no request is in flight, the save has not succeeded, and the target's pathname differs from the current one. (A change of search or hash on the same path is not asked about.) The blocked state opens the discard dialog: `dialogOpen` is true while the blocker is blocked.
- **`Keep editing`, Esc and a click on the backdrop** reset the blocker: the page stays, the typed values stay, the dialog closes, and the next attempt asks again.
- **`Discard changes`** proceeds with the navigation the admin attempted (to `/` for Cancel and the back link, to wherever the brand link or Back/Forward was going).
- **Cancel and the back link** no longer have handlers in the hook (`cancel` and `backLinkProps` go, and so does `onLeave`): the form's `Cancel` button navigates to `/` and the back link is a plain `Link`; the blocker asks for both. While a request is in flight, `Cancel` is disabled, and the back link goes at once (the request is not cancelled), as before.
- **Links that leave on purpose.** The banner link `Back to services` (service limit reached) goes at once, with no question, even with the form changed, as `add-service-screen` specified. The link carries router state `{ leaveWithoutAsking: true }` (a constant exported by the guard's module) and the blocker's function lets a navigation with that state through only when its history action is not `POP` (a history entry keeps its state, so Back or Forward to an entry created by that link must still ask). Any later banner link that offers the same exit uses it.
- **A save that succeeds** must not be asked about. The navigation to `/` that follows the `201` runs in the same tick as the success, before any re-render, so the guard owns a `markSaved()` (returned by the hook: it sets a ref and a state) and the form calls it first in its success callback, before `navigate('/')`. The `saved` option of the hook goes; the unload prompt reads the hook's own saved state. No dialog appears.
- **A second navigation while the question is open** (the browser's Back is not stopped by the modal) replaces the pending one: the dialog stays open and `Discard changes` proceeds with the latest attempt. A sign-out ask while the navigation question is open does nothing more (the dialog is already open and modal). The reverse (a browser Back while the sign-out question is open) replaces the pending sign-out: the latest attempt wins and the other is dropped, so `Discard changes` runs only the navigation, and the sign-out `proceed` is never called.
- **A session that ends** (a `401`: the shell ends the session and `AdminLayout` redirects to `/sign-in`) shows no dialog. Expected: the form is unmounted in the commit that redirects, which removes the blocker before the redirect runs. A test proves it. If the test shows the dialog, make the guard not block while the session is not signed in, with a prop that `AddServicePage` fills from `useSession()` (a page may import `app-shell`; the feature may not), and say so in the plan.
- **The focus** goes to `Keep editing` when the dialog opens and returns, on Keep, to the element that had focus when it opened (Base UI's own behavior through the `Dialog` wrapper, as today); there is no trigger to return to for Back and Forward and that is accepted.
- **The unload prompt** (closing or reloading the tab) is unchanged in behavior; it moves to its own hook `useUnloadPrompt(armed)` (see "Structure").
- **Error pages:** the data router shows its default error page for a render error, which `BrowserRouter` did not. No `errorElement` is added; accepted.

### Sign out

Sign out is a request, not a navigation, so a blocker would ask only after the session had ended. It asks first, through a registration:

- A new provider, mounted in `AdminLayout` around the top bar and the page outlet, holds at most one registered "ask before leaving" function. `useLeaveGate()` gives the shell `confirmLeave(proceed)`: it runs `proceed` at once when nothing is registered or the registered function says there is nothing to ask, and otherwise hands `proceed` to the registered function and does not run it.
- A form registers with `useRegisterLeaveAsk(ask)` while it is mounted (removed on unmount; the latest `ask` is used, not the one from the first render). `ask(proceed)` returns `true` when it took over (it opened its dialog and keeps `proceed` for `Discard changes`) and `false` when there is nothing to ask. The guard's `ask` returns true exactly when the navigation rule above would block (changed, not saving, not saved).
- Outside a provider (a form rendered in a test without `AdminLayout`), `useLeaveGate().confirmLeave` runs `proceed` at once and `useRegisterLeaveAsk` does nothing: the context has a no-op default and neither hook throws.
- The top bar's `Sign out` button calls `confirmLeave(signOut)` with the session's `signOut`. Its disabled state and every other behavior are as today.
- The dialog is the same one: while a sign-out question is open, `dialogOpen` is true. `Keep editing`, Esc and the backdrop close it and drop `proceed`; `Discard changes` calls `proceed` once and disarms nothing: the redirect to `/sign-in` that follows a successful sign-out is not asked about for the same reason a `401` is not (the form is unmounted in the commit that redirects; same test, same fallback). If the sign-out fails (the shell shows its toast and the admin stays), the form is still guarded and the next exit asks again.
- While a request is in flight (saving) `Sign out` goes at once, as the back link does.

### Known gaps

- **Esc on the form** does not ask (the board lists it).
- **A second `Sign out` click** while the question is open is not possible (the dialog is modal).
- **The question offers no "save and leave".** The board has none.
- **The Edit form** has no prompt until `edit-service-screen`.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step. The user approved the shared registration with this task (it lives outside any feature because the shell and a feature both use it and a feature may not import `app-shell/`).

- `frontend/src/hooks/leaveGateContext.ts` (new), `frontend/src/hooks/useLeaveGate.ts` (new: `useLeaveGate` for the shell and `useRegisterLeaveAsk` for a form) and `frontend/src/components/LeaveGateProvider.tsx` (new), the three files split as `app-shell/sessionContext.ts`, `useSession.ts` and `SessionProvider.tsx` are (the lint rule about components and non-components in one file). Each with a test written through a small harness component (`render()`, not `renderHook`: the registration is an effect).
- `frontend/src/app-shell/AdminLayout.tsx`: wraps the top bar and the outlet in `LeaveGateProvider`; the Sign out button calls `confirmLeave(signOut)`.
- `frontend/src/features/service-form/hooks/useLeaveGuard.ts` (and its test): the blocker, the dialog state, the registration, the saved ref. It returns `changed`, `dialogOpen`, `keepEditing`, `discard`, `markSaved`. One concern: asking before the form is left. Its options lose `onLeave` and `saved`. `features/service-form/hooks/useUnloadPrompt.ts` (new, with a harness test): arms the browser's prompt while its `armed` argument is true; the guard passes `changed && !saving && !saved`.
- `frontend/src/features/service-form/components/AddServiceForm.tsx`: `Cancel` navigates to `/`; the back link has no `onClick` from the hook; the success callback calls `markSaved()` first (the callback is created before the guard exists: use a ref the callback reads, or a closure over the later constant if lint allows it; builder's choice, stated in the plan); the form no longer reads `saved` from `useCreateService`.
- `frontend/src/features/service-form/components/FormBanners.tsx`: the `Back to services` link passes `state` with the guard module's exported `LEAVE_WITHOUT_ASKING` constant (`{ leaveWithoutAsking: true }`).
- `frontend/src/features/service-form/components/DiscardDialog.tsx`: unchanged; its comment may name the new exits.
- `frontend/src/App.tsx`, `frontend/src/main.tsx` as in "The data router".
- `frontend/src/test/renderRoutes.tsx` (new): `renderRoutes(routes, { initialEntries, initialIndex, client })` renders the given routes in a memory router inside a `QueryClientProvider` (the given client, or a new one) and returns `{ router, client }`, so a test can call `router.navigate(-1)`, read the location and read the cache. It adds no `ToastProvider`: `appRoutes` has its own, and `AddServiceForm.test.tsx` passes routes whose root element holds one. Used by `App.test.tsx` (its `renderAt` and the two inline renders that read the client), the App renders inline in `AlertList.test.tsx` and `TargetDialog.test.tsx` (their other `MemoryRouter` renders stay as they are), and `AddServiceForm.test.tsx`.

## Design reference

Reference only, read-only: `docs/design/service-form.html`, state "Leave with unsaved changes (proposed)" (the board lists Cancel, the back link, Sign out and Esc; Back and Forward and the brand link are the browser's and the shell's own exits), and `docs/design/README.md` ("Additions that are built"). The dialog already exists; no new markup or style. The wording is unchanged: `Discard unsaved changes?`, `The changes to this service will be lost.`, `Keep editing`, `Discard changes`.

## Dependencies

None. `react-router` 8.5.1 is installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Render with the new helper (a memory data router); `user-event`; mock `createService` and the session wrappers as `App.test.tsx` and `AddServiceForm.test.tsx` do, keeping the real query key.

**Leave gate (`frontend/src/hooks/useLeaveGate.test.tsx` through harness components)**

- With nothing registered, `confirmLeave(proceed)` runs `proceed` once, at once.
- With a registered `ask` that returns `false`, `proceed` runs once and `ask` was called with it; with one that returns `true`, `proceed` does not run until the registered side calls it.
- After the registering component unmounts, `confirmLeave` runs `proceed` at once; after a re-render with a different `ask`, the new one is called, not the first.

**`useLeaveGuard` (`features/service-form/hooks/useLeaveGuard.test.tsx`, a harness inside a memory data router with two routes)**

- Not changed: `router.navigate('/other')` arrives with no dialog. Changed: the same navigation does not arrive and `dialogOpen` is true. `keepEditing` closes it, stays on the page, and the next navigation asks again. `discard` arrives at `/other`.
- Not blocked for a push navigation whose state is `{ leaveWithoutAsking: true }`; blocked for the same target without it; blocked for a `POP` (Back or Forward) to an entry that carries the state.
- Not blocked when a request is in flight; not blocked after `markSaved()`; not blocked for a navigation that changes only the search or the hash of the same path.
- `markSaved` read synchronously: a harness that calls `markSaved()` and navigates in the same event handler arrives with no dialog.
- Sign-out ask: with a changed form, `confirmLeave(proceed)` opens the dialog and does not call `proceed`; `keepEditing` closes it and `proceed` is never called; after `discard`, `proceed` is called once. With an unchanged form, or while saving, `confirmLeave(proceed)` calls `proceed` at once and opens nothing.
- Outside a provider the hooks do nothing and `confirmLeave` runs `proceed` at once (a harness with no `LeaveGateProvider`).
- A second navigation while the dialog is open keeps it open, and `discard` proceeds with the second target. A navigation while the sign-out question is open: `discard` navigates and the sign-out `proceed` is never called.
- The unload prompt (`useUnloadPrompt.test.tsx`) is armed only while its argument is true and removed on unmount (the existing criterion, moved).

**The screen (`AddServiceForm.test.tsx`)**

- The existing leaving criteria still pass on the new router: `Cancel` and the back link with an untouched form go to `/` with no dialog; with a typed name they open the question with `Keep editing` focused; `Keep editing` and Esc close it and keep the values; `Discard changes` goes to `/`; `Cancel` is disabled while saving; the back link goes at once while saving; after a `201` there is no dialog; the limit banner's `Back to services` link, with a changed form after a `409 service_limit_reached`, goes to `/` with no dialog (the existing banner test, kept on the new router); after that, Back to the form's entry and typing a name, `router.navigate(-1)` onto the entry made by that link still asks.

**The app (`App.test.tsx`)**

- Brand link: with a typed name, clicking `Monitory` opens the question and the page stays on the form; `Discard changes` ends on the dashboard; with an untouched form it goes at once.
- Back and Forward: with history `/`, `/services/new`, `/services/s1/alerts` and the index on the form, a changed form answers `router.navigate(-1)` and `router.navigate(1)` each with the question, and `Keep editing` leaves the location and the typed values as they were; `Discard changes` completes the move. An untouched form moves at once.
- Sign out: with a typed name, `Sign out` opens the question and `signOut` was not called; `Keep editing` closes it, `signOut` still not called; `Discard changes` calls `signOut` once, the page ends on the sign-in form and no second question appears (FR-3). With `signOut` failing (the mock leaves the session), the form stays and the next brand-link click asks again. With an untouched form, `signOut` is called at once and no dialog opens.
- Keyboard (NFR-4): with a changed form, focusing `Sign out` and pressing Enter, and focusing the brand link and pressing Enter, each open the question with `Keep editing` focused; Enter on `Keep editing` closes it, and focus is back on the element that opened it where jsdom can show it (assert only what Base UI's focus return does there; a flaky assertion is dropped and said so in the plan); Esc closes it for the sign-out and the brand-link question; a click on the backdrop closes it.
- Back while saving: with a `createService` still pending and a changed form, `router.navigate(-1)` arrives at once with no dialog.
- A `401` while changed: a `createService` that answers `401 unauthenticated` (the mock runs the registered handler before rejecting) with a typed name ends on the sign-in form with the session-ended notice and no dialog is in the page (FR-4).
- The signed-out gate still sends `/services/new` to the sign-in form; every other test in the file passes on the new router with no assertion changed except the waiting.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: `App.test.tsx`, and the inline App renders of `AlertList.test.tsx` and `TargetDialog.test.tsx` (from `MemoryRouter` around `App` to the new helper; nothing else), `AddServiceForm.test.tsx` (its `setup`) and `useLeaveGuard.test.tsx` (its harness: the hook no longer returns `cancel` and `backLinkProps` and no longer takes `onLeave` or `saved`; the cases about Cancel and the back link become the router cases above, the `saved` cases become `markSaved`, and the unload-prompt cases move to `useUnloadPrompt.test.tsx`). No other assertion is removed or loosened.

## Verifier checks

- **By reading `useLeaveGuard.ts`:** the blocker's function and the sign-out ask use one rule (changed, not saving, not saved); "saved" is read from a ref at navigation time; the hook returns semantic mutators (`markSaved`, `keepEditing`, `discard`), no raw setters; the registration is removed on unmount; nothing disarms the guard on Discard.
- **By reading the components:** `features/service-form/` imports nothing from `app-shell/` (the page may); only `components/ui/Dialog.tsx` imports Base UI's Dialog; no `window.confirm`; the wording appears once, in `DiscardDialog`; `AdminLayout` is the only caller of `confirmLeave`.
- **By reading `App.tsx` and `main.tsx`:** the tree is the same as before (same paths, same layout nesting, `ToastProvider` above the session layout, `/status` outside it); `BrowserRouter` is gone; the router is created once, outside a component.
- **Mutation checks to run:** make the blocker ignore `saving`; drop `markSaved` (read state); drop the pathname comparison; make `Keep editing` not reset the blocker; leave the registration in place after unmount; call `signOut` without `confirmLeave`; make the hooks throw outside a provider; drop the `POP` condition of the exception; remove the state from the banner link. Each must fail at least one named test.
- **Inputs to try:** the brand link, Back and Forward, Cancel, the back link and Sign out each with an untouched and a changed form; Keep then the same exit again; a double click on the back link; Back while saving; a `401` on a changed form; a changed form, then a successful save.
- **e2e:** `e2e/**` is not changed. Grep the journeys for a changed form left by Sign out, the brand link or Back; report any as a finding (they would now meet the question).
- **What the verifier cannot prove:** the browser's own history behavior in a real browser and the focus return after Back and Forward; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a `components/ui/` wrapper, or an edit to a spec or design file.
- A prerequisite name is missing, or `react-router` 8.5.1 does not offer what "Prerequisite" lists.
- A state this file does not list seems to be needed (another dialog, a banner).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the data router and test helper first, then the gate, then the guard), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the history and focus behavior were checked in jsdom only, not in a browser, unless you ran the app.

# Plan: data router and the unsaved-changes prompt

Branch: `feat/leave-prompt-data-router`. Prerequisites checked: `useLeaveGuard`, `DiscardDialog`, `useCreateService` (`saving`, `saved`), `App`, `AdminLayout` exist; `react-router` 8.5.1 exports `createBrowserRouter`, `createMemoryRouter`, `RouterProvider`, `useBlocker`; the `target-dialog-test-flake` task is merged (#44).

Integration tests: no backend code touched, so `make test-integration` does not apply.
Outcome: not run: frontend-only task, no code with integration tests.

## Data router

- [ ] `App.tsx` exports `appRoutes` (same tree, root element = `ToastProvider` around `Outlet`); default export gone. Tests: `App.test.tsx` (every existing route test on the new router).
- [ ] `main.tsx` creates the browser router once and renders `RouterProvider`. Covered by `make check` build and App tests.
- [ ] `test/renderRoutes.tsx` helper (`renderRoutes`). Used by `App.test.tsx`, `AddServiceForm.test.tsx`, the App renders in `AlertList.test.tsx` and `TargetDialog.test.tsx`.

## Leave gate

- [ ] `hooks/leaveGateContext.ts`, `hooks/useLeaveGate.ts`, `components/LeaveGateProvider.tsx`; test `hooks/useLeaveGate.test.tsx`:
  - [ ] nothing registered: `confirmLeave` runs `proceed` once at once
  - [ ] `ask` false: `proceed` runs once and `ask` got it; `ask` true: `proceed` does not run
  - [ ] after unmount `proceed` runs at once; after re-render the new `ask` is called

## useLeaveGuard (`features/service-form/hooks/useLeaveGuard.test.tsx`)

- [ ] Not changed: navigate arrives; changed: blocked, `dialogOpen`; `keepEditing` closes and next asks again; `discard` arrives
- [ ] `leaveWithoutAsking` state: push passes; same without state blocked; POP to entry with state blocked
- [ ] not blocked while saving; after `markSaved()`; for search/hash-only change
- [ ] `markSaved()` and navigate in the same handler: no dialog
- [ ] sign-out ask: changed opens the dialog, `proceed` not called; keep never calls; discard calls once; unchanged or saving calls at once
- [ ] outside a provider hooks do nothing, `confirmLeave` runs `proceed`
- [ ] second navigation replaces pending; navigation while sign-out question open drops `proceed`
- [ ] `useUnloadPrompt.test.tsx`: armed only while true, removed on unmount

## The screen (`AddServiceForm.test.tsx`)

- [ ] Existing leaving criteria pass on the new router (Cancel, back link, Keep, Esc, Discard, disabled while saving, back link while saving, after 201, banner link, POP onto the banner link's entry asks)

## The app (`App.test.tsx`)

- [ ] Brand link changed asks / Discard ends on dashboard / untouched goes at once
- [ ] Back and Forward changed ask, Keep keeps location and values, Discard completes; untouched moves at once
- [ ] Sign out: asks, Keep, Discard calls `signOut` once, ends on sign-in, no second question; failing signOut then brand link asks again; untouched calls at once
- [ ] Keyboard (NFR-4): Enter on Sign out and brand link open question with Keep focused; Enter on Keep closes; Esc closes; backdrop closes
- [ ] Back while saving: arrives at once
- [ ] 401 while changed: sign-in with notice, no dialog (FR-4)
- [ ] Signed-out gate still sends `/services/new` to sign-in; other tests pass with only the waiting changed

## Repo-wide

- [ ] `make check` passes
- [ ] Only allowed paths changed; `package.json` and lockfile unchanged
- [ ] Pushed

## Judgment calls

(filled in at the end)

# Plan: data router and the unsaved-changes prompt

Branch: `feat/leave-prompt-data-router`. Prerequisites checked: `useLeaveGuard`, `DiscardDialog`, `useCreateService` (`saving`, `saved`), `App`, `AdminLayout` exist; `react-router` 8.5.1 exports `createBrowserRouter`, `createMemoryRouter`, `RouterProvider`, `useBlocker`; the `target-dialog-test-flake` task is merged (#44).

Integration tests: no backend code touched, so `make test-integration` does not apply.
Outcome: not run: frontend-only task; no backend code or integration-tested code changed.

## Data router

- [x] `App.tsx` exports `appRoutes` (same tree, root element = `ToastProvider` around `Outlet`); default export gone. Tests: `App.test.tsx` (every existing route test on the new router).
- [x] `main.tsx` creates the browser router once and renders `RouterProvider`. Covered by `make check` build and App tests.
- [x] `test/renderRoutes.tsx` helper (`renderRoutes`). Used by `App.test.tsx`, `AddServiceForm.test.tsx`, the App renders in `AlertList.test.tsx` and `TargetDialog.test.tsx`.

## Leave gate

- [x] `hooks/leaveGateContext.ts`, `hooks/useLeaveGate.ts`, `components/LeaveGateProvider.tsx`; test `hooks/useLeaveGate.test.tsx`:
  - [x] nothing registered: `confirmLeave` runs `proceed` once at once
  - [x] `ask` false: `proceed` runs once and `ask` got it; `ask` true: `proceed` does not run
  - [x] after unmount `proceed` runs at once; after re-render the new `ask` is called

## useLeaveGuard (`features/service-form/hooks/useLeaveGuard.test.tsx`)

- [x] Not changed: navigate arrives; changed: blocked, `dialogOpen`; `keepEditing` closes and next asks again; `discard` arrives
- [x] `leaveWithoutAsking` state: push passes; same without state blocked; POP to entry with state blocked
- [x] not blocked while saving; after `markSaved()`; for search/hash-only change
- [x] `markSaved()` and navigate in the same handler: no dialog
- [x] sign-out ask: changed opens the dialog, `proceed` not called; keep never calls; discard calls once; unchanged or saving calls at once
- [x] outside a provider hooks do nothing, `confirmLeave` runs `proceed`
- [x] second navigation replaces pending; navigation while sign-out question open drops `proceed`
- [x] `useUnloadPrompt.test.tsx`: armed only while true, removed on unmount

## The screen (`AddServiceForm.test.tsx`)

- [x] Existing leaving criteria pass on the new router (Cancel, back link, Keep, Esc, Discard, disabled while saving, back link while saving, after 201, banner link, POP onto the banner link's entry asks)

## The app (`App.test.tsx`)

- [x] Brand link changed asks / Discard ends on dashboard / untouched goes at once
- [x] Back and Forward changed ask, Keep keeps location and values, Discard completes; untouched moves at once
- [x] Sign out: asks, Keep, Discard calls `signOut` once, ends on sign-in, no second question; failing signOut then brand link asks again; untouched calls at once
- [x] Keyboard (NFR-4): Enter on Sign out and brand link open question with Keep focused; Enter on Keep closes; Esc closes; backdrop closes
- [x] Back while saving: arrives at once
- [x] 401 while changed: sign-in with notice, no dialog (FR-4)
- [x] Signed-out gate still sends `/services/new` to sign-in; other tests pass with only the waiting changed

## Repo-wide

- [x] `make check` passes
- [x] Only allowed paths changed; `package.json` and lockfile unchanged
- [x] Pushed

## Judgment calls

- `markSaved` is handed to the success callback through a ref (`markSavedRef`) that an effect fills with the guard's function: lint (`react-hooks/immutability`) rejects a closure over the later `guard` constant.
- No dialog on a 401 or after sign-out needed no fallback: the App tests (401 with a changed form, Discard then sign-out) show no dialog, so the guard has no session prop and `AddServicePage` is unchanged.
- `AdminLayout` was split into a gate (`AdminLayout`) and an inner `Shell`, so `LeaveGateProvider` mounts only when signed in and `useLeaveGate` is called inside it.
- The `LeaveGateProvider` holds the registered `ask` in a ref; `useRegisterLeaveAsk` re-registers on every new `ask` and clears on unmount.
- `useLeaveGuard.test.tsx` gets a small extra case ("unload prompt is not armed after markSaved") besides the moved unload cases, which are in `useUnloadPrompt.test.tsx`.
- The banner-link POP case extends the existing limit-banner test (Back, type, Forward) rather than adding a new test; its earlier assertions are unchanged.
- Focus return to Sign out and the brand link after `Keep editing` is asserted in App.test.tsx and passed in jsdom; none was dropped.
- Mutation checks run on the guard (ignore pathname, drop POP condition, no reset on Keep, ignore saving, ignore saved): each fails tests. The others in the verifier's list were not run by me.
- e2e journeys: grepped, none leaves a changed form by Sign out, the brand link or Back (the add-service journey already leaves by Cancel + Discard).
- History and focus behavior were checked in jsdom only, not in a browser.

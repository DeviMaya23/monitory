# Plan: frontend hardening

Branch: feat/frontend-hardening. Paths are under `frontend/src/`.

## Item 1: toast in the portal host
- [x] Viewport is a descendant of `[data-portal-host]` — `components/ui/Toast.tsx` (`BaseToast.Portal container={getPortalHost()}`); test in `components/ui/Toast.test.tsx`.
- [x] Existing Toast tests unchanged and passing — `Toast.test.tsx`.
- [x] `.toast-viewport` z-index 5, `.portal-host` comment rewritten — `styles/components.css`; `portalHost.ts` doc comment updated.
- [x] Measured in headless Chrome (scratchpad script, not committed) against the Vite dev server with a mocked API: 1120 px wide, 1659 px tall page, scrolled to top: bottom gap 16, right gap 16. 360 px: bottom 12, left 12, right 12. With a dialog open and a toast shown, `elementFromPoint` at the toast's centre returned `.dialog-layer` (1120) and `.dialog` (360), not the toast.

## Item 2: Type hint describes the group
- [x] `describedBy` prop sets/omits `aria-describedby` on the radiogroup — `components/ui/RadioGroup.tsx`; test `RadioGroup.test.tsx`.
- [x] Type radiogroup has description `Changing type swaps the fields below.` on Add and Edit — `features/service-form/components/TypeField.tsx`; tests in the existing add/edit form tests (or `TypeField` test).
- [x] Target dialog radiogroup has no `aria-describedby` — `features/alert-list/components/TargetDialog.test.tsx`.

## Item 3: refresh after off-screen save
- [x] Active observer: refetch (query fn called twice), not removed, `onSaved` once — `features/service-form/hooks/useSaveService.ts`; `useSaveService.test.tsx`.
- [x] Failed refetch leaves `saved` true, `failure` null, `onSaved` ran — `useSaveService.test.tsx`.
- [x] No observer: removed after success — `useSaveService.test.tsx`.
- [x] `not-found`: active refetched, inactive removed — `useSaveService.test.tsx`.
- [x] App journey: save finishing after leaving form refreshes dashboard — `App.test.tsx`.

## Item 4: type switch drops other type's summary entries
- [x] `clearType(next)` in `features/alert-list/hooks/useTargetServerErrors.ts`; tests in `useTargetServerErrors.test.tsx` (email drops url/headers, webhook drops address, name kept, bare `headers`, two switches).
- [x] Dialog calls it from `onValueChange`; title count, summary hidden when empty, focus stays on radio, no revival — `TargetDialog.tsx`; `TargetDialog.test.tsx`.

## Item 5: Discard on Forward
- [x] `Back and Forward` case: Forward asks, Discard completes, lands on `/services/s1/alerts`, no second question — `App.test.tsx`.

## Repo-wide
- [x] `make check` passes.
- [x] Nothing outside `frontend/src/` changed (besides this plan).
- `make check`: run, passed.
- Integration tests (`make test-integration`): not run: the task changes only `frontend/src/`; no Go code with integration tests is touched.

## Judgment calls
- Prop name is `describedBy` on `RadioGroup`.
- The refetch call is `void queryClient.refetchQueries(...).catch(() => {})`; `refetchQueries` does not throw by default, the `catch` is a guard so it can never reach the hook's `try`.
- `clearType('email')` also sets the same `headers` flag as `clearHeaders` (drops bare `headers` and every `headers[…]`); `clearType` keeps earlier edits of the same response.
- Toast placement test checks `.toast-viewport` is inside `[data-portal-host]` and outside the render container; it renders no toast, since the viewport exists without one.
- Item 3 App test uses the brand link to go back to the dashboard while the save is pending (no leave prompt, since the form is unchanged-to-guard only on dirty; none appeared). The dashboard remounts and loads, so the mock returns the old list until the save resolves.
- Measurements used a throwaway script in the session scratchpad with mocked `/api/` routes; a sign-out failure (error toast, stays until dismissed) was used to get a toast, then the Add target dialog was opened on the alert list.
- `npm ci` was run in `frontend/` to install dependencies (lockfile unchanged).

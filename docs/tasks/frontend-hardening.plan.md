# Plan: frontend hardening

Branch: feat/frontend-hardening. Paths are under `frontend/src/`.

## Item 1: toast in the portal host
- [ ] Viewport is a descendant of `[data-portal-host]` — `components/ui/Toast.tsx` (`BaseToast.Portal container={getPortalHost()}`); test in `components/ui/Toast.test.tsx`.
- [ ] Existing Toast tests unchanged and passing — `Toast.test.tsx`.
- [ ] `.toast-viewport` z-index 5, `.portal-host` comment rewritten — `styles/components.css`; `portalHost.ts` doc comment updated.
- [ ] Measured in headless Chrome (scratchpad script, not committed): four edge distances and `elementFromPoint` — reported in the handback.

## Item 2: Type hint describes the group
- [ ] `describedBy` prop sets/omits `aria-describedby` on the radiogroup — `components/ui/RadioGroup.tsx`; test `RadioGroup.test.tsx`.
- [ ] Type radiogroup has description `Changing type swaps the fields below.` on Add and Edit — `features/service-form/components/TypeField.tsx`; tests in the existing add/edit form tests (or `TypeField` test).
- [ ] Target dialog radiogroup has no `aria-describedby` — `features/alert-list/components/TargetDialog.test.tsx`.

## Item 3: refresh after off-screen save
- [ ] Active observer: refetch (query fn called twice), not removed, `onSaved` once — `features/service-form/hooks/useSaveService.ts`; `useSaveService.test.tsx`.
- [ ] Failed refetch leaves `saved` true, `failure` null, `onSaved` ran — `useSaveService.test.tsx`.
- [ ] No observer: removed after success — `useSaveService.test.tsx`.
- [ ] `not-found`: active refetched, inactive removed — `useSaveService.test.tsx`.
- [ ] App journey: save finishing after leaving form refreshes dashboard — `App.test.tsx`.

## Item 4: type switch drops other type's summary entries
- [ ] `clearType(next)` in `features/alert-list/hooks/useTargetServerErrors.ts`; tests in `useTargetServerErrors.test.tsx` (email drops url/headers, webhook drops address, name kept, bare `headers`, two switches).
- [ ] Dialog calls it from `onValueChange`; title count, summary hidden when empty, focus stays on radio, no revival — `TargetDialog.tsx`; `TargetDialog.test.tsx`.

## Item 5: Discard on Forward
- [ ] `Back and Forward` case: Forward asks, Discard completes, lands on `/services/s1/alerts`, no second question — `App.test.tsx`.

## Repo-wide
- [ ] `make check` passes.
- [ ] Nothing outside `frontend/src/` changed (besides this plan).
- Integration tests: not run: task touches only frontend code; no integration tests apply.

## Judgment calls
(filled at the end)

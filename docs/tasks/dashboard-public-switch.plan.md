# Plan: dashboard public page switch

Branch: `feat/dashboard-public-switch`. Frontend paths under `frontend/src/`.

## Acceptance criteria

- [x] `lib/api/publicView.ts`: `getPublicViewSettings` GETs `/api/settings/public-view`; `updatePublicViewSettings({enabled:true})` PUTs `{"enabled":true}`. Test: `lib/api/publicView.test.ts`
- [x] `usePublicView` state: loading / on / off / not-loaded (500, TypeError) / failed refetch keeps value / refresh recovers. Test: `features/service-list/hooks/usePublicView.test.tsx`
- [x] `usePublicView` toggle: sends exactly `{enabled}` once; two calls in one tick send one; success caches the answer (mock answers the opposite) with toast by the answer; each failure toast; 404 is the generic toast; 401 no toast. Test: `usePublicView.test.tsx`
- [x] Toolbar order and Tab order (`Add service`, `Refresh`, switch `Public page`, `Open public page (new tab)`); Space toggles (NFR-4). Test: `components/PublicToggle.test.tsx` + `ServiceList.test.tsx`
- [x] Loading / not loaded: switch disabled, unchecked, no On/Off; `Open` link shown, `href=/status`, `target=_blank`, `rel` noopener; no banner, no toast; enabled with word after load. Test: `ServiceList.test.tsx`
- [x] On and Off display; link same in both (FR-26, FR-28). Test: `PublicToggle.test.tsx`
- [x] Toggle from Off: sends `{enabled:true}`, pending shows Off with no `disabled`, second click sends nothing, answer shows On + toast; off toast. Test: `ServiceList.test.tsx`
- [x] 403 csrf_failed toast with Reload (reload once), value kept (NFR-8); 500 toasts on/off, value kept, retry sends again. Test: `ServiceList.test.tsx`
- [x] No `disabled` while pending; focus on the switch after the answer. Test: `ServiceList.test.tsx`
- [x] A pending setting refetch cannot overwrite a toggle's answer. Test: `usePublicView.test.tsx` and `ServiceList.test.tsx`
- [x] `Refresh` and `Retry` call both requests; auto refresh does both (fake timers); Refresh busy follows the list only. Test: `ServiceList.test.tsx`
- [x] No refetch of the setting after a successful toggle. Test: `usePublicView.test.tsx`
- [x] Real dashboard route in `App.test.tsx`: control shows, toggle works; 401 on the setting GET and on the PUT ends on sign-in with notice and no toast. Test: `App.test.tsx`
- [x] One services key: `useServiceList` uses `servicesQueryKey`, no `SERVICES_KEY`; `useServiceList.test.tsx` uses `importOriginal`; `SessionProvider.test.tsx` and `App.test.tsx` unchanged on that. Test: `hooks/useServiceList.test.tsx`
- [x] `Switch` `hideState`: word empty for both values, element kept; default unchanged. Test: `components/ui/Switch.test.tsx`
- [x] CSS: `.dash-toolbar__spacer`, `.public-toggle*`, 640 px block, `.public-toggle .switch-row { min-height: 0 }`. File: `features/service-list/service-list.css` (read only; no jsdom test)
- [x] `make check` passes. Outcome: run, passed (exit 0; one AddServiceForm test timed out at 5 s in the first run under machine load, an unrelated file, and passed alone and in the second full run)
- [x] Nothing outside allowed paths; `package.json` and lockfile unchanged
- [x] Integration tests: not applicable (frontend only). Outcome: not run: frontend-only task, no code with integration tests; `make test-integration` not applicable (database version: none)

## Judgment calls

- **`Open` link markup.** The sr-only text is ` public page (new tab)` in the task; with a leading space inside the span the computed name reads `Openpublic page (new tab)` (the space is dropped), so the space is its own text node between the two spans and the sr-only span holds `public page (new tab)`. The name is `Open public page (new tab)` as required.
- **Switch disabled assertions.** The Base UI switch is a `span role="switch"` and marks disabled with `aria-disabled="true"`, so tests assert that (no real `disabled` attribute exists, which also holds while a request is pending: the switch has no `aria-disabled` then).
- **`hideState`** renders an empty `.switch-row__state` (it keeps `min-width: 3ch`, so no layout shift).
- **`Switch.test.tsx`** has one new case only; the existing cases are unchanged.
- **Wording of mutation failure for non-`ApiError` rejections** (network `TypeError`) is the generic toast, via `toOutcome`'s `failed`.
- **Retry button** calls the same combined refresh as Refresh; its busy state still follows the list only.
- The layout (right end at wide width, full width at 640 px) and the focus outline were checked by reading the CSS only, not in a browser.

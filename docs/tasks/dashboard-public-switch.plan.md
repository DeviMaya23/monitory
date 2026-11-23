# Plan: dashboard public page switch

Branch: `feat/dashboard-public-switch`. Frontend paths under `frontend/src/`.

## Acceptance criteria

- [ ] `lib/api/publicView.ts`: `getPublicViewSettings` GETs `/api/settings/public-view`; `updatePublicViewSettings({enabled:true})` PUTs `{"enabled":true}`. Test: `lib/api/publicView.test.ts`
- [ ] `usePublicView` state: loading / on / off / not-loaded (500, TypeError) / failed refetch keeps value / refresh recovers. Test: `features/service-list/hooks/usePublicView.test.tsx`
- [ ] `usePublicView` toggle: sends exactly `{enabled}` once; two calls in one tick send one; success caches the answer (mock answers the opposite) with toast by the answer; each failure toast; 404 is the generic toast; 401 no toast. Test: `usePublicView.test.tsx`
- [ ] Toolbar order and Tab order (`Add service`, `Refresh`, switch `Public page`, `Open public page (new tab)`); Space toggles (NFR-4). Test: `components/PublicToggle.test.tsx` + `ServiceList.test.tsx`
- [ ] Loading / not loaded: switch disabled, unchecked, no On/Off; `Open` link shown, `href=/status`, `target=_blank`, `rel` noopener; no banner, no toast; enabled with word after load. Test: `ServiceList.test.tsx`
- [ ] On and Off display; link same in both (FR-26, FR-28). Test: `PublicToggle.test.tsx`
- [ ] Toggle from Off: sends `{enabled:true}`, pending shows Off with no `disabled`, second click sends nothing, answer shows On + toast; off toast. Test: `ServiceList.test.tsx`
- [ ] 403 csrf_failed toast with Reload (reload once), value kept (NFR-8); 500 toasts on/off, value kept, retry sends again. Test: `ServiceList.test.tsx`
- [ ] No `disabled` while pending; focus on the switch after the answer. Test: `ServiceList.test.tsx`
- [ ] A pending setting refetch cannot overwrite a toggle's answer. Test: `usePublicView.test.tsx` and `ServiceList.test.tsx`
- [ ] `Refresh` and `Retry` call both requests; auto refresh does both (fake timers); Refresh busy follows the list only. Test: `ServiceList.test.tsx`
- [ ] No refetch of the setting after a successful toggle. Test: `usePublicView.test.tsx`
- [ ] Real dashboard route in `App.test.tsx`: control shows, toggle works; 401 on the setting GET and on the PUT ends on sign-in with notice and no toast. Test: `App.test.tsx`
- [ ] One services key: `useServiceList` uses `servicesQueryKey`, no `SERVICES_KEY`; `useServiceList.test.tsx` uses `importOriginal`; `SessionProvider.test.tsx` and `App.test.tsx` unchanged on that. Test: `hooks/useServiceList.test.tsx`
- [ ] `Switch` `hideState`: word empty for both values, element kept; default unchanged. Test: `components/ui/Switch.test.tsx`
- [ ] CSS: `.dash-toolbar__spacer`, `.public-toggle*`, 640 px block, `.public-toggle .switch-row { min-height: 0 }`. File: `features/service-list/service-list.css` (read only; no jsdom test)
- [ ] `make check` passes. Outcome: pending
- [ ] Nothing outside allowed paths; `package.json` and lockfile unchanged
- [ ] Integration tests: not applicable (frontend only). Outcome: not run: the task touches no code with integration tests

## Judgment calls

(none yet)

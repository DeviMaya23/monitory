# Plan: alert list screen

Prerequisite (Target contract fix) is now on main and merged into this branch: `Target` is `EmailTarget | WebhookTarget`.

## Checklist (one item per acceptance criterion group)

- [ ] `lib/api/targets.ts`: wrappers call `apiRequest` with encoded ids, rejections pass through; `targetsQueryKey` does not start with `'services'` — `lib/api/targets.test.ts`
- [ ] `useTargetList`: loading/list/empty/could-not-load/not-found (404 wins over cache), refreshFailed and `refresh()` — `features/alert-list/hooks/useTargetList.test.tsx`
- [ ] `useRemoveTarget`: ask/cancel/replace/in-flight no-op, confirm once; 204 cache change with `dataUpdatedAt` kept, cancel of in-flight reload, 404 not_found refetch, 403 csrf toast + Reload, generic failures, 401 silent, no cached list, unmount — `features/alert-list/hooks/useRemoveTarget.test.tsx`
- [ ] Screen: loading, list (3 rows, order, type text, chip, fallback names, full long name), singular sub line, NFR-7 text, empty, alerts-off banner, something-went-wrong, service-not-found + h2 focus, only `listTargets` decides not-found, id from address, Remove names, no Add/Edit — `features/alert-list/components/AlertList.test.tsx`
- [ ] Removal flow: confirm group, focus, one question at a time, Cancel/Esc, in-flight state, both banners order, whitespace name, focus after 204/404/403/500/network, 401 — `features/alert-list/components/AlertList.test.tsx`
- [ ] Dashboard: `Alerts {name}` link per row (paused, TCP, encoded id), delivery link — `features/service-list/components/ServiceList.test.tsx` (and ServiceRow rendered there)
- [ ] `App.test.tsx`: alert-list route renders `AlertListPage`
- [ ] `make check` passes; only allowed paths changed; `package.json`/lockfile unchanged
- Integration tests (`make test-integration`): not run: no backend code touched; the task says none applies.

## Judgment calls

(filled in at the end)

# Plan: alert list screen

Prerequisite (Target contract fix) is now on main and merged into this branch: `Target` is `EmailTarget | WebhookTarget`.

## Checklist (one item per acceptance criterion group)

- [x] `lib/api/targets.ts`: wrappers call `apiRequest` with encoded ids, rejections pass through; `targetsQueryKey` does not start with `'services'` — `lib/api/targets.test.ts`
- [x] `useTargetList`: loading/list/empty/could-not-load/not-found (404 wins over cache), refreshFailed and `refresh()` — `features/alert-list/hooks/useTargetList.test.tsx`
- [x] `useRemoveTarget`: ask/cancel/replace/in-flight no-op, confirm once; 204 cache change with `dataUpdatedAt` kept, cancel of in-flight reload, 404 not_found refetch, 403 csrf toast + Reload, generic failures, 401 silent, no cached list, unmount — `features/alert-list/hooks/useRemoveTarget.test.tsx`
- [x] Screen: loading, list (3 rows, order, type text, chip, fallback names, full long name), singular sub line, NFR-7 text, empty, alerts-off banner, something-went-wrong, service-not-found + h2 focus, only `listTargets` decides not-found, id from address, Remove names, no Add/Edit — `features/alert-list/components/AlertList.test.tsx`
- [x] Removal flow: confirm group, focus, one question at a time, Cancel/Esc, in-flight state, both banners order, whitespace name, focus after 204/404/403/500/network, 401 — `features/alert-list/components/AlertList.test.tsx`
- [x] Dashboard: `Alerts {name}` link per row (paused, TCP, encoded id), delivery link — `features/service-list/components/ServiceList.test.tsx` (and ServiceRow rendered there)
- [x] `App.test.tsx`: alert-list route renders `AlertListPage`
- [ ] `make check` passes: **NOT fully passing, see below.** Frontend steps (lint, lint:css, 389 tests, tsc + build, openapi lint) all pass; only allowed paths changed; `package.json`/lockfile unchanged
- Integration tests (`make test-integration`): not run: no backend code touched; the task says none applies.

## Judgment calls

- **`make check` fails in `lint-backend` on code this task may not touch.** `backend/internal/handler/target_mapping.go:56-69` does not compile against the regenerated `backend/internal/api/api.gen.go` (`api.Target` no longer has `Id`, `LastDeliveryFailed`, `FromWebhookTargetInput`; `api.Webhook` and `api.Email` are undefined). It came in with the contract-fix commit on main (`9002110`); my branch changes nothing under `backend/`. The backend needs a fix by its own task or the user.
- **"Others keep their objects" (useRemoveTarget 204):** TanStack's structural sharing in `setQueryData` clones an element that moves position (the one after the removed row), so that test asserts the remaining list by content and order (`toStrictEqual`), not object identity. The first rows keep identity.
- **Removal answers carry a `closed` value** (`{ id, as: 'removed' | 'kept' }`, a new object per close) from `useRemoveTarget`, so `AlertList` can move focus once the removal has settled and the list has updated. Cancel and Esc use it too. A 401 sets none.
- **The refetch after a 404 `not_found` is not awaited**, so the removal settles at once; the not-found block then takes focus on mount.
- **`.alerts-banners:empty { margin-bottom: 0 }`** added (the live region is always rendered, empty, so its margin would otherwise show).
- **`targetsQueryKey` is `['alert-targets', serviceId]`** (task fixed only that it must not start with `'services'`).
- **`EmailTarget` and `WebhookTarget` types are also exported from `lib/api/targets.ts`** (from the generated schema) for the fixtures.
- **Tests named in the task but merged:** the "failed reload with rows on screen" and "both banners" criteria share one test (the reload fails through the 404-refetch path), since the page has no other reload while rows show.
- Toast text appears twice in the DOM (visible and a live region), so toast assertions use `findAllByText`.
- Integration tests: not run: no backend code touched and the task says none applies.

# Plan: alert list screen

Status: **BLOCKED before any code.** No acceptance criterion was started.

## Blocker (task file, "Prerequisite" and "Stop and ask when")

The `Target` contract fix has not been made. In `frontend/src/lib/api/schema.d.ts` (line 641) the generated type is still:

    Target: { type: "Target" } & (Omit<TargetInput, "type"> & { id; last_delivery_failed })

so `target.type` is the literal `"Target"` and `address`, `url` and `headers` are not reachable by `type`. `docs/openapi.yaml` (`Target`, line 1137, `allOf` of `TargetInput`) is unchanged on `origin/main` too (last change `f1d9f3f`). The task says to stop and say so. I may not edit `schema.d.ts` or `docs/openapi.yaml`, and working around it (a hand-written `Target` type) is forbidden by ARCHITECTURE.md ("API types").

Other prerequisites checked and present: `backend/internal/handler/targets.go`, `servicesQueryKey` in `lib/api/services.ts`, the route `/services/:serviceId/alerts` in `App.tsx`.

## Checklist (nothing started)

- [ ] `targets.ts`: `listTargets`/`deleteTarget` encode ids (`lib/api/targets.test.ts`)
- [ ] `targetsQueryKey` does not start with `'services'` (`lib/api/targets.test.ts`)
- [ ] `useTargetList` states, 404 wins, refreshFailed (`hooks/useTargetList.test.tsx`)
- [ ] `useRemoveTarget` ask/cancel/confirm, outcomes, cache, toasts (`hooks/useRemoveTarget.test.tsx`)
- [ ] Screen states, rows, removal flow, focus, banners, 401 (`components/AlertList.test.tsx`)
- [ ] Dashboard `Alerts` link and delivery link (`ServiceRow`/`ServiceList` tests)
- [ ] `App.test.tsx`: route renders `AlertListPage`
- [ ] `make check` passes; nothing outside allowed paths changed
- Integration tests: not run: no backend code touched; the task says none applies.

## Judgment calls

None yet; no code was written.

## To unblock

The user changes `Target` in `docs/openapi.yaml` so it is an email shape or a webhook shape (each with `id` and `last_delivery_failed`), runs `make generate`, and merges it. Then re-run this task.

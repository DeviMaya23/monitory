# Plan: dashboard screen

Branch: `feat/dashboard-screen`. Role: Frontend (`frontend/src/**` only). All Lucide icons named in the task exist in 1.73.0.

One item per acceptance criterion. Tick when done and passing.

## Failure reasons — `features/service-list/lib/failureReason.ts`, test `failureReason.test.ts`

- [ ] Seven codes, 503, json field, two null cases, unknown code (FR-61)

## Times — `features/service-list/lib/formatTime.ts`, test `formatTime.test.ts`

- [ ] Same day / same year / other year, midnight edges, other zone, later same year, later year, invalid string (FR-94)

## `useServiceList` — `features/service-list/hooks/useServiceList.ts`, test `useServiceList.test.tsx`

- [ ] loading, list, empty (FR-9)
- [ ] First load fails then `refresh()`; stays `could-not-load` in flight
- [ ] Failed refresh keeps data, banner flag, clears on success, last success time (FR-95)
- [ ] Refetch exactly at `REFRESH_INTERVAL_MS`, again after, after a failure, constant mocked to 2 min (FR-95)
- [ ] Server order kept

## The screen — `components/ServiceList.test.tsx`, `App.test.tsx`

- [ ] Loading state (skeletons, aria-busy, status, Add enabled, Refresh disabled/busy/spinner, heading line, meta)
- [ ] Could not load heading line and meta
- [ ] List rows, badges, chips, order (FR-9, FR-62)
- [ ] Paused: badge, no reason, public flag text (FR-77, FR-112)
- [ ] Failure reason shown / not shown (FR-61, FR-62)
- [ ] Alert delivery failed notice, paused or not, not a link (FR-86)
- [ ] Last check / last change: Never, —, `time` with `datetime` (FR-62, FR-94)
- [ ] Alerts and Public flags with hidden text and absent defaults (FR-62)
- [ ] `—` has `aria-label="None"`
- [ ] Meta minute count rounding (90,000 → 2, 80,000 → 1)
- [ ] Heading line 1 / 7 / none; meta Updated + auto every N min (FR-95)
- [ ] Empty state, two Add service links to `/services/new`
- [ ] Refresh click: one call, disabled + spinner + aria-busy, rows kept, re-enabled (FR-95)
- [ ] Failed refresh banner, Retry, cleared on success; Could not load banner
- [ ] 401 on refresh ends on sign-in with notice, `['services']` gone (FR-4) — `App.test.tsx`
- [ ] No Pause/Resume/Alerts/Edit/Delete, switch, Open link, no row link
- [ ] `/` shows the dashboard; other routes keep placeholders — `App.test.tsx`
- [ ] Markup in name and failure field rendered as text (NFR-7)

## Toast wrapper — `components/ui/Toast.tsx`, `useToast.ts`, test `Toast.test.tsx`

- [ ] Success gone at exactly 5,000 ms and not at 4,999; error announced via `role="alert"`, stays
- [ ] Dismiss removes; action shows, called once, toast removed

## Sign-out failures — `app-shell/SessionProvider.test.tsx`, `App.test.tsx`

- [ ] 403 csrf_failed toast + Reload calls `window.location.reload` once; stay signed in; button enabled (NFR-8)
- [ ] 500 / network error toast, no action, same outcome
- [ ] 401 and 204 show no toast and end on sign-in (FR-3)

## Repo-wide

- [ ] `make check` passes
- [ ] Only `frontend/src/**` and this plan changed; `package.json` and lockfile unchanged

## Integration tests

- Not applicable: the task touches no code with integration tests. `make test-integration`: not run: frontend-only task, no Go code changed.

## Judgment calls

(filled in at the end)

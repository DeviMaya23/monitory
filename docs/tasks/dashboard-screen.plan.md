# Plan: dashboard screen

Branch: `feat/dashboard-screen`. Role: Frontend (`frontend/src/**` only). All Lucide icons named in the task exist in 1.73.0.

One item per acceptance criterion. Tick when done and passing.

## Failure reasons — `features/service-list/lib/failureReason.ts`, test `failureReason.test.ts`

- [x] Seven codes, 503, json field, two null cases, unknown code (FR-61)

## Times — `features/service-list/lib/formatTime.ts`, test `formatTime.test.ts`

- [x] Same day / same year / other year, midnight edges, other zone, later same year, later year, invalid string (FR-94)

## `useServiceList` — `features/service-list/hooks/useServiceList.ts`, test `useServiceList.test.tsx`

- [x] loading, list, empty (FR-9)
- [x] First load fails then `refresh()`; stays `could-not-load` in flight
- [x] Failed refresh keeps data, banner flag, clears on success, last success time (FR-95)
- [x] Refetch exactly at `REFRESH_INTERVAL_MS`, again after, after a failure, constant mocked to 2 min (FR-95)
- [x] Server order kept

## The screen — `components/ServiceList.test.tsx`, `App.test.tsx`

- [x] Loading state (skeletons, aria-busy, status, Add enabled, Refresh disabled/busy/spinner, heading line, meta)
- [x] Could not load heading line and meta
- [x] List rows, badges, chips, order (FR-9, FR-62)
- [x] Paused: badge, no reason, public flag text (FR-77, FR-112)
- [x] Failure reason shown / not shown (FR-61, FR-62)
- [x] Alert delivery failed notice, paused or not, not a link (FR-86)
- [x] Last check / last change: Never, —, `time` with `datetime` (FR-62, FR-94)
- [x] Alerts and Public flags with hidden text and absent defaults (FR-62)
- [x] `—` has `aria-label="None"`
- [x] Meta minute count rounding (90,000 → 2, 80,000 → 1)
- [x] Heading line 1 / 7 / none; meta Updated + auto every N min (FR-95)
- [x] Empty state, two Add service links to `/services/new`
- [x] Refresh click: one call, disabled + spinner + aria-busy, rows kept, re-enabled (FR-95)
- [x] Failed refresh banner, Retry, cleared on success; Could not load banner
- [x] 401 on refresh ends on sign-in with notice, `['services']` gone (FR-4) — `App.test.tsx`
- [x] No Pause/Resume/Alerts/Edit/Delete, switch, Open link, no row link
- [x] `/` shows the dashboard; other routes keep placeholders — `App.test.tsx`
- [x] Markup in name and failure field rendered as text (NFR-7)

## Toast wrapper — `components/ui/Toast.tsx`, `useToast.ts`, test `Toast.test.tsx`

- [x] Success gone at exactly 5,000 ms and not at 4,999; error announced via `role="alert"`, stays
- [x] Dismiss removes; action shows, called once, toast removed

## Sign-out failures — `app-shell/SessionProvider.test.tsx`, `App.test.tsx`

- [x] 403 csrf_failed toast + Reload calls `window.location.reload` once; stay signed in; button enabled (NFR-8)
- [x] 500 / network error toast, no action, same outcome
- [x] 401 and 204 show no toast and end on sign-in (FR-3)

## Repo-wide

- [x] `make check` passes
- [x] Only `frontend/src/**` and this plan changed; `package.json` and lockfile unchanged

## Integration tests

- Not applicable: the task touches no code with integration tests. `make test-integration`: not run: frontend-only task, no Go code changed.

## Judgment calls

- **Toast placement.** `ToastProvider` wraps the whole `<Routes>` in `App.tsx` (so `/status` has it too), above `SessionProvider`, not only the admin routes.
- **Reload action.** The action button's click runs the caller's `onClick` and then closes the toast, so an used action removes the toast on every path.
- **Action button and `aria-hidden`.** The task says the action button is not hidden; in Base UI 1.9.0 it sits inside the error toast's root, which is `aria-hidden` until focused, so tests focus the toast first and then find `Reload` by role.
- **Time shown in the toolbar and banner.** It is `formatTime` of the last response (`dataUpdatedAt`) against the render time, so a response from yesterday shows with its date, as the task's "today's format" implies.
- **Skeleton row markup.** Fixed pixel sizes of the board's skeleton cells live in `service-list.css`, only the per-row name widths (percentages) are inline. The flags skeleton has its own class (`skeleton--flags`) because `.svc__flags` is `display: contents` on wide screens and would hide it; the unused last empty cell of the board's seven-column row is dropped.
- **`.svc-list > ul` reset.** Added `margin: 0; padding: 0; list-style: none` for the list, which the board gets from its own reset.
- **`ServiceList` takes the hook's view as one prop** (`view`), and reads `REFRESH_INTERVAL_MS` itself for the minute count; the hook returns no interval.
- **Tests set no locale for the row times.** `ServiceList.test.tsx` compares the row text with `formatTime` called with the viewer's defaults (formatting itself is pinned in `formatTime.test.ts` with `en-GB` and `UTC`), so the test passes in any locale and zone.
- **Integration tests:** not run: frontend-only task, no Go code or integration test touched.
- `make check`: run, passed.

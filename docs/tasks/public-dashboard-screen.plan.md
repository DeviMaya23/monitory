# Plan: public dashboard screen

Branch: `feat/public-dashboard-screen`. Role: Frontend (`frontend/src/**` only).

One item per acceptance criterion. Tick when done and passing.

## API wrapper — `lib/api/publicDashboard.ts`, test `publicDashboard.test.ts`

- [x] `getPublicDashboard` sends `GET /api/public/dashboard`, returns body; 404 `public_view_unavailable` and 429 with `Retry-After: 23` reject as `ApiError` (FR-29, FR-32)

## Times — `lib/formatTime.ts`, test `lib/formatTime.test.ts`

- [x] Existing `formatTime` tests unchanged from the new path; old files gone; dashboard tests pass (FR-94)

## `usePublicDashboard` — `features/public-dashboard/hooks/usePublicDashboard.ts`, test `usePublicDashboard.test.tsx`

- [x] loading + fetching; 200 list; 200 empty (FR-28)
- [x] First load failure (network, 500, 404 other code, 404 no body) is could-not-load, refresh() retries, stays could-not-load in flight
- [x] Failed refresh keeps data, sets refreshFailed, cleared on success; lastSuccessAt (FR-30)
- [x] Refetch at exactly REFRESH_INTERVAL_MS, again, after failure, constant mocked to 2 min (FR-31)
- [x] Server order kept
- [x] 404 public_view_unavailable on first load and on refresh: unavailable, services empty, no further refetch (FR-29)
- [x] 429 Retry-After 23 countdown, single call at 23 s, success clears, second 429 with 5 starts new countdown (FR-32)
- [x] 429 over data keeps data; 429 on first load is could-not-load with rateLimit
- [x] 429 with no usable header: `{ secondsLeft: null }`, no auto call before interval
- [x] Success clears rateLimit, no stale timer call; unmount during countdown makes no call
- [x] Countdown holds back the interval (3600; 23 then resume)
- [x] 429 remembered while refetch in flight (first load, manual Retry, no body, other code)

## The screen — `components/PublicDashboard.test.tsx`, `App.test.tsx`

- [x] Every state has h1
- [x] Loading
- [x] List: rows, order, summary variants, meta, foot (FR-28, FR-63, FR-94)
- [x] Constant mocked: 2 min, 90 000 ms, 80 000 ms (FR-31)
- [x] Only name, status, last check rendered (FR-40, FR-63)
- [x] HTML name as text; 100-char name in full (NFR-7)
- [x] Empty
- [x] Unavailable; no refetch (FR-29)
- [x] Unavailable replaces data (FR-29)
- [x] Refresh click (FR-30)
- [x] Failed refresh banner and Retry
- [x] Could not load
- [x] 429 over rows (FR-32)
- [x] 429 one second
- [x] 429 over nothing
- [x] 429 without usable header
- [x] No admin chrome
- [x] Routes in `App.test.tsx`: no sign-in, no getSession, signed in, signed out, 401 shows could-not-load
- [x] Admin routes unchanged

## Repo-wide

- [x] `make check` passes (636 frontend tests; one first run hit a 5 s timeout in `alert-list/TargetDialog.test.tsx` under load, it passed alone and on the rerun)
- [x] Only allowed paths changed; package files untouched; alert-list and service-form untouched
- [x] Integration tests: not run: no integration tests apply; the task changes `frontend/src/` only

## Judgment calls

- The hook uses one `useQuery` whose `refetchInterval` is `held ? false : REFRESH_INTERVAL_MS`; the 429 countdown is a once-a-second timer per 429 answer that refreshes when the elapsed time reaches `Retry-After`.
- `.tabular` was not defined anywhere, so `public-dashboard.css` defines it scoped as `.pub .tabular` (tabular numbers).
- Skeleton rows reuse the board's `.pub-row` markup in a `ul.pub-list`; the inline sizes became `.pub-skeleton__*` classes.
- Rows are keyed by index, as the task says; a comment in the code explains.
- Component tests drive the page through the real hook with `getPublicDashboard` mocked, not a hand-built view, so the countdown is tested end to end.
- The `/status` 401 test mocks `getPublicDashboard` rejecting with a problem; `request.ts` is mocked in `App.test.tsx` as before.
- All Lucide icons named in the task exist under those names in the installed version.

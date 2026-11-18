# Plan: public dashboard screen

Branch: `feat/public-dashboard-screen`. Role: Frontend (`frontend/src/**` only).

One item per acceptance criterion. Tick when done and passing.

## API wrapper — `lib/api/publicDashboard.ts`, test `publicDashboard.test.ts`

- [ ] `getPublicDashboard` sends `GET /api/public/dashboard`, returns body; 404 `public_view_unavailable` and 429 with `Retry-After: 23` reject as `ApiError` (FR-29, FR-32)

## Times — `lib/formatTime.ts`, test `lib/formatTime.test.ts`

- [ ] Existing `formatTime` tests unchanged from the new path; old files gone; dashboard tests pass (FR-94)

## `usePublicDashboard` — `features/public-dashboard/hooks/usePublicDashboard.ts`, test `usePublicDashboard.test.tsx`

- [ ] loading + fetching; 200 list; 200 empty (FR-28)
- [ ] First load failure (network, 500, 404 other code, 404 no body) is could-not-load, refresh() retries, stays could-not-load in flight
- [ ] Failed refresh keeps data, sets refreshFailed, cleared on success; lastSuccessAt (FR-30)
- [ ] Refetch at exactly REFRESH_INTERVAL_MS, again, after failure, constant mocked to 2 min (FR-31)
- [ ] Server order kept
- [ ] 404 public_view_unavailable on first load and on refresh: unavailable, services empty, no further refetch (FR-29)
- [ ] 429 Retry-After 23 countdown, single call at 23 s, success clears, second 429 with 5 starts new countdown (FR-32)
- [ ] 429 over data keeps data; 429 on first load is could-not-load with rateLimit
- [ ] 429 with no usable header: `{ secondsLeft: null }`, no auto call before interval
- [ ] Success clears rateLimit, no stale timer call; unmount during countdown makes no call
- [ ] Countdown holds back the interval (3600; 23 then resume)
- [ ] 429 remembered while refetch in flight (first load, manual Retry, no body, other code)

## The screen — `components/PublicDashboard.test.tsx`, `App.test.tsx`

- [ ] Every state has h1
- [ ] Loading
- [ ] List: rows, order, summary variants, meta, foot (FR-28, FR-63, FR-94)
- [ ] Constant mocked: 2 min, 90 000 ms, 80 000 ms (FR-31)
- [ ] Only name, status, last check rendered (FR-40, FR-63)
- [ ] HTML name as text; 100-char name in full (NFR-7)
- [ ] Empty
- [ ] Unavailable; no refetch (FR-29)
- [ ] Unavailable replaces data (FR-29)
- [ ] Refresh click (FR-30)
- [ ] Failed refresh banner and Retry
- [ ] Could not load
- [ ] 429 over rows (FR-32)
- [ ] 429 one second
- [ ] 429 over nothing
- [ ] 429 without usable header
- [ ] No admin chrome
- [ ] Routes in `App.test.tsx`: no sign-in, no getSession, signed in, signed out, 401 shows could-not-load
- [ ] Admin routes unchanged

## Repo-wide

- [ ] `make check` passes
- [ ] Only allowed paths changed; package files untouched; alert-list and service-form untouched
- [ ] Integration tests: not run: task touches frontend only; no integration-tagged code

## Judgment calls

(filled in at the end)

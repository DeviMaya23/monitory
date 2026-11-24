# Plan: sign-in locked screen

Branch: feat/sign-in-locked-screen

All paths are under `frontend/src/features/sign-in/`.

## Acceptance criteria

### formatWait
- [ ] Every row of the table, including 0 — `lib/formatWait.ts`, test `lib/formatWait.test.ts`

### useSignIn
- [ ] 429 `sign_in_locked` with retryAfter 292 gives `locked`/292, values kept — `hooks/useSignIn.ts`, `hooks/useSignIn.test.tsx`
- [ ] 429 locked with null, locked with 0, `rate_limited` with 30 give `unexpected` — same test file (old 429 row becomes the null case)
- [ ] While locked `submit` and `retry` do not call `signIn`; after `clearFailure()` submit does; non-lock failure still submits — same test file
- [ ] `clearFailure` identity is stable — same test file
- [ ] Second locked failure with same seconds is a new object — same test file

### useLockCountdown
- [ ] Returns full wait at once; `null` and no timer for null — `hooks/useLockCountdown.ts`, `hooks/useLockCountdown.test.tsx`
- [ ] 1 s → 291, 291 s → 1, callback not run — same test
- [ ] Boundary at 292 s vs 1 ms less — same test
- [ ] Clock jump of 200 s gives 92 — same test
- [ ] Callback runs once only — same test
- [ ] New failure object restarts — same test
- [ ] One timer at a time (1, 1 after restart, 0 at end) — same test
- [ ] New callback identity does not restart — same test
- [ ] Unmount clears timer, callback never runs — same test

### SignInForm
- [ ] Locked banner: alert, title, `Try again in 4 min 52 s.`, `.signin__wait` with `aria-live="off"`, no Retry, one banner — `components/SignInForm.tsx`, `components/SignInForm.test.tsx`
- [ ] Button disabled and reads Sign in; fields enabled with values; focus in Password — same test
- [ ] After 1 s `4 min 51 s`; after 292 s banner gone, button enabled, values kept, focus still Password — same test
- [ ] 1 ms before the end banner and disabled button remain — same test
- [ ] `fireEvent.submit` during the lock sends nothing — same test
- [ ] After the lock a submit calls `signIn` again; second 429 with 60 shows `1 min 0 s`, one banner — same test
- [ ] 429 locked without Retry-After and `rate_limited` still show the unexpected banner, Retry focused — same test
- [ ] Locked outranks `unreachable`; unreachable banner appears when the countdown ends — same test
- [ ] Banner text holds neither typed username nor password (FR-1) — same test
- [ ] Unmount during the lock leaves no timer — same test
- [ ] Existing criteria for other states unchanged — existing tests, untouched

### Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside `frontend/src/features/sign-in/` changed (plus this plan file); manifest and lockfile unchanged
- [ ] Integration tests: not run: task is frontend-only, no code with integration tests is touched

## Judgment calls
(filled in at the end)

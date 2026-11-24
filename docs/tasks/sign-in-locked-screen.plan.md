# Plan: sign-in locked screen

Branch: feat/sign-in-locked-screen

All paths are under `frontend/src/features/sign-in/`.

## Acceptance criteria

### formatWait
- [x] Every row of the table, including 0 — `lib/formatWait.ts`, test `lib/formatWait.test.ts`

### useSignIn
- [x] 429 `sign_in_locked` with retryAfter 292 gives `locked`/292, values kept — `hooks/useSignIn.ts`, `hooks/useSignIn.test.tsx`
- [x] 429 locked with null, locked with 0, `rate_limited` with 30 give `unexpected` — same test file (old 429 row becomes the null case)
- [x] While locked `submit` and `retry` do not call `signIn`; after `clearFailure()` submit does; non-lock failure still submits — same test file
- [x] `clearFailure` identity is stable — same test file
- [x] Second locked failure with same seconds is a new object — same test file

### useLockCountdown
- [x] Returns full wait at once; `null` and no timer for null — `hooks/useLockCountdown.ts`, `hooks/useLockCountdown.test.tsx`
- [x] 1 s → 291, 291 s → 1, callback not run — same test
- [x] Boundary at 292 s vs 1 ms less — same test
- [x] Clock jump of 200 s gives 92 — same test
- [x] Callback runs once only — same test
- [x] New failure object restarts — same test
- [x] One timer at a time (1, 1 after restart, 0 at end) — same test
- [x] New callback identity does not restart — same test
- [x] Unmount clears timer, callback never runs — same test

### SignInForm
- [x] Locked banner: alert, title, `Try again in 4 min 52 s.`, `.signin__wait` with `aria-live="off"`, no Retry, one banner — `components/SignInForm.tsx`, `components/SignInForm.test.tsx`
- [x] Button disabled and reads Sign in; fields enabled with values; focus in Password — same test
- [x] After 1 s `4 min 51 s`; after 292 s banner gone, button enabled, values kept, focus still Password — same test
- [x] 1 ms before the end banner and disabled button remain — same test
- [x] `fireEvent.submit` during the lock sends nothing — same test
- [x] After the lock a submit calls `signIn` again; second 429 with 60 shows `1 min 0 s`, one banner — same test
- [x] 429 locked without Retry-After and `rate_limited` still show the unexpected banner, Retry focused — same test
- [x] Locked outranks `unreachable`; unreachable banner appears when the countdown ends — same test
- [x] Banner text holds neither typed username nor password (FR-1) — same test
- [x] Unmount during the lock leaves no timer — same test
- [x] Existing criteria for other states unchanged — existing tests, untouched

### Repo-wide
- [x] `make check` passes
- [x] Nothing outside `frontend/src/features/sign-in/` changed (plus this plan file); manifest and lockfile unchanged
- [x] Integration tests: not run: task is frontend-only, no code with integration tests is touched (`make test-integration` covers Go code only)

## Judgment calls
- **End time taken in a layout effect, not during render.** The task asks for the end time to be fixed during render, but the repo's lint (`react-hooks/purity`, `react-hooks/refs`) rejects `Date.now()` and ref reads in render, and `eslint-disable` is banned. `useLockCountdown` therefore takes the end time in `useLayoutEffect`, before the first paint, and returns the failure's own `seconds` until the first tick. The first value shown is still the full wait.
- **The countdown shows `null` at 0 even if `onEnd` leaves the failure in place**, so the banner never shows `0 s`. The form also requires a non-null `remaining` for the banner and the disabled button.
- **`submit` during the lock calls `preventDefault` and resolves**, so a native form submit does not reload the page.
- **Timer-count test on the form** compares against the count left by an unmounted idle form, because one timer from the test environment survives an unmount there; the hook's own test asserts 0.
- **Formatting.** An earlier commit on this branch accidentally reformatted existing files with Prettier's defaults; a follow-up commit restores them, so the final diff against the default branch holds only the intended changes.

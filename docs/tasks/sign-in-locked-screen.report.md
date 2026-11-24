# Verification report: sign-in locked screen

Branch: `verify/sign-in-locked-screen` (this session's branch, reset onto `origin/feat/sign-in-locked-screen` at `f67ac27`; the verifier's commits sit on top).
Task: `docs/tasks/sign-in-locked-screen.md`. Plan: `docs/tasks/sign-in-locked-screen.plan.md`.

**Verdict: no Blocking findings.**

## Results of the runs

| Run | Result |
|---|---|
| `make check` | **Passed** on the third run (85 test files, 1447 tests, lint, contract lint, builds). The first two runs failed: 7 and 8 tests timed out at 5 s in `AddServiceForm.test.tsx` and `ServiceForm.test.tsx`, files this branch does not touch. The machine load average was 30 to 58 (other sessions). The same tests pass alone and with `--maxWorkers=3` (85 files, 1440 tests). The pass was with load at about 20. See N1 |
| Integration tests (`make test-integration`) | **Not run: not applicable.** The task changes only `frontend/src/features/sign-in/`, and no Go code or integration test is touched. No criterion depends on integration tests |
| Live run in a browser | **Not run.** The verifier has no browser. Everything below comes from reading the code and from tests |
| Dependencies | `package.json` and the lockfile are unchanged. `npm ci` was run in this checkout and left the tree clean |

Tests added by the verifier (existing test files, table rows or subtests only; no source change):

- `hooks/useLockCountdown.test.tsx`: "restarts the timer itself on a new object with the same seconds, not only the shown value".
- `hooks/useSignIn.test.tsx`: a row in the "maps … to unexpected" table, "a non-429 status carrying sign_in_locked and a Retry-After".
- `components/SignInForm.test.tsx`: an `it.each` over waits of 1, 59, 60, 61 and 900 s (text, locked 1 ms before the end, open at the end).

## Criteria

"Real?" = would the test fail if the behaviour were removed? Yes means it did fail in a mutation run (see Mutation checks) or the behaviour is directly asserted.

| # | Criterion | Test (file > name) | Real? | Status |
|---|---|---|---|---|
| 1 | `formatWait` gives each table row, including 0 | `lib/formatWait.test.ts` > `formats %i seconds as %s` (8 rows) | Yes (M16 fails the 60 row) | Met |
| 2 | 429 `sign_in_locked` with 292 gives `locked`/292, values kept (FR-2) | `useSignIn.test.tsx` > maps a 429 sign_in_locked with a Retry-After to locked… | Yes (M10, M1 both break the mapping family) | Met |
| 3 | Locked with `null`, with 0, and `rate_limited` with 30 give `unexpected` | `useSignIn.test.tsx` > `maps %s to unexpected…` (rows null, 0, rate_limited 30) | Yes (M1 fails the 0 row; M10 fails the `rate_limited` row) | Met |
| 4 | While locked `submit` and `retry` call `signIn` zero more times; after `clearFailure` a submit does; a non-lock failure still submits (FR-2) | `useSignIn.test.tsx` > sends nothing from submit or retry while locked… and > still submits after a failure that is not the lock | Yes (M4 and M4b each fail it) | Met |
| 5 | `clearFailure` keeps its identity | `useSignIn.test.tsx` > keeps the identity of clearFailure across renders | Yes (M11) | Met |
| 6 | A second locked failure with the same seconds is a new object | `useSignIn.test.tsx` > gives a second lock with the same seconds as a new object | Partly: it checks `not.toBe`, which holds because each `toFailure` call builds an object literal. It would fail only if the hook cached the object. Cheap, fine | Met |
| 7 | Hook returns 292 at once; `null` with no timer for `null` | `useLockCountdown.test.tsx` > returns the full wait at once, and null with no timer… | Yes (M17 ignores state and still passes this one, but M2/M5 families cover the rest). The `null`/no-timer half is directly asserted | Met |
| 8 | After 1 s 291; after 291 s 1; callback not run | `useLockCountdown.test.tsx` > counts down from the clock without running the callback early | Yes (M5a, M17) | Met |
| 9 | Boundary: at 292 s callback run once and `null`; 1 ms less it has not | `useLockCountdown.test.tsx` > ends at exactly the wait, and not one millisecond before | Yes (M5a early, M5b late, M14) | Met |
| 10 | Clock jump of 200 s then 500 ms gives 92 | `useLockCountdown.test.tsx` > reads the clock, not the ticks… | Yes (M2) | Met |
| 11 | Callback runs once however long timers advance | `useLockCountdown.test.tsx` > runs the callback once however long… | Yes (M14 removes the call; and the interval is cleared at 0, so a removed `clearInterval` on end would also be caught by the one-timer test, M5b) | Met |
| 12 | A new failure object restarts it from its own seconds | `useLockCountdown.test.tsx` > restarts from its own seconds on a new failure object… (builder) plus > restarts the timer itself on a new object with the same seconds (verifier) | Builder's test: **No**. It passed under M9 (the timer was not restarted, only the shown value). Verifier's added test: Yes (M9 fails it) | Met (after the added test) |
| 13 | One timer at a time: 1, 1 after restart, 0 at the end | `useLockCountdown.test.tsx` > keeps one timer at a time… | Yes (M5b, M6) | Met |
| 14 | A callback with a new identity does not restart it | `useLockCountdown.test.tsx` > does not restart for a callback with a new identity | Yes (M12) | Met |
| 15 | Unmount clears the timer and the callback never runs | `useLockCountdown.test.tsx` > clears the timer on unmount and never runs the callback | Yes (M6) | Met |
| 16 | Locked banner: `role="alert"`, title, `Try again in 4 min 52 s.`, `.signin__wait` with `aria-live="off"`, no Retry, one banner (FR-2) | `SignInForm.test.tsx` > shows the locked banner with the time, and nothing else (FR-2) | Yes (M13 fails on `aria-live`; M15 fails when the banner is absent) | Met |
| 17 | Button disabled and still reads Sign in; fields enabled with values; focus in Password (FR-2) | `SignInForm.test.tsx` > disables the button, keeps the fields enabled… | Yes (M3, M7, M8) | Met |
| 18 | After 1 s `4 min 51 s`; after 292 s banner gone, button enabled, values kept, focus still Password | `SignInForm.test.tsx` > counts down, and at the end removes the banner… | Yes (M7, M14, M15, M17) | Met |
| 19 | 1 ms before the end banner and disabled button remain | `SignInForm.test.tsx` > is still locked one millisecond before the end (and the added `it.each`) | Yes (M3, M5a) | Met |
| 20 | `fireEvent.submit` during the lock sends nothing | `SignInForm.test.tsx` > sends nothing when the form is submitted during the lock (FR-2) | Yes (M4) | Met |
| 21 | After the lock a submit calls `signIn` again with the same values; a second 429 with 60 shows `1 min 0 s`, one banner (FR-2) | `SignInForm.test.tsx` > submits again after the lock, and a new lock replaces the old… | Yes (M5b, M14, M15, M16) | Met |
| 22 | 429 `sign_in_locked` without `Retry-After` and `rate_limited` still show `Can’t reach the server.` with Retry focused | `SignInForm.test.tsx` > outcomes > `%s shows the unexpected banner, focuses Retry…` (rows: null, 0, rate_limited 30) | Yes (M1, M10) | Met |
| 23 | Locked outranks `unreachable`; the unreachable banner appears when the countdown ends | `SignInForm.test.tsx` > outranks the unreachable banner, which appears when the countdown ends | Yes (M5b, M14, M15) | Met |
| 24 | Banner text holds neither the typed username nor the password (FR-1) | `SignInForm.test.tsx` > repeats neither the typed username nor the password (FR-1) | Passes without the behaviour unless the banner prints credentials, and the banner code has no access to them. It guards against a future change; it cannot fail today. Acceptable for a "does not leak" criterion | Met |
| 25 | Unmounting during the lock leaves no timer | `SignInForm.test.tsx` > leaves no timer when unmounted during the lock | Yes (M6). Deviation: the test compares to a baseline (see N2) instead of asserting `0` | Met (see N2) |
| 26 | Existing criteria for other states pass with no change in what they assert | Existing tests in the three files | Yes: the diff only replaces the 429 rows as the task allows and adds new rows | Met |
| 27 | `make check` passes | see Results | Third run passed; first two failed on unrelated timeouts under load | Met (see N1) |
| 28 | Nothing outside `frontend/src/features/sign-in/` changed (plus the plan); manifest and lockfile unchanged | `git diff main...HEAD --name-only`: ten files, all under the feature folder plus `docs/tasks/sign-in-locked-screen.plan.md` | n/a | Met |

Requirement IDs: FR-2 (screen half) is covered by rows 2, 4, 16 to 21, 23. FR-1 (no credential in the banner) by row 24, which is a guard rather than a proof.

## Plan check

Read after judging the code against the task file.

- Every criterion in the task file is in the plan, and every ticked item names a test that exists. No ticked item points at a missing test.
- Weak ticks: "A new failure object restarts it" (row 12): the named test passes with the timer not restarted. Fixed here by an added test. "Banner text holds neither typed value" is a guard that cannot fail today (row 24). "Unmount leaves no timer" is ticked, but the test does not assert 0 as the task says (N2).
- "`make check` passes" is ticked. It passed here only on the third run (N1).
- Differences between plan and diff: none found. The plan's five judgment calls match the code:
  - end time taken in `useLayoutEffect` rather than in render (N3);
  - `null` returned at 0;
  - `preventDefault` in the guarded `submit`;
  - timer-count test compared with a baseline;
  - formatting restored by `f67ac27`.
- The plan says nothing about the `rate_limited` and `retryAfter` 0 extra rows in `SignInForm.test.tsx`; they are an addition to the task's list and correct.

## Rule checks

- **Dependencies:** none added; `package.json` and `package-lock.json` unchanged; `lucide-react`'s `Lock` was already available. No version adopted, nothing to record in `STACK.md`.
- **Time rule:** `Date.now` and `setInterval` appear in source only in `hooks/useLockCountdown.ts` (and in tests). No `setTimeout` in source. The remaining time is `max(0, ceil((end - Date.now()) / 1000))` from a fixed end time, never decremented. The interval is cleared in the effect cleanup and when the countdown ends. Tick is 500 ms.
- **Codes, not text:** `toFailure` tests `status`, `code`, `retryAfter`; it does not read `message`, the problem's `title` or the header.
- **No `dangerouslySetInnerHTML`;** the time is a text child. No `eslint-disable`, no `@ts-` suppressions (grep over the diff).
- **Generated types:** no hand-written mirror of a generated type; nothing under `lib/api/**`, `app-shell/**`, `pages/**`, `App.tsx` or `styles/**` changed.
- **Button and fields:** the button's `disabled` is `locked || lockActive`; both fields keep `disabled={locked}` (M8 shows the test would catch a change).
- **CSS:** one rule, `.signin__wait`, equal to the board's rule, tokens only. No board class (`state`, `frame`, `board-*`) copied; no board markup copied. The banner uses the existing `banner banner--error`, `banner__body`, `banner__title` classes.
- **Other banners:** the diff does not change the text, icon or role of the other four banners.
- **Layering and conventions:** no backend change; the hook is the only place with timer logic; the component only reads it. No data scoping or transaction rules apply to a frontend-only diff.
- **Structure:** `lib/formatWait.ts` is in the feature's `lib/` as the task says. Nothing new at top level.
- **Lint:** `make lint` (eslint, stylelint) passes with the new files.

## Mutation checks run

All run against the sign-in tests only, each reverted afterwards (`git status` clean of source changes).

| Mutation | Result |
|---|---|
| M1 drop `retryAfter >= 1` | Fails: `useSignIn` and form rows for `retryAfter` 0 |
| M1b drop `status === 429` | **Survived** the builder's tests. Killed after adding the non-429 row |
| M2 count ticks instead of reading the clock | Fails: the `setSystemTime` jump test |
| M3 stop disabling the button during the lock | Fails: the disabled test and the 1 ms test |
| M4 let `submit` call `signIn` while locked | Fails: the `useSignIn` guard test and the form-submit test |
| M4b let `retry` call `signIn` while locked | Fails: the `useSignIn` guard test |
| M5a clear one tick early | Fails: three tests, including both boundary tests |
| M5b clear one tick late | Fails: four tests, including the hook boundary test |
| M6 never clear the timer on unmount | Fails: four tests (unmount, one-timer, no-timer) |
| M7 focus Username on the locked outcome | Fails: the focus test and two others |
| M8 disable the fields during the lock | Fails: the fields-enabled test |
| M9 do not restart on a new failure object | **Survived** the builder's tests. Killed after adding the same-seconds restart test |
| M10 treat `rate_limited` as locked | Fails: `useSignIn` and form `rate_limited` rows |
| M11 `clearFailure` not stable | Fails: the identity test |
| M12 a new callback identity restarts the countdown | Fails: the callback-identity test |
| M13 remove `aria-live="off"` | Fails: the banner test |
| M14 never call `onEnd` | Fails: five tests |
| M15 never render the locked banner | Fails: five tests |
| M16 format 60 as `60 s` | Fails: `formatWait` and the form relock row |
| M17 ignore the shown state (always the full wait) | Fails: six tests |

## Edge cases tried beyond the task's list

- Waits of 1, 59, 60, 61 and 900 s through the form, with the text, 1 ms before the end and at the end (added `it.each`): all pass.
- Two locks in a row (5 s then 60 s): covered by the builder's test and passes.
- A lock that ends while the session state is unreachable: covered and passes.
- A 403 carrying `sign_in_locked` and a `Retry-After`: now covered, stays `unexpected`.
- A lock object with the same seconds arriving while the timer runs: the timer restarts (added test).
- Strict-mode double effect: the layout effect cleans up and re-runs; each run reads the clock again, so the end time moves by at most the gap between the two runs. Not a defect.
- Concurrent writes and malformed input: there is no storage or user input beyond the `Retry-After` the existing `ApiError` already normalises.

## Findings

### Blocking

None.

### Non-blocking

**N1. Frontend suite timeouts under machine load.** Category: test quality. 5 s timeouts hit `AddServiceForm.test.tsx` (7 tests) and `ServiceForm.test.tsx` (1 test) twice in a row when the load average was 30 to 58; they pass alone and with fewer workers. Not caused by this branch (no file in those features changed). Matters when: CI or a builder's machine runs `make check` with several test processes at once. Reproduce: run `make check` while the machine is busy.

**N2. The form's unmount test measures against a baseline, not 0.** Category: test quality. The task asks for `vi.getTimerCount()` of 0 after unmount; the test compares with one leftover timer from the idle form (likely from the test environment's scheduler; the hook's own test asserts 0). The test still fails if the countdown timer leaks (M6). Matters when: a timer of the feature's own appears in the idle form; the baseline would hide it. Report only.

**N3. The end time is taken in a layout effect, not during render.** Category: decision needed. The task says "fixed during the render … not in an effect". The plan explains the lint rules (`react-hooks/purity`, `react-hooks/refs`) forbid it and `eslint-disable` is banned. Behaviour matches: the first value is the full wait and the clock is read just before the first paint. Matters when: the drafter wants the task text and the code aligned; the task wording could say "before the first paint".

**N4. The FR-1 test cannot fail with today's code.** Category: test quality. The banner has no access to the typed values. Matters when: a later change passes the username into the banner. Report only.

## Docs or specs that no longer match

- `docs/openapi.yaml`: nothing; the `429 sign_in_locked` with `Retry-After` is already in the contract (lines 53, 92, 98).
- `docs/requirements.md`: nothing.
- `STACK.md`: no version adopted; nothing to record.
- `docs/tasks/backlog.md`, milestone 5 table, FR-2 row: still accurate ("the locked state is on screen" remains for the end-to-end task). The `sign-in-screen` item about focus effects in `SignInForm` now also covers one more branch (`locked`) in the same effect; the item's trigger is unchanged.
- `docs/tasks/sign-in-locked-screen.md` ("Structure"): says the end time is fixed during render; the code does it in a layout effect (N3).

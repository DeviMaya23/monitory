# Task: sign-in locked screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

When the server answers `signIn` with `429 sign_in_locked`, the sign-in screen shows the "Locked after 5 failures" state from the board: an error banner `Too many failed attempts.` with a live countdown, the Sign in button disabled until the countdown reaches zero, and then the banner removed and the button enabled again. Today that response falls into the unexpected-error banner (`Can’t reach the server.`).

Requirements covered:

- FR-2, the screen's half: a locked account's wait is shown to the admin and the form cannot be submitted during it. The server half is `sign-in-lockout-api`.
- FR-1, in part: the locked banner repeats no credential that was typed.

Out of scope:

- The server side (`sign-in-lockout-api`). This task runs against mocks of the 429 and does not wait for it.
- Remembering a lock across a page reload. The browser knows about a lock only from the last `429` it received (see "Known gaps").
- The keyboard and screen-reader journeys (NFR-4) and the end-to-end journey for the lockout. Both belong to the milestone 5 end-to-end task and the manual check (`backlog.md`).
- Moving the three existing focus effects and four refs of `SignInForm` into a hook. That is a tracked backlog item for a later task; this task adds to the component only what it needs (see "Structure").
- `frontend/src/lib/api/request.ts`, `App.tsx`, the session provider and every other screen. None changes.

## Prerequisite

All merged on the default branch (they are today). The builder checks the names and stops to ask if one is missing:

- `frontend/src/features/sign-in/` with `components/SignInForm.tsx`, `hooks/useSignIn.ts`, `sign-in.css` and their tests.
- `ApiError` in `frontend/src/lib/api/ApiError.ts` with `status`, `code`, `problem` and `retryAfter` (seconds, from a whole-number `Retry-After` header on a 429; otherwise `null`), and `apiRequest` filling it (`lib/api/request.ts`, tested in `request.test.ts`).
- The generated `ProblemCode` in `frontend/src/lib/api/schema.d.ts` containing `sign_in_locked`.
- `.signin*` rules in `features/sign-in/sign-in.css` and the `.banner`, `.banner--error`, `.banner__body`, `.banner__title` classes in `frontend/src/styles/components.css`.
- The Lucide `Lock` icon.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/sign-in/**`. You may not change anything else under `frontend/src/` (in particular `lib/api/**`, `app-shell/**`, `pages/**`, `App.tsx`, `App.test.tsx`, `styles/**`, `components/**`), `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/sign-in-locked-screen.plan.md`), or anything else outside `frontend/src/features/sign-in/`.

Shared files: none outside the feature folder. This task owns `features/sign-in/**` while it runs.

Tasks that may run at the same time: `sign-in-lockout-api` (backend only), `frontend-test-hardening` (frontend test files elsewhere: it is planned to touch `AddServiceForm.test.tsx` and `App.test.tsx` and no file under `features/sign-in/`), and `m4-e2e-journeys` (`e2e/**` only). If you find you need `App.test.tsx` or any file outside the feature folder, stop and ask.

## Operations used

From `docs/openapi.yaml`. On the server, `signIn` does not answer `429 sign_in_locked` until `sign-in-lockout-api` merges; this task is built and tested against mocked errors. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles (changes only) |
|---|---|---|
| `signIn` | `POST /api/session` | `429 sign_in_locked` with header `Retry-After` (integer, at least 1, seconds): the locked state. Every other response is handled as today |

The contract's 429 for `signIn` carries the `Problem` body (code `sign_in_locked`, title `Sign-in locked`) and `Retry-After`. The screen reads the code and the header only; the title is not shown.

## Behavior

### What exists

- `useSignIn` (`hooks/useSignIn.ts`) turns each outcome of `signIn` into a `SignInFailure`: `invalid-credentials`, `https-required` or `unexpected`. A 429 of any code is `unexpected` today. `SignInForm` shows one banner at a time in an always-present live region (`aria-live="polite"`), by precedence: the last submit's failure, then the unreachable-session banner, then the "session ended" notice.
- `apiRequest` already puts the whole-number `Retry-After` of a 429 into `ApiError.retryAfter` (`null` when absent, empty, a date or a fraction).
- Two existing tests list `429 sign_in_locked` among the failures that show `Can’t reach the server.`: `hooks/useSignIn.test.tsx` and `components/SignInForm.test.tsx`. This task changes them (see "Tests this task changes on purpose").

### When the locked state applies

The outcome is "locked" when `signIn` rejects with an `ApiError` whose `status` is 429, whose `code` is `sign_in_locked` and whose `retryAfter` is a whole number of at least 1. The wait is that number of seconds.

Anything else that is a 429 stays the unexpected-error banner, exactly as today: a `sign_in_locked` without a usable `Retry-After` (`null` or 0), and a 429 with any other code (`rate_limited`, none). The contract promises a header of at least 1; this is the defensive branch, and it is decided here.

### The countdown

- It starts when the locked outcome arrives: the end time is the current time (`Date.now()`) plus the wait in seconds. The server rounds the wait up, and the end is taken after the response arrived, so the screen never unlocks before the server does.
- The remaining time is always computed from the end time and the current time, never by counting ticks: `remaining = max(0, ceil((end − now) / 1000))` whole seconds. A throttled or paused tab therefore shows the right value as soon as it ticks again. The first value shown is the wait itself, with no flash of another value.
- The clock is read every 500 ms while the countdown runs, and the page changes only when the shown text changes. One timer runs at a time; it is cleared when the countdown ends and when the component unmounts. Time comes from `Date.now()` and `setInterval`/`setTimeout` in the one hook named under "Structure"; nowhere else in the feature.
- When the remaining time is 0 (the current time is at or after the end): the failure is cleared once, so the banner disappears and the button is enabled. Nothing else changes: the typed values stay and focus does not move.
- The countdown is in whole seconds. A wait is never shown as 0: the banner is gone at 0.

### The locked state on the screen

Board: `docs/design/sign-in.html`, the state "Locked after 5 failures" (desktop and 360 px). The page structure, the card and the fields are unchanged.

- **Banner:** error banner (`banner banner--error`, `role="alert"`) in the existing banner slot, with the Lucide `Lock` icon (decoration, `aria-hidden`), the title `Too many failed attempts.` and the line `Try again in ` + the time + `.`, where the time sits in `<span class="signin__wait">` (tabular figures, semibold; the rule is copied from the board into `sign-in.css`). No `Retry` button. Only this banner is in the slot.
- **Time format** (`formatWait`): under a minute `N s`; from a minute `M min S s`. Seconds are not padded and there are no hours.

  | Seconds | Text |
  |---|---|
  | 1 | `1 s` |
  | 59 | `59 s` |
  | 60 | `1 min 0 s` |
  | 61 | `1 min 1 s` |
  | 292 | `4 min 52 s` |
  | 900 | `15 min 0 s` |
  | 3600 | `60 min 0 s` |

  `0` formats as `0 s` (never shown). The text is plain text.
- **The tick is not announced second by second:** the span that holds the time has `aria-live="off"`, so a screen reader hears the banner once, with the starting time. Whether that fully holds in every screen reader is a manual check (NFR-4, milestone 5); it is not claimed here.
- **Form:** the Username and Password fields stay enabled and keep their values, as on the board. The Sign in button is disabled for as long as the banner shows (`disabled`, no `aria-busy`, still reads `Sign in`). It is also disabled while a submit is in flight or a recheck runs, as today.
- **Focus:** when the locked outcome arrives, focus moves to Password (values were kept, so the admin can wait and submit again).
- **Submit during the lock does nothing:** while the locked banner shows, pressing Enter in a field, or any other way to submit, sends no request. `useSignIn`'s `submit` and `retry` return at once without calling `signIn` while its failure is `locked`.
- **A new submit** (after the countdown ended) removes any banner as today. If the server locks again, a new countdown starts from the new `Retry-After`; there is never more than one banner.
- **Precedence** is unchanged: the locked banner is a failure of the last submit, so it outranks the unreachable-session banner and the "session ended" notice. When the countdown ends and the failure clears, whatever the precedence then gives is shown: with the session state "unreachable" the unexpected-error banner appears; otherwise the slot is empty.
- **Unexpected-error banner and others:** unchanged in text, icons, focus and `Retry` behavior.

### Known gaps

- **A reload forgets the lock.** The screen knows the wait only from a `429`. After a reload the admin sees an ordinary form; the first submit is answered `429` again, with the time left, and the countdown starts then. There is no operation to ask for the lock state without making an attempt.
- **Screen readers may re-announce the countdown.** `role="alert"` on the banner is as the board draws it; `aria-live="off"` on the changing span is the mitigation. Not proven without a screen reader; the milestone 5 manual check covers it.
- **The wait is shown from the response, not from the lock's start.** A slow response makes the screen unlock a moment after the server; it never unlocks earlier.
- **The client trusts `Retry-After`.** A very large value (several hours) is shown as minutes, such as `600 min 0 s`; the server sends 900 at most.

## Structure

By `ARCHITECTURE.md`: the screen stays in its feature folder; no new shared component, no new folder.

- `hooks/useSignIn.ts`: `SignInFailure` gains `{ kind: 'locked'; seconds: number }` (new). `toFailure` maps the case above to it. The hook returns a new function `clearFailure` (new) that sets the failure to `null`. `submit` and `retry` return without calling `signIn` while the failure is `locked`.
- `hooks/useLockCountdown.ts` (new) with a colocated test: takes the locked failure (or `null`) and a callback to run once when the countdown ends; returns the remaining whole seconds (or `null` when there is no countdown). It owns the end time, the timer and its cleanup. A new locked failure object (even with the same seconds) restarts it.
  - The end time is fixed during the render in which a new locked failure object is first seen (for example in a ref compared with the object), not in an effect, so the first value returned is the full wait.
  - The tick runs every 500 ms.
  - The callback is read through a ref, so a callback with a new identity does not restart the countdown; `clearFailure` in `useSignIn` is stable (`useCallback`) as well.
- `lib/formatWait.ts` (new) with a colocated test: the pure function that produces the text of the table above. `lib/` is the feature's folder for such helpers, as in `features/service-list/lib/`.
- `components/SignInForm.tsx`: renders the locked banner, moves focus to Password on the locked outcome (one more branch in the existing focus effect), and calls `useLockCountdown(failure?.kind === 'locked' ? failure : null, clearFailure)`.
  - `SignInForm` already has `const locked = submitting || rechecking`, which disables both fields and the button. That name and the fields' `disabled` stay as they are. Add a new name for the lock, for example `lockActive` (true while the locked banner shows), and make the button's `disabled` `locked || lockActive`. The fields do not use `lockActive`.
  - `CONVENTIONS.md` sets no size limit. The banner may stay inline or become a small component in the same folder; the builder decides. The existing focus effects are not moved into a hook (tracked in the backlog).
- `sign-in.css`: add the `.signin__wait` rule from `docs/design/sign-in.css` (values and rules only).

Existing text, icons and classes are not renamed or restyled.

## Design reference

`docs/design/sign-in.html` ("Locked after 5 failures", desktop and 360 px) with `sign-in.css`. Read-only. Copy style values and rules into the project's CSS; never copy board markup. Colours, spacing and type come from the tokens in `frontend/src/styles/tokens.css`. Use the classes that exist in `components.css`; do not restyle them. Icons come from Lucide only.

Where this file and the board differ, this file wins: the time format is the table above; focus goes to Password; the unlock does not move focus; the changing span has `aria-live="off"`; the board's `Sign in` button text stays the same.

## Dependencies

None. `react`, `react-hook-form`, `lucide-react` and Vitest with Testing Library are already in `frontend/package.json`. The manifest and the lockfile do not change.

## Acceptance criteria

Vitest with Testing Library. `signIn` is mocked at the wrapper boundary (`lib/api/session`) as in the existing tests; errors are built with the real `ApiError` (`new ApiError(429, { title: 'Sign-in locked', status: 429, code: 'sign_in_locked' }, 292)`), with the problem typed by the generated type. The shared `problem()` helper in `src/test/fixtures.ts` always gives `retryAfter` `null` and is outside your paths, so the cases with a `Retry-After` build `ApiError` directly.

Countdown tests use fake timers from the start (`vi.useFakeTimers`, with `vi.setSystemTime` or `now` for the start), advance them with `vi.advanceTimersByTimeAsync`, and never wait in real time. `TESTING.md` says `user-event` hangs under fake timers: in these tests fire events with `fireEvent` (`fireEvent.change` on each field, `fireEvent.submit` on the form), flush the rejected `signIn` with `await act(() => vi.advanceTimersByTimeAsync(0))`, and assert with `getBy*`, not `findBy*` or `waitFor`. `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, as `ServiceList.test.tsx` does, is also allowed. Every criterion is a test that fails if the behavior is removed.

**`formatWait` (`lib/formatWait.test.ts`)**

- Each row of the table above, including `0`.

**`useSignIn` (`hooks/useSignIn.test.tsx`)**

- A 429 `sign_in_locked` with `retryAfter` 292 gives `{ kind: 'locked', seconds: 292 }`, and both typed values are kept (FR-2).
- A 429 `sign_in_locked` with `retryAfter` `null`, a 429 `sign_in_locked` with `retryAfter` 0, and a 429 `rate_limited` with `retryAfter` 30 each give `unexpected` (replacing the old 429 row, which now has `retryAfter` `null`).
- With the failure `locked`, `submit` and `retry` call `signIn` zero times more; after `clearFailure()` a submit calls it again (FR-2). Without the lock, a submit after an `invalid-credentials` failure still calls it (shows the guard is the lock). This test is the proof of the guard in `submit` and `retry`; `retry` has no button during a lock, so it is not reachable from the screen.
- `clearFailure` keeps its identity across renders.
- A second locked failure with the same seconds is a new object (a change the countdown can see).

**`useLockCountdown` (`hooks/useLockCountdown.test.tsx`)**

- Given a locked failure of 292 seconds it returns 292 at once, with no timer advanced; with `null` it returns `null` and sets no timer (`vi.getTimerCount()` is 0).
- After 1 s it returns 291; after 291 s it returns 1; the callback has not run.
- Boundary: at exactly 292 s the callback has run once and the return is `null`; one millisecond less, it has not run.
- Computed from the clock, not ticks: jumping `vi.setSystemTime` forward by 200 s and advancing 500 ms returns 92.
- The callback runs once only, however long the timers keep advancing.
- A new failure object restarts it from its own seconds.
- One timer at a time: `vi.getTimerCount()` is 1 while counting, still 1 after a restart with a new failure object, and 0 once it has ended.
- Rerendering with a callback of a new identity does not restart it: the value keeps following the clock and the callback still runs once.
- Unmounting mid-countdown clears the timer (`vi.getTimerCount()` is 0) and the callback never runs.

**`SignInForm` (`components/SignInForm.test.tsx`)**

- A 429 `sign_in_locked` with `retryAfter` 292 shows an error banner with `role="alert"`, the title `Too many failed attempts.`, and `Try again in 4 min 52 s.`; the time sits in an element with class `signin__wait` that has `aria-live="off"`; there is no `Retry` button and no other banner (FR-2).
- During the lock the Sign in button is disabled and still reads `Sign in`; Username and Password are enabled and keep what was typed (FR-2). Focus is in Password.
- After 1 s the text reads `4 min 51 s`; after 292 s in all (one tick at a time is not required) the banner is gone, the button is enabled, the typed values are kept, and focus is where it was (still Password).
- One millisecond before the end the banner and the disabled button are still there.
- Firing a submit on the form during the lock (`fireEvent.submit`, which does not go through the disabled button) calls `signIn` no more times than before.
- After the lock ends, submitting calls `signIn` again with the same values (FR-2); if that answer is another 429 with 60, the banner reads `Try again in 1 min 0 s.` and there is one banner only.
- A 429 `sign_in_locked` without `Retry-After`, and a 429 `rate_limited`, still show `Can’t reach the server.` with `Retry` and focus on `Retry` (the old 429 case, kept with the new input).
- The locked banner outranks the unreachable banner: with the `unreachable` prop set, a locked answer shows `Too many failed attempts.` and not `Can’t reach the server.`; when the countdown ends, the unreachable banner appears.
- The banner's text contains neither the typed username nor the typed password (FR-1): type a username and password that are distinctive strings and check the page's text for both.
- Unmounting during the lock leaves no timer (`vi.getTimerCount()` is 0).
- The existing criteria for the other states (wrong credentials, HTTPS required, unexpected error, session ended, submitting, empty field) still pass with no change in what they assert.

**Repo-wide**

- `make check` passes.
- Nothing outside `frontend/src/features/sign-in/` changed; `package.json` and the lockfile are unchanged.

Tests this task changes on purpose: the `429 sign_in_locked` row in the `it.each` tables of `hooks/useSignIn.test.tsx` (line 79) and `components/SignInForm.test.tsx` (line 197). Today each expects the unexpected banner for `problem(429, 'sign_in_locked')`, which has no `Retry-After`. Each row stays as the "no usable `Retry-After`" case with a name that says so and the input written as `new ApiError(429, <problem>, null)`. No other assertion is removed or loosened.

## Verifier checks

The verifier has no browser. Check by reading the code and the tests:

- **Time:** `Date.now`, `setInterval` and `setTimeout` appear only in `hooks/useLockCountdown.ts` (and tests); the remaining time is computed from the end time and `Date.now()`, never decremented per tick; the timer is cleared in the effect's cleanup and when the countdown ends.
- **Branches on codes, not text:** `toFailure` tests `status`, `code` and `retryAfter`, never `message` or the problem's `title`; it uses `ApiError.retryAfter` and does not read the header again.
- **No `dangerouslySetInnerHTML`;** the time is a text child.
- **Nothing hand-written that mirrors a generated type;** no change to `lib/api/**`, `app-shell/**`, `pages/**`, `App.tsx` or `styles/**`.
- **The button's `disabled`** includes the lock; the fields' `disabled` does not (the board keeps them enabled).
- **No `eslint-disable`, no new dependency;** no literal colour or pixel value in `sign-in.css` where a token exists; no board class (`state`, `frame`, `board-*`) copied.
- **Existing banners:** the diff does not change the text, icons or `role` of the other four banners.
- **Mutation checks to run:** drop the `retryAfter >= 1` condition (the `retryAfter` 0 case must fail); count ticks instead of reading the clock (the `setSystemTime` jump test must fail); stop disabling the button during the lock (the disabled test must fail); let `submit` call `signIn` while locked (the `useSignIn` guard test and the form-submit test must fail); clear the failure one tick early or one tick late (both boundary tests must fail); never clear the timer on unmount (the unmount test must fail); move focus to Username on the locked outcome (the focus test must fail); disable the fields during the lock (the fields-enabled test must fail); clear the failure but not restart on a new object (the second-lock test must fail); show the unexpected banner for `rate_limited` as locked (the `rate_limited` case must fail).
- **Inputs to try:** `retryAfter` 1, 59, 60, 61, 900; two locks in a row; a lock that ends while the session state is unreachable. (A lock while `rechecking` is true cannot happen: `Retry` for a recheck is in the unreachable banner, which the locked banner replaces, and a recheck disables the form.)

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design or this file conflict with each other.
- You think you need a change outside `frontend/src/features/sign-in/`, a dependency, or an edit to a spec or design file.
- You think `lib/api/request.ts` or `ApiError` must change for this task to work.
- A state appears that is neither in this file nor on the board.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.

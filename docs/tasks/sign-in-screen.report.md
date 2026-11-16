# Verification report: sign-in screen

Branch: `verify/sign-in-screen` (built on `feat/sign-in-screen` at `cbb610e`). No pull request was opened: the user asked for none while the PR template is being updated.

Result: **no Blocking findings.** `make check` passed (Go, lint, 97 frontend tests, build) after the tests I added. Before them it ran 94 tests and also passed.

Integration tests: **not run.** The task touches only `frontend/src/`, and no criterion depends on the Go integration tests (`make test-integration`, which needs Docker for Mailpit). Nothing here depends on them.

## Criteria

"Real?": yes means the test fails when the behavior is removed (a mutation run, or clear from reading); "weak" means it could pass without the behavior. SP = `app-shell/SessionProvider.test.tsx`, APP = `App.test.tsx`, FORM = `SignInForm.test.tsx`, HOOK = `useSignIn.test.tsx`.

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| 200 gives signed in, token to `setCsrfToken` (NFR-8) | SP "gives signed in on 200…" | yes (M2) | met |
| 401 gives signed out; network failure and 500 give unreachable; one call each | SP "session check" table | yes (M9b) | met |
| `recheck()` calls again; in flight stays unreachable and `rechecking`; then follows the answer | SP "recheck from unreachable…" | yes (M9b) | met |
| `signedIn(info)` passes token, gives signed in (NFR-8) | SP "signedIn" | yes (M1) | met |
| Handler while signed in: signed out, notice, other query gone; while checking no notice | SP "a session that ends" | yes (M6) | met |
| `signOut()` 204: token null, signed out, no notice, queries gone (FR-3) | SP "on 204…" | yes (M10, M11) | met |
| `signOut()` 401 with handler first: notice false at once, end state signed out | SP "on 401 unauthenticated…" | yes (M7, M20) | met |
| `signOut()` 500 stays signed in | SP "on a 500…" | yes | met |
| Notice, then `signedIn`: false at once; later `signOut` leaves it false | SP "then signing in clears the notice…" | yes (M8) | met |
| Handler set to null on unmount | SP "is set to null on unmount" | yes (M13) | met |
| Signed in: five routes inside the layout with `Sign out` | APP table | yes (M3, M9b) | met |
| Signed out: each route ends on the form, no placeholder rendered (FR-4) | APP table with a MutationObserver | yes (M3) | met |
| Unreachable: banner, Retry rechecks, form stays, Retry disabled, 200 lands on `/` | APP "unreachable: / ends…" | yes (M9b, M15) | met |
| Checking: nothing rendered | APP "checking…" (and `/sign-in`) | yes | met |
| `/status` shows its placeholder; `getSession` not called | APP "/status…" | yes (M12b) | met |
| `/sign-in` signed in ends on `/` | APP | yes | met |
| Successful submit ends on `/` inside the layout | APP | yes | met |
| Sign out: disabled in flight, 204 ends on form with no banner, 500 re-enables | APP "Sign out" | yes | met |
| Session ends on `/`: notice shown | APP "A session that ends" | yes | met |
| Focus in Username on appearing, also with the notice | FORM "starts in Username…" | yes (read) | met |
| Live region present in every state; three banners `role="alert"` | FORM "focus and the banner slot" | yes (M18) | met |
| Submit by button and Enter in each field | FORM "submitting" | yes (read) | met |
| Empty field: no call, focus on first empty field, no `aria-invalid` | FORM two tests | yes (read) | met |
| In flight: disabled, `aria-busy`, `Signing in…` | FORM | yes (read) | met |
| 200: callback receives `SessionInfo` | HOOK | yes | met |
| 401: text, password cleared, username kept, focus Password; text same whatever typed (FR-1) | FORM, HOOK | yes (M5) | met |
| 403 with `detail` exact; `<b>x</b>` as text; without `detail` title alone; focus on button (FR-97, NFR-7) | FORM | yes (M4) | met |
| Network, 500, 422, 429: unexpected banner, focus Retry, Retry resubmits | FORM table, HOOK table | yes (M16) | met |
| Unreachable prop: Retry calls callback; `rechecking` disables all; focus after recheck both ways | FORM | yes (M15, M17, M21) | met |
| Precedence: unreachable plus 401 shows credentials banner | FORM | yes (M14) | met |
| Notice has no alert role, gone once submit starts | FORM | yes | met |
| A second failure replaces the first | FORM | weak: see Non-blocking 2 | met |
| `make check` passes | run | n/a | met |
| Nothing outside `frontend/src/` changed | `git diff main...HEAD --name-only` | n/a | met (plus the plan file, allowed) |

Gap found in coverage, now closed by tests I added (see "Tests I added"): the unreachable banner while a submit is in flight, and the recheck outcomes at route level (401 and fails again). Before those tests, mutation M19b survived.

## Plan check

Read after judging the code. Every criterion in the task file has a ticked plan line. No ticked item lacks a test.

- **Difference, plan vs diff:** the plan says a successful `signIn` "leaves the form in its submitting state until the route redirects". The code does not: `useSignIn.attempt` sets `submitting` false in `finally` after success. I probed it at route level with a MutationObserver and saw no render with the enabled "Sign in" button before the redirect. The behavior is fine and the plan sentence is wrong.
- The plan's mutation list (four checks) is a subset of mine; all four reproduce.
- The plan's judgment calls (`signingOut` in `useSession`, `test/fixtures.ts`, own refs for focus, retry uses last submitted values, empty `detail` treated as absent) match the diff.

## Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged; nothing new is imported beyond `react-hook-form`, `@tanstack/react-query`, `react-router`, `lucide-react`. No version adopted.
- **Contract and spec files, backend, other docs:** untouched.
- **No** `dangerouslySetInnerHTML`, `innerHTML`, `localStorage`, `sessionStorage`, `document.cookie`, `eslint-disable`, or `retryAfter` use in the diff (grep).
- **Types:** `SessionInfo` and `SignInRequest` are aliases of the generated schema types in `lib/api/session.ts`; no hand-written mirror. `ProblemBody` comes from `ApiError`.
- **Layering:** `features/sign-in/` imports nothing from `app-shell/` or another feature; `pages/SignInPage.tsx` and `app-shell/` do the wiring.
- **Branches on `ApiError.code`**, never message text. 429 gets only the unexpected banner.
- **CSS:** `sign-in.css` matches the board minus `.signin__wait`, with `min-height: 100dvh`. The only literals are `360px`, `1px` and the `640px` container query, all copied from the board where no token exists. No board class or markup copied.
- **Banner slot** is rendered in every state, including idle.
- **Component library:** none needed, nothing hand-written. Icons are Lucide only.
- **Forms** use react-hook-form. `useSignIn` returns semantic mutators, not raw setters.

## Mutation checks run

Each was applied to source, the full frontend suite run, then reverted with `git checkout`. All listed ones failed at least one named test, except M19.

| # | Break | Failing test |
|---|---|---|
| M1 | no `setCsrfToken` in `signedIn` | SP signedIn |
| M2 | no `setCsrfToken` after 200 | SP session check |
| M3 | admin routes render while signed out | APP signed-out table (FR-4) |
| M4 | `detail` via `dangerouslySetInnerHTML` | FORM NFR-7 |
| M5 | password kept after 401 | FORM and HOOK |
| M6 | notice set on any 401 (no state guard) | SP "while checking sets no notice" |
| M7 | notice set during sign-out in flight | SP "on 401 unauthenticated…" |
| M8 | `signedIn` does not clear the notice | SP "then signing in…" |
| M9b | "checking" derived from `status === 'pending'` | SP recheck, APP unreachable |
| M10, M11 | sign-out keeps queries / skips `setCsrfToken(null)` | SP "on 204" |
| M12b | `/status` moved inside the provider | APP "/status" |
| M13 | handler not nulled on unmount | SP unmount |
| M14 | unreachable outranks the submit failure | FORM precedence |
| M15 | Retry always calls `signIn` | FORM and APP |
| M16 | 429 mapped differently | FORM and HOOK |
| M17 | recheck does not disable the form | FORM |
| M18 | no `aria-live` | FORM |
| M20 | sign-out 401 not swallowed | SP |
| M21 | no focus to Username after recheck | FORM, plus the APP test I added |
| M19 | unreachable banner shown while submitting | **survived** (no test); my added FORM test now kills it |
| M19a | failure banners shown while submitting | equivalent mutant: `attempt` clears `failure` first, so the guard is redundant |

## Tests I added (existing files only)

- `SignInForm.test.tsx`: "the unreachable banner is gone while a submit is in flight" (slot empty).
- `App.test.tsx`: "a Retry answered 401 removes the banner, enables the form and focuses Username" and "a Retry that fails again keeps the banner and focuses Retry". Both use a deferred promise.

## Findings

### Blocking

None.

### Non-blocking

1. **Focus after a fast recheck can be lost.** Category: latent bug. The focus move after a recheck runs only when the form renders once with `rechecking` true. If the recheck answers before that render, focus is not moved. I reproduced it in a test with an instantly rejecting `getSession` after Retry: a 401 left focus on `body` and not on Username. Matters when: the server answers a recheck faster than one render, for example a local or very fast network, or if a future change moves the recheck onto a cached path.
2. **A test can't tell "one banner" from "two".** Category: test quality. The "second failure replaces the first" test passes if the slot ever holds a banner of a different kind that is hidden by a matching guard. Matters when: someone adds a new banner kind and drops a precedence guard. Report only: it is guarded today by precedence tests.
3. **Focus handling sits in `SignInForm` rather than a hook.** Category: decision needed. `CONVENTIONS.md` ("Component and hook granularity") asks for a hook per cohesive concern, and the three focus effects with four refs are one such concern. The task file fixed only `useSignIn` and left other names to the builder. I did not treat it as Blocking. Matters when: a second screen needs the same focus-follows-outcome logic, or the user reads the convention as strict now.
4. **Plan sentence about the submitting state is wrong.** Category: cosmetic. See Plan check. Matters when: someone reads the plan to learn the behavior. Report only.

## Docs or specs that no longer match

- `docs/tasks/sign-in-screen.plan.md`: the "successful `signIn` leaves the form in its submitting state" judgment call does not describe the code.
- `docs/tasks/backlog.md` already tracks the failed sign-out state, the locked state and the end-to-end journeys; nothing new to add from this work.
- `STACK.md`, `docs/openapi.yaml`, `docs/requirements.md`, `ARCHITECTURE.md`: no mismatch. No dependency was added, so no version to record.
- `docs/manual-checks.md` "After the first front-end slice" is still the user's by-hand step; this report does not tick it.

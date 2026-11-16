# Task: sign-in screen

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can sign in on `/sign-in`, is sent there whenever an admin page has no session, and can sign out from the top bar of every admin page. This is the first front-end slice: it builds the sign-in screen and the session handling in the app shell that every later admin screen relies on.

Requirements covered: FR-1, FR-3, FR-4, FR-97, NFR-7, NFR-8.

Out of scope:

- The server side of the three operations. The backend task `sign-in-api` builds it; this task runs against mocks and does not wait for it.
- The "Locked after 5 failures" state (FR-2, `429 sign_in_locked`, the countdown). It stays in the backlog for milestone 5. Do not build it.
- Returning to the screen the admin was on after a session ends, and restoring typed values. `docs/design/README.md` lists both as not built: sign-in always goes to the dashboard.
- The dashboard and every other admin page. Their routes keep the `NotBuilt` placeholder, now inside the admin layout.
- Toasts. No toast wrapper exists yet; the dashboard task adds it.
- End-to-end tests. The milestone's last task writes them.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/sign-in-screen.plan.md`), or anything else outside `frontend/src/`.

Shared files this task touches, all owned by this task while it runs: `frontend/src/App.tsx` and `frontend/src/App.test.tsx`. It reads `frontend/src/lib/api/request.ts` and `frontend/src/main.tsx` and changes neither.

Tasks that may run at the same time: `sign-in-api` and `http-probe`, both backend only. No other frontend task runs beside this one.

## Operations used

From `docs/openapi.yaml`. On the server none of the three works until `sign-in-api` merges: `signIn` answers 501, and `getSession` and `signOut` answer `401 unauthenticated` because no session exists. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `signIn` | `POST /api/session`, body `SignInRequest` | 200 `SessionInfo`; 401 `invalid_credentials`; 403 `https_required` with `detail`; anything else as the unexpected-error state |
| `getSession` | `GET /api/session` | 200 `SessionInfo`; 401 `unauthenticated`; anything else as "unreachable" |
| `signOut` | `DELETE /api/session`, header `X-CSRF-Token` | 204; 401 `unauthenticated`; anything else leaves the admin signed in |

## Behavior

### What exists

- `apiRequest` in `frontend/src/lib/api/request.ts` sends `X-CSRF-Token` on writes from the token given to `setCsrfToken`, and on any `401` with code `unauthenticated` clears the token and calls the handler given to `setUnauthenticatedHandler`. It calls that handler before it throws. A non-2xx response throws `ApiError` (`code`, `status`, `problem`, `retryAfter`); a network failure rejects with another error.
- `frontend/src/App.tsx` has the route table, every route a `NotBuilt` placeholder. `frontend/src/main.tsx` provides TanStack Query and the router.
- `frontend/src/styles/components.css` already has `.brand`, `.topbar`, `.topbar__spacer`, `.btn`, `.btn--primary`, `.btn--ghost`, `.field`, `.label`, `.input`, `.banner` with `--error`, `--warn` and `--info`, `.banner__body`, `.banner__title`, `.banner__actions` and `.spinner`. The `.signin*` rules are not there yet.

### The session, in the app shell

The app shell holds one session state for the page load, with four values:

| State | Meaning |
|---|---|
| checking | the first `getSession` has not answered yet |
| signed in | a session is known; its CSRF token has been given to `setCsrfToken` |
| signed out | no session |
| unreachable | the last `getSession` failed with anything other than `401 unauthenticated` |

The session check is one TanStack query (key `['session']`), and the state is derived from it, never copied into component state with an effect:

- its query function calls `getSession`. On 200 it gives the token to `setCsrfToken` and returns the `SessionInfo`. On `401 unauthenticated` it returns `null`. On any other failure it throws;
- the state comes from the query's result, in this order: data that is a `SessionInfo` is "signed in"; data that is `null` is "signed out"; no data and `isFetched` false (the first check has not answered) is "checking"; no data and `isFetched` true is "unreachable". TanStack Query resets `status` and `error` to pending while it refetches a query that has no data, so `status`, `error` and `isRefetching` cannot tell a recheck from the first check: use `isFetched`;
- `useQuery` for the session is called in `SessionProvider` only, which stays mounted across the redirects between the admin routes and `/sign-in`. Everything else reads the session through `useSession`;
- the query has `retry: false`, `staleTime: Infinity`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchOnMount: false` and `retryOnMount: false`. It runs once at start and again only through `recheck()`. Nothing else re-runs it, and a failure of any other request never changes the session state, except the `401 unauthenticated` rule below;
- `recheck()` refetches it. While the refetch is in flight the state stays what it was ("unreachable"), with a flag `rechecking` true (`isFetched` and `isFetching` both true); it does not go back to "checking".

Rules:

- **Where it applies:** `/sign-in` and the admin routes are inside the session provider. `/status` is outside it: on `/status` no session operation is called and there is no session state.
- **Admin routes** (`/`, `/services/new`, `/services/:serviceId`, `/services/:serviceId/alerts` and the catch-all `*`):
  - checking: render nothing (no page, no top bar, no sign-in form);
  - signed in: render the admin layout with the page inside;
  - signed out or unreachable: redirect to `/sign-in`, replacing the history entry.
- **`/sign-in`:**
  - checking: render nothing;
  - signed in: redirect to `/`, replacing the history entry;
  - signed out: the form;
  - unreachable: the form with the unexpected-error banner (below).
- **A session ends while signed in:** the handler registered with `setUnauthenticatedHandler` runs on every `401 unauthenticated`. When the state is "signed in" and no sign-out is in flight, it sets the session query's data to `null` ("signed out"), removes every other query from the cache, and sets the notice flag, so the sign-in screen shows the "session ended" notice. In any other state, or while a sign-out is in flight, it sets no notice.
- **Sign-out:** the top bar's button calls `signOut`. While the request is in flight the button is disabled. On 204, and also on `401 unauthenticated`: the CSRF token is set to null, the session query's data is set to `null`, every other query is removed from the cache, and the admin lands on `/sign-in` with no notice (the flag is already false: it is never set while signed in or while a sign-out is in flight). On any other failure the admin stays signed in, the button is enabled again and nothing is shown (see "Known gaps").
- **Sign-in succeeds:** `signedIn(info)` gives the CSRF token to `setCsrfToken`, sets the session query's data to the `SessionInfo`, clears the notice flag, and the app goes to `/`, replacing the history entry. Always `/`, whatever page the admin came from.

The CSRF token lives in memory only (`request.ts`). Nothing about the session is written to `localStorage`, `sessionStorage` or a cookie by the frontend.

### The admin layout

Every admin route renders inside one layout: the top bar, then the page. The top bar, as on the dashboard board: the brand (the Lucide `Activity` icon and the word `Monitory`) as a link to `/`, a spacer, and a ghost button with the Lucide `LogOut` icon and the text `Sign out`. `/sign-in` and `/status` have no top bar.

### The sign-in screen

Board: `docs/design/sign-in.html`. A centred card with the brand (not a link), the heading `Sign in`, one banner slot, then the form: `Username`, `Password`, and the button `Sign in`.

- The banner slot is a live region (`aria-live="polite"`) that is always in the page, empty when there is no message, so the form does not move. It holds at most one banner; a new one replaces the old one.
- Username has `autocomplete="username"`; Password has `type="password"` and `autocomplete="current-password"`. Focus starts in Username whenever the form appears, with or without a banner. Tab order: Username, Password, Sign in. Enter in either field submits.
- **Empty field:** the form is react-hook-form with both fields required. Submitting with an empty field sends no request and moves focus to the first empty field. No message is shown and the field is not marked invalid (no `aria-invalid`): the design draws neither.
- **Which banner:** the slot shows, in this order of precedence: the outcome of the last submit, if it failed; otherwise the unexpected-error banner when the session state is "unreachable"; otherwise the "session ended" notice when its flag is set. While a submit is in flight the slot is empty.

States, each from the board:

| State | When | What is shown |
|---|---|---|
| Idle | nothing submitted | the form, empty banner slot |
| Submitting | `signIn` in flight | both fields and the button disabled; the button has `aria-busy="true"`, a spinning Lucide `LoaderCircle` (class `spinner`) and the text `Signing in…`. Any banner is removed when the submit starts |
| Wrong credentials | `401 invalid_credentials` | error banner (`role="alert"`), title `Username or password is incorrect.` The password is cleared, the username is kept, and focus moves to Password |
| HTTPS required | `403 https_required` | warning banner (`role="alert"`), title `Sign-in requires HTTPS`, and under it the response's `detail`, word for word, as plain text with the class `signin__detail`. When `detail` is absent, the title alone. Both values are kept; focus moves to the Sign in button |
| Unexpected error | `signIn` fails in any other way (a network failure, any other status or code, including 400, 413, 415, 422, 429 and 5xx), or the session state is "unreachable" | error banner (`role="alert"`), title `Can’t reach the server.`, text `Check your connection and try again.`, and a button `Retry` with the Lucide `RefreshCw` icon. Both values are kept. After a failed `signIn`, focus moves to `Retry` |
| Session ended | arriving after a session ended (above) | info banner (no `role="alert"`), title `Your session has ended.`, text `Sign in again to continue.` Removed when a submit starts |

`Retry`: when the banner came from a failed `signIn`, it submits the same username and password again. When it came from the "unreachable" session state, it calls `recheck()`: the form stays in the page with its values, and while `rechecking` is true `Retry`, both fields and the Sign in button are disabled, so nothing can be submitted during a recheck. If the recheck answers 200 the page goes to `/`; if `401 unauthenticated`, the banner is removed, the form is enabled and focus moves to Username; if it fails again, the banner stays, the form and `Retry` are enabled again and focus moves to `Retry`.

Banner icons, as on the board, all decoration (`aria-hidden`): wrong credentials `CircleAlert`; HTTPS required `TriangleAlert`; unexpected error `WifiOff`; session ended `Info`.

Four things here are not drawn on the board and are decided by this file; build them as written and do not stop for them: the blank page while "checking"; the HTTPS banner with the title alone when `detail` is absent; the unexpected-error banner for the "unreachable" session state, with `Retry` meaning recheck; and an empty-field submit that only moves focus.

All text from the server (`detail`) is rendered as text, never as HTML (NFR-7).

### Known gaps

- **`429 sign_in_locked` shows the unexpected-error banner.** The server does not send it until the milestone 5 lockout task, which also builds the locked state.
- **`422 validation_failed` shows the unexpected-error banner.** The form never sends an empty field, so it is not reachable from the screen, and the board draws no field error.
- **A failed sign-out shows nothing.** The board draws no such state and there is no toast wrapper yet. Tracked in the backlog for the dashboard task.
- **The first visit after a session expired while the page was closed shows no notice.** The notice is only for a session that ends while the page is open.
- **"Focus stays on the button" while submitting** (the board's note) is not required: a disabled button cannot hold focus in every browser. Focus after each outcome is as the table says.

## Structure

By `ARCHITECTURE.md`. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice.

- `frontend/src/lib/api/session.ts` (new): three thin wrappers over `apiRequest`, `signIn`, `getSession` and `signOut`, typed with the generated types. Shared, because the app shell and the sign-in feature both use them.
- `frontend/src/app-shell/`: the session state and what coordinates across pages.
  - `SessionProvider.tsx` (new), `useSession.ts` (new) and `sessionContext.ts` (new), three files, because the lint rule `react-refresh/only-export-components` does not allow a component, a hook and a context in one file. `useSession` returns the state, `rechecking`, the notice flag, and the semantic mutators `signedIn(info)`, `signOut()` and `recheck()`. No raw setter is exposed.
  - `SessionProvider` registers the handler with `setUnauthenticatedHandler` on mount and removes it (sets it to null) on unmount.
  - `AdminLayout.tsx` (new): the gate for admin routes and the top bar.
  - Sign-out is a TanStack mutation.
- `frontend/src/features/sign-in/`: the screen.
  - `components/SignInForm.tsx` (new): the card, the banner slot and the form. It takes what it needs as props (the notice to show, what to call when signed in, what `Retry` does for "unreachable") and imports nothing from `app-shell/` or another feature.
  - `hooks/useSignIn.ts` (new) with a colocated test (`useSignIn.test.ts` or `.tsx`): submits, and turns each outcome into one of the screen's states.
  - `sign-in.css` (new), a feature stylesheet imported by `SignInForm.tsx`: the `.signin*` rules, copied from `docs/design/sign-in.css` (values and rules only). `min-height: 620px` on `.signin` is board framing: use `min-height: 100dvh` instead. The `.signin__wait` rule belongs to the locked state and is not copied.
- `frontend/src/pages/SignInPage.tsx` (new): the thin route entry that connects `useSession` to `SignInForm`.
- `frontend/src/App.tsx`: a layout route renders `SessionProvider` around `/sign-in` and the admin routes; `/sign-in` renders `SignInPage`; the admin routes render inside `AdminLayout` and keep their `NotBuilt` placeholders; `/status` keeps its placeholder outside the provider. `frontend/src/main.tsx` does not change: the session query's options are set on the query itself.

No new component goes into `components/ui/`: this task needs no Base UI primitive.

## Design reference

`docs/design/sign-in.html` with `sign-in.css`, and the top bar on `docs/design/dashboard.html`. Read-only. Copy style values and rules into the project's CSS; never copy board markup. Colours, spacing, type sizes and radii come from the tokens in `frontend/src/styles/tokens.css`. Use the classes that already exist in `frontend/src/styles/components.css`; do not restyle them. Icons come from Lucide only.

Where this file and the board differ, this file wins: the locked state is not built, the HTTPS detail text is the server's, sign-in always goes to `/`, the username is not prefilled after a session ends, and the four undrawn behaviors listed under "The sign-in screen" are built.

## Dependencies

None. `react-hook-form`, `@tanstack/react-query`, `react-router` and `lucide-react` are already in `frontend/package.json`. The manifest and the lockfile do not change.

## Acceptance criteria

Vitest with Testing Library. API calls are mocked at the wrapper boundary (`lib/api/session`) with value-return spies, and mock data is typed with the generated types. The session tests also spy on `setCsrfToken` and `setUnauthenticatedHandler` from `lib/api/request`, keeping the handler they are given so a test can call it. Tests that render the provider or the routes wrap them in a `QueryClientProvider` with a fresh client. Every criterion is a test that fails if the behavior is removed.

Evidence that lives elsewhere: that a write carries `X-CSRF-Token` is proven by the existing `frontend/src/lib/api/request.test.ts` (NFR-8); the wrappers here are pass-throughs. FR-4 is covered here for pages only; the API half belongs to `sign-in-api`. NFR-4 is not claimed: its keyboard journeys are an end-to-end item in the backlog.

**Session (`app-shell/`, tested through a small harness that renders the provider)**

- A 200 from `getSession` gives "signed in" and passes the response's `csrf_token` to `setCsrfToken` (NFR-8).
- A `401 unauthenticated` gives "signed out"; a network failure and a 500 each give "unreachable". In each case `getSession` was called exactly once.
- `recheck()` from "unreachable" calls `getSession` again; while it is in flight the state is still "unreachable" and `rechecking` is true; afterwards the state follows the new answer.
- `signedIn(info)` passes `info.csrf_token` to `setCsrfToken` and gives "signed in" (NFR-8).
- While signed in, calling the registered handler gives "signed out" with the notice flag set, and a query seeded under another key is gone from the cache. Called while "checking", it sets no notice.
- `signOut()` on 204: `setCsrfToken(null)`, "signed out", no notice, a query seeded under another key is gone (FR-3).
- `signOut()` answered `401 unauthenticated`, where the mocked `signOut` calls the registered handler before it rejects, as `request.ts` does: the notice flag is false right after the handler call, before the rejection is handled, and the end state is "signed out" with no notice.
- `signOut()` on a 500: still "signed in".
- Session ended (notice set), then `signedIn(info)`: the notice flag is false at once. A following `signOut()` leaves it false.
- The handler is set to null on unmount.

**Routes (`App.test.tsx`, replacing the current placeholder test)**

- Signed in: `/`, `/services/new`, `/services/0190-abc`, `/services/0190-abc/alerts` and `/nothing/here` each show their placeholder inside the layout, with the `Sign out` button.
- Signed out: each of those routes ends on the sign-in form, and no placeholder text was rendered (FR-4).
- Unreachable: `/` ends on the sign-in form with `Can’t reach the server.`; clicking `Retry` calls `getSession` again, the form is still in the page while it is in flight with `Retry` disabled, and a 200 then ends on `/` inside the layout.
- Checking: neither a placeholder nor the sign-in form is in the page.
- `/status` shows its placeholder and `getSession` was not called.
- `/sign-in` while signed in ends on `/`.
- A successful submit on `/sign-in` ends on the `/` placeholder inside the layout.
- Clicking `Sign out` calls `signOut`, the button is disabled while it is in flight, and a 204 ends on the sign-in form with no banner (FR-3). After a 500 the button is enabled again and the placeholder is still shown.
- After a session ends while on `/`, the sign-in form shows `Your session has ended.`

**Sign-in (the `useSignIn` test and `SignInForm.test.tsx`)**

- Focus is in Username when the form appears, also when it appears with the notice.
- The banner slot has `aria-live="polite"` and is in the page in every state; the three error and warning banners have `role="alert"`.
- Submitting calls `signIn` with the typed username and password, by the button and by Enter in each field.
- Submitting with an empty username, or an empty password, calls nothing, focuses the first empty field, and sets no `aria-invalid`.
- While in flight: both fields and the button are disabled, the button has `aria-busy="true"` and reads `Signing in…`.
- 200: the callback receives the `SessionInfo`.
- `401 invalid_credentials`: the banner reads `Username or password is incorrect.`, the password is empty, the username is kept, focus is in Password. The text is the same whatever was typed (FR-1).
- `403 https_required` with a `detail`: the title `Sign-in requires HTTPS` and the detail text exactly; a `detail` of `<b>x</b>` appears as those characters and creates no `b` element (FR-97, NFR-7). Without `detail`: the title alone. Focus is on the Sign in button.
- A network failure, a 500, a 422 and a 429 each show `Can’t reach the server.` with `Retry`, and focus is on `Retry`; `Retry` calls `signIn` again with the same values.
- With the "unreachable" prop, the same banner is shown and `Retry` calls the given callback, not `signIn`; with the "rechecking" prop `Retry`, both fields and the Sign in button are disabled. When "rechecking" ends with "unreachable" still set, focus is on `Retry`; when it ends with "unreachable" cleared, focus is in Username.
- Precedence: with "unreachable" set, a submit answered 401 shows `Username or password is incorrect.` and not the unreachable banner.
- The "session ended" notice is shown when asked for, has no `role="alert"`, and is gone once a submit starts.
- A second failure replaces the first banner: there is never more than one.

**Repo-wide**

- `make check` passes.
- Nothing outside `frontend/src/` changed.

Tests this task replaces on purpose: `frontend/src/App.test.tsx` asserts today that every route, including `/` and `/sign-in`, shows a `NotBuilt` placeholder with no session. It is rewritten as listed under "Routes".

## Verifier checks

The verifier has no browser. Check by reading the code and the tests:

- No `dangerouslySetInnerHTML` anywhere in the diff; `detail` is rendered as a text child.
- No hand-written type that mirrors `SessionInfo`, `SignInRequest` or `Problem`; they come from `schema.d.ts`.
- `features/sign-in/` imports nothing from `app-shell/` or another feature; `app-shell/` and `pages/` do the wiring.
- No use of `localStorage`, `sessionStorage` or `document.cookie`.
- No literal colour and no pixel value in `sign-in.css` where a token exists; no board class (`state`, `frame`, `board-*`) and no board markup copied.
- No `eslint-disable`, no new dependency, `package.json` and the lockfile unchanged.
- The banner slot element is rendered in every state, including idle.
- Branches are on `ApiError.code`, never on message text.
- Nothing for 429 beyond the unexpected-error banner: no countdown, no use of `retryAfter`.
- Mutation checks to run: stop calling `setCsrfToken` after sign-in (a session test must fail); let admin routes render while "signed out" (a route test must fail); render `detail` through `innerHTML` (the NFR-7 test must fail); keep the password after a 401 (must fail); set the notice on the first `401` (must fail); set the notice from the handler while a sign-out is in flight (must fail); stop clearing the notice in `signedIn` (must fail); derive "checking" from `status === 'pending'` (the recheck tests must fail).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design or this file conflict with each other.
- You think you need a change outside `frontend/src/`, a dependency, or an edit to a spec or design file.
- You think `frontend/src/lib/api/request.ts` must change for this task to work.
- A state appears that is neither in this file nor on the board.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.

# Plan: sign-in screen

Branch: `feat/sign-in-screen`. Integration tests (`make test-integration`): not run: frontend-only task, no Go code or integration tests touched (no database involved).

Test files: `SP` = `frontend/src/app-shell/SessionProvider.test.tsx`, `APP` = `frontend/src/App.test.tsx`, `HOOK` = `frontend/src/features/sign-in/hooks/useSignIn.test.tsx`, `FORM` = `frontend/src/features/sign-in/components/SignInForm.test.tsx`.
Source: `frontend/src/lib/api/session.ts`, `app-shell/{SessionProvider.tsx,useSession.ts,sessionContext.ts,AdminLayout.tsx}`, `features/sign-in/{components/SignInForm.tsx,hooks/useSignIn.ts,sign-in.css}`, `pages/SignInPage.tsx`, `App.tsx`.

## Session (SP)

- [x] 200 from `getSession` gives signed in and passes `csrf_token` to `setCsrfToken` (SP)
- [x] 401 unauthenticated gives signed out; network failure and 500 give unreachable; `getSession` called once each (SP)
- [x] `recheck()` from unreachable calls `getSession` again; in flight: still unreachable, `rechecking` true; then follows the answer (SP)
- [x] `signedIn(info)` passes `csrf_token` to `setCsrfToken`, gives signed in (SP)
- [x] Handler while signed in: signed out, notice set, other query removed; while checking: no notice (SP)
- [x] `signOut()` 204: `setCsrfToken(null)`, signed out, no notice, other query removed (SP)
- [x] `signOut()` 401 with handler called before rejection: notice false right after, end state signed out, no notice (SP)
- [x] `signOut()` 500: still signed in (SP)
- [x] Notice set, then `signedIn(info)`: notice false at once; later `signOut()` leaves it false (SP)
- [x] Handler set to null on unmount (SP)

## Routes (APP)

- [x] Signed in: five routes show placeholder inside layout with `Sign out` (APP)
- [x] Signed out: each ends on sign-in form, no placeholder rendered (APP)
- [x] Unreachable: `/` ends on form with `Can’t reach the server.`; Retry calls `getSession`, form stays, Retry disabled in flight, 200 ends on `/` in layout (APP)
- [x] Checking: no placeholder, no form (APP)
- [x] `/status` shows placeholder, `getSession` not called (APP)
- [x] `/sign-in` while signed in ends on `/` (APP)
- [x] Successful submit on `/sign-in` ends on `/` placeholder inside layout (APP)
- [x] `Sign out`: calls `signOut`, disabled in flight, 204 ends on form with no banner; 500 re-enables, placeholder stays (APP)
- [x] Session ends on `/`: form shows `Your session has ended.` (APP)

## Sign-in (HOOK, FORM)

- [x] Focus in Username when form appears, also with the notice (FORM)
- [x] Banner slot `aria-live="polite"` in every state; three banners have `role="alert"` (FORM)
- [x] Submit calls `signIn` with typed values, by button and Enter in each field (FORM)
- [x] Empty username or password: no call, focus on first empty field, no `aria-invalid` (FORM)
- [x] In flight: fields and button disabled, `aria-busy`, `Signing in…` (FORM)
- [x] 200: callback receives `SessionInfo` (HOOK)
- [x] 401 invalid_credentials: banner text, password empty, username kept, focus Password (FORM, HOOK for the outcome)
- [x] 403 https_required with detail exact text, `<b>x</b>` as text with no `b` element; without detail title alone; focus on Sign in button (FORM, HOOK)
- [x] Network failure, 500, 422, 429: unexpected banner, focus Retry, Retry calls `signIn` again with same values (HOOK, FORM)
- [x] `unreachable` prop: same banner, Retry calls callback not `signIn`; `rechecking` disables Retry, fields, button; focus after recheck ends (FORM)
- [x] Precedence: unreachable plus a 401 submit shows the credentials banner (FORM)
- [x] Session-ended notice: shown, no `role="alert"`, gone when submit starts (FORM)
- [x] A second failure replaces the first banner: one at a time (FORM)

## Repo-wide

- [x] `make check` passes
- [x] Nothing outside `frontend/src/` changed (plus this plan file)

## Judgment calls

- `useSession` also returns `signingOut` (true while the sign-out request is in flight). The top bar needs it to disable the button and the task's list of return values did not name it.
- Shared test data (`sessionInfo`, `problem()` to build an `ApiError`) lives in `frontend/src/test/fixtures.ts`, beside the existing `test/setup.ts`, instead of being repeated in four test files. It holds test helpers only.
- Focus is set through our own refs beside react-hook-form's, not `setFocus`, because `setFocus` defers with `setTimeout` and focus would then land after the render the behavior is tied to. The empty-field focus uses react-hook-form's own error focus (first registered field first).
- `Retry` after a failed `signIn` resubmits the last submitted values held in a ref, not the current field contents, so it is the "same username and password" even if the fields were edited.
- An empty `detail` string on `https_required` is treated like an absent one (title alone).
- A failed sign-out is swallowed: the mutation's error is not shown anywhere, as the task says.
- A successful `signIn` leaves the form in its submitting state until the route redirects, instead of re-enabling it for a moment.
- On `/sign-in` the card is `<main class="signin">`; the admin layout renders the top bar and then the page's own `<main>` (the placeholder).
- Mutation checks run by hand on `SessionProvider.tsx`: dropping `setCsrfToken` in `signedIn`, dropping `setNotice(false)`, using `status === 'pending'` for checking, and dropping the sign-out-in-flight guard each made a test fail; the file was restored after each.

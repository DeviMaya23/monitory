# Plan: m5-security-journeys

Branch: feat/m5-security-journeys. Only `e2e/**` and this file change.

## Prerequisite checks
- [x] ROLES.md / TESTING.md allow more than one closing e2e task (checked: reworded).
- [x] Five wrong sign-ins over the built binary end in 429 (journey 1 passes: the sixth attempt is 429).

## Helpers (`e2e/support/helpers.ts`)
- [x] `signInApi`, `signInRaw`, `attemptSignIn`, `setCookieOf`, `publicApi(request, headers?)`

## Acceptance criteria
- [x] Journey 1: five wrong attempts lock; screen + API + session untouched — `e2e/journeys/sign-in-lockout.spec.ts`, test `M5 journey 1 ...`
- [x] Journey 2: what counts and what resets — `sign-in-lockout.spec.ts`, test `M5 journey 2 ...`
- [x] Journey 3: restart clears lock and count (two tests) — `sign-in-lockout.spec.ts`, tests `M5 journey 3 ...`
- [x] Journey 4: require HTTPS refuses plain HTTP — `e2e/journeys/sign-in-https.spec.ts`, test `M5 journey 4 ...`
- [x] Journey 5: cookie follows the setting (three tests) — `sign-in-https.spec.ts`, tests `M5 journey 5 ...`
- [x] Journey 6: trust off ignores forwarding headers — `e2e/journeys/proxy-trust.spec.ts`, test `M5 journey 6 ...`
- [x] Journey 7: trust on, default header — `proxy-trust.spec.ts`, test `M5 journey 7 ...`
- [x] Journey 8: trust on, another header — `proxy-trust.spec.ts`, test `M5 journey 8 ...`
- [x] Repo-wide: smoke passes (9 passed, run as the Makefile's command directly, see judgment call 1); new specs pass in Chromium (workers 1 and 4) and Firefox (11 passed); WebKit: run, 3 of the new tests fail with `Page.overrideSetting: Unknown setting: PushAPIEnabled` on `newPage` (installed WebKit build does not match Playwright 1.64.1); the existing `public-dashboard` journeys fail the same way, so it is the environment
- [x] Repo-wide: `make check` passes; nothing outside `e2e/` changed

## Integration tests
- [x] Integration tests: not run: nothing outside `e2e/` changed (`make check`: passed)

## Judgment calls
1. `make test-e2e-smoke` could not start Mailpit (host port 1025 already held by another session's container), so I ran its second line, `cd e2e && npx playwright test --project=chromium --grep @smoke`, against that Mailpit. I did not stop the other container.
2. Journey 1 step 4: the countdown regex is anchored on the whole line `Try again in … s.`.
3. Journey 1 step 6: the "start" reading for the falling-header poll is taken from one extra refused attempt after the wrong-credential checks.
4. Journey 5's three tests sit in three describes with their own `appOverrides`; titles all start `M5 journey 5`.
5. Journey 4 step 5 `/status` check uses the visitor page that already ran step 1.
6. `signInApi` and `signInRaw` return the same shape as `publicApi` (type name `PublicApiResult` reused).

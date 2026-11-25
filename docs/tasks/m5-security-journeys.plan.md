# Plan: m5-security-journeys

Branch: feat/m5-security-journeys. Only `e2e/**` and this file change.

## Prerequisite checks
- [ ] ROLES.md / TESTING.md allow more than one closing e2e task (checked: reworded).
- [ ] Five wrong sign-ins over the built binary end in 429 (checked while running journey 1).

## Helpers (`e2e/support/helpers.ts`)
- [ ] `signInApi`, `signInRaw`, `attemptSignIn`, `setCookieOf`, `publicApi(request, headers?)`

## Acceptance criteria
- [ ] Journey 1: five wrong attempts lock; screen + API + session untouched — `e2e/journeys/sign-in-lockout.spec.ts`, test `M5 journey 1 ...`
- [ ] Journey 2: what counts and what resets — `sign-in-lockout.spec.ts`, test `M5 journey 2 ...`
- [ ] Journey 3: restart clears lock and count (two tests) — `sign-in-lockout.spec.ts`, tests `M5 journey 3 ...`
- [ ] Journey 4: require HTTPS refuses plain HTTP — `e2e/journeys/sign-in-https.spec.ts`, test `M5 journey 4 ...`
- [ ] Journey 5: cookie follows the setting (three tests) — `sign-in-https.spec.ts`, tests `M5 journey 5 ...`
- [ ] Journey 6: trust off ignores forwarding headers — `e2e/journeys/proxy-trust.spec.ts`, test `M5 journey 6 ...`
- [ ] Journey 7: trust on, default header — `proxy-trust.spec.ts`, test `M5 journey 7 ...`
- [ ] Journey 8: trust on, another header — `proxy-trust.spec.ts`, test `M5 journey 8 ...`
- [ ] Repo-wide: `make test-e2e-smoke` passes; new specs pass in Chromium; firefox/webkit reported
- [ ] Repo-wide: `make check` passes; nothing outside `e2e/` changed

## Integration tests
- [ ] No backend code touched: not run: nothing outside `e2e/` changed

## Judgment calls
(filled at the end)

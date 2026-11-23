# Verifier report: m3-e2e-journeys

Branch: `verify/m3-e2e-journeys` (the builder's `feat/m3-e2e-journeys` plus one added test and this report).

**Result: no Blocking findings.** `make check` passed. The whole Chromium project passed three times (82 tests, 83 with the test added here), at 4 and at 1 worker, with the shell's limits set to other values. 22 of 25 mutations were caught by the named journey. Of the 3 that were not, one was closed here by a new test, one is an equivalent change my mutation made too weak, and one is a Non-blocking gap in journey 8 (finding 1).

Commands run, on this branch:

| Command | Result |
|---|---|
| `make check` (after `npm ci` in `frontend/` and `e2e/`: a fresh checkout has no `eslint`) | run, passed (exit 0) |
| `cd e2e && npm run typecheck` | run, passed |
| `npx playwright test --project=chromium` (4 workers) | run, 82 passed, 2.4 min (146 s) |
| the same, with `MAX_SERVICES=7 SERVICE_NAME_MAX_LENGTH=40 API_REQUEST_MAX_BYTES=2000000 REQUEST_MAX_HEADERS=5 MAX_REDIRECTS=9 RESPONSE_BODY_MAX_BYTES=9999 CHECK_INTERVAL_MAX_SECONDS=999 RETRY_COUNT_MAX=9` in the shell, after adding one test | run, 83 passed, 139 s (the explicit environment of each test won) |
| `npx playwright test --project=chromium --workers=1 -g "M3 journey"` | run, 58 passed, 4.4 min |
| `--list` and `--grep @smoke --list` | 82 tests; 7 smoke tests: M1 sign-in, add, delete; M2 email and webhook; M3 journey 1 JSON text; M3 journey 2 first test. As the task asks |
| Integration tests (`make test-integration`) | **not run**: the diff has no `backend/**` change, so no code with integration tests is touched, and ports 1025 and 8025 are held by a Mailpit container of another worktree, which I did not disturb. The e2e runs used that Mailpit (`axllent/mailpit:latest`). No criterion of this task depends on an integration test |
| System clock a day later | **not run**: needs root. Margin reasoning: each certificate is generated relative to "now" in the test itself, so a shifted clock moves both sides; the half-day margin to the truncation was measured (below) |
| Mutation checks | 25 run, see below |

`makeCert`, printed from a one-off spec (not kept): `validCert(10)` ends 252.00 hours from now (10 days 12 hours), SAN `IP:127.0.0.1`, EC key; `expiredCert()` ended 24.00 hours ago; `wrongHostCert()` ends in 720.00 hours, SAN `DNS:other.test` only.

## Criteria

"Real?" says whether the named test fails when the behaviour is removed. "Yes (M-n)" means a mutation numbered n below made it fail. "Structural" means no mutation was possible or needed.

| Criterion | Test (in `e2e/journeys/`) | Real? | Verdict |
|---|---|---|---|
| Harness: `npm ci && npm run typecheck` | run | n/a | Met |
| Harness: `--list` lists every journey; `@smoke` as asked | run | n/a | Met |
| Harness: parallel tests get their own app, site, TCP stub, certificates | fixtures `site`, `tlsSite`, `tcp`; runs at 1 and 4 workers | Structural | Met |
| Harness: certificate days match the preset | one-off spec; journey 4 expiry test | Yes (M-9, M-10) | Met |
| Harness: M1 and M2 journeys pass unchanged | full runs; diff to `helpers.ts` is additions plus `export` on `readStatus` | n/a | Met |
| Harness: no test clears Mailpit | grep for `DELETE` | n/a | Met |
| J1 FR-42, FR-61: `non_2xx_status` on panel and dashboard | `check-failures` `non_2xx_status` | Yes for the text and the one attempt (M-14). It does not pin the 2xx boundary: widening it to 399 survives (M-10), as 503 is far from it | Met |
| J1 FR-41, FR-61: `timed_out`, slow response | `timed_out, a slow response` | Yes (M-0) | Met |
| J1 FR-41, FR-73: timeout covers the body read with JSON rules | `timed_out, a stalled body with a JSON rule` | Yes (M-23) | Met |
| J1 FR-61: `could_not_connect` | `could_not_connect` | Yes by contrast: M-0 turns the timeout into another code, and the TCP tests fail if refused is not `could_not_connect` | Met |
| J1 FR-44, FR-46, FR-61: JSON text rule, dotted path (`@smoke`) | `json_rule_matched, text` | Yes: M-2 and M-3 reach the same code path; the path and the field text are asserted | Met |
| J1 FR-61, FR-62: rule beats non-2xx | `json_rule_matched beats a non-2xx status` | Yes (M-1) | Met |
| J1 FR-44: `true` and `false` | `json_rule_matched, true and false` | Yes: run 3 (`ok` true on `false`) fails if kinds were mixed up; not mutated | Met |
| J1 FR-45: number as text, case-sensitive | `a number is compared as text, text is case-sensitive` | Yes (M-2) | Met |
| J1 FR-47: any or all | `any or all` | Yes (M-3) | Met |
| J1 FR-48, FR-61: not JSON, empty, missing field | `invalid_or_missing_json: …` | Yes (M-24 for the missing field) | Met |
| J1 FR-73: body over the read limit is not valid JSON | `a body over the read limit is not valid JSON` | Yes (M-4); 2,001 against 1,999 bytes | Met |
| J1 FR-58, FR-61: redirects, three followed, fourth fails | `too_many_redirects and the limit of three` | Yes (M-5) | Met |
| J2 FR-33, FR-49, FR-52, FR-55, FR-61: TCP accepted, refused, accepted again (`@smoke`) | `check-tcp` `accepted, refused, and again` | Yes: the refused step needs the real probe; the recovery step needs the state to change back | Met |
| J2 FR-61: refused from the start | `refused from the start` | Yes, as above | Met |
| J3 FR-35, FR-36, FR-37: request arrives as saved, then edited | `check-request` `the request arrives as saved` | Yes for method, query, headers, body and content type, which are compared field by field. Not mutated | Met |
| J3 FR-37: each body type | `each body type arrives as saved` | Yes (exact content types and bodies) | Met |
| J3 FR-39: edit screen shows header values in full | `the edit screen shows the saved header values in full` | Yes (reads the input values) | Met |
| J3 FR-58: saved headers with each redirected request | `redirects carry the saved headers` | **No**: survives M-6. Go copies the first request's headers by itself on a same-host redirect | Met only with the test added here, `redirects to another host still carry the saved headers` (Yes, M-6) |
| J4 FR-64: self-signed, expired, wrong host fail unless ignored | `check-certificates`: three tests | Yes (M-7). The task's Known gaps say each fault shows only as "fails unless ignored" | Met |
| J4 FR-50, FR-64: expiry applies when errors are ignored | `the expiry check applies when errors are ignored` | Yes (M-8) | Met |
| J4 FR-64: expired is 0 days left | `an expired certificate has 0 days left` | Yes (M-9) | Met |
| J4 FR-74 (part): options off for a non-https URL | `the screen switches the options off…` | Yes: reads `aria-checked` and `disabled` | Met |
| J5 FR-51, FR-53, FR-54, FR-112: retries, "Not checked yet" until the last | `check-retries` `all attempts fail` | Yes (M-11, M-12, M-13) | Met |
| J5 FR-54: a retry that succeeds | `a retry that succeeds` | Yes (M-13) | Met |
| J6 FR-104, NFR-7: healthy result, plain text, no markup | `test-panel` `a healthy result shows what came back` | Yes for the escaping: no `b` or `script` in the area, `window.pwned` undefined. Not mutated (frontend) | Met |
| J6 FR-104: failed result with body; long body cut; empty body | `a failed result shows the body too`, `a long body is cut off…` | Yes (exact 65,536 characters, exact notices) | Met |
| J6 FR-105: nothing saved, no state change | `nothing is saved and no state changes` | Partly real: the service has no repository (`ServiceCheckTestService` holds only probers, a clock and limits), so the panel cannot write by construction. The test reads the server's state before and after | Met |
| J6 FR-104, FR-106: one attempt | the `site.count()` assertions in J1 and J6 | Yes (M-14) | Met |
| J6 FR-106, FR-74: invalid settings run nothing | `invalid settings run nothing` | Yes (count stays 0, messages exact) | Met |
| J6 FR-38: request over the size limit | `a request over the size limit is refused` | Yes (M-22) | Met |
| J7 FR-66, FR-67: edit keeps state, no check at saving, applies at the next check | `edit-service` `editing keeps the state and applies at the next check` | Yes (M-15, M-16) | Met |
| J7 FR-66: type change keeps the state | `a type change keeps the state` | Yes (M-16) | Met |
| J7 FR-12, FR-74: invalid edit refused, nothing changed | `an invalid edit is refused and nothing changes` | Yes: the form refusal and the server's `422`, then reloaded values | Met |
| J7 FR-59: name taken, case-insensitive, on update | `a name taken by another service` | Partly: the refusal message is asserted; "nothing changed" is shown only by finding the service under its old name (finding 2) | Met |
| J8 FR-75, FR-76, FR-78, FR-79: pause, no checks or mail, resume checks at once, alert | `pause-resume` `pause stops checks and alerts, resume checks at once` | Resume half: Yes (M-18). Pause half: **No**: survives M-17, because the interval is 60 s and the wait is 10 s (finding 1) | Met (the pause half is covered by the next row) |
| J8 FR-78, FR-62, FR-76: paused keeps its state, shown as paused | `a paused service keeps its state` | Yes (M-17): interval 6 s, two 10 s waits | Met |
| J8 FR-111: restart keeps it paused | `a restart keeps it paused` | Yes (M-19); the unpaused service is the baseline | Met |
| J9 A FR-38, FR-59, FR-65, FR-69: each limit at the limit saves, one past is refused with nothing saved | `service-validation` `journey 9 A` nine tests | Yes (M-20 for headers, with a non-default limit). The other limits are read the same way; I also probed multibyte names and bodies and a URL with two parameters (below) | Met |
| J9 B FR-56, FR-57: timing limits and the worst case | `journey 9 B` four tests | Yes: messages and the exact worst-case line are asserted. Not mutated | Met |
| J9 C FR-60: the third service refused, a freed slot reused | `journey 9 C` | Yes (M-21) | Met |
| J9 D FR-38: the one-megabyte rule | `journey 9 D` | Yes (M-22) | Met |
| J9 E FR-74, FR-106: URL, host, port, rule path, certificate days; no request for screen-only refusals | `journey 9 E` three tests | Yes: the `POST /api/services` count separates the screen's refusal from the server's | Met |
| Each FR-61 code is produced and its dashboard text asserted | J1 (`timed_out`, `could_not_connect`, `non_2xx_status`, `json_rule_matched`, `invalid_or_missing_json`, `too_many_redirects`), J4 (`certificate_problem`) | Yes | Met |
| Every limit of journey 9 has an at-limit save and a one-past refusal | `service-validation.spec.ts` | Yes | Met |
| Repo-wide: `make check`; Chromium suite twice; only `e2e/**` and the plan changed | run | n/a | Met |

## Plan check

- Every criterion of the task appears in the plan (harness, nine journeys, FR-61 coverage, limits, repo-wide). None is missing.
- Every ticked item has its test. I checked the claims that can be checked: the 82 tests, the smoke list, the certificate numbers, the mutation-free state of `backend/**`, the one-line manifest change. They match.
- Differences between the plan and the diff: none that matter. The plan calls the 500 ms pause in journey 5's polling loop "a plain timer"; the task says no `waitForTimeout` other than `settle`, and a `setTimeout` is not that call, so it follows the letter (finding 3).
- The plan's judgment calls are consistent with the code. `timing: null` is a reasonable reading, because `defaultTiming` would overwrite saved timing on an Edit form.
- The plan says "Mutation checks were not run". They are in this report.

## Rule checks

- **Diff scope:** only `e2e/**` and `docs/tasks/m3-e2e-journeys.plan.md` differ from `origin/main` (17 files), plus this report and one test in `check-request.spec.ts` from me. `backend/**`, `frontend/**`, the contract, `Makefile` and CI are untouched.
- **Dependencies:** `e2e/package.json` gains one line, `"selfsigned": "5.5.0"` (exact). The lockfile pins `selfsigned` 5.5.0 and its transitive packages (`@peculiar/x509` 1.14.3, `pkijs` 3.4.3 and others). `@playwright/test` 1.64.1, `typescript` 6.0.3 and `@types/node` 24.19.2 are unchanged. `selfsigned` is imported only by `support/certs.ts`.
- **Verifier checks of the task:** no `waitForTimeout` in new code (only `settle`; the three others are in M1's `delete-service.spec.ts`, not in this diff); no CSS-class selector (`locator('.…')` has no hit; the tag selectors `p`, `dd`, `span`, `b`, `script` are used on purpose and named in the plan); no test clears Mailpit; `retries: 0`; no new test writes over HTTP (`serviceState` and `serviceCount` only read; the writes in `delete-service.spec.ts` are M1's); "unchanged" is read from `GET /api/services`, never from a relative time on the dashboard.
- **Texts:** every quoted message was compared with its source: `failureReason.ts`, `testResult.ts` (`TEST_TEXT`), `FormBanners.tsx`, `ServiceForm.tsx` (`NAME_TAKEN`, `Enter a URL.`), `timingGroup.ts`, `service_validation.go`. All match. The journeys also passed against the real screens.
- **"Nothing happens" assertions have a baseline:** the pause journey flips the stub to 503 while paused, then resume produces the request and the mail; journey 8's restart test has an unpaused service that is checked again; journey 5's retry test reads the row while the cycle runs and the other test shows the same setup ends `Unhealthy`; journey 7's "no check at saving" is shown to fail by M-15.
- **CONVENTIONS.md layers, data scoping, transactions:** not applicable to an e2e-only diff. Frontend component-library check: no frontend change. No design reference code copied.

## Mutation checks run

Each was made in the source, run against the named journey with `--grep`, and reverted with `git checkout` (the working tree was clean after each). "Caught" means the named journey failed.

| # | Mutation | Journey run | Result |
|---|---|---|---|
| 0 | the deadline reported as `could_not_connect` | J1 `timed_out, a slow response` | caught |
| 1 | status beats JSON rule | J1 `beats a non-2xx status` | caught |
| 2 | JSON text compared case-insensitively | J1 `a number is compared as text…` | caught |
| 3 | `any` and `all` swapped | J1 `any or all` | caught |
| 4 | body limit not applied | J1 `a body over the read limit` | caught |
| 5 | redirect limit +1 | J1 `too_many_redirects…` | caught |
| 6 | saved headers not set again on a redirect | J3 `redirects carry the saved headers` | **not caught** by the builder's test; **caught** by the test added here |
| 7 | `ignore_certificate_errors` ignored | J4 `self-signed…` | caught |
| 8 | expiry check skipped when errors are ignored | J4 `the expiry check applies…` | caught |
| 9 | expired certificate given 1 day left | J4 `0 days left` | caught |
| 10 | 2xx range widened to 399 (my own, not on the task's list) | J1 `non_2xx_status` | not caught: equivalent for a 503; the boundary is the probe's unit test |
| 11 | failed check not retried | J5 `all attempts fail` | caught |
| 12 | retry count off by one | J5 `all attempts fail` | caught |
| 13 | a service shown `Unhealthy` before the last retry | J5 both tests | caught by both |
| 14 | the test panel makes two attempts | J1 `non_2xx_status` | caught |
| 15 | an edit runs a check at the moment of saving | J7 `editing keeps the state…` | caught |
| 16 | an edit resets the state | J7 | caught by two tests |
| 17 | a pause does not stop the scheduler | J8 `pause stops checks and alerts…` | **not caught** by that test; run again on all of J8: caught by `a paused service keeps its state` |
| 18 | a resume waits for the interval | J8 `pause stops checks and alerts…` | caught |
| 19 | a restart starts the paused service | J8 `a restart keeps it paused` | caught |
| 20 | `REQUEST_MAX_HEADERS` hardcoded (20) | J9 `headers` | caught |
| 21 | the service limit off by one (`>` for `>=`) | J9 C | caught |
| 22 | the one-megabyte rule removed | J6 size test and J9 D | caught by both |
| 23 | a stalled body read reported as `could_not_connect` | J1 `a stalled body…` | caught |
| 24 | a missing JSON field judged healthy | J1 `invalid_or_missing_json…` | caught |

25 mutations. Caught by the named journey: 22. Not caught: 6 (closed here by a new test), 10 (equivalent) and 17 (finding 1).

Not run: "the test panel saving or changing state": `ServiceCheckTestService` has no repository, recorder or scheduler, so nothing can be mutated without adding wiring (source change).

## Cases tried beyond the task file

All in a throwaway spec (deleted, not committed), against the real app:

- Eight concurrent `POST /api/services` with distinct names at 1 of `MAX_SERVICES=2`: one `201`, seven `409`, two rows after. Six concurrent creates with one name in two letter cases: one `201`, five `409`.
- A 12-character name of `é` saves, a 13-character name of `日` is refused (the limit counts characters, not bytes).
- A body of 11 `€` (33 bytes) is refused at 32 bytes, 10 `€` plus `ab` (32 bytes) saves (the limit counts bytes).
- A URL with two query parameters at 61 characters is refused and at 60 saves (`?`, `&`, `=` count).
- `--workers=1` and `--workers=4`; the journey-9 limits and the other limits set to other values in the shell: all passed.

No defect found in the product by any of them.

## Findings

### Blocking

None.

### Non-blocking

1. **Journey 8's first test cannot detect a pause that does not stop the scheduler** (test quality). The service has a 60-second interval and the test waits 10 seconds, so the site count and the empty mailbox stay the same whether or not the scheduler was stopped (M-17). The task prescribes the 60-second interval, because it is needed to prove that resume checks at once. The pause is protected by `a paused service keeps its state` (6-second interval, two 10-second waits), which has no alert target, so "no alerts while paused" (FR-76) is covered only through "no check ran". Matters when: that second test is changed or removed, or a future change sends an alert from somewhere other than the check path. Suggested fix, for the user to decide: add an email target to the second test, or pause in the first test with a short interval and resume with a long one.
2. **Journey 7 `a name taken by another service` proves "nothing changed" only by looking the service up under its old name** (test quality). It does not read the stored name after the refusal in the Edit screen. Matters when: report only (a partial write would also have to change the name, which the lookup would show).
3. **A fixed 500 ms `setTimeout` in the journey 5 polling loop** (cosmetic). Matters when: report only. It is a poll interval, not a wait for an event.
4. **M1's `delete-service.spec.ts` uses `waitForTimeout` and writes over HTTP** (test quality, outside this diff). Matters when: `delete-service.spec.ts` is next edited; the task rules say no other `waitForTimeout`.
5. **Journey 4 cannot show which fault failed a certificate, as the task's Known gaps say** (decision needed). Every generated certificate is self-signed, so the probe's "unknown authority" hides an expired or wrong-host fault. Matters when: the probe's certificate options are changed in a way the probe unit tests do not cover.
6. **Added by this verifier: the saved `Authorization` header goes to a different host on a redirect.** FR-58 says the saved headers go with each redirected request, and the product does it, including to another host (decision needed). Matters when: a saved credential header is used on a URL that can redirect off-site. The product behaves as specified, so this is not a defect; the user may want to confirm it is intended.

## Tests added

- `e2e/journeys/check-request.spec.ts`, test `M3 journey 3 redirects to another host still carry the saved headers (FR-58)`: a redirect from `127.0.0.1` to `localhost` with a saved `Authorization` header. It passes on the product as is, and fails under mutation 6, which the builder's same-host test did not catch. I added it in the journey file of the criterion, not in a new file.

## Docs or specs that no longer match

- **`STACK.md`:** add `selfsigned` 5.5.0 (exact, dev dependency of `e2e/`, used only by `support/certs.ts`; it brings `@peculiar/x509` 1.14.3 and `pkijs` 3.4.3 into the e2e lockfile). It is not listed today.
- **`STACK.md` (end-to-end row) and `TESTING.md` ("End-to-end"):** both say the suite uses "Mailpit and the stub target server". It now also has a scriptable HTTP(S) stub of a checked site (`StubSite`), a TCP stub (`StubTcp`) and generated certificates. Worth one line each.
- **`docs/manual-checks.md`:** this merge completes milestone 3's end-to-end task, which makes the "At each milestone" heading due: the `Full end-to-end` workflow in three browsers (Firefox and WebKit were not run by the builder or by me), the screens against their boards, local times on the dashboards.
- **`docs/openapi.yaml`, `docs/requirements.md`:** nothing out of date found. The journeys run with intervals of 6 seconds and similar, through the deployment configuration, as the contract says the limits are initial values from it.

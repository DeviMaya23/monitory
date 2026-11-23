# Plan: m3-e2e-journeys

Branch: `feat/m3-e2e-journeys`. Only `e2e/**` and this file change.

## Harness
- [x] `cd e2e && npm ci && npm run typecheck` passes. Files: `e2e/support/*`, `e2e/journeys/*`, `package.json`. Test: `npm run typecheck`.
- [x] `--list` shows every journey; `--grep @smoke` lists the M1 and M2 smoke tests plus exactly the JSON-rule test of journey 1 and the first test of journey 2. Files: spec titles. Test: `npx playwright test --project=chromium --list [--grep @smoke]`.
- [x] Parallel tests get their own app, site, TCP stub and certificates. Files: `support/fixtures.ts` (`site`, `tlsSite`, `tcp`), `support/stubSite.ts`, `support/stubTcp.ts`. Outcome: run, passed: default (4 workers) twice, and `--workers=1` on the 57 M3 tests (57 passed, 4.4 min).
- [x] `makeCert` days left match the preset. File: `support/certs.ts`. Test: a one-off script printing `notAfter` of `validCert(10)`. Outcome: run; `validCert(10)` was valid until 251.99 hours from now (10 days 12 hours); `expiredCert()` ended 24.0 hours ago; `wrongHostCert()` has only `DNS:other.test`.
- [x] M1 and M2 journeys still pass unchanged. Files: `support/helpers.ts`, `fixtures.ts` (additions only). Test: the M1 and M2 specs in the Chromium run.
- [x] No test clears Mailpit. Check: grep for `DELETE` in `e2e/`.

## Journeys
- [x] Journey 1 (FR-41, 42, 44, 45, 46, 47, 48, 58, 61, 62, 73, 104), `journeys/check-failures.spec.ts`, tests `M3 journey 1 ...` (the JSON text test is `@smoke`).
- [x] Journey 2 (FR-33, 49, 52, 55, 61), `journeys/check-tcp.spec.ts`, tests `M3 journey 2 ...` (the first is `@smoke`).
- [x] Journey 3 (FR-35, 36, 37, 39, 58), `journeys/check-request.spec.ts`, tests `M3 journey 3 ...`.
- [x] Journey 4 (FR-34, 50, 61, 64, 74 in part), `journeys/check-certificates.spec.ts`, tests `M3 journey 4 ...`.
- [x] Journey 5 (FR-51, 53, 54, 112), `journeys/check-retries.spec.ts`, tests `M3 journey 5 ...`.
- [x] Journey 6 (FR-38, 74, 104, 105, 106, NFR-7), `journeys/test-panel.spec.ts`, tests `M3 journey 6 ...`.
- [x] Journey 7 (FR-12, 59, 66, 67, 74), `journeys/edit-service.spec.ts`, tests `M3 journey 7 ...`.
- [x] Journey 8 (FR-62, 75, 76, 78, 79, 111), `journeys/pause-resume.spec.ts`, tests `M3 journey 8 ...`.
- [x] Journey 9 (FR-38, 56, 57, 59, 60, 65, 69, 74, 106), `journeys/service-validation.spec.ts`, describes A to E.
- [x] Each FR-61 reason (`timed_out`, `could_not_connect`, `non_2xx_status`, `json_rule_matched`, `invalid_or_missing_json`, `too_many_redirects`, `certificate_problem`) is produced by a test and its dashboard text asserted. Files: journeys 1, 2, 4.
- [x] Every limit of journey 9 has a test at the limit that saves and one past it that is refused with nothing saved. File: `service-validation.spec.ts`.

## Repo-wide
- [x] `make check` passes. Outcome: run, passed (exit 0)
- [x] `make test-e2e-smoke` (or the direct command) passes in Chromium. Outcome: `make test-e2e-smoke` run, passed (7 tests; Mailpit v1.33.1 started with `make mailpit-up`).
- [x] The whole Chromium project passes at least twice in a row; time and slowest tests reported. Outcome: run twice, 82 passed each (143 s and 138 s; the second with `MAX_SERVICES`, `SERVICE_NAME_MAX_LENGTH`, `API_REQUEST_MAX_BYTES`, `REQUEST_MAX_HEADERS`, `MAX_REDIRECTS`, `RESPONSE_BODY_MAX_BYTES`, `ADMIN_PASSWORD`, `SMTP_HOST` set to other values in the shell). Slowest: M2 journey 1 (31 s), M2 `alerts off` (29 s), M2 journey 4 retries (26 s), M3 journey 8 a paused service keeps its state (23 s), M3 journey 7 editing keeps the state (23 s), M3 journey 9 C (18 s). No flaky test seen.
- [x] Nothing outside `e2e/**` and this file changed (`git diff --stat origin/main`). Outcome: run; only `e2e/**` and this file differ (`e2e/package.json`: one line, `selfsigned` 5.5.0 exact).
- [x] Integration tests (`make test-integration`): the task changes no code with integration tests (no `backend/**` change). Outcome: not run: no backend code touched, e2e only.

## Judgment calls
- Mailpit v1.33.1. The Docker daemon was off at the start; I started Docker Desktop and ran `make mailpit-up`.
- `fillServiceForm` fills `defaultTiming` when the spec has no `timing`, as the task says. On an Edit form that would overwrite the saved timing, so `timing: null` means "do not touch the Timing group" (used on every edit and for every second run on one form).
- `runTest` presses `Run test` and waits for the running notice to have appeared (a `MutationObserver` set before the click) before it reads `Healthy` or `Failed`, so a second run never reads the first run's result.
- `cancelForm` presses `Cancel` and presses `Discard changes` only when the dialog appears; an unchanged form leaves at once.
- Extra helpers beyond the task's list: `openAddService`, `openEditService`, `cancelForm`, `clearRules`, `testPanel`, `readStatus` (exported from M1's code, behaviour unchanged), `serviceCount`, `repeat`.
- The test panel's reason is the second `span` of the verdict `div`, `Took` and `HTTP` are the `dd` of their `dt`, and the failure paragraph of a row is its only `p`: tag selectors, no CSS classes.
- Journey 1 JSON-rule runs 2 and 3 change the rules with `clearRules` and fill again; the "any or all" test changes mode and rule 2's text on the open form.
- Journey 1 `invalid_or_missing_json`: Run 1's body is put back before saving, so the saved service shows the same reason as Run 1.
- Journey 1 redirect test: no count of one request is asserted (the chain is several requests of one attempt); it asserts one request reached `/ok` after each run of the chain that ends there.
- Journey 3: `Content-Type` of `Plain text` is asserted to be exactly `text/plain`, and of the form body exactly `application/x-www-form-urlencoded`; both passed as written.
- Journey 3 `the edit` step waits for a `GET` request in the site log and checks that one (an earlier `POST` check may still be in flight when the edit is saved).
- Journey 6 "invalid settings": the URL `ftp://x.test`, port `0` and the empty rule path are refused by the server (the screen's own checks only look for an empty URL or a non-number), so the panel shows its refusal after a `422`; the test follows the task's wording.
- Journey 7 `invalid edit`: after the port is cleared the screen's own message is `Enter a whole number.`; the TCP service is also reopened to show the saved port.
- Journey 8 `restart`: the unpaused service is on `stub`; the test waits for its count to rise after the restart, then lets `settle` pass before it reads the paused service's site count.
- Journey 9: each limit row is one test; describe B's "one past each" runs its seven cases in one form in sequence and then shows nothing was saved; the same message under two fields (journey 9 A, messages) is counted once per field.
- Journey 9 E, the certificate days case uses an HTTPS stub with a generated certificate (`tlsSite`) as the saved URL; the service is saved, not awaited.
- `settle` is the only `waitForTimeout` in new code; the retry-loop pause in journey 5 uses a plain 500 ms timer, as M2's `waitForMessages` does.
- `/tmp` was used once for the `make check` log; everything else is in the scratchpad.
- Mutation checks were not run (the verifier's job). Firefox and WebKit were not run.
- The new dependency `selfsigned` 5.5.0 (exact) needs adding to `STACK.md` after the merge.
- Texts on screen differing from the task file: none found.

# Verification report: m5-e2e-journeys

Branch: `verify/m5-e2e-journeys` (the builder's work, `feat/m5-e2e-journeys` at `cd86ab7`, plus this report).

Verdict: **no Blocking findings.** Source code was not changed; every mutation was reverted (`git status` clean after each).

## What was run

| Command | Result |
|---|---|
| `make check` | run, passed (exit 0). Fresh worktree: `npm ci` in `frontend/` and `e2e/` first. |
| `npx playwright test data-survives-restart keyboard toast-and-refresh --project=chromium`, `--workers=1` | run, 8 passed |
| same, `--workers=4`, twice in a row | run, 8 passed each time |
| same, `--project=firefox` | run, 8 passed |
| `--project=chromium --grep @smoke` (what `make test-e2e-smoke` runs) | run, 10 passed, journey 10's first test among them. The make target itself was not used: `mailpit-up` would collide with the sibling worktree's Mailpit container already holding 1025/8025, which was left alone and served the run. |
| whole suite, Chromium | run, 109 passed |
| `toast-and-refresh keyboard --repeat-each=3 --workers=4` (Chromium) | run, 21 passed |
| WebKit | not run: does not work on macOS 14 (`TESTING.md`) |
| Integration tests (`make test-integration`) | not run, not applicable: nothing outside `e2e/` changed, and `e2e/` has no Go integration tests. No criterion depends on them. |

## Criteria

All tests are in `e2e/journeys/`. "Real?" = would the test fail if the behaviour were removed. "Mutation" refers to the table below.

| Criterion | Test | Real? | Status | Evidence |
|---|---|---|---|---|
| J9 steps 1 to 5 (NFR-1 in part): services body, targets bodies, `Public page` switch, visitor's names, A resumes and B stays stopped | `data-survives-restart.spec.ts` `M5 journey 9 ...` | Yes | Met | Mutations K2 (setting reset at start: fails at the switch), L (paused service started again: fails `/b` count), M (nothing resumed: fails the two-check wait). Before and after bodies both come from `GET /api/services` and `/api/services/<id>/targets`; only `state.last_checked_at` is dropped. |
| J10 steps 1 to 4 (NFR-4): focus in `Username`, stops in order and marked, Enter signs in, wrong password keeps focus in `Password` | `keyboard.spec.ts` `M5 journey 10 ...` (two tests, first `@smoke`) | Yes for steps 1 to 3 (E, F); step 4 (banner, focus in `Password`) was not mutated | Met | Mutation E (`tabIndex=1` on `Sign in`: exact stop list fails), F (focus outline removed: mark fails). |
| J11 steps 1 to 6 (NFR-4): reading order, actions last, marks, reached list, hint description, arrow swap both ways, Enter saves add and edit | `keyboard.spec.ts` `M5 journey 11 ...` | Yes | Met | Mutation C (no `aria-describedby`: description `""`), F (marks), J (Enter blocked in inputs: add never saves). Step 4 focuses the radio with `focus()` rather than arriving by Tab; see finding N3. The arrow-key swap and the reading order were not mutated. |
| J12 steps 1 to 6 (NFR-4): dialog trap, order, marks, type swap, Enter saves, Escape leaves list unchanged, edit, remove | `keyboard.spec.ts` `M5 journey 12 ...` | Yes | Met | Mutation G (non-modal dialog: `focus is inside the scope after Tab 6` fails), F. Steps 3 to 6 were not mutated; they assert toasts, row counts and focus placement that the real app produces. |
| J13 steps 1 to 4: initial focus on `Cancel`, trap, both buttons marked, Escape and focus return, delete | `keyboard.spec.ts` `M5 journey 13 ...` | Yes for the initial focus (I) and the marks (F); the trap only through H2 | Met | Mutation I (initial focus moved to `Delete service`: fails), F, H2 (see table: the alert dialog cannot be made non-modal through its props, so H2 swaps the primitive; it fails, but in a confounded way). |
| J14 steps 1 to 3 (NFR-4, FR-95): placement 16 px and 12 px, under a dialog and back above after Escape | `toast-and-refresh.spec.ts` `M5 journey 14 ...` | Yes | Met | Mutation A (toast portal in `document.body`: fails the 360 px check by 4 px), B (viewport `z-index` above the dialog layer: `the dialog layer is above the toast` fails, so hit testing is not skipped by the library: the Known-gaps question is answered, the check is real). |
| J15 steps 1 to 4 (FR-95): late save refreshes the dashboard before the automatic refresh | `toast-and-refresh.spec.ts` `M5 journey 15 ...` | Yes | Met | Mutation D (`removeQueries` only: `serviceRow(second)` not visible within 5 s). The held promise is released only after the dashboard shows one service. |
| Repo-wide: smoke and new specs pass in Chromium; Firefox and WebKit reported | see "What was run" | n/a | Met | WebKit not run (reason above). |
| Repo-wide: `make check` passes; nothing outside `e2e/` changed | `make check` | n/a | Met | `git diff main...HEAD --stat`: `e2e/` (4 files) and the plan only. |

## Plan check

Read after the criteria were judged.

- Every criterion has a plan item; none is missing.
- Every ticked item's test exists and checks the behaviour (table above). The plan's outcome lines match what I reproduced (new specs passed in Chromium with workers 4 and 1, Firefox 8 passed, WebKit not run, smoke 10, whole Chromium suite 109).
- Differences between plan and diff: the plan lists five helpers; the diff has a sixth, `expectAllMarked` (a loop over `marked`). Journey 11 step 4 in the diff focuses the radio with `focus()`; the plan's judgment calls list the other deviations (step 5's second Tab, journey 12 step 3's focus check, `/^Save/`) but not this one. Neither matters to the behaviour.

## Rule checks

- **Only `e2e/**` and the plan file changed.** Met. `package.json`, `package-lock.json`, `playwright.config.ts`, `app.ts`, the stubs and `fixtures.ts` are untouched; `@playwright/test` stays `1.64.1`. No dependency was added.
- **No `waitForTimeout`, no `locator(` with CSS, no `retries`** in the new specs or in the helper diff (grep, no hits). `page.mouse.move(1, 1)` in journey 14 is not a wait.
- **Journeys 10 to 13 never `click` the control under test.** Met: they use `focus()` once per screen, `Tab`, `Enter`, arrows and `Escape`. Journey 14 clicks the `Public page` switch (the toast's source, not the thing tested); journey 15 clicks links and `Save`, as the steps say.
- **No test writes over HTTP.** Met: `page.request.get` only, in journeys 9 and 15; `page.route` in 15 continues the request to the real server.
- **The app's environment stays explicit.** Met: `app.ts` unchanged.
- **Texts compared with the screens.** Every quoted text in the new specs (`Username or password is incorrect.`, `Changing type swaps the fields below.`, `Target added.`, `Target saved.`, `Target removed.`, `Confirm removal`, `Public page turned`, `Delete “<name>”?`, `No services yet`) is asserted by passing runs against the real screens.
- **Reading the tests.** Journey 9's two reads use the same endpoints; journey 11 steps 5 and 6 submit with `Enter` in `URL` and `Name`; journey 13 step 3 asserts the row stays and the opener has focus; journey 15 resolves the held promise only after the dashboard has been shown.
- **CONVENTIONS.md** layer, scoping and transaction rules do not apply: no Go or frontend code in the diff. No component library or design reference involved.
- **Prerequisites.** `ROLES.md` and `TESTING.md` already say a milestone's closing end-to-end work may be more than one task, and `frontend-hardening` is in the source (`describedBy` on `RadioGroup`, toast in the portal host, refetch in `useSaveService`).

## Mutation checks run

Each was a scratch edit of the source in this worktree, rebuilt with `make build`, run in Chromium, and reverted with `git checkout`.

| # | Mutation | Journey run | Result |
|---|---|---|---|
| A | Toast portal container `document.body` instead of the portal host | 14 | fails (step 2, 4 px off at 360 px). Step 1 on its own passes, so only the narrow-window check catches it. |
| B | `.toast-viewport` `z-index` 30 (above the dialog layer 20) | 14 | fails at `the dialog layer is above the toast`; hit testing is not skipped, so step 3 is real. |
| C | `aria-describedby` removed from the Type group | 11 | fails (description `""`) |
| D | `removeQueries` only, no refetch | 15 | fails (row not visible within 5 s) |
| E | `tabIndex={1}` on `Sign in` | 10 | fails (stops are not `Username, Password, Sign in`) |
| F | `outline: none !important` on `:focus-visible` | 10 to 13 | 4 tests fail (the mark), dialogs included |
| G | `modal={false}` on `Dialog` (no trap) | 12 | fails (`focus is inside the scope after Tab 6`) |
| H | `modal={false}` on `AlertDialog` | 13 | **no effect**: the primitive omits the prop and stays modal; the test passed. Not a gap in the test. |
| H2 | `AlertDialog` built from the plain Dialog primitive with `modal={false}` and `role="alertdialog"` | 13 | fails, but at `Cancel` not found after Tab (the dialog closed when focus left), so it shows the trap is guarded by the test, confounded by the swap |
| I | Initial focus of the delete dialog on `Delete service` | 13 | fails |
| J | Enter in an input blocked in the service form | 11 | fails (add form never saves) |
| K | `PublicViewEnabled` always `false` | 9 | fails before the restart (step 2), so it does not isolate persistence |
| K2 | Public-view setting reset to off at start | 9 | fails after the restart (`aria-checked` `false`) |
| L | Paused services started at start-up | 9 | fails (`/b` requested again) |
| M | Nothing started at start-up | 9 | fails (`/a` not checked twice in 20 s) |

Not run: `tabindex` reordering on the service and target forms (the reading-order rule), `outline: none` limited to inputs, a backend change that drops a table's rows at start. The reading-order check of journeys 11 and 12 and the unlisted mutation of dropping target rows are therefore not shown to fail.

## Edge cases tried

Workers 1 and 4; the specs twice in a row; the whole suite once; journey 14 and the keyboard specs three times at four workers (21 passed); Firefox. No failures. The 5 s toast in journey 14 did not expire under load in any of these runs.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Journey 14 step 3 can fail or go vacuous if the toast expires.** Category: test quality. The toast lasts 5 s; the test reads its box, opens the dialog and asserts `insideToast` true before and false after opening. If the machine stalls past 5 s between those, the "before" assertion fails (a flake) or, if the toast expires after the dialog opens, "under the dialog" passes vacuously (the re-made toast after Escape still asserts the other direction). Matters when: CI becomes slow enough that a keyboard open of a dialog takes more than a few seconds.
- **N2. Mutation A is caught only by the 360 px part of journey 14.** Category: test quality. Matters when: the toast placement for wide windows alone regresses in a way the narrow window does not show (for example a change of `right` only in the default rule).
- **N3. Journey 11 step 4 focuses the radio with `focus()` instead of Tab, and the task says "with focus in the Type group".** Category: test quality. The Tab path to the group is asserted in step 2. Matters when: the group stops being a single Tab stop in some state the step 2 list does not reach.
- **N4. `expectReached` and the reading-order check of journey 12 were not mutation-tested** (no `tabindex` reorder run on the forms). Category: test quality. Matters when: someone reorders fields in `TargetForm` or `ServiceForm` and this suite is the only guard. Report only otherwise.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing; no contract or requirement changed.
- `STACK.md`: no dependency or version adopted; Playwright stays at `1.64.1` in `e2e/package.json`.
- `docs/manual-checks.md`, "Keyboard (NFR-4)": still correct (the colour and visibility in both themes stay manual). The checkbox "Restart and upgrade (NFR-1)" is half automated now: the restart half is journey 9, the container and newer-image halves stay manual. The text could say so; the user decides.
- `TESTING.md` and `ROLES.md`: already reworded for more than one closing end-to-end task; nothing further.

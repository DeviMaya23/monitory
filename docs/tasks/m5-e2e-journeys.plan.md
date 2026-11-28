# Plan: m5-e2e-journeys

Branch: `feat/m5-e2e-journeys`. Only `e2e/**` and this file change.

- [x] Support code: `tabThrough`, `expectTabStaysIn`, `expectReadingOrder`, `expectFieldsBeforeActions`, `expectReached` in `e2e/support/helpers.ts`.
- [x] Journey 9 (steps 1 to 5: services body, targets bodies, public switch, visitor names, A resumes and B stays stopped): `e2e/journeys/data-survives-restart.spec.ts`, test `M5 journey 9 ...`.
- [x] Journey 10 (sign-in form by keyboard, steps 1 to 4, first test `@smoke`): `e2e/journeys/keyboard.spec.ts`, tests `M5 journey 10 ...` (two).
- [x] Journey 11 (add and edit service forms by keyboard, steps 1 to 6, hint description, arrow swap, Enter saves): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 11 ...`.
- [x] Journey 12 (target dialog by keyboard, steps 1 to 6): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 12 ...`.
- [x] Journey 13 (delete confirmation by keyboard, steps 1 to 4): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 13 ...`.
- [x] Journey 14 (toast placement at 1000x400 and 360x600, stays under a dialog both directions, steps 1 to 3): `e2e/journeys/toast-and-refresh.spec.ts`, test(s) `M5 journey 14 ...`.
- [x] Journey 15 (save finishing after the admin left refreshes the dashboard, steps 1 to 4): `e2e/journeys/toast-and-refresh.spec.ts`, test `M5 journey 15 ...`.
- [x] Repo-wide: smoke and new specs. Outcome: new specs run, passed in Chromium (workers 4 and 1, repeated), whole Chromium suite 109 passed, `@smoke` subset 10 passed (run as `npx playwright test --project=chromium --grep @smoke`: `make test-e2e-smoke` failed at `mailpit-up` because a sibling worktree's Mailpit already holds ports 1025/8025; that container was left alone and served the run). Firefox: run, 8 passed. WebKit: not run: does not work on macOS 14 (`TESTING.md`).
- [x] Repo-wide: `make check`. Outcome: run, passed.
- [x] Integration tests (`make test-integration`). Outcome: not run: nothing outside `e2e/` changed, so no code with integration tests is touched.

## Judgment calls

- **Focus guards.** The dialog's focus trap wraps through two inert, hidden sentinel spans (`data-base-ui-focus-guard`) beside the popup; focus rests on one for an instant, then the library moves it inside. Read straight after a Tab, `expectTabStaysIn` and `tabThrough` sometimes saw the sentinel (journeys 12 and 13 failed intermittently). The helpers now wait (up to 2 s) until focus is not on a sentinel before reading. A trap that lets focus go to a real control still fails: focus ends outside.
- **`tabThrough` stops when nothing moves.** In Firefox, Tab past the last control goes to the browser's own UI and the document keeps the last element; the helper ends when a Tab leaves the stop unchanged (journey 10 got `Sign in` repeated otherwise).
- **Journey 13 reads the mark after each Tab, not on the first focus.** The task asks for this ("read after each Tab"). The opener is focused with `focus()`, and Firefox does not treat the dialog's script focus on Cancel as `:focus-visible` in that case. The first-focus mark is not asserted.
- **Journey 12, step 3**: "focus is on a control of the page" is checked as an element inside `main` that is, or sits inside, a `button` or `a`.
- **Journey 14 toasts.** Each toast is made after every dialog-role element is gone (a service saved just before leaves a toast too, which would raise the stack), and the pointer is moved to the window's corner first (a pointer over a toast pauses its timer).
- **Journey 11, step 5**: after the Type group, Tab to `URL` takes one or two presses depending on whether the Method select sits between; the test checks focus and presses once more if needed.
- **Journey 15**: the save button is matched by `/^Save/` because its name changes while saving.
- **Journey 9**: `state.last_checked_at` is the only field dropped from the services comparison; `last_status_change_at` is also asserted equal on its own.

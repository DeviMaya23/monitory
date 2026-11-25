# Plan: m5-e2e-journeys

Branch: `feat/m5-e2e-journeys`. Only `e2e/**` and this file change.

- [ ] Support code: `tabThrough`, `expectTabStaysIn`, `expectReadingOrder`, `expectFieldsBeforeActions`, `expectReached` in `e2e/support/helpers.ts`.
- [ ] Journey 9 (steps 1 to 5: services body, targets bodies, public switch, visitor names, A resumes and B stays stopped): `e2e/journeys/data-survives-restart.spec.ts`, test `M5 journey 9 ...`.
- [ ] Journey 10 (sign-in form by keyboard, steps 1 to 4, first test `@smoke`): `e2e/journeys/keyboard.spec.ts`, tests `M5 journey 10 ...` (two).
- [ ] Journey 11 (add and edit service forms by keyboard, steps 1 to 6, hint description, arrow swap, Enter saves): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 11 ...`.
- [ ] Journey 12 (target dialog by keyboard, steps 1 to 6): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 12 ...`.
- [ ] Journey 13 (delete confirmation by keyboard, steps 1 to 4): `e2e/journeys/keyboard.spec.ts`, test `M5 journey 13 ...`.
- [ ] Journey 14 (toast placement at 1000x400 and 360x600, stays under a dialog both directions, steps 1 to 3): `e2e/journeys/toast-and-refresh.spec.ts`, test(s) `M5 journey 14 ...`.
- [ ] Journey 15 (save finishing after the admin left refreshes the dashboard, steps 1 to 4): `e2e/journeys/toast-and-refresh.spec.ts`, test `M5 journey 15 ...`.
- [ ] Repo-wide: `make test-e2e-smoke` passes; new specs pass in Chromium (`npx playwright test data-survives-restart keyboard toast-and-refresh --project=chromium`). Outcome: 
- [ ] Repo-wide: `make check`. Outcome: 
- [ ] Integration tests (`make test-integration`): the task touches no backend code. Outcome: 

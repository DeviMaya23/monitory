# Verification report: service public page toggle

Branch: `verify/service-public-toggle` (the verified code is `feat/service-public-toggle` at `3db0e8b`; this branch adds this report and two test rows).

Result: **no Blocking findings.** `make check`: run, passed (second run; see Non-blocking 1 for the first). Integration tests: not run, the task touches no Go code and the frontend has none.

## Criteria

"Real?" = would the named test fail if the behavior were removed. Yes means a mutation (below) or the assertion's shape shows it fails.

| # | Criterion | Test(s) | Real? | Status |
|---|---|---|---|---|
| 1 | `toServiceInput` sends the flag, true and false, HTTP and TCP (FR-27, FR-68) | `serviceInput.test.ts` "is sent as %s for an HTTP and a TCP form" | Yes (M1) | Met |
| 2 | `toFormValues` gives true, false, false for true, false, absent | `serviceInput.test.ts` "is read from a service with the flag %s" | Yes (M4) | Met |
| 3 | Round trip keeps the flag | `serviceInput.test.ts` "survives the round trip" | Yes (M4) | Met |
| 4 | `ADD_DEFAULT_VALUES.shown_on_public_view` is `false` (FR-68) | `serviceInput.test.ts` "starts false on the add form" | Yes (M3) | Met |
| 5 | `useUpdateService` sends the form's value, not the loaded one; body is exactly `toServiceInput(values)` | `useUpdateService.test.tsx` "sends the form's public flag, not the loaded one" (both directions), "sends a saved form value as it is" | Yes (M2) | Met |
| 6 | Group: legend, switch, description; follows value; toggles; disabled while `saving` | `PublicPageGroup.test.tsx` (3 tests) | Yes (M5) | Met |
| 7 | Add idle: last group, after Alerts, before the test panel, off; untouched sends false; on sends true (FR-68, FR-27) | `AddServiceForm.test.tsx` "is the last group…", "sends shown_on_public_view for the switch %s" | Yes (M3, M6) | Met |
| 8 | Edit shown/hidden: switch state; unchanged sends as loaded; toggled sends the opposite (FR-27, FR-7) | `EditServiceForm.test.tsx` "for a service saved as shown=%s…" (state and unchanged, toggled), "with nothing changed sends the saved values…" | Yes (M4, M2). The "unchanged" half alone would pass without the hook change (loaded equals form); the "toggled" half is what fails | Met |
| 9 | Leaving: Unsaved changes, Cancel and back link ask, unload armed; put back clears (Add and Edit) | `AddServiceForm.test.tsx` "counts the switch on as changed…", `EditServiceForm.test.tsx` "counts a change from the loaded value…" (Cancel and back link), `formChanged.test.ts` row | Yes (M7) | Met |
| 10 | In flight: disabled while pending, enabled after failure | Add and Edit "is disabled while a save is pending…" | Yes (M5) | Met |
| 11 | Tab order Recovery message, switch, Run test, Cancel; Space toggles (NFR-4) | `AddServiceForm.test.tsx` "is reached by Tab after the Recovery message…" and the long Tab-order case; `ServiceForm.test.tsx` Tab case | Yes (M6) | Met |
| 12 | 422 naming `shown_on_public_view`: plain text, no link, nothing marked, no text under switch, toggling clears nothing | Add "lists a 422 naming…", Edit "lists a 422 naming…" | Partly: the "no error text under the switch" and "plain text" assertions hold because no code maps that path; I did not mutate it (see mutation list). It would fail if someone mapped the path to a field | Met |
| 13 | TCP form shows the group (after Timing, Alerts) and sends the value | Add "shows the group on a TCP form…", Edit "sends a TCP service's saved flag…" | Yes (M1, M2) | Met |
| 14 | `make check` passes | run | n/a | Met (second run; first run had a timeout flake) |
| 15 | Nothing outside allowed paths; `package.json`, lockfile unchanged | `git diff 607a2f0 HEAD --stat`: only `features/service-form/**`, `App.test.tsx` (one line), the plan file | n/a | Met |

## Plan check

- Every criterion has a plan item; none missing.
- Every ticked item has an existing test that checks the behavior (the table above names them).
- Plan line "`make check` passes: run, passed" does not mention the timeout flake I saw (Non-blocking 1); not a plan/diff mismatch.
- Plan vs diff: the plan's judgment calls match the diff. `ServiceForm.test.tsx` exists (the task file says it does not); the builder edited its Tab case and did not create it. Correct.
- The Edit test titled "…sends it unchanged, and sends the opposite once toggled" only asserts the unchanged half; the opposite half is the next `it.each`. Cosmetic.

## Rule checks (by reading the diff)

- Dependencies: `package.json` and lockfile unchanged; no import added beyond `react-hook-form` (already used) and the `Switch` wrapper.
- `serviceInput.ts`: the flag is sent from the form's value in one place; `useUpdateService` adds nothing; `toFormValues` and `toServiceInput` are inverses for the flag.
- Components: `PublicPageGroup` is a `fieldset.group` with the `Switch` wrapper, takes `control` and `saving` only, no request logic; words are in `lib/publicPageGroup.ts` and match the task file exactly; no literal colour or pixel value; `features/service-form/` imports nothing from `app-shell/` or another feature.
- Contract: key and type match `ServiceInput.shown_on_public_view`; no new status or code.
- No design reference code copied; no hand-written switch.
- CONVENTIONS layer boundaries and transactions: not touched (frontend only).

## Mutation checks run

Each run against the Public page, flag, round-trip and changed-form tests. All reverted (`git checkout`).

| # | Mutation | Result |
|---|---|---|
| M1 | Drop the flag from `toServiceInput` | 17 tests failed |
| M2 | Update hook sends the loaded value | 5 failed (Edit toggled, Edit TCP, two `useUpdateService` cases) |
| M3 | Add default `true` | 9 failed |
| M4 | `toFormValues` reads `false` for a saved `true` | 6 failed |
| M5 | Switch enabled while saving | 3 failed (group, Add, Edit) |
| M6 | Group removed from the form; group moved before Alerts | 21 failed each (a form with the group removed also fails) |
| M7 | `isFormChanged` ignores the key | 4 failed (Add, Edit Cancel, Edit back link, `formChanged.test.ts`) |

Not mutated: the 422 plain-text path (criterion 12).

## Inputs tried beyond the task file

Added as rows in the existing test files, both passed:

- Add: a 422 on the name with the switch on keeps the switch on, and the retry sends `true` (`AddServiceForm.test.tsx`, Public page describe).
- Edit: switch toggled and put back, then saved, sends the saved value for a shown and a hidden service (`EditServiceForm.test.tsx`, Public page describe).

Already covered by existing tests: a service with no flag in the answer (Edit "no saved flag"), double click on Save sends one request (existing Add test), switch on then off in Add.

Cannot prove: the look at 360 px, the focus outline, and the real server's answers. I did not run the built app.

## Integration tests

Not run: the task touches no Go code, and the frontend has no integration tests. No criterion depends only on one.

## Findings

### Blocking

None.

### Non-blocking

1. **Timeout flake in `AddServiceForm.test.tsx`.** Category: test quality. On the first `make check`, "sends what was typed, locks the form in flight, and on the 201 goes to /…" timed out at 5000 ms, while the whole file took about 113 s to 167 s (230 tests). It passed alone and on the second full run. Matters when: CI runs on a slower or busier machine and one of the 230 tests in that file crosses 5 s. (Not caused by this task: the test is not new and the added tests are a small share of the file.)
2. **Edit test title overstates.** Category: test quality (cosmetic). Matters when: someone reads the title as proof that the toggled half is in that test. Report only.

## Docs or specs that no longer match

- `docs/tasks/service-public-toggle.md` says `ServiceForm.test.tsx` "does not exist"; it does (from `service-test-panel`). Stale task text; the builder handled it correctly.
- `STACK.md`, `docs/openapi.yaml`, `docs/requirements.md`: no change needed. No dependency or version adopted.
- `docs/design/README.md`: nothing to update; the Public page group is drawn on the board.

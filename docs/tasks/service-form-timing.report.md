# Verification report: service form timing

Verifier branch: `verify/service-form-timing` (on top of the builder's `feat/service-form-timing`, commit `4f75884`).

**Result: no Blocking findings.** `make check`: exit 0 on the final run (43 files, 709 tests). Integration tests: not run, none apply (frontend-only task, no backend change).

`make check` needed two runs. The first had one timeout (5000 ms) in `TargetDialog.test.tsx` "adds a header row… (FR-92)", a file this branch does not touch. It passed alone and on the second full run. It is already in `docs/tasks/backlog.md` as a known flake.

## Criteria

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | Starting values 60/10/2/10 (FR-57) | `timingGroup.test.ts` "are 60, 10, 2 and 10" | Real (mutation 16) | Met |
| 2 | Whole-number reading: accepts `0`, `60`, ` 12 `, max safe; rejects `''`, ` `, `-1`, `1.5`, `1e3`, `abc`, `+5`, above max | `timingGroup.test.ts` `readWholeNumber` tables | Real (mutation 3 fails `reads " 12 " as 12`) | Met |
| 3 | Longest attempt: 50 fits, 70 exceeds, equal fits, zero retries (FR-56) | `timingGroup.test.ts` `longestAttempt` | Real (mutation 12) | Met |
| 4 | Body has four integers, `'45'` → 45, defaults 60/10/2/10 (FR-41/51/53/57) | `useCreateService.test.tsx` "sends the four timing texts as integers, trimmed" | Real (mutations 1, 2) | Met |
| 5 | "Changed" false at start, true on any one text incl. trailing space, false when put back | `useLeaveGuard.test.tsx` per-field table | Real (mutation 9) | Met |
| 6 | Four paths map to label, target and id; bare `settings` → `Timing`, no target; `check.headers[2].value` and `toString` unmapped; group message readable and clearable; clearing a field removes only its entries | `fieldLabels.test.ts`, `useServerErrors.test.tsx` | Real (mutations 6, 7, 8, 10, 11) | Met |
| 7 | Idle: group between Request and Alerts, labels, values, addons, no placeholder/hint, line `10 × (1 + 2) + 10 × 2 = 50 s fits in the 60 s interval.`, empty footer | `AddServiceForm.test.tsx` "shows between Request and Alerts…", `TimingGroup.test.tsx` | Real (mutations 15, 16, 19) | Met |
| 8 | Line updates while typing, hides on blank/letters, `fits` returns; saving on `exceeds` still sends (FR-56) | "updates the line as the admin types…", "still sends the request when the line says exceeds" | Real (mutations 4, 12, 18) | Met |
| 9 | Send: untouched body, typed `45/5/0/1`, ` 12 ` → 12 | "sends the typed values as integers…", `App.test.tsx` body assertion, "sends what was typed…" | Real (mutations 1, 2, 3) | Met |
| 10 | Client checks: message under field, focus on first invalid in form order, nothing sent, cleared on edit, two bad fields both show | `client checks` table, "shows both bad fields…", "puts the Name before…" | Real (mutations 5a, 14) | Met |
| 11 | In flight: read-only, editable after failure | "locks the four inputs in flight…", `TimingGroup.test.tsx` "locks the inputs while saving" | Real (mutation 13) | Met |
| 12 | `422` for `settings.timeout_seconds` and `settings.retry_count`: ordered summary entries, messages with aria, links focus input, summary focused, markup as text, edit clears only its own | `a 422 for fields` (4 tests) | Real (mutations 6, 8) | Met |
| 13 | `422` bare `settings`: message under legend with icon, `group--invalid`, `aria-describedby` on line and error, `Timing:` plain text, edit of any of four clears error, class, entry and summary (FR-56) | `a 422 for the group` (3 tests, per-input table) | Real (mutations 7, 10, 11, 15, 17) | Met |
| 14 | `check.url` and a timing error together, cleared independently | "a 422 for check.url and a timing error clear independently" | Real (mutation 8) | Met |
| 15 | Leaving: footer, Cancel asks, unload armed, put back clears | "counts a changed value, asks on Cancel…" | Real (mutation 9) | Met |
| 16 | Tab order URL → four inputs → switch (NFR-4) | "is reached by Tab from the URL…" and the Alerts-group Tab test | Real (mutation 6 breaks it) | Met |
| 17 | Replaced tests as listed | diff of the named files | n/a | Met (checked in the diff; nothing else loosened) |
| 18 | `make check` passes; no change outside allowed paths; `package.json` and lockfile unchanged | `make check`; `git diff main...HEAD --stat` | n/a | Met |

## Plan check (`service-form-timing.plan.md`)

- Every acceptance criterion is in the plan. None missing.
- Every ticked item has a test that exists and checks the behavior (see "Real?" above and the mutation list).
- Differences between plan and diff:
  - The builder reflowed some existing lines in `useServerErrors.ts` (the `setEdited` generic and the `errorFor` line). No behavior change. Cosmetic.
  - The plan's note that layout at 360 px is unverified matches my own limit (see below).
- The plan says the line is three spans. The code does that. The task file says `p.timing-sum` with a mono span. Both fit.

## Rule checks (by reading the diff)

- **Dependencies:** none added; `package.json`, the lockfile and `schema.d.ts` unchanged. No versions adopted. `react-hook-form` and `lucide-react` were already installed.
- **Paths:** changes are in `features/service-form/**`, one assertion in `App.test.tsx`, and the plan file. `fixtures.ts`, `components.css`, `components/ui/**`, `backend/**` and `docs/**` untouched, except this report.
- **Layers and imports:** no import from `features/alert-list`, `features/service-list` or `features/sign-in`. `TimingGroup` has no request code. Icon comes through the existing `FieldErrorText` (Lucide).
- **Always four integers; only client check is "whole number":** `useCreateService.ts` sends all four through `Number(text.trim())`. The only `validate` is `readWholeNumber(value) !== null`. No range, minimum, maximum or worst-case rule blocks a submit (mutations 4, 5a and 5b confirm tests catch each).
- **Summary line is display only:** computed in `useSummaryLine`; not used by submit.
- **Server messages are not rewritten:** shown through `FieldErrorText` as received (mutation 11).
- **Strings defined once:** `TIMING_TEXT`, `TIMING_FIELDS`, `TIMING_DEFAULTS` in `lib/timingGroup.ts`. The `×` is U+00D7.
- **Keyboard:** the order in the DOM is Name, Method, URL, four inputs, switch, messages, footer. Each input has a `label`/`htmlFor`. Errors are linked by `aria-describedby`. The summary keeps its `tabindex="-1"` (unchanged `ErrorSummary`).
- **Component library:** the task prescribes plain `div.input-group` and `input.input` markup; no shadcn component for numeric text input is replaced by hand-written code.
- **Design copy:** `.timing-sum` lines in `service-form.css` equal the two rules in `docs/design/service-form.css` (values with tokens). No board markup copied.
- **Layout by reading CSS:** `.grid, .grid--4` becomes one column at the existing breakpoint (`components.css:563`). `.timing-sum` has `flex-wrap: wrap`. The addon is an always-rendered sibling span, so it is visible on each input. jsdom cannot prove any of this.
- **Contract:** body matches `ServiceInput.settings`; no new status or code handled.

## Mutation checks run

Each was applied to the source, the service-form tests and `App.test.tsx` run, then reverted (`git status` clean after each).

| # | Mutation | Result |
|---|---|---|
| 1 | Send the texts as strings | Failed 9 tests |
| 2 | Send no `settings` | Failed 9 tests |
| 3 | Do not trim in `readWholeNumber` | Failed 2 tests |
| 4 | Block saving when the line says `exceeds` | Failed "still sends the request when the line says exceeds" |
| 5a | Client minimum (retries ≥ 1) | Failed "sends the typed values as integers…" (retries `0`) |
| 5b | Client maximum (≤ 86400) | **Survived** as built. I added tests; now fails 2 tests (see below) |
| 6 | Map `settings.timeout_seconds` to the Retries input | Failed 11 tests |
| 7 | Leave the group error after an edit | Failed 5 tests |
| 8 | Leave the field error after an edit | Failed 3 tests |
| 9 | Drop the timing values from "changed" | Failed 6 tests |
| 10 | Make the bare `settings` entry a link | Failed 3 tests |
| 11 | Rewrite the server's message | Failed 2 tests |
| 12 | `<` instead of `<=` | Failed 2 tests |
| 13 | No `readOnly` in flight | Failed 2 tests |
| 14 | Client error not cleared on edit | Failed 6 tests |
| 15 | Drop the group's `aria-describedby` | Failed 6 tests |
| 16 | Wrong default (retries 3) | Failed 9 tests |
| 17 | No `group--invalid` class | Failed 3 tests |
| 18 | Hide the line when it exceeds | Failed 5 tests |
| 19 | Wrong addon for retries | Failed 1 test |

## Tests I added

In `AddServiceForm.test.tsx` (the existing test file), in the Timing group block:

- A table, `0`, `100000` and `9007199254740991` for Check interval: each is sent as typed. This pins "no client minimum or maximum" (FR-57) at the boundary and well past a typical server range.
- `9007199254740992` (one above the largest safe integer) is refused with `Enter a whole number.` and nothing is sent.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: a client maximum was not caught.** Mutation 5b survived; the tests only sent small values. Fixed here with the added tests. *Matters when:* someone adds a "sensible" upper bound to the form.
2. **Test quality / latent bug: the line and the sent value can differ near the safe-integer limit.** If each field is a safe integer but the worst case is not, the line is hidden and the request is still sent (judgment call in the plan, matches the task file). No test covers the hidden-line case with an actual send. *Matters when:* someone changes `longestAttempt` to return a number for unsafe sums, or blocks submit when the line is hidden. Category: test quality.
3. **Cosmetic: unrelated reformatting in `useServerErrors.ts`.** Existing lines were reflowed with no behavior change. *Matters when:* the file is blamed during a later review. Report only.
4. **Decision needed: the group error's plain-text summary entry departs from the board** (the board draws a link). The task file records this and says the user may list it in `docs/design/README.md`. *Matters when:* the design README is next reviewed against the screens.
5. **Not proven (by design):** the look at 360 px and the real server's range messages. Both need a person or a real server; see below.

## What I did not run

- **The built app was not run in a browser.** No live check was done. The layout at 360 px, the addon rendering and the real server's `out_of_range` and `check_budget_exceeded` messages are unverified. This report has no live-run section.
- Integration tests: not run, none apply to this task.

## Docs or specs that no longer match

- `docs/design/README.md`: it does not yet list the deviation that the Timing group's summary entry is plain text, not a link (task file "Decisions"). The user may add it.
- `docs/tasks/backlog.md`: the "Left out of" items for the form groups (Timing) can be struck now. The edit-form task has a second group to build from this one.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: nothing out of date; no dependency or version adopted.

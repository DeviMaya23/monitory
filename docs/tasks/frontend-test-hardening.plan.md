# Plan: frontend test hardening

Branch: `feat/frontend-test-hardening`

Integration tests: none apply (frontend test files only). Outcome: `not run: no code with integration tests is touched`.

## Checklist (one item per acceptance criterion)

**Measurement and speed**

- [ ] Plan holds the before and after numbers of step 1 per file (sum of case durations, test count). Section "Measurements" below; measured with `npx vitest run <file> --reporter=json` per file, `scratchpad/run.sh`.
- [ ] `AddServiceForm.test.tsx` alone: sum of durations at least a fifth lower. File: `AddServiceForm.test.tsx`; technique: `delay: null` in `setup()`, one-step filler text in `fill`.
- [ ] No case of the seven files over 2.5 s in a single-file run; the two former `15_000` cases (`AddServiceForm.test.tsx`, "Health rules") about 1 s or less, durations in the plan.
- [ ] `npm test` passes three times in a row under one busy loop per core; load and result in the plan.

**Nothing weakened**

- [ ] Per file, old and new `expect(` lines compared; count before and after in the plan (all seven files).
- [ ] No `15_000`, third argument to `it`, `{ timeout:` or `useFakeTimers` added; `git diff --stat` lists only allowed files.
- [ ] Typing and keyboard cases keep `user.type` with their keys; list in the plan.
- [ ] Mutations (a) `AddServiceForm.test.tsx` "sends what was typed…" (b) Enter keyboard cases (c) "editing a field removes its error…" (d) `AddServiceForm.test.tsx` "sends Text, false and true rules in order…" (e) `RequestRowsGroup.test.tsx`, `TargetDialog.test.tsx`, `HealthRulesGroup.test.tsx` no-limit cases. Results in the plan.

**Repo-wide**

- [ ] `make check` passes.
- [ ] Nothing outside the allowed paths changed.

## Measurements

(to be filled)

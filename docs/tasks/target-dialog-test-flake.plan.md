# Plan: target dialog test flake

Branch: feat/target-dialog-test-flake. Only file changed besides this plan: `frontend/src/features/alert-list/components/TargetDialog.test.tsx`.

## Checklist

- [ ] Reproduce on the default version: single-file verbose run, note the long test's duration; `make test-frontend` x3, note timeouts and durations. (File: `TargetDialog.test.tsx`; test: the old "adds a header row … has no limit (FR-92)".) Result: _pending_
- [ ] Behavior case: three rows only, same assertions (focus on row 1 name, numbering, renumber and focus after removing row 2, order of the sent headers). File: `TargetDialog.test.tsx`; new test in `describe('the form')`, title ending `(FR-92)`. Result: _pending_
- [ ] No-limit case: 21 `fireEvent.click` on `Add header`, 21 `Remove header` buttons, `Header 21 name` present; no typing, no submit. File: `TargetDialog.test.tsx`; new test, title ending `(FR-92)`. Result: _pending_
- [ ] Each new case under 1000 ms in the single-file verbose run (durations noted below); suite x3 without a timeout in this file. Result: _pending_
- [ ] By reading: old title gone, two cases, every old assertion in exactly one, no timeout/third `it` argument/fake timers/sleep. Result: _pending_
- [ ] `make check` passes. Result: _pending_
- [ ] Nothing outside the allowed paths changed (`git diff --stat main`). Result: _pending_
- [ ] Integration tests: none apply (frontend test file only). `not run: no code with integration tests is touched`

## Judgment calls

_pending_

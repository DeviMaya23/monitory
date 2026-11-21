# Plan: target dialog test flake

Branch: feat/target-dialog-test-flake. Only file changed besides this plan: `frontend/src/features/alert-list/components/TargetDialog.test.tsx`.

## Checklist

- [x] Reproduce on the default version (`TargetDialog.test.tsx`, the old "adds a header row … has no limit (FR-92)" test). Single-file verbose run: 4259 ms (this machine is slower than the task's 1.9 s). `make test-frontend` x3: it timed out at 5000 ms in all three runs (5190, 5060, 5081 ms); suite durations 158.7 s, 144.1 s, 148.8 s.
- [x] Behavior case: three rows only, same assertions (focus on row 1 name, numbering, remove row 2 then `Header 3 name` gone / `Header 2 name` = `C` with focus, order of sent headers). `TargetDialog.test.tsx`, in `describe('the form')`, "adds a header row and focuses its name; names the inputs by number; renumbers and moves focus on removal; sends rows in order, empty ones too (FR-92)".
- [x] No-limit case: 21 `fireEvent.click` on `Add header`, 21 `Remove header` buttons, `Header 21 name` present; no typing, no submit. `TargetDialog.test.tsx`, "adds 21 header rows and offers each a Remove button: there is no limit (FR-92)".
- [x] Each case under 1000 ms in the single-file verbose run: behavior 781 ms, no-limit 822 ms (old: 4259 ms on this machine). Full suite x3 after the change: 911 passed each time, no timeout (123.2 s, 131.5 s, 99.5 s).
- [x] By reading: old title gone; two cases; every old assertion in exactly one case with the same expectation (see Judgment calls for the two that moved); no timeout, no third `it` argument, no fake timers, no sleep.
- [x] `make check` passes (exit 0).
- [x] Nothing outside the allowed paths changed (`git diff --stat c674ff1`: this plan and `TargetDialog.test.tsx`).
- [x] Integration tests: not run: no code with integration tests is touched (frontend test file only).

## Judgment calls

- The "21 Remove header buttons" assertion and `Header 21 name` live in the no-limit case only; the behavior case no longer asserts a count of 21 (it has three rows). The task assigns them this way.
- The behavior case does not assert a `Remove header` count of 3 before removing row 2: the old case had no such assertion at that point.
- The no-limit case does not type a URL (the task says none is typed) and does not submit.
- I wrote the titles as: the old title minus "; has no limit" for the behavior case, and "adds 21 header rows and offers each a Remove button: there is no limit (FR-92)" for the other.
- `main` locally has moved on from this branch's base, so I compared the diff against the base commit `c674ff1`.
- Dependencies were installed with `npm ci` (no lockfile change).

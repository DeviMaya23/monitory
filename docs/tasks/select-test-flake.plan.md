# Plan: select test flake

Branch: feat/select-test-flake. Only file changed besides this plan: `frontend/src/components/ui/Select.test.tsx`.

- [ ] Reproduce on the unchanged file: 30 single-file runs, count and message. File: `Select.test.tsx`, test "lists every option when opened…". Result: (to fill)
- [ ] After the change: the same 30 runs have no failure. File: `Select.test.tsx`. Result: (to fill)
- [ ] After the change: `make test-frontend` run 3 times, no failure. Result: (to fill)
- [ ] By reading: every test that reads the popup awaits `findByRole('listbox')` first in the same test. File: `Select.test.tsx`, test "lists every option…" gets the wait; the arrow-key test is checked by repeated runs and changed only if it fails (otherwise reported).
- [ ] Assertions unchanged in meaning; no timeout, retry, sleep added; `Select.tsx`, `test/setup.ts`, other files untouched. Checked with `git diff main`.
- [ ] `make check` passes. Result: (to fill)
- [ ] Nothing outside the allowed path changed (`git diff --stat main`).
- [ ] Integration tests: not run: the task touches only a frontend test file; no Go code or integration tests are affected.

# Plan: select test flake

Branch: feat/select-test-flake. Only file changed besides this plan: `frontend/src/components/ui/Select.test.tsx`.

- [x] Reproduce on the unchanged file: 30 single-file runs, count and message. File: `Select.test.tsx`, test "lists every option when opened…". Result: 7 of 30 runs failed, all in "lists every option…" with `Unable to find an accessible element with the role "listbox"`. The arrow-key test never failed.
- [x] After the change: the same 30 runs have no failure. File: `Select.test.tsx`. Result: 0 of 30 failed.
- [x] After the change: `make test-frontend` run 3 times, no failure. Result: 3 of 3 passed (38 files, 584 tests each).
- [x] By reading: every test that reads the popup awaits `findByRole('listbox')` first in the same test. File: `Select.test.tsx`, test "lists every option…" gets the wait; the arrow-key test is checked by repeated runs and changed only if it fails (otherwise reported). Done: it did not fail in 60 runs, so unchanged; "renders its list…" already awaits `findByRole`.
- [x] Assertions unchanged in meaning; no timeout, retry, sleep added; `Select.tsx`, `test/setup.ts`, other files untouched. Checked with `git diff main`.
- [x] `make check` passes. Result: passed.
- [x] Nothing outside the allowed path changed (`git diff --stat main`).
- [x] Integration tests: not run: the task touches only a frontend test file; no Go code or integration tests are affected.

## Judgment calls

- Added the wait inline (`await screen.findByRole('listbox')`) in the one test and kept `optionNames` synchronous, which the task allowed.
- Counted the arrow-key test as not flaky because it passed in all 60 single-file runs (30 before, 30 after) and in 3 full-suite runs; left unchanged as instructed.
- Ran `npm ci` in `frontend/` to get dependencies; no tracked file changed.

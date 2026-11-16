<!-- Delete any section that does not apply. Keep it short: the details live in the task file, the plan and the report, so link them instead of repeating them. -->

## Task

`docs/tasks/<slug>.md` — <!-- one line: what a user can do after this merges -->

Branch chain: builder `<branch>` → verifier `<branch>` → <!-- fix round / second pass, if any -->

## What changed

<!-- 2 to 4 bullets: the behavior, not the file list. -->

-

## Evidence

- Verifier report: `docs/tasks/<slug>.report.md` — <!-- no Blocking findings | N Blocking fixed in round 2 | … -->
- Plan with judgment calls: `docs/tasks/<slug>.plan.md`
- Requirements covered: <!-- IDs; the report maps each to its test -->
- `make check`: <!-- passed on which branch/commit -->
- Integration tests: <!-- run by me, passed | not run, and why -->

## By hand

<!-- The verifier fills this in; nobody ticks anything. Nothing is tested by hand per pull request: whatever a test can assert (statuses, limits, messages) is in the report, and what needs a person is in `docs/manual-checks.md`. -->

- Live run by the verifier: <!-- yes: what it ran and against what, and the report section that lists it | no, and why -->
- Manual checks due once this merges: <!-- the heading in `docs/manual-checks.md` this merge makes due | none until <what else must merge> | none -->
- Pairs with: <!-- the other slice of this feature and which merges first, from the task file | nothing -->

## For the reviewer

- **Judgment calls the task file did not settle** (from the plan): <!-- list the ones worth a second look, or "none" -->
- **Non-blocking findings** (from the report): <!-- fixed here | in the backlog | left, because … -->
- **Docs or specs that no longer match** (from the report): <!-- or "none" -->
- **Known gaps** (from the task file): <!-- or "none" -->
- **Departures from the task file or the design**, and why: <!-- or "none" -->

## Merge notes

<!-- Order relative to other PRs, anything to run after merging (migration, dependency install, new env var), or "none". -->

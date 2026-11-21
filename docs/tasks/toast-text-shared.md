# Task: toast text shared

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The dashboard's two row-action hooks, `useDeleteService.ts` and `usePauseService.ts` (both in `features/service-list/hooks/`), each spell the same toasts and each carry the same function that sorts an API error into an outcome: the text `That service was already deleted.`, the text `The request wasn’t accepted. Reload and try again.` with its Reload button, and `toOutcome` (401 `unauthenticated`, 404 `not_found`, 403 `csrf_failed`, anything else failed). A verifier of `dashboard-pause-resume` found the risk: someone rewords one toast and forgets the other. This task gives these two toasts and the outcome function one home inside the feature, and has both hooks use it. No behavior changes: every toast, every outcome and every test stays as it is.

Requirements covered: none. This is a clean-up with no change of behavior; FR-8, FR-72 and FR-75 keep the proofs they have. Its criteria show that the texts and the outcome rule live once, and that a change to them reaches both hooks.

Out of scope:

- The other copies of the Reload toast outside `features/service-list`: `features/alert-list/hooks/useRemoveTarget.ts` and `app-shell/SessionProvider.tsx` (and the banner titles in `service-form` and `alert-list`). Sharing across features is a new shared place and needs the user's approval (`CONVENTIONS.md`, "Matching existing shapes"); the new module stays inside `features/service-list/lib/`, next to `servicesCache.ts`. A backlog line records the other copies.
- The success texts (`Service deleted.`, `“<name>” paused…`, `“<name>” resumed…`) and the failure texts that differ between the hooks (`Couldn’t delete the service. Try again.`, `Couldn’t pause the service. Try again.`, `Couldn’t resume the service. Try again.`): they are not duplicated and stay in their hooks.
- Everything about the cache (`servicesCache.ts`), the hooks' returned shapes, the components, the toast component and `useToast`.
- Any change to a backend file, the contract or the design.

## Prerequisite

None. The builder checks first that `useDeleteService.ts` and `usePauseService.ts` hold the two texts and a `toOutcome` function as described in "What exists", and that `useDeleteService.test.tsx` and `usePauseService.test.tsx` exist.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-list/hooks/useDeleteService.ts` and `usePauseService.ts`, and add `frontend/src/features/service-list/lib/rowActionToasts.ts` with `rowActionToasts.test.ts`. You may not change the hook test files `useDeleteService.test.tsx` and `usePauseService.test.tsx` (they are the proof that nothing changed), any other file under `frontend/src/` (the alert list, the app shell, the service form, `components/`, `lib/`), `frontend/package.json`, `frontend/package-lock.json`, the lint and build configuration, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/toast-text-shared.plan.md`).

Shared files this task touches: none besides the two hooks, which it owns while it runs. Tasks that may run at the same time: `worker-test-hardening` and `test-service-check-api` (backend), and the frontend group's form tasks (the form tasks change `features/service-form/` and the router, not these hooks).

## Operations used

None. The hooks keep calling `deleteService`, `pauseService` and `resumeService` as they do.

## Behavior

### What exists

- Both hooks define a private `Outcome` type and a private `toOutcome(error)`: an `ApiError` with status 401 and code `unauthenticated` is `unauthenticated`; 404 `not_found` is the "gone" outcome (named `already-deleted` in the delete hook and `gone` in the pause hook); 403 `csrf_failed` is `csrf`; everything else, including an `ApiError` with another status or code and any other error, is `failed`. The match is by status and code, never by message text.
- Both hooks, on the 404 outcome, remove the service from the cached list and show an error toast with the text `That service was already deleted.` (the delete hook also closes its dialog as removed).
- Both hooks, on the CSRF outcome, show an error toast with the text `The request wasn’t accepted. Reload and try again.` and a Reload action that reloads the page.
- On the unauthenticated outcome neither hook shows a toast (the session provider handles it).

### The change

A new module `features/service-list/lib/rowActionToasts.ts` holds, and the two hooks import:

- one `toOutcome` with one `Outcome` type, the rule above, with the "gone" outcome named `gone`. The delete hook's `already-deleted` is renamed `gone` where it uses it; no test refers to the name.
- the text `That service was already deleted.` and the text `The request wasn’t accepted. Reload and try again.` once each, and the Reload action (label `Reload`, which reloads the page), used by both hooks to build the toast they show. The module may export the texts, or functions that return the toast to show (`kind`, `message` and `action`), or both (the export names and shape are the builder's choice and go under "judgment calls" in the report); the hooks' calls of `toast.show` must give the same toasts as today, character for character, including the typographic apostrophe in `wasn’t`.

Nothing else in the hooks changes: the other toasts, the cache changes, the guards against a second request, the returned shapes.

### Known gaps

- The Reload toast text exists twice more outside this feature as a toast (`features/alert-list/hooks/useRemoveTarget.ts`, which also has its own copy of `toOutcome`, and `app-shell/SessionProvider.tsx`), and the banners in `service-form` and `alert-list` carry a related title with different words; they stay separate until the user approves a shared place (see the backlog line that this task adds).
- `toOutcome` treats a 403 with a code other than `csrf_failed` as a generic failure. The contract lists only `csrf_failed` for these operations, so this is correct today; the new unit test pins it.

## Structure

By `ARCHITECTURE.md` and the shape the feature already has: `features/service-list/lib/` holds pure helpers next to the hooks that use them (`servicesCache.ts`, `failureReason.ts`, each with a test file). The new module is of that kind: no React, no hooks, no `useToast`; the hooks call `toast.show` themselves. No shared component, no new top-level folder, no new dependency.

## Design reference

None. No screen changes.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

- `rowActionToasts.test.ts`, a unit test of the pure module: `toOutcome` maps an `ApiError` with 401 and `unauthenticated` to `unauthenticated`; 404 and `not_found` to `gone`; 403 and `csrf_failed` to `csrf`; and to `failed`: a 403 with another code, a 404 with another code, a 401 with another code, a 500, a 500 with the code `csrf_failed`, a 404 with the code `csrf_failed`, a plain `Error`, a string and `undefined` (the status-and-code cases give a matcher that looks at only one of the two something to fail on). The texts (or the toasts the module builds) equal `That service was already deleted.` and `The request wasn’t accepted. Reload and try again.` exactly, and the CSRF toast carries an action labelled `Reload` whose `onClick` calls `window.location.reload` (the test stubs `window.location` with `vi.stubGlobal` and unstubs it after, as `usePauseService.test.tsx` does).
- `useDeleteService.test.tsx` and `usePauseService.test.tsx` pass **unchanged** (their cases for the 404 toast, the CSRF toast with its Reload action and the unauthenticated case already pin the texts and the behavior). Their file contents are not edited.
- By reading: each of the two texts appears once under `frontend/src/features/service-list/` outside test files, in `rowActionToasts.ts`; neither hook defines `toOutcome` or `Outcome`; both import them from the module.
- The whole frontend suite passes (`make test-frontend`) three times, with no new flaky case.
- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** the diff touches only the two hooks and the two new files; the hook test files are untouched; the module imports nothing from React, `useToast` or the hooks; the apostrophe in `wasn’t` is the typographic one, as in the old code; no toast text of the hooks other than the two moved ones changed.
- **Mutation check:** reword the 404 text in the module and see both hook tests fail (so both hooks really use the module); reword the CSRF text and see both hook tests and the unit test fail; make `toOutcome` treat any 403 as `csrf` and see the unit test fail (the case the previous verifier found uncovered); make it match on the code alone, or on the status alone, and see the unit test fail.
- **Run it:** `make test-frontend` three times; report failures. The known flaky case `TargetDialog.test.tsx` "adds a header row…" may time out under load and is not this task's; if `target-dialog-test-flake` has merged, it should not.

## Stop and ask when

- The contract, a requirement, or this file conflict with each other.
- A hook test fails after the change and the cause is not a typo: do not edit the test; report.
- You think you need a change outside your paths (the other features, `components/`, `lib/`, a dependency).
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, the test that shows the texts live once, which tests ran (and the three `make test-frontend` runs), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.

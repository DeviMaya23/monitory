# Task: <short name>

> Copy this file to `docs/tasks/<slug>.md` and fill it in. Delete every `<!-- guidance -->` comment and every section that does not apply. The slug is what `scripts/stage.sh` takes as `TASK=<slug>`.
>
> A task file is the agent's whole brief. If a behavior, message, limit or dependency is not written here, the agent will invent it, and you will find out in review. Sections are ordered the way the agent reads them.

<!-- guidance: one paragraph for the role. Example: "One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them." -->

## Goal

<!-- guidance: two or three sentences. What can a user do after this task that they could not before? Name the screens or operations. -->

Requirements covered: <!-- FR/NFR IDs, each proven by an acceptance criterion below. -->

Out of scope: <!-- everything a reader might assume is included but is not. Name the neighbouring screens and operations, and say why (not built yet, a stub, a later task). -->

## Prerequisite

<!-- guidance: anything that must already be on main (merged tasks, a regenerated contract, a constant in generated code). The builder checks it first and stops to ask if it is missing; it never creates it. Delete if none. -->

## Role and ownership

Role: <!-- Backend | Frontend | …, see ROLES.md -->

You may change `<paths>`. You may not change `<paths>`, `docs/**` (except your own plan file, `docs/tasks/<slug>.plan.md`), or <!-- anything else forbidden: the contract, migrations, generated files, the build file -->.

Shared files this task touches, and who owns each: <!-- see ROLES.md, "Shared state". Name the tasks that run at the same time. -->

## Operations used

<!-- guidance: the operationIds from docs/openapi.yaml, with method and path. Say which are real on the server and which are still stubs. State where types come from (generated, never hand-copied). -->

## Behavior

<!-- guidance: the heart of the file. One subsection per screen or operation, in the order things happen. For each:
- the happy path, step by step;
- every failure, with the exact message or status and code, and where it is shown;
- every limit, with its number and what happens at exactly the limit and one past it;
- for anything over time (polling, retries, timers, concurrency), what happens on each outcome, including a failure that arrives after data is already on screen;
- the exact wording of every user-visible message, in a table if there are many.
Everything must be inside what docs/openapi.yaml lists; anything else is a contract change and goes to the user first (see AUTHORING.md).
Decide the wording yourself. The agent's invented wording becomes a "judgment call" you have to review. -->

### Known gaps

<!-- guidance: things deliberately not solved, with the reason, so the builder does not work around them and the verifier does not flag them. -->

## Structure

<!-- guidance: where code goes, by reference to ARCHITECTURE.md. Name the hooks, helpers and components that must exist. Say what goes to a shared folder and what stays in its feature. Describe shapes; do not paste code. -->

## Design reference

<!-- guidance: frontend tasks only. The design files under docs/design/ are a reference, read-only. Copy values from the styles (colours, spacing, type) into the project's tokens; never copy component code. Use the component library named in STACK.md for anything it provides (dialogs, menus, selects, toasts). A hand-written version of a library-provided component is a verifier finding. -->

## Dependencies

<!-- guidance: only libraries STACK.md names, with the version resolved now (latest stable, at least two weeks old) and the command used, for the user to approve with the task. Anything else is a question for the user first. Only one agent at a time may change manifests or lockfiles. -->

## Acceptance criteria

<!-- guidance: every criterion has a test, and the test must fail if the behavior is removed. Group by unit (screen, hook, operation). Include boundary cases and every failure above. State which tests are integration tests (written, not necessarily run by the agent). -->

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

<!-- guidance: checks specific to this task, on top of the repo-wide ones in the verifier prompt. Rules the diff must obey, and a list of inputs to try to break it with (boundaries, malformed input, concurrency, a failure arriving late). The verifier has no browser: say how a UI behavior is checked by reading code and tests. -->

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond the list above, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if the task touches code with integration tests), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which integration tests ran and which did not (and the database version if they ran), dependency versions, and anything you were unsure about. Also list every judgment call this file did not settle.

---

## Before you hand this file to an agent

- [ ] Every behavior has a message or status, not just "handle the error".
- [ ] Every limit has a number and a boundary case.
- [ ] Every dependency is named in `STACK.md`, with a resolved version.
- [ ] Out of scope and known gaps are written down.
- [ ] Each acceptance criterion could fail if the behavior were removed.
- [ ] The file is committed and pushed to the default branch. A cloud session sees only what is on GitHub.

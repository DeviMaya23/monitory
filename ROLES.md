# Roles

How the work divides between agent roles. Every agent also follows `AGENTS.md`, `CONVENTIONS.md` and the reference files that match its task. 

## The contract comes first

`docs/openapi.yaml` and `docs/requirements.md` are the shared contract. No agent edits them; ask the user. Backend and frontend agents work independently against `docs/openapi.yaml`: the frontend builds against a mock of the API while the backend is still being written.

## Roles

| Role | May change | Must not change |
|---|---|---|
| Foundation | Done at kickoff (skill step E), before any task chain, by the kickoff session with the user: project scaffold, migrations for the core entities, shared types, test support. Not a task role once the chain starts | Feature work |
| Backend | `backend/**`, except migrations | `frontend/**`, the contract, existing migrations |
| Frontend | `frontend/**` | `backend/**`, the contract, `docs/design/**` |
| End-to-end | `e2e/**`, as the builder of a milestone's last task | `backend/**`, `frontend/**`, the contract |
| Integrator | Any file, to merge work and fix the seams between pieces | Add features, or change requirements |
| Verifier | Tests and a verification report | Source code |
| Drafter | The task files it drafts (`docs/tasks/<slug>.md`) and `docs/tasks/backlog.md`, in an interactive session with the user (see `docs/tasks/AUTHORING.md`) | Everything else: code, tests, the contract, requirements, other docs |

**Task records.** Each task keeps its records under `docs/tasks/`: the builder's plan (`<task>.plan.md`), the verifier's report (`<task>.report.md`) and the shared `backlog.md`. The agent a prompt names writes that record, and these are the only files under `docs/` a builder or verifier may change. Only the Drafter writes task files and edits the backlog beyond appending findings; no builder or verifier edits the task file itself, `requirements.md` or any other doc.

Each agent runs in its own isolated checkout on its own branch, and stays inside the directories it owns. Directory ownership keeps branches from touching the same files, so merges stay clean.

## Shared state

Some files can only have one writer at a time. Two tasks that change any of these do not run together:

- Migrations: only one agent at a time may add them, and an agent that needs a schema change outside its task stops and asks. This avoids two agents claiming the same migration number.
- Dependency manifests and lockfiles: only the task that adds a dependency changes them while it runs.
- Files that wire the application together (the router, the server's constructor, configuration, the entry point) and shared test doubles: the task file names them under "Shared files".

## Dependencies

`STACK.md` names the libraries; it does not pin versions. When a task needs a library that `STACK.md` names, the Drafter resolves the version at drafting time (the latest stable release, at least a couple of weeks old), records it and the command used in the task's "Dependencies" section, and the user approves it by approving the task. A library `STACK.md` does not name needs the user's approval first. After the task merges, the user records the adopted version in `STACK.md`; the verifier's report lists it under "docs or specs that no longer match".

## Verifier

Checks the finished work against the requirements, runs the tests and linters, and reports per requirement ID (FR-n, NFR-n) with evidence. It does not fix source; findings go back to the user. Its report also contains, for every criterion, whether the named test would fail if the behaviour were removed ("Real?"), the mutation checks it ran (break the code, see which test fails), and a section "Docs or specs that no longer match" (the contract, requirements, `STACK.md` or other docs that the merged work makes out of date, for the user to act on). Every non-blocking finding carries a category (latent bug, test quality, UX, cosmetic, decision needed) and a "matters when" trigger; a finding without a trigger stays in the report and does not go to the backlog.

## Handing back

Before pushing, an agent runs `make check` (the single definition of done) and, when the task touches code with integration tests, the integration-test command named in `TESTING.md`, and reports "run, passed", "run, failed", or "not run" with the reason. A fresh checkout has no installed dependencies: install them first (see `STACK.md`). Each agent commits and pushes its own branch (never the default branch), then finishes with a short report: branch name, what changed, which requirement IDs it covers, and anything it was unsure about. The user is the only one who merges.

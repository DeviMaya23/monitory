# Monitory

A self-hosted uptime and status monitor: one admin adds services, the app checks them in the background, sends email and webhook alerts on status changes, and can show a public status page. Go (Echo, SQLite) with a React frontend embedded in the binary, shipped as one container. It is built with a multi-agent workflow: a drafter writes each task, a builder implements it, a verifier checks it, and the user merges.

The product is specified in `docs/requirements.md` and the HTTP contract in `docs/openapi.yaml`. Implementation must match both. If a task conflicts with either, stop and ask.

## Reference Files

Read these before the work type they cover — not all at once, only the relevant one:

| When you're about to… | Read |
|---|---|
| Understand what the product must do, or check a behaviour | `docs/requirements.md` |
| Add or change an endpoint, a request or a response | `docs/openapi.yaml` |
| Orient to the project stack or pick a library | `STACK.md` |
| Place a new file, create a feature, or touch an existing structure | `ARCHITECTURE.md` |
| Write any code | `CONVENTIONS.md` |
| Write or plan any tests | `TESTING.md` |
| Find out which part of the repo your role may change | `ROLES.md` |
| Work out how production is wired, or which config key does what | `deploy/README.md`, `.env.example` |
| Touch a table, a migration or a stored field | `docs/data-model.md` |
| Build or change a screen | `docs/design/README.md`, then the screen's board in `docs/design/` |
| Draft a task, or read how a task file is laid out | `docs/tasks/AUTHORING.md`, `docs/tasks/TEMPLATE.md` |
| Start or check a stage of a task | `docs/tasks/prompts.md` |
| Find what is left over or waiting for a decision | `docs/tasks/backlog.md` |
| See what the user checks by hand | `docs/manual-checks.md` |

## Decision Boundaries

Ask the user before:

- editing `docs/openapi.yaml` or `docs/requirements.md`
- adding a dependency not listed in `STACK.md`, or changing a pinned version (a language version included)
- adding a new shared abstraction: a shared component, a shared package, a new top-level directory
- adding or changing a database migration outside your assigned task
- weakening or skipping a requirement, a test or a lint rule
- adding or renaming a config key, or changing a default in `.env.example`
- writing text the admin or an alert recipient reads that the design does not show (the default alert messages, email subject and body)
- building a screen state that is neither drawn in `docs/design/` nor listed in `docs/design/README.md`

Never change a test to make it pass: fix the cause, or stop and report. A design reference under `docs/design/` is read-only: copy styles from it, never component code.

Git: work on the branch you were assigned, commit in small steps, and push that branch so the user can review it. Never push to the default branch, force-push, or rewrite history that has been pushed.

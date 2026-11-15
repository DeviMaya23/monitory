# Backlog

What has not been turned into a task yet, and the loose ends from verifier reports that the user chose to track. It holds no status: `bash scripts/status.sh` shows what is drafted, running or merged. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`).

**One home per item.** An item leaves this file in the same commit that adds its task file. From then on the task file is the only record. When a task is split and part of it is left out, this file gets a line for the left-out part that names the task it came from.

**Only items with a trigger.** A non-blocking finding is tracked here only if it has a "matters when" trigger (or the user asks for it). Every other finding stays in its report. A tracked item whose trigger has not happened by the next milestone is dropped.

**Cap.** When "Loose ends" passes about 15 lines, the next drafting session proposes one hardening task per layer that batches them.

## Not built yet

Derived from the contract and the requirements at scaffold time: a coverage map of requirement, operation, screen and task. Keep a row only until its task file exists.

| Requirement | Operation | Screen | Notes |
|---|---|---|---|

## Cross-cutting and later

- <!-- items that belong to no single slice (rate limiting, deployment work, hardening), each with what it needs first -->

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

<!-- One line each: `- `<task>`: <the question>. Decide by: <milestone>.` -->

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->

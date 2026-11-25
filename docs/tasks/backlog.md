# Backlog

What has not been turned into a task yet, and the loose ends from verifier reports that the user chose to track. It holds no status: `bash scripts/status.sh` shows what is drafted, running or merged. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`).

**One home per item.** An item leaves this file in the same commit that adds its task file. From then on the task file is the only record. When a task is split and part of it is left out, this file gets a line for the left-out part that names the task it came from.

**Only items with a trigger.** A non-blocking finding is tracked here only if it has a "matters when" trigger (or the user asks for it). Every other finding stays in its report. A tracked item whose trigger has not happened by the next milestone is dropped.

**Cap.** When "Loose ends" passes about 15 lines, the next planning session (`AUTHORING.md`, Phase 0) proposes one hardening task per layer that batches them.

## Not built yet

Derived from the contract and the requirements at scaffold time: a coverage map of requirement, operation, screen and task. Keep a row only until its task file exists. Milestones are those of `TESTING.md`. Every active requirement is in exactly one row; a row is a candidate slice, not a task boundary.

### Milestone 2: alerting

| Requirement | Operation | Screen | Notes |
|---|---|---|---|

### Milestone 3: full check settings

| Requirement | Operation | Screen | Notes |
|---|---|---|---|

### Milestone 4: public view and health endpoint

| Requirement | Operation | Screen | Notes |
|---|---|---|---|

### Milestone 5: release hardening

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| NFR-2, NFR-3 | none | All screens | By hand: `docs/manual-checks.md` |

## Cross-cutting and later

- Production, after the first deploy (`deploy/RUNBOOK.md`): a payment method on the Fly.io account so the machine stays up; the certificate and DNS record for the custom domain; the release workflow with its deploy token; a redeploy that shows data survives; `Fly-Client-IP` checked once sign-in exists. Needs: the user. Deadline: before first real use.

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

- Left out of `share-form-parts`: `toOutcome` exists twice (`features/service-list/lib/rowActionToasts.ts` with the outcome `gone`, and `features/alert-list/hooks/useRemoveTarget.ts` with `already-removed`); the two server-error hooks (`useServerErrors`, `useTargetServerErrors`) have different path models. Matters when: a third place sorts an API error into an outcome, or the rule for 401, 404 or 403 changes in one copy.

- `sign-in-screen`: the three focus effects and four refs sit in `SignInForm` rather than a hook, against the hook-per-concern rule in `CONVENTIONS.md` ("Component and hook granularity"). Matters when: a second screen needs the same focus-follows-outcome logic, or the convention is read as strict.

- `alert-dispatch`: authentication over `starttls` is never exercised: go-mail v0.8.1 authenticates only on an encrypted connection, so `SMTP_TLS=none` with `SMTP_USERNAME` set can never send, and the `starttls` success path is untested (the `tls` path, authentication included, is covered by `mailer-implicit-tls`). Matters when: the SMTP provider is chosen and `SMTP_USERNAME` is set; run the Milestone 2 manual check (`docs/manual-checks.md`) with the real `starttls` or `tls` settings.

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

- What watches the app from outside (the Fly.io health check alone, or an external monitor on `/health`). Decide by: before first real use.

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->


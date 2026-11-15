# Backlog

What has not been turned into a task yet, and the loose ends from verifier reports that the user chose to track. It holds no status: `bash scripts/status.sh` shows what is drafted, running or merged. The user decides the order and turns an item into a task file (`docs/tasks/TEMPLATE.md`).

**One home per item.** An item leaves this file in the same commit that adds its task file. From then on the task file is the only record. When a task is split and part of it is left out, this file gets a line for the left-out part that names the task it came from.

**Only items with a trigger.** A non-blocking finding is tracked here only if it has a "matters when" trigger (or the user asks for it). Every other finding stays in its report. A tracked item whose trigger has not happened by the next milestone is dropped.

**Cap.** When "Loose ends" passes about 15 lines, the next drafting session proposes one hardening task per layer that batches them.

## Not built yet

Derived from the contract and the requirements at scaffold time: a coverage map of requirement, operation, screen and task. Keep a row only until its task file exists. Milestones are those of `TESTING.md`. Every active requirement is in exactly one row; a row is a candidate slice, not a task boundary.

### Milestone 1: basic monitoring

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-101, FR-102, FR-103 | none | none | Built in the foundation: the config loader refuses to start without the credentials and names the missing key, with tests. Left: the sign-in task reads the credentials from it |
| FR-1, FR-3, FR-4, FR-5, FR-114, NFR-8 | `signIn`, `getSession`, `signOut` | Sign-in | Session store, the gate and CSRF in the policy router. Lockout and the HTTPS setting are milestone 5 |
| FR-6, FR-12, FR-35, FR-36, FR-56, FR-57, FR-59, FR-60, FR-67 | `createService` | Add a service | HTTP type with method and URL only; the other request fields are milestone 3. The whole request shape is validated from the start |
| FR-9, FR-62, FR-94, FR-95, FR-112 | `listServices` | Admin dashboard | List, states, refresh, local times. First front-end slice: the browser checkpoint follows it |
| FR-8, FR-70, FR-71, FR-72 | `deleteService` | Dashboard delete dialog | Stops the schedule after the delete commits |
| FR-10, FR-41, FR-42, FR-51, FR-53, FR-54, FR-55, FR-111, NFR-6 | none | none | Scheduler, HTTP probe, retries, status transitions, start-up rebuild. Failure reasons here: timed out, could not connect, non-2xx |
| Milestone journeys | all of the above | Sign-in, dashboard, add | End-to-end suite set up in `e2e/`; the last task of the milestone |

### Milestone 2: alerting

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-14 to FR-19, FR-80, FR-81, FR-82, FR-87, FR-88, FR-89, FR-92, FR-100, FR-110 | `listTargets`, `createTarget`, `updateTarget`, `deleteTarget` | Alert list | Cap and duplicate rule under concurrent requests |
| FR-20, FR-65 | `createService`, `updateService` | Service form | Alerts switch and the two messages |
| FR-21, FR-22, FR-23, FR-24, FR-25, FR-93, NFR-5 | none | none | The status change decides the alerts; delivery loop. Needs the default message wording (see decisions) |
| FR-83, FR-84, FR-85, FR-86 | `listServices`, `listTargets` | Dashboard notice, alert list notice | Mailer, per-target retries, the "last delivery failed" notice and `alert_delivery_failed` |
| FR-90, FR-91, FR-115 | webhook `receiveAlert` | none | Webhook sender: custom headers, timeout, no redirects |
| FR-107, FR-108 | `testTarget` | Target form | One attempt, no saved state touched |
| Milestone journeys | all of the above | Alert list | Down to alert received in Mailpit and at the stub receiver; failed-delivery cases |

### Milestone 3: full check settings

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-7, FR-39, FR-66 | `getService`, `updateService` | Edit a service | State kept, no check at save, schedule restarted |
| FR-37, FR-38 | `createService`, `updateService` | Service form rows | Query parameters, headers, body; every limit from the configuration; the 1 MB request limit |
| FR-44 to FR-48, FR-69, FR-73 | `createService`, `updateService` | JSON rules | Rule evaluation, any-or-all, body read limit |
| FR-34, FR-50, FR-64 | `createService`, `updateService` | Certificate options | Expiry check, ignore certificate errors |
| FR-58 | none | none | Redirect limit, headers re-sent |
| FR-33, FR-49, FR-52 | `createService`, `updateService` | Type switch, TCP fields | TCP probe |
| FR-74 | `createService`, `updateService` | Field errors | The remaining validation cases |
| FR-61 | `listServices`, `getService` | Failure reason wording | All seven reasons and the JSON-rule precedence |
| FR-75 to FR-79 | `pauseService`, `resumeService` | Dashboard row actions | Cancels a running check |
| FR-104, FR-105, FR-106, NFR-7 | `testServiceCheck` | Test result area | Takes no repository that can write |
| Milestone journeys | all of the above | Service form | Each failure reason produced on purpose; limits and validation |

### Milestone 4: public view and health endpoint

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-26, FR-27, FR-68 | `getPublicViewSettings`, `updatePublicViewSettings`, `updateService` | Dashboard switch, service toggle | The two settings operations exist (built in the foundation as the example for each layer). Left: the switch on the dashboard and the service toggle |
| FR-28 to FR-31, FR-40, FR-63, FR-113 | `getPublicDashboard` | Public dashboard | Response type holds name, status and last check time only |
| FR-32 | `getPublicDashboard` | "Too many requests" state | Fixed window per client address from the policy router |
| FR-96 | `getHealth` | none | Built in the foundation; this row is its end-to-end journey |
| Milestone journeys | all of the above | Public dashboard | As an anonymous visitor, including what must not be shown |

### Milestone 5: release hardening

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-2 | `signIn` | Sign-in locked state | In memory, fake clock |
| FR-97, FR-98, FR-99 | `signIn` | "HTTPS required" state | `REQUIRE_HTTPS`, `TRUST_PROXY`, `CLIENT_IP_HEADER` |
| NFR-1 | none | none | Restart and upgrade with data, against the Docker image and a volume |
| NFR-4 | none | All forms, delete dialog | Keyboard journeys in the end-to-end suite |
| NFR-2, NFR-3 | none | All screens | By hand: `docs/manual-checks.md` |

## Cross-cutting and later

- `fly.toml`, the release workflow and the first production deploy. Needs: the user says the Fly.io app is ready (`deploy/RUNBOOK.md`). No deadline.
- Browser checkpoint: after the dashboard slice merges, the user opens the app and runs "After the first front-end slice" in `docs/manual-checks.md` before the next front-end task is drafted.

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

- Default unhealthy and recovery messages, and the email subject and body. Decide by: the first milestone 2 task is drafted.
- The contract has no error code for an unexpected `500`; the code sends `internal_error`, which is not in `docs/openapi.yaml`. Add it to `ProblemCode`, or choose another shape. Decide by: the first milestone 1 task is drafted.
- `updatePublicViewSettings` with `{}` counts as off, because `enabled` then reads as false. Reject it as `validation_failed`, or keep. Decide by: the milestone 4 settings task is drafted.
- SMTP provider for production. Decide by: before the first deploy.
- What watches the app from outside (the Fly.io health check alone, or an external monitor on `/health`). Decide by: before the first deploy.

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->

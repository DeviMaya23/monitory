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
| FR-6, FR-12, FR-74 | `createService` (built in `create-service-api`) | Add a service | The screen only: name, method and URL, the `422` field errors on the fields, and the `409` banners. The other form rows are milestone 3. The server trims surrounding whitespace from the name and URL before validating and saving, so a name of only spaces is `required` and `API` with a trailing space is the same name as `API`; the screen shows what the 201 returns |
| FR-8, FR-72 | `deleteService` (built in `list-and-delete-services-api`) | Dashboard delete dialog | The screen only: the confirmation dialog, the target count from `listServices`, the deleting state, and the failure toasts |
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
| FR-44 to FR-48, FR-69, FR-73 | `createService`, `updateService` | JSON rules | Rule evaluation, any-or-all, body read limit. Left out of `http-probe`: the JSON-rule half of FR-42, and reading the body inside the timeout (FR-41) |
| FR-34, FR-50, FR-64 | `createService`, `updateService` | Certificate options | Expiry check, ignore certificate errors. Left out of `http-probe`, which fails a check on an invalid certificate with no way to turn that off |
| FR-58 | none | none | Left out of `http-probe`, which has the redirect limit: the saved headers re-sent with each redirect |
| FR-33, FR-49, FR-52 | `createService`, `updateService` | Type switch, TCP fields | TCP probe |
| FR-74 | `createService`, `updateService` | Field errors | The remaining validation cases |
| FR-61 | `listServices`, `getService` | Failure reason wording | All seven reasons and the JSON-rule precedence. Left out of `http-probe`, which produces five: `json_rule_matched` and `invalid_or_missing_json` |
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
| FR-2 | `signIn` | Sign-in locked state | In memory, fake clock. Left out of `sign-in-api` and `sign-in-screen`: `429 sign_in_locked` and the countdown |
| FR-99 | `signIn`, `getPublicDashboard` | none | `TRUST_PROXY`, `CLIENT_IP_HEADER`: the policy router resolves the scheme and the client address. Left: the journey with trust on |
| NFR-1 | none | none | Restart and upgrade with data, against the Docker image and a volume |
| NFR-4 | none | All forms, delete dialog | Keyboard journeys in the end-to-end suite |
| NFR-2, NFR-3 | none | All screens | By hand: `docs/manual-checks.md` |

## Cross-cutting and later

- Left out of `dashboard-screen`, to be added by the task that builds what each does: the name as a link to Edit, with the desktop ellipsis and the full-name tooltip (the edit screen); the "view alert list" link on the delivery-failed notice and the row's Alerts button (the alert list); the row's Pause and Resume, Delete, the public-page switch and the "Open public page" link (their own tasks, listed above). The failed-action toasts for row actions come with the row action that causes them.

- Left out of `check-sequence-and-state`: its runner does nothing for a TCP service, so one stays `not_yet_checked`; the `scheduler` task still gives a TCP service a timer, whose every sequence does nothing. The task that builds the TCP probe (FR-49, FR-52, milestone 3) makes the runner call it with the same retry rule.

- Left out of `scheduler`: a log line per check outcome with the failure reason (`CONVENTIONS.md`, Logging). The runner returns no result to log. Matters when: the admin needs to see in the log why a service went unhealthy; best added with the first alert task, which handles the status change.

- Production, after the first deploy (`deploy/RUNBOOK.md`): a payment method on the Fly.io account so the machine stays up; the certificate and DNS record for the custom domain; the release workflow with its deploy token; a redeploy that shows data survives; `Fly-Client-IP` checked once sign-in exists. Needs: the user. Deadline: before first real use.

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

- `sign-in-screen`: focus is not moved to Username after a fast recheck, because the focus effect runs only when the form renders once with `rechecking` true; an instantly rejecting `getSession` after Retry leaves focus on `body`. Matters when: the server answers a recheck faster than one render, for example a local or very fast network, or a change moves the recheck onto a cached path.
- `sign-in-screen`: the three focus effects and four refs sit in `SignInForm` rather than a hook, against the hook-per-concern rule in `CONVENTIONS.md` ("Component and hook granularity"). Matters when: a second screen needs the same focus-follows-outcome logic, or the convention is read as strict.

- `create-service-api`: the handler suite takes about 30 s because `newRouter` parses the contract for every case, in the shared `helpers_test.go`. Matters when: later tasks add more handler cases to the same helper and CI time grows with each.
- `http-probe`: wall-clock assertions can flake under load (`TestTargetServer_DelayAndRedirect` expects an answer in under 100 ms; several probe tests rely on a 20 ms delay against a 200 ms timeout). Matters when: CI runs the suite on a loaded runner with `-race` and one fails with no code change.
- `http-probe`: the test target server's `Arrived` closes once per path and never again, so a test cannot wait for a second request to the same path. Matters when: the scheduler task tests a retry against one path and wants to wait for the second attempt.

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

- Default unhealthy and recovery messages, and the email subject and body. Decide by: the first milestone 2 task is drafted.
- `updatePublicViewSettings` with `{}` counts as off, because `enabled` then reads as false. Reject it as `validation_failed`, or keep. Decide by: the milestone 4 settings task is drafted.
- Where the shared service-input normalization lives. `create-service-api` trims surrounding whitespace from the name, URL, host, query parameter names, header names and values, rule fields and the two messages in a private `normalizeServiceInput` in `usecase/service_validation.go`, before validating, and saves the trimmed text. `updateService` must apply the same rules or an edited name could differ from a created one, so it needs the function shared (a new shared place, which needs your approval); `testServiceCheck` should probably trim the URL and host too, so a test run matches what would be saved. Decide by: the first milestone 3 task that touches `updateService` or `testServiceCheck` is drafted.
- SMTP provider for production. Decide by: before the first alert task is deployed.
- What watches the app from outside (the Fly.io health check alone, or an external monitor on `/health`). Decide by: before first real use.

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->

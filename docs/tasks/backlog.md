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
| FR-84, FR-85, FR-86 | none | none | Per-target retries and the delivery outcome written to `targets.last_delivery_failed`. The mailer, `alert_delivery_failed` in `listServices` and the dashboard notice (`ServiceRow`) exist |
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

- Left out of `dashboard-screen`, to be added by the task that builds what each does: the name as a link to Edit, with the desktop ellipsis and the full-name tooltip (the edit screen); the row's Pause and Resume, the public-page switch and the "Open public page" link (their own tasks, listed above). The failed-action toasts for row actions come with the row action that causes them.

- Left out of `check-sequence-and-state`: its runner does nothing for a TCP service, so one stays `not_yet_checked`; the `scheduler` task still gives a TCP service a timer, whose every sequence does nothing. The task that builds the TCP probe (FR-49, FR-52, milestone 3) makes the runner call it with the same retry rule.

- Left out of `add-service-screen`: the "Discard unsaved changes?" prompt on the top-bar brand link, the browser's Back and Forward, and Sign out (it covers only the form's Cancel and back link, and the browser's own prompt on closing the tab). Blocking in-app navigation needs react-router's `useBlocker`, which needs a data router instead of `BrowserRouter`. Needs: the user, a decision on the router. Decide by: the edit-form task is drafted, since it builds the same prompt for the edit form.

- Left out of `add-service-screen`: the form has no `Type` control, no test panel and none of the rows below Request. The type switch comes with the TCP form task, the test panel with `testServiceCheck`, and the other rows with the milestone 3 form tasks (all already rows above).

- Left out of `service-form-alerts`: the Alerts group (the `Send alerts` switch and the two messages) on the edit form, with `getService` and `updateService` (FR-20, FR-65). The edit-form task builds it from the add form's `AlertsGroup` and the `Switch` hint prop. Matters when: the edit-form task is drafted.

- Left out of `scheduler`: a log line per check outcome with the failure reason (`CONVENTIONS.md`, Logging). The runner returns no result to log. Matters when: the admin needs to see in the log why a service went unhealthy; best added with `delivery-outcome`, which writes what the alert pipeline learned (`alert-dispatch` did not add it).

- Left out of `alert-dispatch`: `worker.AlertDispatcher` makes one attempt per target with no retry and writes no delivery outcome (`last_delivery_failed` is never set); `webhook-sender` replaces its skip of a webhook target. The retry task uses `ALERT_DELIVERY_RETRIES` and `ALERT_DELIVERY_RETRY_INTERVAL_SECONDS`, which exist and are unused; the outcome task writes the notice (FR-86). The mailer's two reasons (`no SMTP account configured`, `the SMTP server did not accept the message`) may get finer ones then. The test-alert wording (FR-107) belongs to `test-target`. Matters when: an admin has only webhook targets, or an email is refused, before those tasks merge.

- Left out of `target-form-dialog` (by the user's decision, the alert-list feature keeps its own copies): the discard dialog, the `422` error summary with its server-error hook, and the failure banners exist twice, in `service-form` and in `alert-list`. Promote them to shared places (`components/`, `lib/`). Matters when: a third form needs them, or the wording or behaviour of one copy changes and the other is forgotten. Needs: the user's approval of the shared components (`CONVENTIONS.md`, "Matching existing shapes").

- Left out of `target-form-dialog`: its custom header rows (`alert-list/components/HeaderRows.tsx`) are the feature's own, built before the service form has request headers. The milestone 3 task that builds the service form's headers (FR-37, FR-38) promotes them to `components/` instead of writing a second copy (`CONVENTIONS.md`, "No duplicated logic across entry points"). Matters when: that task is drafted. Needs: the user's approval of the shared component.

- Production, after the first deploy (`deploy/RUNBOOK.md`): a payment method on the Fly.io account so the machine stays up; the certificate and DNS record for the custom domain; the release workflow with its deploy token; a redeploy that shows data survives; `Fly-Client-IP` checked once sign-in exists. Needs: the user. Deadline: before first real use.

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

- `sign-in-screen`: the three focus effects and four refs sit in `SignInForm` rather than a hook, against the hook-per-concern rule in `CONVENTIONS.md` ("Component and hook granularity"). Matters when: a second screen needs the same focus-follows-outcome logic, or the convention is read as strict.

- `create-service-api`: the handler suite takes about 30 s because `newRouter` parses the contract for every case, in the shared `helpers_test.go`. Matters when: later tasks add more handler cases to the same helper and CI time grows with each.
- `targets-api`: a webhook target's header names and values are checked for length only, so a name or value with CR or LF, or two headers with the same name, is saved. By the user's decision `webhook-sender` refuses to send such a header (the delivery fails with a reason), and rejecting on save is left here: a `targets-api` change (`422 validation_failed`, code `invalid_value`, already in the contract; FR-38 lists no such rule, so the user approves it first). Matters when: an admin saves a webhook with such a header and learns only from the failed delivery or the failed test alert. Needs: the user's approval of the new rule.
- `http-probe`: wall-clock assertions can flake under load (`TestTargetServer_DelayAndRedirect` expects an answer in under 100 ms; several probe tests rely on a 20 ms delay against a 200 ms timeout). Matters when: CI runs the suite on a loaded runner with `-race` and one fails with no code change.
- `add-service-screen`: the services query key exists twice: `servicesQueryKey` (used by `service-form`) and `SERVICES_KEY` in `useServiceList.ts`. Using the shared one needs the mock factory in `useServiceList.test.tsx` to export it, a second `service-list` edit. Matters when: someone changes the value of either key, so the form drops a cache entry the dashboard does not read. Best done by a task that already changes `service-list`.
- `add-service-screen`: if the admin leaves by the back link while a save is in flight, the dashboard stays stale until the next automatic refresh (FR-95), because `removeQueries` does not refetch a query that is already mounted. Adding `invalidateQueries` would cover it, but changes what the task specified. Matters when: a slow or overloaded server makes a save take longer than the admin waits. Needs: the user, to approve the change.
- `portal-into-app`: the toast viewport is `position: fixed` inside `.app`, which has `container-type: inline-size` and so contains fixed descendants; it is positioned against `#root`'s box, not the viewport. Not checked in a browser. Matters when: a toast shows on a page taller than the window (the dashboard with many services) and sits at the bottom of the page instead of the window, or the milestone check of the toasts is run.
- `scheduler`: `Stop` followed by `Start` for the same id can run two sequences at once, because `Stop` does not wait and the next `Start` finds no entry to wait for; there is no test for it. Also, `Start` itself ignores `Paused`; only `StartChecks` filters paused services. Matters when: the first task that calls `Stop` then `Start` for one service (edit, pause, resume, milestone 3) is drafted; it decides whether `Stop` waits and where the paused check lives.

- `portal-into-app`: the dialog host has `z-index: 40`, above the toast viewport (30), so a toast fired while a dialog or alert dialog is open sits under the backdrop and cannot be read. Today's order before the task had the toast above. A host value below 30 (for example 25) keeps the old order. Matters when: a toast fires while a dialog is open (a failed removal in the alert list, a save result while a dialog is still closing).
- `portal-into-app`: the `Select` tests "lists every option" and "picks with the arrow keys" fail about half the time in single-file runs, because they query `listbox` synchronously. Matters when: CI shows a red `Select.test.tsx` on an unrelated change.

- `alert-dispatch`: authentication is never exercised: go-mail v0.8.1 authenticates only on an encrypted connection and the fake SMTP server has no TLS, so `SMTP_TLS=none` with `SMTP_USERNAME` set can never send, and the `starttls` and `tls` success paths are untested. Matters when: the SMTP provider is chosen and `SMTP_USERNAME` is set; run the Milestone 2 manual check (`docs/manual-checks.md`) with the real `starttls` or `tls` settings.
- `alert-dispatch`: three worker mutations (no cancel in `Close`, `Dispatch` waiting, sequential deliveries) fail by hanging until the package timeout, not by an assertion. Matters when: `delivery-retry` changes the same code; its tests should put a deadline around the blocking calls so a regression fails fast.
- `alert-dispatch`: the Mailpit integration test clears the mailbox of whichever Mailpit answers on `localhost:8025`, including one from another worktree's compose project. Matters when: two worktrees run integration or end-to-end tests at the same time.

- `target-form-dialog`: a `422` summary keeps the entries of the inactive type. After a `url` error, switching to Email leaves `Webhook URL: …` in the summary with a link that moves focus nowhere, while its message is hidden with the field. Matters when: an admin gets a `url` or `headers` error and then switches type. Needs: the user, to decide whether a type switch drops the other type's entries.

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

- `updatePublicViewSettings` with `{}` counts as off, because `enabled` then reads as false. Reject it as `validation_failed`, or keep. Decide by: the milestone 4 settings task is drafted.
- Where the shared service-input normalization lives. `create-service-api` trims surrounding whitespace from the name, URL, host, query parameter names, header names and values, rule fields and the two messages in a private `normalizeServiceInput` in `usecase/service_validation.go`, before validating, and saves the trimmed text. `updateService` must apply the same rules or an edited name could differ from a created one, so it needs the function shared (a new shared place, which needs your approval); `testServiceCheck` should probably trim the URL and host too, so a test run matches what would be saved. Decide by: the first milestone 3 task that touches `updateService` or `testServiceCheck` is drafted.
- SMTP provider for production. Decide by: before the first alert task is deployed.
- What watches the app from outside (the Fly.io health check alone, or an external monitor on `/health`). Decide by: before first real use.

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->

- [alert-list-screen] Test quality: the "failed reload with rows on screen" criterion is only reached through the delete-404 refetch; the task's screen test for a failed reload and the "both banners" test are one test, so the screen-level `refreshFailed` path has no test of its own (the hook test covers the hook). Matters when: a real reload (a refresh button or polling for this list) is added.
- [alert-list-screen] Latent bug: `useRemoveTarget` keeps `askedId` if `serviceId` changes while the page stays mounted. No link goes from one alert list to another, so it cannot happen today. Matters when: a service switcher or a prev/next link appears on this page.

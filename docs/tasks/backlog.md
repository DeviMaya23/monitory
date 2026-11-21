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
| Milestone journeys | all of the above | Service form | Each failure reason produced on purpose; limits and validation |

### Milestone 4: public view and health endpoint

| Requirement | Operation | Screen | Notes |
|---|---|---|---|
| FR-26, FR-27, FR-68 | `getPublicViewSettings`, `updatePublicViewSettings`, `updateService` | Dashboard switch, service toggle | The two settings operations exist (built in the foundation as the example for each layer). Left: the switch on the dashboard and the service toggle |
| FR-28, FR-29, FR-32, FR-40, FR-63, FR-113 | `getPublicDashboard` | none | Backend: the usecase (name, status and last check of the chosen services that are healthy or unhealthy, ordered by name ignoring case), the fixed window per client address (60 a minute, from configuration) with `429 rate_limited` and `Retry-After`, and `404 public_view_unavailable` while the view is off. Waits for the delivery lane (`handler/server.go`, `cmd/server/main.go`). Left out of `public-dashboard-screen`, which builds the page |
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

- Left out of `dashboard-screen`, to be added by the task that builds what each does: the public-page switch and the "Open public page" link (their own tasks, listed above). The failed-action toasts for row actions come with the row action that causes them (Pause and Resume: `dashboard-pause-resume`).

- Left out of `service-form-json-and-cert-rows`: its row-focus effect (`features/service-form/hooks/useRowFocus.ts`) repeats the one in `components/NameValueRows.tsx` (Add moves focus to the new row, Remove to the next, the previous or Add). Share it. Matters when: the focus rule changes in one of the two. Needs: the user's approval of the shared hook.

- Left out of `target-form-dialog` (by the user's decision, the alert-list feature keeps its own copies): the discard dialog, the `422` error summary with its server-error hook, and the failure banners exist twice, in `service-form` and in `alert-list`. Promote them to shared places (`components/`, `lib/`). Matters when: a third form needs them, or the wording or behaviour of one copy changes and the other is forgotten. Needs: the user's approval of the shared components (`CONVENTIONS.md`, "Matching existing shapes").

- Production, after the first deploy (`deploy/RUNBOOK.md`): a payment method on the Fly.io account so the machine stays up; the certificate and DNS record for the custom domain; the release workflow with its deploy token; a redeploy that shows data survives; `Fly-Client-IP` checked once sign-in exists. Needs: the user. Deadline: before first real use.

## Loose ends from verifier reports

<!-- One line each: `- `<task>`: <finding>. Matters when: <trigger>.` -->

- `sign-in-screen`: the three focus effects and four refs sit in `SignInForm` rather than a hook, against the hook-per-concern rule in `CONVENTIONS.md` ("Component and hook granularity"). Matters when: a second screen needs the same focus-follows-outcome logic, or the convention is read as strict.

- `create-service-api`: the handler suite takes about 30 s because `newRouter` parses the contract for every case, in the shared `helpers_test.go`. Matters when: later tasks add more handler cases to the same helper and CI time grows with each.
- `http-probe`: wall-clock assertions can flake under load (`TestTargetServer_DelayAndRedirect` expects an answer in under 100 ms; several probe tests rely on a 20 ms delay against a 200 ms timeout). Matters when: CI runs the suite on a loaded runner with `-race` and one fails with no code change.
- `add-service-screen`: the services query key exists twice: `servicesQueryKey` (used by `service-form`) and `SERVICES_KEY` in `useServiceList.ts`. Using the shared one needs the mock factory in `useServiceList.test.tsx` to export it, a second `service-list` edit. Matters when: someone changes the value of either key, so the form drops a cache entry the dashboard does not read. Best done by a task that already changes `service-list`.
- `add-service-screen`: if the admin leaves by the back link while a save is in flight, the dashboard stays stale until the next automatic refresh (FR-95), because `removeQueries` does not refetch a query that is already mounted. Adding `invalidateQueries` would cover it, but changes what the task specified. Matters when: a slow or overloaded server makes a save take longer than the admin waits. Needs: the user, to approve the change.
- `portal-into-app`: the toast viewport is `position: fixed` inside `.app`, which has `container-type: inline-size` and so contains fixed descendants; it is positioned against `#root`'s box, not the viewport. Not checked in a browser. Matters when: a toast shows on a page taller than the window (the dashboard with many services) and sits at the bottom of the page instead of the window, or the milestone check of the toasts is run.

- `portal-into-app`: the dialog host has `z-index: 40`, above the toast viewport (30), so a toast fired while a dialog or alert dialog is open sits under the backdrop and cannot be read. Today's order before the task had the toast above. A host value below 30 (for example 25) keeps the old order. Matters when: a toast fires while a dialog is open (a failed removal in the alert list, a save result while a dialog is still closing).

- `alert-dispatch`: authentication over `starttls` is never exercised: go-mail v0.8.1 authenticates only on an encrypted connection, so `SMTP_TLS=none` with `SMTP_USERNAME` set can never send, and the `starttls` success path is untested (the `tls` path, authentication included, is covered by `mailer-implicit-tls`). Matters when: the SMTP provider is chosen and `SMTP_USERNAME` is set; run the Milestone 2 manual check (`docs/manual-checks.md`) with the real `starttls` or `tls` settings.
- `alert-dispatch`: the Mailpit integration test clears the mailbox of whichever Mailpit answers on `localhost:8025`, including one from another worktree's compose project. Matters when: two worktrees run integration or end-to-end tests at the same time.

- `target-form-dialog`: a `422` summary keeps the entries of the inactive type. After a `url` error, switching to Email leaves `Webhook URL: …` in the summary with a link that moves focus nowhere, while its message is hidden with the field. Matters when: an admin gets a `url` or `headers` error and then switches type. Needs: the user, to decide whether a type switch drops the other type's entries.

- Left out of `toast-text-shared`: the Reload toast (`The request wasn’t accepted. Reload and try again.` with a Reload button) is also spelled in `features/alert-list/hooks/useRemoveTarget.ts` (which also has its own `toOutcome`) and `app-shell/SessionProvider.tsx`, and a related title in the banners in `service-form` and `alert-list`; the task shares it only inside `features/service-list/lib/`. Matters when: someone rewords one of these and not the others, or a fifth place needs it. Needs: the user's approval of a shared place (`components/` or `lib/`; `CONVENTIONS.md`, "Matching existing shapes").

## Decisions waiting on the user

Each needs a decision, or to be dropped, by the next milestone.

- `updatePublicViewSettings` with `{}` counts as off, because `enabled` then reads as false. Reject it as `validation_failed`, or keep. Decide by: the milestone 4 settings task is drafted.
- SMTP provider for production. Decide by: before the first alert task is deployed.
- What watches the app from outside (the Fly.io health check alone, or an external monitor on `/health`). Decide by: before first real use.

## Process and tooling

<!-- Changes to how the work is done, not to the product. -->

## Non-blocking findings from fix rounds

<!-- Fix rounds append here: `- [<task slug>] finding. Matters when: <trigger>.` -->

- [alert-list-screen] Test quality: the "failed reload with rows on screen" criterion is only reached through the delete-404 refetch; the task's screen test for a failed reload and the "both banners" test are one test, so the screen-level `refreshFailed` path has no test of its own (the hook test covers the hook). Matters when: a real reload (a refresh button or polling for this list) is added.
- [alert-list-screen] Latent bug: `useRemoveTarget` keeps `askedId` if `serviceId` changes while the page stays mounted. No link goes from one alert list to another, so it cannot happen today. Matters when: a service switcher or a prev/next link appears on this page.

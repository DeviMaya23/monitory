# Task: end-to-end hardening

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Two older end-to-end specs are made to follow the suite's own rules and to be able to fail:

1. The pause journey's second test now proves directly that a paused service sends no alert (FR-76), with a baseline that the same setup does send one when the condition is reversed. Today it proves only that no check ran, and its target-less setup cannot show an alert at all.
2. The delete journey (`@smoke`) no longer writes over HTTP and no longer uses `waitForTimeout`: it adds the service's two notification targets through the alert list screen, which now exists, and uses the suite's one fixed wait, `settle`.

No product behavior and no requirement changes; the journeys keep the behavior they show today.

Requirements covered (the journeys' existing coverage, kept and strengthened):

- FR-76: a paused service sends no alert (`pause-resume.spec.ts`, the second test, now through a target that would receive one).
- FR-75, FR-78: unchanged in the same tests (checks stop, the state is kept).
- FR-8, FR-70, FR-71, FR-72: unchanged in `delete-service.spec.ts` (the confirmation names the targets, the service and its targets go, its checks stop).

Out of scope:

- Every other finding about these specs and any other spec. This task changes exactly two files.
- The first test of the pause journey (60-second interval) and the third (restart keeps it paused): unchanged.
- That the repository removes a deleted service's target rows. The `404` read cannot tell it (the lookup fails when the service row is gone); the dialog's target count and the `404` stay as they are.
- Product code, the contract, the helpers' behavior (`settle` keeps its 10 seconds), CI and docs.
- The end-to-end rule that a milestone's journeys are written by the closing end-to-end tasks: this task is one of milestone 5's closing end-to-end tasks, drafted at the user's request to bring two M3 and M1 specs up to the rules `m4-e2e-journeys` and later tasks follow. The user's decision is that hardening existing end-to-end specs in milestone 5's closing stage counts, so the builder does not stop for it; if `ROLES.md` or `TESTING.md` says otherwise when the task runs, it stops and asks.

## Prerequisite

All merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- `m5-e2e-journeys` (the user's order: this task runs after it, so the whole suite is run once with all of milestone 5 in it). This task shares no file with it.
- The alert list screen and its helpers in `e2e/support/helpers.ts`, with the names and signatures quoted here (`m5-e2e-journeys` extends the file and may add helpers; it must not change these): `openAlertList`, `addTarget`, `targetRow`, `serviceId`, `waitForPaused`, `waitForStatus`, `settle`, and `e2e/support/mailpit.ts`: `uniqueAddress`, `messagesTo`, `waitForMessages`.
- `e2e/journeys/pause-resume.spec.ts` (the test titled `M3 journey 8 a paused service keeps its state (FR-78)`) and `e2e/journeys/delete-service.spec.ts` (`journey 5: delete a service ...`).

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/journeys/pause-resume.spec.ts` and `e2e/journeys/delete-service.spec.ts`. You may not change any other file: `e2e/support/**` (the helpers stay as they are), `playwright.config.ts`, `e2e/package.json`, the lockfile, `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/e2e-hardening.plan.md`), `.env.example`, `Makefile`, `.github/**`, `scripts/**`, `docker-compose.yml`.

Shared files: none. Tasks that may run at the same time: none that touch `e2e/`.

## Operations used

None added or changed. The journeys use the real app through the browser. Reads over HTTP stay where they are (`GET /api/services`, `GET /api/services/<id>/targets`). After this task no test in either file writes over HTTP: the unauthenticated sign-in `POST /api/session` and the two `POST /api/services/<id>/targets` calls in the delete spec go.

## Behavior

### The pause journey's second test (`pause-resume.spec.ts`)

Test title: `M3 journey 8 a paused service keeps its state (FR-78)` becomes `M3 journey 8 a paused service keeps its state and sends no alert (FR-76, FR-78)`. The test keeps every assertion it has and changes its setup and adds three. New flow, in order (the site is the scriptable `site` fixture; the app's check interval is the harness's 6 seconds, so a check that was wrongly still scheduled would run inside the 10-second `settle`):

1. The site answers `503`. Add the service with its alerts on (the form's default; not `alerts: false`), save, and wait for `Unhealthy`. Read `before = serviceState(...)` and assert `last_failure_reason.code` is `non_2xx_status` (as today).
2. Open the service's alert list (`openAlertList`) and add one email target with a fresh address (`uniqueAddress()`, `addTarget`); return to the dashboard with the `Services` link (as the first test does) and wait for `Unhealthy`. Assert `messagesTo(address)` is empty (the first check's alert, if any, went before the target existed).
3. Pause (`Pause <name>`, `waitForPaused`). Read `afterPause`, `settle`, read `afterSettle`. For both: `paused` true, `status` `unhealthy`, the same `last_failure_reason` and `last_status_change_at` as `before` (as today). The row shows `Paused` instead of the failure (as today).
4. The site turns healthy. Read `site.count()`, `settle`: the count is unchanged, the state is still `unhealthy` (as today), **and** `messagesTo(address)` is still empty (new: a recovery alert would be sent if a check had run).
5. Press `Resume <name>`: the status becomes `Healthy` (as today) **and** exactly one message reaches the address (`waitForMessages(address, 1)` followed by `expect(mail).toHaveLength(1)`, as the first test does; new). Only one recovery alert is sent, for the one unhealthy-to-healthy change. This is the baseline the "no mail" assertions need: the same setup does produce the alert when the condition is reversed (`TESTING.md`, "Time").

Nothing else in the file changes. The count assertion of step 4 (`site.count()` unchanged) and the status assertion already fail first for a scheduler that keeps running; what the new mailbox assertions add is the direct FR-76 check and its baseline.

### The delete journey (`delete-service.spec.ts`)

Keep the title (`journey 5: delete a service (FR-8, FR-70, FR-71, FR-72) @smoke`) and every assertion about the dialog texts, Cancel, the deletion, the toast, the empty state, the reload, the `404` of the targets, and the service without targets. Change only these:

1. **The two targets** are added through the screen: after `Healthy`, `openAlertList(page, name)`, `addTarget(page, { type: 'email', address: 'ops@example.com' })`, `addTarget(page, { type: 'webhook', url: 'https://hooks.example.com/e2e' })`, then the `Services` link back to the dashboard, then `waitForStatus(page, name, 'Healthy')`, which refreshes the list: the dashboard first shows its cached rows (`target_count` 0) and the delete dialog reads the count from the row it was opened for, so without the refresh a quick click would show `It has no notification targets.`. The comment `No alert list screen exists yet` and the block that signs in again over HTTP to get a CSRF token and posts the targets go. `page.reload()` before the first `Delete` goes, replaced by that wait. The dialog still shows `Its alert list goes with it: 2 notification targets.`
2. **The service id** comes from the helper `serviceId(page, name)`; the local `ServiceBody` interface and the hand-written list parsing go.
3. **The absence check** uses the suite's one fixed wait instead of `waitForTimeout`: in the place of the old waits, after the reload, the empty state and the `404` read of the targets, `settle(page)` (the longest attempt is 3 seconds, so a check already under way has ended), then read `stub.count()`, `settle(page)` again (longer than one 6-second interval), and assert the count is unchanged. The `toastAt` variable and both `page.waitForTimeout` calls go.

The two waits are 20 seconds in all, against about 9 to 12 seconds before, and the two target saves add a few seconds; the test is about 30 to 35 seconds in all, inside the configuration's 60-second timeout (`playwright.config.ts`; the test sets none). It stays `@smoke` (it adds that time to the pull-request smoke subset). The builder reports the measured duration.

### Known gaps

- **The absence check is still a wait.** It shows that something does not happen, which is what `settle` is for; it is 8 to 10 seconds longer than the old fixed waits.
- **The pause test's no-alert assertion depends on the harness's 6-second interval** being shorter than `settle` (10 seconds). The test says so in a comment so that changing either breaks it knowingly.
- **A webhook target to `https://hooks.example.com/e2e` is never called:** no status change happens after it is added.

## Structure

By `TESTING.md` ("End-to-end"). The two spec files change; no new file, helper, fixture or dependency. If a step needs a helper that does not exist, stop and ask (the helpers named above exist).

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a journey (a test) that fails if the behavior is removed.

**`pause-resume.spec.ts`, second test**

- Steps 1 to 5 as written, with the three new assertions: no mail before the pause, none after the 10-second wait, one after the resume.
- A pause that did not stop the scheduler fails it at step 4: the site's count rises within `settle` (the count assertion fails first), and the recovery mail would also have arrived (the empty-mailbox assertion).

**`delete-service.spec.ts`**

- The test passes with the targets added through the screen and shows `Its alert list goes with it: 2 notification targets.`
- No `page.request.post`, `put`, `patch` or `delete` call and no `waitForTimeout` remain in the file; the absence check passes only if no check reaches the stub after the deletion, across both waits.

**Repo-wide**

- `make test-e2e-smoke` passes (the delete journey is in it) and the two specs pass in Chromium (`npx playwright test pause-resume delete-service --project=chromium` from `e2e/`, after `make build`). Report firefox and webkit as run or not run, with the reason; WebKit does not run on every machine (`TESTING.md`).
- Nothing outside the two files changed; no manifest or config change.

## Verifier checks

- **Diff rules:** only the two spec files and the plan file; `waitForTimeout` appears nowhere in `e2e/journeys/` (only in `settle` in `e2e/support/helpers.ts`); no test writes over HTTP; no assertion of either journey is removed or loosened (every old assertion is still there, in the same order, apart from the changed setup); no CSS-class selectors; the second pause test's setup differs from today's only by the target.
- **Texts:** `Pause <name>`, `Resume <name>`, `Services` (the back link), the target dialog and toast texts are compared with the code by the helpers; a difference is a finding.
- **Mutation checks** (scratch worktree of `backend/`, never committed; each must fail the named test): pausing does not stop the scheduler (pause test step 4: the count assertion fails first, the mailbox assertion would too); a paused service's checks still run only for the alert path, that is, the count is unchanged but a recovery alert is still sent (step 4's mailbox assertion alone: this one needs the mutation to send alerts without a check, and may not be constructible; report if so); a deleted service's checks keep running (the delete test's absence check); the dialog showing no target count (the `2 notification targets` assertion).
- **Reading the tests:** the mailbox assertions in the pause test compare against a baseline made in the same test (step 5); the delete test's first `settle` comes after the `404` read and before the count is read; the delete test refreshes the list (`waitForStatus`) before it opens the dialog.
- **Inputs to try:** run both specs with `--workers=1` and `--workers=4`; twice in a row; report each spec's duration before and after this change.

## Stop and ask when

- The contract, a requirement or this file conflict with each other, or the real screens differ from what this file quotes.
- A step needs a helper, fixture or change outside the two files.
- `ROLES.md` or `TESTING.md` does not allow this task to be built by the End-to-end role (see "Out of scope").
- `m5-e2e-journeys` is not merged.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and the commands under "Repo-wide", commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which end-to-end commands ran and in which browsers, each spec's duration before and after, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.

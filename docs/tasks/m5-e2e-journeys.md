# Task: milestone 5 end-to-end journeys

One end-to-end agent builds this on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The rest of milestone 5 is proven through a real browser against the real binary. After this task the suite in `e2e/` shows that the admin's data (services, their settings and state, notification targets, the public-view setting) is all still there after the app restarts; that the sign-in form, the add and edit service forms, the notification target dialog and the delete confirmation can be used with the keyboard alone; that a toast sits at the bottom of the window and stays under an open dialog; and that a save that finishes after the admin has left the form still refreshes the dashboard.

Requirements covered, each by the journey named:

- NFR-1, in part: services, their settings and current state, notification targets and the public-view setting are the same after a restart (journey 9). The upgrade half (a newer build on the same data) is not automated; see "Out of scope".
- NFR-4: the sign-in form, the add and edit forms for services and notification targets, and the delete confirmation can be used without a mouse: Tab moves through the controls in reading order, Enter submits, a dialog keeps focus inside it, Esc leaves it, and the focused control carries a visible mark (journeys 10 to 13). The mark is checked as a style, not as a picture; "visibly marked in both themes" stays the manual check.
- NFR-4, the Type hint: the Type radio group of the service form is described by the hint `Changing type swaps the fields below.` (journey 11), the result of `frontend-hardening`.
- FR-95, in part: the dashboard shows a service whose save finished after the admin left the form, without waiting for the next automatic refresh (journey 15), the result of `frontend-hardening`.

Test titles of this task start with `M5 journey <n>`, numbered after `m5-security-journeys`, which has journeys 1 to 8: this task's journeys are 9 to 15, and this file uses those numbers throughout.

Out of scope:

- **A newer build on the same data (the upgrade half of NFR-1).** It needs two builds of the binary: an older one to create the data and the current one to open it. The suite builds one. Restarting the same binary on the same database is proven here (migrations then find nothing to apply); an upgrade across versions stays in the manual check (`docs/manual-checks.md`, "Restart and upgrade"). The Docker image and volume are manual too (decided by the user).
- **Which colour the focus mark is, and whether it is visible in both themes.** Manual check (`docs/manual-checks.md`, "Keyboard (NFR-4)").
- **Screen readers.** Manual. This task checks the accessible description of one group because the browser computes it, not what a screen reader says.
- **The sign-in lockout, the HTTPS settings and the proxy settings:** `m5-security-journeys`.
- **Keyboard use of every control of every form.** The journeys cover the reading order and the Enter and Esc rules of each form and the default controls; each control's own key handling (switches, selects, the JSON rules rows) is the frontend's component tests.
- **Narrow screens and the other browsers' runs** beyond the full suite: manual checks and the user's `make test-e2e`.
- **Any change to product code, the contract, the `Makefile`, CI, `docker-compose.yml` or docs.**

## Prerequisite

**A change by the user first**, shared with `m5-security-journeys`: `ROLES.md` (the End-to-end row) and `TESTING.md` allow the End-to-end role only for "a milestone's last task"; the user rewords both so that a milestone's closing end-to-end work may be more than one task. If the rule still says "last task", the builder stops and asks.

All of these are merged on the default branch; the builder checks first and stops to ask if any is missing (it never creates them):

- `m5-security-journeys` (its helpers `signInApi`, `attemptSignIn`, `setCookieOf`, and the extended `publicApi`; this task reuses them and changes none).
- `frontend-hardening`: the Type hint on the radio group (`aria-describedby`), the toast viewport inside the portal host below dialogs, and the dashboard refetch after a save that finished off-screen. Check by reading `frontend/src/components/ui/Toast.tsx` (a `BaseToast.Portal`) and `RadioGroup.tsx` (a describedby prop).
- The M1 to M4 suites and their helpers (`signIn`, `serviceName`, `serviceRow`, `addService`, `createService`, `openAddService`, `openEditService`, `openAlertList`, `addTarget`, `fillTarget`, `targetDialog`, `targetRow`, `waitForStatus`, `waitForPaused`, `serviceId`, `listTargets`, `setPublicView`, `publicNames`, `publicApi`), the fixtures (`app`, `stub`, `site`, `receiver`, `visitor`) and `App` (`stop`, `start`, `restart`).
- The screens: sign-in, dashboard, add and edit service, alert list with the target dialog, the delete confirmation.

## Role and ownership

Role: End-to-end (`ROLES.md`).

You may change only `e2e/**`: the support code (`helpers.ts`; `fixtures.ts` only if needed) and the journeys. No dependency is added, so `package.json` and `package-lock.json` do not change; `playwright.config.ts` does not change. You may not change `backend/**`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/m5-e2e-journeys.plan.md`), the root `.gitignore`, `.env.example`, `Makefile`, `.github/**`, `scripts/**` or `docker-compose.yml`.

Shared files this task touches, owned by this task while it runs: `e2e/support/helpers.ts` (and `fixtures.ts` if touched). `m5-security-journeys` has merged before this task runs; no other task changes `e2e/` or the product now.

## Operations used

None is added or changed. The journeys use the real app through the browser (the keyboard, `page.keyboard`), and a few direct HTTP reads where a screen cannot show the value: `listServices` and `listTargets` (with the admin page's session, journeys 9 and 15), sent as `page.request.get('/api/services')` and `page.request.get('/api/services/<id>/targets')` (`listTargets` exists; there is no `listServices` helper to add). The public page is read through `/status` in the visitor's context (`publicNames`). Nothing writes over HTTP: every write goes through a form or a button.

## Behavior

### The harness

Everything of the M1 to M5 harness stays: one app (own port, own temporary database) and one stub per test, `globalSetup` builds the binary once, elements are found by role, label and visible text, the app's environment is explicit, and the only fixed wait is `settle`. Mailpit is not used except where journey 12's targets are saved (an email target needs no mail to be sent; nothing is delivered). This task adds, in `helpers.ts` (names marked new are fixed here; the rest is the builder's choice):

- `tabThrough(page, options)` (new): the control that has focus when it is called is the first stop. It then presses `Tab` up to `options.max` times and returns the stops in order, each as `{ label, top, left, marked }`. `label` is the control's accessible name (its `aria-label`, its associated `label` text, or its own text); `top` and `left` are the bounding box's, in page coordinates (`getBoundingClientRect()` plus the scroll offsets, read right after the Tab). `marked` is the focus-mark check below. It stops when focus returns to the first stop, when focus leaves `options.scope` (a locator whose element must contain the active element), or at `max`. The Type radio group is one stop, whose label is the checked radio's name (`HTTP(S)` on the add form).
- `expectTabStaysIn(page, scope, count)` (new): presses `Tab` `count` times, and after each press the active element is inside `scope`. Used for the dialogs, with a `count` larger than the number of their controls, to show that focus wraps and never leaves.
- The focus mark (`marked`, computed in the page after each Tab): true when the active element, or its closest `label` ancestor (the segmented radio's ring is on its label), has a computed `outline-style` other than `none` and an `outline-width` above 0. `box-shadow` is not counted: `.dialog` has a shadow that every button inside it would inherit. This is a proxy for "visibly marked", not proof of it.
- `expectReadingOrder(stops, { exempt })` (new): among the stops whose label is not in `exempt`, for every pair of consecutive stops the next is not above the previous by more than 4 px, and when the two are within 4 px vertically the next is to the right of the previous. (Reading order: top to bottom, left to right.) The service forms pass `exempt: ['Run test', 'Cancel', 'Save service']`: the test panel and the sticky footer are positioned apart from the fields (the footer sticks to the window, the panel to the right column), so their page coordinates are not reading order; `expectFieldsBeforeActions(stops, ['Run test', 'Cancel', 'Save service'])` (new) instead asserts that every stop of the exempt set comes after every other stop in the Tab order.
- `expectReached(stops, labels)` (new): every label in the list is among the stops' labels, by exact accessible name. Other stops are allowed (the dialogs' `Close` button, `Send test alert`, the `Method` select, `Add parameter` and `Add header`, `Body type`, the message fields): the list is the journey's, written below, and is not derived from the page.

Journeys 10 to 13 never use `click` on the control under test: they move focus with `Tab` (or, once per screen, `focus()` on its first control, which the test names) and act with `Enter`, `Space`, the arrow keys and `Escape`.

### Journey 9: data survives a restart (`data-survives-restart.spec.ts`)

Uses `site` (two routes) and `receiver`. Steps:

1. The admin signs in. The public view is turned on (`setPublicView`). Service A: an HTTP service on the site's route `/a`, alerts on, shown on the public page; wait for `Healthy`. Service B: an HTTP service on `/b`, alerts off, not shown; then paused: the admin presses `Pause <B's name>` and `waitForPaused` waits for it. On A's alert list, add an email target (`ops@e2e.test`, named `Ops`) and a webhook target (the receiver's URL, named `Hook`, one custom header `X-Token` with value `secret-token`).
2. Before: read `GET /api/services` (the whole body), `GET /api/services/<A>/targets` and `<B>/targets` (whole bodies), and, with the visitor's context, the names `publicNames` shows on `/status`. Read A's `state.last_status_change_at` and B's `state.status`.
3. `app.restart()`. The old session is gone (the dashboard asks for sign-in again); sign in.
4. After: the services body equals the before body in every field except `state.last_checked_at` (a new check may have run): the same ids, names, check settings, alert and public flags, `paused` values, `target_count`, `alert_delivery_failed`, `state.status`, `state.last_status_change_at` and `state.last_failure_reason`. Each service's targets body equals the before body exactly. The `Public page` switch reads `On` (loaded, then asserted), and the visitor's `/status` lists the same names as before (A only, since B is not shown and is paused).
5. The checks resume for A and stay stopped for B: right after `app.restart()` resolves, before signing in, read the number of requests `site` has seen for `/a` and for `/b` (`site.requestsTo(path).length`); then, after steps 3 and 4, wait until the number for `/a` has gone up by two (two checks, six seconds apart, within 20 s), then the number for `/b` is still the one read first. (This step comes after steps 3 and 4 only in the order of the text; the two baselines are taken first.) (A wrongly resumed B would have been checked twice by then.)

### Journey 10: the sign-in form by keyboard (`keyboard.spec.ts`; the first test `@smoke`)

Two tests, each on a fresh page on `/sign-in`, signed out, with its own app. The first has steps 1 to 3, the second step 4.

1. Focus is in `Username` when the page appears (no key pressed).
2. `tabThrough` with the scope the `main` element and `max` 6, called while focus is in `Username`: the stops are `Username`, `Password`, `Sign in`, in reading order, each marked; `expectReached(stops, ['Username', 'Password', 'Sign in'])`.
3. Typing the admin's username in `Username`, `Tab`, typing the password in `Password`, and pressing `Enter` (not the button) signs in and shows the dashboard heading.
4. (Second test.) With a wrong password typed and `Enter`: the banner `Username or password is incorrect.` shows and focus is in `Password`.

### Journey 11: the service forms by keyboard (`keyboard.spec.ts`)

A signed-in admin and `site` with one route.

1. **Add.** On the empty dashboard, focus the `Add service` link (the first of the two on the empty state) with `focus()` and press `Enter`; the page `Add service` shows and focus is in `Name`.
2. `tabThrough` from `Name` with the scope `main`, `max` 80: `expectReadingOrder` and `expectFieldsBeforeActions` (with the exempt set above), every stop `marked`, and `expectReached` with: `Name`, `HTTP(S)` (the Type group's one stop), `URL`, `Check interval`, `Timeout`, `Retries`, `Retry interval`, `Send alerts`, `Show on public page`, `Run test`, `Cancel`, `Save service`. Tab enters the Type group once and leaves it on the next Tab (one stop for the group).
3. The Type group is described by its hint: `getByRole('radiogroup', { name: 'Type', exact: true })` (the `Body type` group is also a radiogroup, so the name is matched exactly) has the accessible description `Changing type swaps the fields below.`
4. With focus in the Type group, `ArrowRight` selects `TCP port`: the fields `Host` and `Port` appear and `URL` is gone; `ArrowLeft` returns to `HTTP(S)` (the form swaps back).
5. Fill `Name` and `URL` with the keyboard (typing; `Tab` between); press `Enter` in `URL`: the service is saved and the dashboard shows its row.
6. **Edit.** Focus the `Edit <name>` link of that service with `focus()` and press `Enter`; the page `Edit service` shows. The reading-order, exempt-set and mark checks of step 2 also pass on the edit form (`tabThrough` from `Name`, the same list). Change `Name` by typing; press `Enter` in `Name`: the dashboard shows the new name.

### Journey 12: the notification target dialog by keyboard (`keyboard.spec.ts`)

A signed-in admin, one service, its alert list open (`openAlertList`).

1. Focus the `Add target` button with `focus()` (named) and press `Enter`: the dialog `Add target` opens and focus is inside it. `expectTabStaysIn` with the dialog as scope and a count of 20 (more than its controls): focus never leaves the dialog.
2. In the dialog, `tabThrough` from `Name (optional)` (its initial focus) with the dialog as scope: `expectReadingOrder` with `exempt: ['Close']` (the head's `Close` button is first in the page's order and at the top right, and the focus trap makes it the stop after `Add target`; it is not a field) and the mark on every stop, and `expectReached` with `Name (optional)`, `Email` (the Type group's one stop is its checked radio, `Email`), `Email address`, `Cancel`, `Add target`. Choosing `Webhook` with the arrow keys swaps `Email address` for `Webhook URL` (and shows `Add header`).
3. Back on Email, `Email address` typed with the keyboard, `Enter` in the field: the toast `Target added.` shows and the dialog closes; focus is on a control of the page (a button or link inside `main`), not on `body`.
4. Reopen the dialog with the keyboard and press `Escape` with nothing typed: the dialog closes and the list is unchanged.
5. **Edit.** Focus `Edit <label>` of the new target with `focus()` and press `Enter`: the dialog `Edit target` opens with focus in `Name (optional)`. Type a name and press `Enter` in it: the toast `Target saved.` shows, the dialog closes and the row shows the name.
6. **Remove.** Focus `Remove <label>` with `focus()` and press `Enter`: the group `Confirm removal` appears with focus on its `Remove` button (the screen puts it there); `Enter` removes the target: the toast `Target removed.` shows and the list no longer has the row.

### Journey 13: the delete confirmation by keyboard (`keyboard.spec.ts`)

A signed-in admin, one service on the dashboard.

1. Focus `Delete <name>` with `focus()` (named) and press `Enter`: the dialog `Delete “<name>”?` opens with focus on `Cancel`.
2. `Tab` moves to `Delete service`; another `Tab` stays inside the dialog (it comes back to `Cancel`), and `expectTabStaysIn` with a count of 10 shows focus never leaves it. Both buttons are `marked` (read after each Tab).
3. `Escape` closes the dialog; the service row is still there; focus is back on the `Delete <name>` button.
4. Open it again, `Tab` to `Delete service`, press `Enter`: the row is gone and the dashboard shows the empty state (`No services yet`).

### Journey 14: the toast is placed against the window and stays under a dialog (`toast-and-refresh.spec.ts`)

A viewport of 1000 by 400 px. A signed-in admin with five services (added through `createService` with `alerts: false`), so the dashboard is taller than the window and is scrolled to its top.

A toast is made by pressing the `Public page` switch (role `switch`, name `Public page`, exact, enabled once loaded): it shows `Public page turned on.` or `Public page turned off.` for 5 seconds. The test waits for the previous toast to be gone before it makes the next. The toast is found as the element with the role `dialog` whose text holds `Public page turned` (toasts have the role `dialog`; the viewport itself has no label to find it by). With one toast shown, its bounding box is the stack's.

1. A toast shown: its bottom is 16 px above the bottom of the window and its right is 16 px inside the window's right, measured with `document.documentElement.clientHeight` and `clientWidth` (not `innerHeight` and `innerWidth`, which include a scrollbar), each within 1 px. (On a page taller than the window, a toast placed against the page would be below the fold.)
2. A new page at 360 by 600 px, signed in: a toast shown: its bottom is 12 px above the window's bottom, its left 12 px inside the left and its right 12 px inside the right, within 1 px.
3. With a toast shown, the test first reads the toast's bounding box and its centre point; then the admin opens the delete confirmation of a service with the keyboard (`focus()` on `Delete <name>`, `Enter`; no mouse click, which a toast could intercept): `document.elementFromPoint` at the toast's centre is not inside the toast, because the dialog layer is above it. After `Escape`, while the toast is still shown (the steps run inside its 5 seconds; if it has gone, the toast is made again), the element at that point is inside the toast.

### Journey 15: a save that finishes after the admin left (`toast-and-refresh.spec.ts`)

A signed-in admin with one service on the dashboard (loaded).

1. The test holds the answer to the save: `page.route` on `POST /api/services` waits on a promise the test resolves later, then continues the request. (Playwright route handling; the request still reaches the real server.)
2. Open `Add service`, fill a new name and the site's URL, press `Save service` (the request is now held).
3. Leave the form with the back link, the link named `Services` at the top of the form (`Cancel` is disabled while a save is in flight, and no question is asked): the dashboard shows the one service from before.
4. Resolve the held promise. Without waiting for the automatic refresh (5 minutes), the dashboard lists the new service within 5 seconds, and `GET /api/services` has two services.

### Known gaps

- **Journey 9 does not prove an upgrade** across versions or the Docker image (see "Out of scope").
- **The focus mark is a style check,** not a rendered-colour check; a mark that exists but is invisible passes. The manual check covers visibility in both themes.
- **Keyboard journeys use `focus()` once per screen** to reach a control that is far from the page's start (a link in the list, a button in a row); that the control is reachable by Tab is asserted by the `tabThrough` of the screen where it matters (the forms and dialogs), not for every dashboard row.
- **Journey 14 depends on a 5-second toast** and the browser's layout; the numbers are asserted within 1 px, and the viewport sizes are set by the test.
- **A control that fails the focus mark or the reading order is a finding about the product, not about the test:** the builder reports it and stops (see "Stop and ask when"); it does not loosen a check or change the product.
- **On the service forms, `Run test` is after the last field in Tab order but at the top right of the page on a wide screen.** The file exempts it, `Cancel` and `Save service` from the geometric rule and requires them to come after the fields. Whether that order is acceptable for NFR-4 is the user's call (reported in the drafting notes); the journey does not decide it.
- **Journey 14's step 3 depends on the dialog layer being hit-testable above the toast.** If the library makes the toast inert while a dialog is open, hit testing skips it and the assertion passes in either order; the verifier runs the mutation named below and reports whether it fails.
- **The wrong-password sign-in in journey 10's second test, and the target and service saves, are single attempts;** none comes near the lockout.

## Structure

By `TESTING.md` ("End-to-end"). Names marked "new" are fixed by this file; the rest is the builder's choice.

- `e2e/support/helpers.ts` extended as above (`app.ts`, `stub*.ts`, `mailpit.ts`, `certs.ts` are not changed; `fixtures.ts` only if a fixture is needed).
- `e2e/journeys/data-survives-restart.spec.ts` (journey 9), `keyboard.spec.ts` (journeys 10 to 13), `toast-and-refresh.spec.ts` (journeys 14 and 15) (new). Titles start with `M5 journey <n>` (9 to 15) and name the requirement IDs. The first test of journey 10 is tagged `@smoke` (it adds one test to the pull-request smoke subset).
- No new script or config file, and no new dependency.

## Dependencies

None. Playwright and the harness are already in `e2e/package.json`; the manifest and the lockfile do not change.

## Acceptance criteria

Every criterion is a journey (a test) that fails if the behavior is removed. The journeys run in Chromium by default and in all three browsers in the full suite.

**Journey 9**

- Steps 1 to 5 with their equalities: the services body, the targets bodies, the public switch, the visitor's names, and the checks that resume for A and stay stopped for B (the two-check wait).

**Journey 10**

- Steps 1 to 4, with the stops reached in the order given and each marked.

**Journey 11**

- Steps 1 to 6, including the hint's accessible description, the arrow-key swap in both directions, Enter saving the add form and the edit form.

**Journey 12**

- Steps 1 to 6, including that no Tab ever leaves the dialog, that Escape with nothing typed leaves the list unchanged, the edit (`Target saved.`) and the removal (`Target removed.`).

**Journey 13**

- Steps 1 to 4, including the initial focus on `Cancel`, the trap, the focus return and the delete.

**Journey 14**

- Steps 1 to 3 with their numbers; step 3 asserts both directions (under the dialog, back above after Escape).

**Journey 15**

- Steps 1 to 4: the dashboard shows the new service after the held save resolves and before any automatic refresh.

**Repo-wide**

- `make test-e2e-smoke` passes and the new specs pass in Chromium (`npx playwright test data-survives-restart keyboard toast-and-refresh --project=chromium` from `e2e/`, after `make build`). Report firefox and webkit as run or not run, with the reason. WebKit does not run on macOS 14 (`TESTING.md`).
- `make check` passes for anything outside `e2e/` it covers; nothing outside `e2e/` changed.

## Verifier checks

- **Diff rules:** only `e2e/**` and the plan file; no manifest or config change; no `waitForTimeout` except in `settle`; no CSS-class selectors in `locator`; no `retries` setting; journeys 10 to 13 do not `click` the control under test; no test writes over HTTP; the app's environment stays explicit.
- **Texts:** every quoted message and label is compared with its source (`frontend/src/features/**`, `frontend/src/components/ui/**`) and a difference is a finding against the file or the test.
- **Mutation checks** (scratch worktree of `frontend/`, never committed; each must fail at least the named journey): the toast viewport rendered outside the portal host again (journey 14, step 1 or 2); `.toast-viewport` above the dialog layer (journey 14, step 3; run it and report whether it fails: see Known gaps); `aria-describedby` removed from the Type group (journey 11, step 3); `removeQueries` only, without the refetch (journey 15); a `tabindex` that puts a later field before an earlier one (journeys 10 to 12: the reading order); `outline: none` and no other focus style on inputs (the mark, journeys 10 to 12; the dialogs' buttons included, which the old proxy would have passed through `.dialog`'s shadow); the dialog's focus trap removed (journeys 12 and 13); the initial focus of the delete dialog moved to `Delete service` (journey 13); Enter not submitting the add form (journey 11); the app dropping a table's rows at start, or not reading a setting (journey 9; a backend scratch change: skip the ones that cannot be made).
- **Reading the tests:** journey 9's before and after reads come from the same endpoints; journey 11 step 5 and 6 use `Enter` and not the button; journey 13 step 3 asserts the row is still present and the focus is back on the opener; journey 15 resolves the held promise only after the dashboard has been shown.
- **Inputs to try:** run with `--workers=1` and `--workers=4`; run the new specs twice in a row, and the whole suite once; run journey 14 in each browser the machine has.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the real screens differ from what this file quotes.
- A control fails the reading-order or the focus-mark check, or a dialog lets focus leave it, or Enter does not submit: report it as a finding and stop; do not loosen the check.
- `ROLES.md` or `TESTING.md` still says the End-to-end role builds only "a milestone's last task" (see "Prerequisite").
- `frontend-hardening` or `m5-security-journeys` is not merged.
- You think you need a change outside `e2e/`, a dependency, or a change to a product text.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` and the commands under "Repo-wide", commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the journey that shows each), which end-to-end commands ran and in which browsers, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.

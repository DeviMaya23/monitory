# Manual checks

What no automated test covers. The user runs these and ticks the boxes; agents do not. A bug found here leaves a test behind (`TESTING.md`).

## After the first front-end slice

Once, before the next front-end task is drafted.

- [ ] `make build`, start the binary, open `http://localhost:8080`: the app page loads from the binary, not the placeholder.
- [ ] The Vite dev server on `:5173` reaches the API through its proxy.
- [ ] The screen matches its board in `docs/design/`: tokens, type, spacing, status badges.
- [ ] Dark theme follows the operating system setting.
- [ ] No error in the browser console.

## At each milestone

- [ ] `make test-e2e` passes in Chromium, Firefox and WebKit.
- [ ] Each screen the milestone added matches its board, in the light and the dark theme.
- [ ] Times on the dashboards are in this computer's local time (FR-94).
- [ ] Milestone 2: an email alert arrives in a real mailbox through the production SMTP provider, as plain text, with the time in UTC (FR-23, FR-93, NFR-7). Needs the SMTP provider.

## Before release (milestone 5)

### Browsers (NFR-2)

In the latest two versions of Chrome, Firefox, Safari and Edge, with no visible layout break and no error in the browser console:

- [ ] Sign in.
- [ ] Add a service.
- [ ] Edit it.
- [ ] Pause and resume it.
- [ ] Delete it, with the confirmation.
- [ ] Add a notification target.
- [ ] Open the public dashboard.

### Narrow screens (NFR-3)

At 360 px width, across the same flows:

- [ ] No screen scrolls sideways.
- [ ] Every button and field can be reached and used.
- [ ] No text or control is cut off.

### Keyboard (NFR-4)

- [ ] The focused field is visibly marked on every form and in the delete dialog, in both themes.

### Restart and upgrade (NFR-1)

With the Docker image and a volume:

- [ ] Stop and start the container: services, alert lists, settings and state are still there; the admin signs in again (FR-114).
- [ ] Replace the container with a newer image on the same volume: the same holds, and migrations apply.

### Production

- [ ] The pre-flight checklist and the post-deploy smoke test in `deploy/README.md`.
- [ ] Sign-in over plain HTTP is refused, and the cookie is marked `Secure` (FR-97, FR-98).
- [ ] The public view's rate limit counts the visitor's address, not the proxy's (FR-99, FR-32).
- [ ] Stopping the app is noticed by the outside watcher.

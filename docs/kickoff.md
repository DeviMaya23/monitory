# Kickoff progress

Written by the `project-kickoff` skill. One line per finished step; a step is finished only when the user has said so. Delete this file when step E is done.

Kit: local clone at `~/Documents/GitHub/kickoff-kit` (`templates/`, `packs/go-react/`).

| Step | What | Status | Decided |
|---|---|---|---|
| Intake | requirements.md and openapi.yaml pass the strict checks | Done 2026-11-15 | Passed against requirements v0.44 and openapi 0.1.0 |
| A | Stack and production map; concerns table answered; env contract; pack check (full, partial or no match, and which pack) | Done 2026-11-15 | `STACK.md`, `deploy/README.md`, `.env.example` confirmed. Pack check: partial match with go-react |
| B | Design brief written, design produced, error table reconciled with the contract | Done 2026-11-15 | Design in `docs/design/` (read-only, rules in `docs/design/README.md`). Every mismatch row decided. Contract is 0.2.0 |
| C | Reference docs written (STACK, ARCHITECTURE, CONVENTIONS, TESTING, ROLES, AGENTS) | Done 2026-11-15 | `ARCHITECTURE.md`, `CONVENTIONS.md`, `TESTING.md`, `ROLES.md`, `AGENTS.md` (`CLAUDE.md` links to it), `docs/tasks/` templates and prompts, `scripts/`. The choices made without a question were confirmed with the files |
| D | Scaffold files: Makefile, CI, scripts, backlog coverage map | Done 2026-11-15 | `Makefile`, `.github/workflows/pr-ci.yml`, `docker-compose.yml` (Mailpit), `.markdownlint-cli2.yaml`, `.gitignore`, `docs/tasks/backlog.md` (coverage map), `docs/manual-checks.md` |
| E | Data model approved; foundation done (app runs locally, `make check` and CI green); walking-skeleton deploy live; first feature task drafted | Foundation done: the user confirmed the done-when list 2026-11-16. Walking skeleton live on Fly.io 2026-11-16. Still open: first feature task | Data model approved; CI green on `8d37378` |

## Intake result

Strict checks, all passing:

1. IDs and testability: 119 active requirements, all with IDs. NFR-2 and NFR-3 got pass criteria in v0.44 and are checked by hand.
2. Mapping: every active requirement is cited by an operation or is in the contract's "no API" list (FR-58 and FR-94 were added to the list).
3. Test profile: present (requirements section 8), with three failure modes, three high-risk paths and five milestones.
4. Access: all 20 operations state their security. Public: `signIn`, `getPublicDashboard`, `getHealth`. Gated by the session cookie: the other 17. Users and reach are in requirements section 2.

Advisory:

- Go-live prerequisites exist (requirements section 9), all nine "not started". Slow ones to start first: hosting account with billing and an always-on instance, domain name and DNS, SMTP account (sender-domain verification).
- Assumptions and out-of-scope sections exist. Every operation lists its statuses and cites requirement IDs.
- `requirements.md` points to `open-questions.md`, which is not in `docs/`.
- Requirements section 9 assumes a container and a persistent volume. These are hosting choices; step A records them in `STACK.md` and `deploy/README.md`.
- For step B: the "last delivery failed" notice is shown on the admin dashboard (FR-86), but the contract only exposes it through `listTargets`, one call per service.
- NFR-2 and NFR-3 go on the manual smoke list (`docs/manual-checks.md`) at step D.

## Decisions log

- 2026-11-15, intake: FR-58 and FR-94 belong in the contract's "no API" list (user edited `openapi.yaml`).
- 2026-11-15, intake: NFR-2 and NFR-3 are checked by hand, with pass criteria written into the requirements (v0.44).
- 2026-11-15, step A: backend is Go, Echo, oapi-codegen (strict server interface).
- 2026-11-15, step A: the only data store is a SQLite file on the persistent volume. Sessions, failed sign-in counts, lockouts and rate-limit counters are in memory.
- 2026-11-15, step A: data access is GORM with a pure-Go SQLite driver (no cgo). Migrations are golang-migrate numbered SQL pairs, embedded in the binary and applied at startup.
- 2026-11-15, step A: frontend is React, TypeScript, Vite; the built files are embedded in the Go binary and served by it (one container).
- 2026-11-15, step A: hosting is one always-on Fly.io machine with a volume.
- 2026-11-15, step A: background scheduler and alert delivery worker are hand-rolled, in process, behind interfaces, with an injected clock. No job queue library.
- 2026-11-15, step A: email is sent with `wneessen/go-mail`; Mailpit is the SMTP server in development and integration tests.
- 2026-11-15, step A: the public view's rate limit (FR-32, fixed window per client address) and the sign-in lockout (FR-2) are hand-rolled in the app, in memory, with an injected clock. No rate-limiting library, no proxy limit.

- 2026-11-15, step A: component primitives are Base UI. Frontend takes the go-react pack defaults (plain CSS with tokens and stylelint, TanStack Query, react-router, ESLint, Vitest, openapi-typescript) with Lucide icons.
- 2026-11-15, step A: forms use react-hook-form; the server validates and its 422 field errors are mapped onto fields. No client schema library.
- 2026-11-15, step A: end-to-end tests are Playwright; a smoke subset runs in CI, the user runs the full suite at milestones.
- 2026-11-15, step A: backend tests use testify; repository tests run in plain `go test` against a real SQLite temp file; only email delivery (Mailpit, Docker) carries the `integration` tag.
- 2026-11-15, step A: `make check` adds golangci-lint, shellcheck and markdownlint. Dockerfile, workflow YAML, SQL and `fly.toml` are not linted.
- 2026-11-15, step A: CI is GitHub Actions; release is `fly deploy` from Actions on merge to `main`. The release workflow is written when the Fly.io app exists.
- 2026-11-15, step A: proxy trust is `TRUST_PROXY` plus `CLIENT_IP_HEADER` (default `X-Forwarded-For`, last entry; `Fly-Client-IP` on Fly.io).
- 2026-11-15, step A: `requirements.md` and `openapi.yaml` stay in `docs/`; pack paths are changed to `docs/openapi.yaml` at scaffold.
- 2026-11-15, step A: public address, SMTP provider and outside watcher are deferred; each becomes a backlog decision with the deadline "before the first deploy".
- 2026-11-15, step A: the walking-skeleton deploy (step E.4) is deferred past the first feature tasks. Why: the user has no Fly.io account set up yet and cannot deploy to production. Until then the skeleton is proven locally: the Docker image run with a volume and the production environment values.
- 2026-11-15, step A: the user confirmed the three step A files. The deferred deploy has no deadline; the user works on Fly.io separately.
- 2026-11-15, step A: every "do not hardcode" limit is an environment key with the requirements' value as default; the dashboards' refresh interval (FR-95) is a named frontend constant. No dev auth bypass. Ports: Go `:8080`, Vite `:5173`.
- 2026-11-15, deploy preparation: Fly.io account and app created, admin credentials staged as secrets. Public address is a custom domain with DNS at Cloudflare. Region `syd`; hostname `monitory.evimay.me`; Cloudflare in DNS-only mode, so Fly.io's proxy is the only proxy. Open: SMTP provider, outside watcher.
- 2026-11-15, step B: contract changed to 0.2.0: `Service` gains read-only `target_count` and `alert_delivery_failed`; `FieldError.message` is required and display-ready, stating the install's limit; field paths use dots with zero-based bracket indexes.
- 2026-11-15, step B: built from the designer's additions: dark theme, inline confirm for removing a target, discard-unsaved-changes dialog. Not built: return to the previous screen after re-sign-in, restoring typed values after a session expires.
- 2026-11-15, step B: counters and hints for configurable limits are not shown; the UI shows the server's field message. Pages: `/` dashboard, `/sign-in`, `/status` public with the fixed heading "Service status" (confirmed).
- 2026-11-15, step B: open for step D: Redocly reports one error (`security-defined` on the `alertDelivery` webhook) and seven style warnings in `docs/openapi.yaml`; decide the fix or a lint config before `make check` exists.
- 2026-11-15, step C: the background half lives in the pack's layers: thin `worker/` (scheduler, delivery loop), rules in `usecase/`, probes, mailer and webhook sender in `adaptor/`. The usecase tells the scheduler after the write commits; startup rebuilds all schedules.
- 2026-11-15, step C: ids are UUIDv7. Logging is `log/slog`, JSON to stdout, with no request data, addresses or secrets.
- 2026-11-15, step C: end-to-end tests are written by the last task of each milestone; agents and CI run the Chromium smoke subset; the user runs the full suite.
- 2026-11-15, step C: chosen by the skill without a question, for the user to confirm: frontend feature names and routes (`/services/new`, `/services/:serviceId`, `/services/:serviceId/alerts`); `memstore/` for in-memory state; the frontend builds into `backend/internal/web/dist/`; fixed limits (500, 50, 30 days, 5 failures, 15 minutes) are named constants; no lint-suppression comments; three extra decision boundaries in `AGENTS.md` (config keys, admin-facing text, undrawn screen states).
- 2026-11-15, foundation risk: `docs/openapi.yaml` is OpenAPI 3.1 (type arrays with `'null'`, `const`). Check first thing in step E that oapi-codegen and the conformance validator accept it; if not, the user decides between another generator and rewriting those constructs.
- 2026-11-15, step C: the user confirmed the step C files as written.
- 2026-11-15, step D: `make check` is lint (gofmt, golangci-lint, ESLint, stylelint, shellcheck, markdownlint), contract lint, tests with the race detector, and both builds. Tools run through npx are pinned: Redocly 2.78.0, openapi-typescript 7.13.0, markdownlint-cli2 0.24.1. CI installs golangci-lint v2.15.0.
- 2026-11-15, step D: CI keeps the pack's path-filtered jobs, each calling the Makefile targets, and adds a markdown-and-scripts job and an end-to-end smoke job that is skipped until `e2e/package.json` exists. Integration tests run in the backend job against Mailpit from `docker-compose.yml`.
- 2026-11-15, step D: markdownlint has line length, table alignment, inline HTML and bold-as-heading turned off; `docs/requirements.md` (two blank-line findings, the user's file) and the pull request template are not linted.
- 2026-11-15, step D: deployment pieces. Exists now: `docker-compose.yml` for Mailpit, `.env` loading through the Makefile. Built in step E: Dockerfile, `/health`, startup migrations, the config-key test, `frontend/.nvmrc` (CI reads the Node version from it), `backend/.golangci.yml`. Scheduled in the backlog: `fly.toml`, the release workflow, the first deploy.
- 2026-11-15, step D: the kickoff session works on `main`, and the user commits there. Nothing is on GitHub yet: `scripts/status.sh` and CI need `main` pushed to `origin`. The first `triage.sh` run needs `--since <commit>`.
- 2026-11-15, step D: contract 0.2.1: the `alertDelivery` webhook declares `security: []` (user decided). `redocly.yaml` turns off `info-license` and `tag-description`; `.redocly.lint-ignore.yaml` exempts `/health` from the 4xx rule. The contract lint is clean.
- 2026-11-15, step D: GitHub repository set to squash merges only, with branches deleted on merge (user decided).
- 2026-11-15, step D: the user confirmed the scaffold checklist.
- 2026-11-15, step E: data model decisions: single values of the check are typed columns on `services`, the three lists are JSON text columns; state lives in its own table `service_states`; a duplicate contact is an email ignoring case or a URL compared exactly; service names are unique by a Unicode lower-case copy kept by the app. `docs/data-model.md` is written and waits for the user's approval.
- 2026-11-15, step E: foundation risk checked outside the repo: oapi-codegen v2.8.2 generates the strict Echo server from the 3.1 contract; nullable fields become pointers. It also generates a handler for the `alertDelivery` webhook, which the app does not serve. Still to check in the foundation: that the generated code compiles, and a conformance validator that accepts OpenAPI 3.1.
- 2026-11-15, step E: the user approved `docs/data-model.md`. Messages are trimmed before saving; left out, null and empty all mean the default message.
- 2026-11-15, step E: both development ports are set in `.env`: `LISTEN_ADDR` for the Go server (the Vite proxy follows its port) and `FRONTEND_DEV_PORT` for Vite. `FRONTEND_DEV_PORT` is development only, read by `frontend/vite.config.ts`, and commented out in `.env.example` because the Go config does not read it. Defaults stay `:8080` and `5173`.
- 2026-11-16, step E: the walking skeleton is proven on Fly.io at the `fly.dev` address; the user ran the commands. Deferred by the user to before first real use: a payment method (machines stop after 5 minutes without one), the custom domain, the release workflow. Feature tasks may start.

## Pack check

Partial match with `packs/go-react`.

- Frontend: full match. Use the pack's Frontend sections, Makefile targets and CI job as they are (paths changed to `docs/openapi.yaml`).
- Backend: match except the data store. Use the pack's Backend sections for layering, handlers, usecases, the API layer and testify. Write from the step descriptions: everything about the database (SQLite, repository tests on a temp file, migrations at startup), the scheduler, the delivery worker, the mailer, and the in-memory session, lockout and rate-limit state.
- Not used from the pack: `migrate.yml`, `scripts/test-integration-local.sh`, the `db-up`, `db-down` and `migrate` Makefile targets, testcontainers.
- Added beyond the pack: golangci-lint, shellcheck, markdownlint, Playwright, Mailpit, the embedded frontend, the Dockerfile and `fly.toml`.

## Carried forward from step A

- Deployment pieces to build in the scaffold or foundation: Dockerfile (frontend stage, Go stage, embedded files), `fly.toml`, health endpoint at `/health`, env-file loading for local development, startup migrations, a check that every key the config code reads is in `.env.example`, docker compose for Mailpit.
- The first production deploy has no deadline: the user is preparing Fly.io separately, using `deploy/README.md`. Step E.4 runs the skeleton locally (Docker image, volume, production-style values) until the user says the host is ready.

## Open after step D

- `shellcheck` is not installed on the user's machine (`brew install shellcheck`); `make lint-shell` says so until it is.
- `deploy/README.md` names the real hostname and the repository is public.
- Nothing is pushed to GitHub yet.

## Foundation state

Built on 2026-11-15. Not committed yet; the user commits.

- Decided: golang-migrate runs through the app's own driver (`platform/migrate/driver.go`), because its SQLite driver and GORM's pure-Go driver (`glebarez/sqlite`) cannot share a binary. Reusable pieces were adapted from the user's earlier project. TypeScript is 6.0 (the newest typescript-eslint supports). The `go` directive is 1.27.4. The TypeScript types are generated with `--default-non-nullable=false`, so a field with a default stays optional.
- Backend: module, generated API code (oapi-codegen 2.8.2; the webhook is excluded from the server), config with the `.env.example` key test, clock and fake, database opener, migration 000001, domain types, policy router (gate, CSRF, size limit, JSON and required body, scheme and client address), error mapping, 501 stubs, `/health`, embedded frontend server, `testutil.NewDB` and `AssertConforms`, and the public view setting as the example through repository, usecase and handler. Sessions are a stand-in that knows none, so gated operations answer 401 until the sign-in task.
- Frontend: project, ESLint (Base UI imports only in `components/ui`), stylelint, Vitest, generated types, API request wrapper, `Switch` and `Dialog` wrappers, tokens and component styles copied from the design, route table with placeholders.
- Dockerfile, `.dockerignore`, `make dev-backend`, `make dev-frontend`, `make docker-build`.

Done-when list, checked 2026-11-15:

| Item | Result |
|---|---|
| `make check` is green | Run, passed |
| Migrations apply to an empty database and reverse | Run, passed (`platform/migrate` tests) |
| The app runs locally end to end | Run, passed: Go on `:8080`, Vite on `:5173`, `/health` reached through the dev proxy |
| Generated code is current | Run, passed: regenerating changes nothing |
| `make test-integration` | Run, passed with Mailpit; no test carries the `integration` tag yet |
| CI green on the foundation commit | Run 2026-11-16 on commit `8d37378`, passed: backend, frontend, contract, markdown and scripts. End-to-end smoke skipped: the suite does not exist yet |
| `docs/data-model.md` and the migrations agree | Checked by reading: the four tables, their columns, checks, indexes and cascades match |
| Walking skeleton | Run locally, passed. Deployed to Fly.io 2026-11-16 by the user: `/health` answers 200 and `/api/services` 401 at `https://monitory.fly.dev` (`deploy/RUNBOOK.md`) |

Open, also in `docs/tasks/backlog.md`: the `internal_error` code is not in the contract; `updatePublicViewSettings` with `{}` counts as off.

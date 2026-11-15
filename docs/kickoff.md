# Kickoff progress

Written by the `project-kickoff` skill. One line per finished step; a step is finished only when the user has said so. Delete this file when step E is done.

Kit: local clone at `~/Documents/GitHub/kickoff-kit` (`templates/`, `packs/go-react/`).

| Step | What | Status | Decided |
|---|---|---|---|
| Intake | requirements.md and openapi.yaml pass the strict checks | Done 2026-11-15 | Passed against requirements v0.44 and openapi 0.1.0 |
| A | Stack and production map; concerns table answered; env contract; pack check (full, partial or no match, and which pack) | Done 2026-11-15 | `STACK.md`, `deploy/README.md`, `.env.example` confirmed. Pack check: partial match with go-react |
| B | Design brief written, design produced, error table reconciled with the contract | In progress | Brief written at `docs/design/ui-design-brief.md`; waiting for the design |
| C | Reference docs written (STACK, ARCHITECTURE, CONVENTIONS, TESTING, ROLES, AGENTS) | | |
| D | Scaffold files: Makefile, CI, scripts, backlog coverage map | | |
| E | Data model approved; foundation done (app runs locally, `make check` and CI green); walking-skeleton deploy live; first feature task drafted | | |

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

## Pack check

Partial match with `packs/go-react`.

- Frontend: full match. Use the pack's Frontend sections, Makefile targets and CI job as they are (paths changed to `docs/openapi.yaml`).
- Backend: match except the data store. Use the pack's Backend sections for layering, handlers, usecases, the API layer and testify. Write from the step descriptions: everything about the database (SQLite, repository tests on a temp file, migrations at startup), the scheduler, the delivery worker, the mailer, and the in-memory session, lockout and rate-limit state.
- Not used from the pack: `migrate.yml`, `scripts/test-integration-local.sh`, the `db-up`, `db-down` and `migrate` Makefile targets, testcontainers.
- Added beyond the pack: golangci-lint, shellcheck, markdownlint, Playwright, Mailpit, the embedded frontend, the Dockerfile and `fly.toml`.

## Carried forward from step A

- Deployment pieces to build in the scaffold or foundation: Dockerfile (frontend stage, Go stage, embedded files), `fly.toml`, health endpoint at `/health`, env-file loading for local development, startup migrations, a check that every key the config code reads is in `.env.example`, docker compose for Mailpit.
- The first production deploy has no deadline: the user is preparing Fly.io separately, using `deploy/README.md`. Step E.4 runs the skeleton locally (Docker image, volume, production-style values) until the user says the host is ready.

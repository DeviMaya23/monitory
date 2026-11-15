# Deployment

Written at kickoff (step A) and kept true as the deployment changes. The commands that actually worked are in `RUNBOOK.md`, written while deploying.

## Production map

One row per part of the app. A part with no row has no decided home.

| Part | Production service | Wired to | Config keys it needs | Where each value comes from | Copied or new |
|---|---|---|---|---|---|
| App: Go binary with the embedded frontend | One Fly.io machine in region `syd`, always on (no auto-stop, minimum one machine running), built from the repo's `Dockerfile` | Listens on `LISTEN_ADDR`; Fly.io's proxy forwards HTTPS to it. Reads and writes the database file. Opens outbound connections to checked services, webhooks and SMTP | Every key in `.env.example` | Non-secret values in `fly.toml` `[env]`; secrets as below | New |
| Frontend | Inside the app binary | Served by the app at the same origin as `/api` | None at runtime | Built by the Dockerfile's frontend stage | New |
| Database | SQLite file on a Fly.io volume in region `syd`, mounted at `/data` on the app's machine | Opened by the app at `DATABASE_PATH` | `DATABASE_PATH=/data/monitory.db` | Derived from the mount path in `fly.toml` | New |
| Migrations | Inside the app: applied at startup, before the server listens | The database file | None | None | New |
| Proxy and HTTPS | Fly.io's proxy | Terminates HTTPS, forwards to the app with `X-Forwarded-Proto` and `Fly-Client-IP` | `REQUIRE_HTTPS=true`, `TRUST_PROXY=true`, `CLIENT_IP_HEADER=Fly-Client-IP` | Fixed for this host, in `fly.toml` `[env]` | New |
| Access gate | Inside the app: single account, in-memory sessions | Sign-in at `/api/session` | `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Username: choose. Password: generate. Both set with `fly secrets set` | New |
| Secrets | Fly.io secrets, injected as environment variables | The app's machine | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SMTP_PASSWORD` | `fly secrets set` | New |
| Health watcher on the platform | Fly.io HTTP health check in `fly.toml` | `GET /health` on the app | None | Path fixed by the contract | New |
| PR CI | GitHub Actions `pr-ci.yml` | Runs on pull requests to `main` | None | None | Copied |
| Release | GitHub Actions workflow: `fly deploy` on merge to `main`, after CI passes | Fly.io, with a deploy token | `FLY_API_TOKEN` (GitHub Actions secret) | Generate with `fly tokens create deploy`; paste into the repository's Actions secrets | New |
| Public address | `monitory.evimay.me`, DNS at Cloudflare in DNS-only mode (not proxied) | A Cloudflare DNS record pointing at the Fly.io app; a Fly.io certificate for the hostname (`fly certs add`) | None in the app | The DNS record values come from `fly certs` output at the first deploy | New |
| SMTP provider | Undecided | The app connects out to it | `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Copy from the provider's dashboard. Decided before the first deploy (backlog) | New |
| Outside watcher | Undecided: something outside Fly.io that calls `/health` | `GET /health` at the public address | None in the app | Decided before the first deploy (backlog) | New |

Config keys and their sources are in `.env.example`; every key the config code reads appears there.

## New parts

Copied from the stack pack: PR CI, the health endpoint, the env-file loader for local development. Changed on purpose: the data store (SQLite on a volume) and the host (Fly.io), because the product is one self-hosted container. Everything else that is new follows from those two.

New parts, in the order they will be tried, with what could fail:

1. Container image with the embedded frontend: the frontend build output is missing from the Go build stage; client-side routes return 404 on reload instead of the app page; `/api` and `/health` are shadowed by the static file handler.
2. SQLite file on a mounted volume: the app's user cannot write to the mount; the file is created inside the image instead of on the volume, so data is lost on redeploy; a second connection hits "database is locked" under concurrent writes.
3. Migrations at startup: a failed migration leaves the app not starting and the health check failing; a new release's migration is not backward-compatible and the old release cannot be rolled back onto it.
4. Fly.io machine and volume: auto-stop is left on and checks stop when no request arrives; a volume pins the app to one machine in one region, so a deploy replaces the machine with a short gap instead of rolling; the volume is not attached on the first deploy.
5. Fly.io proxy headers: `Fly-Client-IP` or `X-Forwarded-Proto` is not what the app reads, so sign-in is refused (`https_required`) or all viewers share one rate limit.
6. Secrets: a secret is set in `fly.toml` instead of `fly secrets`; a missing `ADMIN_PASSWORD` stops the app (intended, FR-102) and looks like a failed deploy.
7. Outbound SMTP from Fly.io: the provider's port is blocked from the host; the sender address is not verified with the provider.
8. Release workflow: the deploy token is missing or scoped to the wrong app; the workflow deploys before CI finishes.
9. Reach of checked services: private addresses are not reachable from the Fly.io machine.

## Pre-flight checklist

Run before the first deploy and before any deploy that changes wiring. Add a line whenever a deploy error teaches you one.

- [ ] The Fly.io account has a payment method: without one, machines are stopped after 5 minutes.
- [ ] Every key in `.env.example` that has no default is set: non-secrets in `fly.toml` `[env]`, secrets with `fly secrets set`.
- [ ] `REQUIRE_HTTPS=true`, `TRUST_PROXY=true` and `CLIENT_IP_HEADER=Fly-Client-IP` are set.
- [ ] The volume exists, is mounted at `/data`, and `DATABASE_PATH` points inside it.
- [ ] The machine does not auto-stop and at least one machine always runs.
- [ ] The health check in `fly.toml` probes `/health` and needs no credentials.
- [ ] The release's migrations are backward-compatible with the version still running.
- [ ] A copy of the database file was taken before a release that changes the schema.
- [ ] The SMTP provider accepts the `SMTP_FROM` sender, and its port is reachable from the machine.
- [ ] `FLY_API_TOKEN` is set in the repository's Actions secrets.
- [ ] A rollback exists: how to return to the previous release, and what to do if a migration already ran.

## Post-deploy smoke test

Run after every production deploy, by hand or by script.

- [ ] `GET /health` answers `200` at the public address.
- [ ] The sign-in page loads over HTTPS.
- [ ] `GET /api/services` answers `401` without a session and `200` after signing in.
- [ ] A service added before the deploy is still listed, with its state (NFR-1).
- [ ] Add a service, see its first check complete, then delete it.
- [ ] A test alert to an email target is delivered.

## Rollback

Filled in during the first deploy.

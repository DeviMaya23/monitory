# Runbook

Filled in while deploying, never afterwards from memory. At the end of any session that helps with a deploy, ask it to write here every command and setting that finally worked, in order, with the errors met and their fixes. Do not put secret values here, only where each one comes from.

## Fly.io: setup

Done on 2026-11-15, as reported by the user:

1. Fly.io account created.
2. `fly apps create <name>`: reserves the app with no machine. Nothing runs yet.
3. `fly secrets set ADMIN_USERNAME=... ADMIN_PASSWORD=... --app <name> --stage`: stores the admin credentials without a restart. The password was generated; its value is in the user's password manager.

Decided, not yet applied: region `syd`; hostname `monitory.evimay.me` with Cloudflare in DNS-only mode.

Not done yet: volume, `fly.toml`, certificate and DNS for the custom domain, SMTP secrets, deploy token, first deploy.

## Local walking skeleton

Run on 2026-11-15 in place of the first deploy, which is deferred. Every command worked as written.

1. `make docker-build`: builds the frontend, embeds it in the Go binary, and produces `monitory:local` (about 32 MB, distroless, runs as user 65532). The build fails if the frontend stage produced no app page.
2. An env file with `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `REQUIRE_HTTPS=true`, `TRUST_PROXY=true`, `CLIENT_IP_HEADER=Fly-Client-IP`. No quotes around values: `docker --env-file` does not strip them.
3. `docker run -d --name monitory -p 8080:8080 -v monitory-data:/data --env-file <env file> monitory:local`. The image sets `LISTEN_ADDR=:8080` and `DATABASE_PATH=/data/monitory.db`.
4. Checked: `GET /health` answers `200 {"status":"ok"}`; `/` and `/services/new` return the built app page; `GET /api/services` answers `401`; an unknown `/api` path answers a `404` problem; the start log shows `schema_version` 1.
5. Checked: the database file on the volume is owned by user 65532. After `docker rm -f monitory` and step 3 again, a value written before is still there and the migrations do not run again.
6. Checked: without `ADMIN_PASSWORD` the container exits with status 1 and logs `ADMIN_PASSWORD is not set`.

Not covered locally: Fly.io's proxy and `Fly-Client-IP`, the volume on Fly.io, HTTPS, the health check in `fly.toml`, outbound SMTP.

## Redeploy

Filled in at the first deploy.

## Known errors

| Error | Cause | Fix |
|---|---|---|

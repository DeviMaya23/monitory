# Runbook

Filled in while deploying, never afterwards from memory. At the end of any session that helps with a deploy, ask it to write here every command and setting that finally worked, in order, with the errors met and their fixes. Do not put secret values here, only where each one comes from.

## Fly.io: setup

Done on 2026-11-15, as reported by the user:

1. Fly.io account created.
2. `fly apps create <name>`: reserves the app with no machine. Nothing runs yet.
3. `fly secrets set ADMIN_USERNAME=... ADMIN_PASSWORD=... --app <name> --stage`: stores the admin credentials without a restart. The password was generated; its value is in the user's password manager.

Decided, not yet applied: region `syd`; hostname `monitory.evimay.me` with Cloudflare in DNS-only mode.

Not done yet: volume, `fly.toml`, certificate and DNS for the custom domain, SMTP secrets, deploy token, first deploy.

## Redeploy

Filled in at the first deploy.

## Known errors

| Error | Cause | Fix |
|---|---|---|

# Plan: backend test hardening

Branch: `feat/backend-test-hardening`

## Baseline (item 1, reproduce first)

- `go test -race -count=1 ./internal/handler/` before any change: **67.4 s** (ok).
- CPU profile of that run: `operationRules` (via `NewRouter`, via the test helper `newRouter`) 11.6 s = 19.5%; `testutil.AssertConforms` 9.05 s = 15.2%; total about 35% of the samples, which matches the drafter's figure (above one fifth, so the premise holds). The test helper `operations` is three calls and negligible.
- Read-only check: `operationRules`' two maps are only read, by `policyRouter.add` (`router.go`, `p.public[...]`, `p.bodyRequired[...]`); nothing writes them after they are built.
- Read-only check: `AssertConforms` and `findOperation` only read the spec; the spec is passed to `routers.Route` and `openapi3filter.ValidateResponse` reads it (to be re-confirmed in kin-openapi's source, noted below).
- `operations(t)` callers (`router_test.go` lines 32, 44, 71) only range over the slice.

## Checklist

### Contract read once
- [ ] `operationRules` memoized with `sync.OnceValues` in `handler/router.go`; `NewRouter` unchanged.
- [ ] `handler/rules_test.go` (new): `TestOperationRules_AreMemoizedAndUnchanged`: same map pointers on two calls, literal contents of `public` and `bodyRequired`.
- [ ] `operations(t)` memoized in `handler/helpers_test.go` (`sync.OnceValues` without `*testing.T`; `require` on the caller's `t`).
- [ ] `testutil/conformance.go`: `AssertConforms` reads the contract through a package-level `sync.OnceValues(api.GetSwagger)`.
- [ ] Handler suite passes `-race`; wall time after recorded here (expected under 10 s).

### Timing-independent tests
- [ ] `testutil/target_server_test.go` `TestTargetServer_DelayAndRedirect`: remove `fast < 100 ms` and its measurement; keep `slow >= 100 ms`.
- [ ] `adaptor/probe/http_test.go` `TestCheckHTTP_Timeout`: healthy case uses `longTimeout`.
- [ ] Audit of every test in `http_test.go` and `target_server_test.go` (table below).
- [ ] `adaptor/probe` and `testutil` pass `-count=30 -race`.
- [ ] Same packages pass `-count=3 -race` under CPU load (one busy loop per core).
- [ ] Mutations: `TargetServer` ignoring `Delay` fails `TestTargetServer_DelayAndRedirect`; probe ignoring its timeout fails `TestCheckHTTP_Timeout`.

### Mailpit test (`adaptor/mailer/mailer_integration_test.go`, `TestMailpit_DeliversTheAlert`)
- [ ] No `DELETE /api/v1/messages` without an `IDs` body; random recipient `integration-<16 hex>@example.com`.
- [ ] Search `to:<address>`, assert `len(messages) == 1`, same message assertions as before.
- [ ] Delete only its own id at the end of the body (200, then search is empty) and again in `t.Cleanup` with its own context.
- [ ] Integration test run: not run yet (Docker daemon state to be recorded).

### Repo-wide
- [ ] `make check` passes.
- [ ] Nothing outside the allowed paths changed.

## Audit table

(filled in as the tests are read)

## Judgment calls

(filled in at the end)

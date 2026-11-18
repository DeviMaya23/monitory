# Plan: http json rules

Branch: `feat/http-json-rules`. Prerequisite `http-request-send` is merged (checked: `HTTPCheck` request fields, prober building the request, runner mapping, `domain.JSONRule`, failure codes, `ResponseBodyMaxBytes`).

Files: E = `backend/internal/adaptor/probe/json_rules.go` / `json_rules_test.go`; P = `http.go` / `http_test.go` (same dir); R = `backend/internal/worker/check_runner.go` / `_test.go`; M = `backend/cmd/server/main.go`; D = `backend/internal/domain/check.go`.

## Evaluation (E, table `TestEvaluateJSONRules_*`)

- [x] String rule: same string matches; other case, prefix, surrounding spaces do not (FR-45)
- [x] Numbers match their text as written (`3`, `1.50`, `1e3`); never a bool rule (FR-45)
- [x] Bool rule matches only a JSON bool of the same value; `"true"` string vs `true` both ways
- [x] `null` matches only the string `null`; not missing
- [x] Nested path; missing key, empty segments, array/string/number/true/null steps missing; object/array values present and never match; non-object top level makes all missing; duplicate key takes last (FR-46)
- [x] Modes any / all / empty (FR-47), incl. `all` with a missing field = missing, not a match
- [x] Escaped string `"down"` matches `down`
- [x] First matching rule in saved order reported, under any and all
- [x] Not valid JSON cases: empty, whitespace, `{`, text, BOM, `{} x`, `{}{}`, `{} {}`; whitespace around fine; too large invalid (FR-48, FR-73)

## Probe (P, `TestCheckHTTP_JSONRules*`)

- [x] 200 ok body healthy / matching body `json_rule_matched` with field, HTTPStatus nil (FR-42, FR-44)
- [x] 500 matching = `json_rule_matched`; 500 non-matching and 500 no JSON = `non_2xx_status`; 200 non-JSON, empty, missing field = `invalid_or_missing_json` (FR-48, FR-61)
- [x] No rules: 1 MB body with empty non-nil rules healthy; same with a rule `invalid_or_missing_json`
- [x] Limit: exactly max valid non-match healthy; one more `invalid_or_missing_json` (also valid prefix); limits 64 and 1024 (FR-73)
- [x] Reading inside timeout: slow body `timed_out` with rules, healthy without; cut-off body `could_not_connect` (2xx) / `non_2xx_status` (500); slow 500 body `timed_out`; caller cancel during read returns context error (FR-41, FR-61)
- [x] Redirects: rules judge the final response
- [x] HEAD with rules and 2xx fails `invalid_or_missing_json`
- [x] Modes any/all through the probe (FR-47)
- [x] Existing `http_test.go` tests unchanged apart from the constructor argument

## Runner (R)

- [x] Rules and mode reach the prober on every attempt; none gives nil and empty mode
- [x] `json_rule_matched` with field recorded after last attempt; fail then healthy recorded healthy

## Wiring and repo-wide

- [x] M passes `cfg.Limits.MaxRedirects` and `cfg.Limits.ResponseBodyMaxBytes`
- [x] D: `JSONRules`, `JSONRuleMode` on `HTTPCheck`
- [x] `make check` passes: run, passed (second run; the first run failed once in the unrelated `TestScheduler_ContextWinsOverFiredTimer`, which passed 10 of 10 alone and is untouched by this branch)
- [x] No change to go.mod/go.sum/.env.example/config/migrations/other files outside allowed paths
- [x] Integration tests: not run: no integration test applies to this task (probe and runner tests are unit tests)

## Judgment calls

- A rule list that is non-empty but `any`/`all` with zero matches and zero missing is healthy; `all` with an empty rule list cannot fail (never reached, since no rules means no body read).
- Under `any`, one match plus another missing field reports `json_rule_matched` (a match wins over a missing field), as step 7 orders it.
- `evaluateJSONRules` returns a small struct (`Failed`, `Field`, `Unjudgeable`); `http.go` owns the result order.
- A read error is classified inline in `CheckHTTP` (same rule as `classify`: caller context, then deadline), not through `classify`, because the status decides the non-deadline case.
- Test files: the slow and cut-off bodies are served by `httptest` servers in `http_test.go`; the tests use `time.After` inside a handler only to bound a stalled response.
- Mutation checks were not run by the builder; the verifier runs them.

# Plan: http json rules

Branch: `feat/http-json-rules`. Prerequisite `http-request-send` is merged (checked: `HTTPCheck` request fields, prober building the request, runner mapping, `domain.JSONRule`, failure codes, `ResponseBodyMaxBytes`).

Files: E = `backend/internal/adaptor/probe/json_rules.go` / `json_rules_test.go`; P = `http.go` / `http_test.go` (same dir); R = `backend/internal/worker/check_runner.go` / `_test.go`; M = `backend/cmd/server/main.go`; D = `backend/internal/domain/check.go`.

## Evaluation (E, table `TestEvaluateJSONRules_*`)

- [ ] String rule: same string matches; other case, prefix, surrounding spaces do not (FR-45)
- [ ] Numbers match their text as written (`3`, `1.50`, `1e3`); never a bool rule (FR-45)
- [ ] Bool rule matches only a JSON bool of the same value; `"true"` string vs `true` both ways
- [ ] `null` matches only the string `null`; not missing
- [ ] Nested path; missing key, empty segments, array/string/number/true/null steps missing; object/array values present and never match; non-object top level makes all missing; duplicate key takes last (FR-46)
- [ ] Modes any / all / empty (FR-47), incl. `all` with a missing field = missing, not a match
- [ ] Escaped string `"down"` matches `down`
- [ ] First matching rule in saved order reported, under any and all
- [ ] Not valid JSON cases: empty, whitespace, `{`, text, BOM, `{} x`, `{}{}`, `{} {}`; whitespace around fine; too large invalid (FR-48, FR-73)

## Probe (P, `TestCheckHTTP_JSONRules*`)

- [ ] 200 ok body healthy / matching body `json_rule_matched` with field, HTTPStatus nil (FR-42, FR-44)
- [ ] 500 matching = `json_rule_matched`; 500 non-matching and 500 no JSON = `non_2xx_status`; 200 non-JSON, empty, missing field = `invalid_or_missing_json` (FR-48, FR-61)
- [ ] No rules: 1 MB body with empty non-nil rules healthy; same with a rule `invalid_or_missing_json`
- [ ] Limit: exactly max valid non-match healthy; one more `invalid_or_missing_json` (also valid prefix); limits 64 and 1024 (FR-73)
- [ ] Reading inside timeout: slow body `timed_out` with rules, healthy without; cut-off body `could_not_connect` (2xx) / `non_2xx_status` (500); slow 500 body `timed_out`; caller cancel during read returns context error (FR-41, FR-61)
- [ ] Redirects: rules judge the final response
- [ ] HEAD with rules and 2xx fails `invalid_or_missing_json`
- [ ] Modes any/all through the probe (FR-47)
- [ ] Existing `http_test.go` tests unchanged apart from the constructor argument

## Runner (R)

- [ ] Rules and mode reach the prober on every attempt; none gives nil and empty mode
- [ ] `json_rule_matched` with field recorded after last attempt; fail then healthy recorded healthy

## Wiring and repo-wide

- [ ] M passes `cfg.Limits.MaxRedirects` and `cfg.Limits.ResponseBodyMaxBytes`
- [ ] D: `JSONRules`, `JSONRuleMode` on `HTTPCheck`
- [ ] `make check` passes: (outcome)
- [ ] No change to go.mod/go.sum/.env.example/config/migrations/other files outside allowed paths
- [ ] Integration tests: not run: no integration test applies to this task

## Judgment calls

(filled at the end)

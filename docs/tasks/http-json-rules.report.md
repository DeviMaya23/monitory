# Verification report: http json rules

Branch: `verify/http-json-rules` (builder's work at `5107d5a`, `feat/http-json-rules`, plus two test additions by the verifier).

Result: **no Blocking findings.** Two Non-blocking findings. Two tests added (see "Mutation checks").

## `make check` and integration tests

- `make check`: backend lint (`0 issues`), `go test -race ./...`, builds and contract lint pass. The first run failed in `lint-frontend` only because `frontend/node_modules` was missing (`eslint: command not found`); after `npm ci` the frontend suite had one timeout in `TargetDialog.test.tsx` (FR-92, a file this diff does not touch) under load, and it passed alone (58 of 58). Run, passed on the second pass.
- `make test-integration`: **not run.** `docker compose up` failed: port 1025 is already held by another session's container (`alert-dispatch-builder-mailpit-1`), which I did not stop. The only integration test file is `adaptor/mailer/mailer_integration_test.go`; no criterion of this task depends on it (probe and runner tests are unit tests).
- Live run of the built app: **no.** Everything was tried against in-process servers (`testutil.TargetServer`, `httptest`), listed under "Inputs tried".

## Criteria

"Real?" = would the named test fail if the behavior were removed. Mutation evidence is in the mutation table.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| String rule: same string, not other case, prefix or spaces (FR-45) | `TestEvaluateJSONRules_StringMatching` | Yes (mutation: case-insensitive) | Met |
| Numbers by text as written; never a bool rule (FR-45) | `TestEvaluateJSONRules_NumbersByText` | Yes (number by value) | Met |
| Bool rule only a JSON bool; `"true"` both ways | `TestEvaluateJSONRules_Booleans` | Yes (string rule matches true) | Met |
| `null` matches text `null` only, present not missing | `TestEvaluateJSONRules_Null` | Yes (null as missing) | Met |
| Paths: nested, empty segments, steps into array/string/number/true/null, object/array values, non-object top level, duplicate key (FR-46) | `TestEvaluateJSONRules_Paths` | Yes (allow array step) | Met |
| Modes any/all/empty, `all` with a missing field (FR-47) | `TestEvaluateJSONRules_Modes`, `TestCheckHTTP_JSONRuleModes` | Yes (all as any; missing under any) | Met |
| Escaped string `"down"` matches `down` | `TestEvaluateJSONRules_StringMatching` | **No in the builder's version:** the row's body was `{"s":"down"}` with no escape, so it passed without the behavior. Verifier added a row with a real `down` | Met after the added row (see N1) |
| First matching rule in saved order, any and all | `TestEvaluateJSONRules_Modes` rows, `TestCheckHTTP_JSONRuleModes` | Yes (last matching field) | Met |
| Not valid JSON cases, white space ok, too large invalid (FR-48, FR-73) | `TestEvaluateJSONRules_ValidJSON` | Yes (trailing garbage valid) | Met |
| 200 ok healthy / matching: `json_rule_matched`, field, `HTTPStatus` nil (FR-42, FR-44) | `TestCheckHTTP_JSONRules` | Yes | Met |
| 500 matching beats status; 500 non-matching or non-JSON is `non_2xx_status`; 200 non-JSON, empty, missing field is `invalid_or_missing_json` (FR-48, FR-61) | `TestCheckHTTP_JSONRules` | Yes (non_2xx beats rule; invalid beats non_2xx) | Met |
| No rules: 1 MB body with an empty non-nil list healthy; with a rule `invalid_or_missing_json`; body not read without rules (FR-73) | `TestCheckHTTP_JSONBodyLimit/large body`, `TestCheckHTTP_JSONBodyReadInsideTimeout/slow 2xx body` | Yes (read body with no rules fails both) | Met |
| Limit exactly `max` healthy, `max+1` and valid-prefix invalid; limits 64 and 1,024 (FR-73) | `TestCheckHTTP_JSONBodyLimit/limit 64`, `/limit 1024` | Yes (drop limit; over-limit counted valid) | Met |
| Reading under the timeout: slow body `timed_out` with rules, healthy without; cut-off body `could_not_connect` / `non_2xx_status`; slow 500 `timed_out`; caller cancel returns context error (FR-41, FR-61) | `TestCheckHTTP_JSONBodyReadInsideTimeout` | Yes (read error ignores deadline; read body with no rules) | Met |
| Redirects: final response judged | `TestCheckHTTP_JSONRules/rules judge the final response after a redirect` | Yes (both directions are asserted) | Met |
| HEAD with rules and 2xx: `invalid_or_missing_json` | `TestCheckHTTP_JSONRules/HEAD…` | Yes | Met |
| Existing `http_test.go` tests changed only in setup | diff: the only removed lines are the 8 `NewHTTPProber(n)` calls | n/a | Met |
| Runner: rules and mode reach the prober each attempt; none gives nil and empty mode | `TestRun_PassesJSONRules`, `TestRun_NoJSONRulesStayEmpty` | Yes (assignment removal fails both; checked by reading, not run) | Met |
| Runner: `json_rule_matched` with field recorded; fail then healthy is healthy | `TestRun_RecordsJSONRuleField` | Yes (asserts code and field) | Met |
| Wiring: `NewHTTPProber(cfg.Limits.MaxRedirects, cfg.Limits.ResponseBodyMaxBytes)` | read `cmd/server/main.go` (one-line diff) | n/a | Met |
| `make check`; no change to `go.mod`, `go.sum`, `.env.example`, config, migrations or other paths | see above; `git diff --stat` | n/a | Met |

## Plan check

- Every criterion of the task file has a plan item. Nothing missing.
- Ticked item "Escaped string `"down"` matches `down`": the test does not check the behavior (no escape in the body). The plan text has the same flaw (the `d` is gone). Fixed by the verifier's added row.
- All other ticked items have an existing test that checks the behavior.
- Plan vs diff: the file list matches. The plan says the first `make check` run failed once in an unrelated scheduler test; I did not see that. Judgment calls in the plan agree with the code (match beats missing under `any`; read errors classified inline; `evaluateJSONRules` returns a three-field struct).
- Plan: "Mutation checks were not run by the builder": confirmed below.

## Rule checks

- **Dependencies:** none added; `go.mod`, `go.sum`, `.env.example`, `platform/config` untouched. Pinned versions unchanged.
- **Paths:** the diff touches only allowed files (`domain/check.go`, `adaptor/probe/{http,json_rules}(_test).go`, `worker/check_runner(_test).go`, `cmd/server/main.go`, the plan).
- **Layering:** `adaptor/probe` imports `domain` and the standard library only; `worker` imports only `domain` and `pkg/clock` (unchanged).
- **Where rules live:** `evaluateJSONRules` is pure (no network, no clock); `http.go` owns the result order; nothing about alerts or transitions added.
- **No hardcoded limit:** no `65536`, `64 * 1024` or `1 << 16` in non-test probe code.
- **FR-73:** the body is read only after the `len(JSONRules) == 0` early return; the read is `io.LimitReader(resp.Body, max+1)`.
- **FR-41:** the read uses the response of the request built on `probeCtx`; no new context or timer.
- **Logs and time:** the prober has no logging and no `time.Now/Sleep/After/NewTimer` in non-test code. The tests use `time.After` inside stalled handlers only.
- **Data scoping, transactions:** not touched.

## Mutation checks run

All run against the builder's source, one at a time, then reverted (`git status` clean on source). Each row: the named test failed unless noted.

| Mutation | Failed |
|---|---|
| Compare case-insensitively | `TestEvaluateJSONRules_StringMatching` |
| Compare a number by value (`1.50`→`1.5`, `1e3`→`1000`) | `TestEvaluateJSONRules_NumbersByText` |
| String rule matches `true` | `TestEvaluateJSONRules_Booleans` |
| Treat `null` as missing | `TestEvaluateJSONRules_Null` |
| Read a non-2xx body only after the status check (skip body for non-2xx) | `TestCheckHTTP_JSONRules`, `…ReadInsideTimeout` |
| `non_2xx_status` beats a matching rule | `TestCheckHTTP_JSONRules` |
| `invalid_or_missing_json` beats `non_2xx_status` | `TestCheckHTTP_JSONRules` |
| `all` acts as `any` | `TestCheckHTTP_JSONRuleModes`, `TestEvaluateJSONRules_Modes` |
| Report the last matching field | `TestCheckHTTP_JSONRuleModes`, `TestEvaluateJSONRules_Modes` |
| Read the body when there are no rules | `TestCheckHTTP_JSONBodyLimit/large body`, `…ReadInsideTimeout/slow 2xx body` (plus many status tests) |
| Drop the limit | `TestCheckHTTP_JSONBodyLimit` |
| Count an over-limit body as valid | `TestCheckHTTP_JSONBodyLimit` |
| Trailing garbage valid | `TestEvaluateJSONRules_ValidJSON` |
| Allow an array step | `TestEvaluateJSONRules_Paths` |
| Missing field not counted under `any` | `TestCheckHTTP_JSONRules` and three evaluation tests |
| Read error ignores the deadline (read outside the deadline classification) | `TestCheckHTTP_JSONBodyReadInsideTimeout` |
| **Read the whole body (no `LimitReader`)** | **Survived.** Fixed by the verifier's test `an endless body is not read past the limit` in `TestCheckHTTP_JSONBodyLimit`; with it the mutation fails (2.3 s timeout instead of `invalid_or_missing_json`) |

Not run as a source mutation: "read the body with a context outside the deadline". The response body is tied to the request's context, so it cannot be moved without rebuilding the request; the deadline classification mutation above stands in for it.

## Inputs tried

Beyond the table: a gzip response without a saved `Accept-Encoding` is decompressed and judged (`json_rule_matched` by the rule, healthy-or-not as the body says); with a saved `Accept-Encoding: gzip` it fails as `invalid_or_missing_json` (the known gap); a 50 MB gzip bomb at limit 1,024 is `invalid_or_missing_json` and returns (the limit counts decompressed bytes); an empty rule field is `invalid_or_missing_json`; a rule with a nil failing value never matches (healthy); limit 1 works. The rest of the task file's list is covered by the tests above (nested 3 deep, number text, `true` against `true` and `"true"`, boundary 64/1,024, empty 200, 204, 500 HTML, redirect, `all` with a missing field, array top level, slow body, second rule matches). These were temporary and are not in the repo. Behavior against real services and real compressed responses cannot be proved here.

## Findings

### Blocking

None.

### Non-blocking

- **N1. The escape test did not contain an escape.** Category: test quality. The row "escape decoded" had the body `{"s":"down"}`. Fixed here: a row with `down` was added to `TestEvaluateJSONRules_StringMatching`. Matters when: a change to the parser (a hand-written scan) stops decoding escapes.
- **N2. No test of "read the whole body".** Category: test quality. Fixed here with the endless-body test (see mutation table). Matters when: someone replaces `LimitReader` and a slow endless body ties up a check until the timeout.
- **N3. A nil failing value makes a rule that never matches, and the field present means "healthy".** Category: report only. Allowed by the task file ("would never match"); the handler refuses such a value on save.

## Docs or specs that no longer match

- `STACK.md`: no new dependency or version (the task adds none); nothing to record.
- `docs/openapi.yaml`, `docs/requirements.md`: no difference found. `json_rule_matched`, `invalid_or_missing_json`, `json_rule_field` and FR-73 behave as written; the precedence (a matching rule beats a non-2xx status, a non-2xx status beats invalid JSON) is the user's decision recorded in the task file; `requirements.md` FR-61 states only the first half (a matching rule beats a non-2xx status); the user may want to add that a non-2xx status beats invalid or missing JSON.
- `docs/tasks/backlog.md`, rows for FR-44 to FR-48, FR-73 and FR-61: they say evaluation, any/all and the body limit are `http-json-rules`; this task delivers them, so those rows can be marked probe-side done. The form rows and the failure-reason wording stay open.
- `.env.example`: no change needed; its `RESPONSE_BODY_MAX_BYTES` comment (`FR-73, FR-104`) is still right.

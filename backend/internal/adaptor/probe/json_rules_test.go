package probe

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"monitory/internal/domain"
)

func rule(field string, v any) domain.JSONRule {
	return domain.JSONRule{Field: field, FailingValue: v}
}

// verdictKind is a compact way to write the three outcomes of a verdict.
type verdictKind int

const (
	judgedOK    verdictKind = iota // no match, nothing missing
	matched                        // the rules fail the check
	unjudgeable                    // invalid JSON or a missing field, no match
)

func kindOf(v jsonVerdict) verdictKind {
	switch {
	case v.Failed:
		return matched
	case v.Unjudgeable:
		return unjudgeable
	default:
		return judgedOK
	}
}

type evalCase struct {
	name  string
	body  string
	rules []domain.JSONRule
	mode  domain.JSONRuleMode
	want  verdictKind
	field string
}

func runEvalCases(t *testing.T, cases []evalCase) {
	t.Helper()
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := evaluateJSONRules([]byte(c.body), false, c.rules, c.mode)
			assert.Equal(t, c.want, kindOf(got))
			assert.Equal(t, c.field, got.Field)
		})
	}
}

func TestEvaluateJSONRules_StringMatching(t *testing.T) {
	runEvalCases(t, []evalCase{
		{name: "same string", body: `{"s":"down"}`, rules: []domain.JSONRule{rule("s", "down")}, want: matched, field: "s"},
		{name: "other case", body: `{"s":"Down"}`, rules: []domain.JSONRule{rule("s", "down")}, want: judgedOK},
		{name: "prefix", body: `{"s":"downtime"}`, rules: []domain.JSONRule{rule("s", "down")}, want: judgedOK},
		{name: "surrounding spaces", body: `{"s":" down "}`, rules: []domain.JSONRule{rule("s", "down")}, want: judgedOK},
		{name: "escape decoded", body: `{"s":"down"}`, rules: []domain.JSONRule{rule("s", "down")}, want: matched, field: "s"},
		{name: "unicode escape in the body is decoded before comparing", body: `{"s":"\u0064own"}`, rules: []domain.JSONRule{rule("s", "down")}, want: matched, field: "s"},
		{name: "invalid utf-8 does not invalidate", body: "{\"s\":\"a\xffb\",\"t\":\"x\"}", rules: []domain.JSONRule{rule("t", "x")}, want: matched, field: "t"},
	})
}

func TestEvaluateJSONRules_NumbersByText(t *testing.T) {
	runEvalCases(t, []evalCase{
		{name: "integer", body: `{"n":3}`, rules: []domain.JSONRule{rule("n", "3")}, want: matched, field: "n"},
		{name: "keeps trailing zero", body: `{"n":1.50}`, rules: []domain.JSONRule{rule("n", "1.50")}, want: matched, field: "n"},
		{name: "not by value 1.5", body: `{"n":1.50}`, rules: []domain.JSONRule{rule("n", "1.5")}, want: judgedOK},
		{name: "exponent as written", body: `{"n":1e3}`, rules: []domain.JSONRule{rule("n", "1e3")}, want: matched, field: "n"},
		{name: "not by value 1000", body: `{"n":1e3}`, rules: []domain.JSONRule{rule("n", "1000")}, want: judgedOK},
		{name: "never a bool rule", body: `{"n":1}`, rules: []domain.JSONRule{rule("n", true)}, want: judgedOK},
	})
}

func TestEvaluateJSONRules_Booleans(t *testing.T) {
	runEvalCases(t, []evalCase{
		{name: "true matches true", body: `{"b":true}`, rules: []domain.JSONRule{rule("b", true)}, want: matched, field: "b"},
		{name: "false matches false", body: `{"b":false}`, rules: []domain.JSONRule{rule("b", false)}, want: matched, field: "b"},
		{name: "true rule not false", body: `{"b":false}`, rules: []domain.JSONRule{rule("b", true)}, want: judgedOK},
		{name: "string true is not JSON true", body: `{"b":true}`, rules: []domain.JSONRule{rule("b", "true")}, want: judgedOK},
		{name: "bool rule not string true", body: `{"b":"true"}`, rules: []domain.JSONRule{rule("b", true)}, want: judgedOK},
	})
}

func TestEvaluateJSONRules_Null(t *testing.T) {
	runEvalCases(t, []evalCase{
		{name: "null matches the text null", body: `{"v":null}`, rules: []domain.JSONRule{rule("v", "null")}, want: matched, field: "v"},
		{name: "null matches nothing else", body: `{"v":null}`, rules: []domain.JSONRule{rule("v", "nil")}, want: judgedOK},
		{name: "null is not a bool", body: `{"v":null}`, rules: []domain.JSONRule{rule("v", false)}, want: judgedOK},
		{name: "null is present, not missing", body: `{"v":null}`, rules: []domain.JSONRule{rule("v", "x")}, want: judgedOK},
		{name: "text null does not match absent key", body: `{}`, rules: []domain.JSONRule{rule("v", "null")}, want: unjudgeable},
	})
}

func TestEvaluateJSONRules_Paths(t *testing.T) {
	r := func(f string) []domain.JSONRule { return []domain.JSONRule{rule(f, "x")} }
	runEvalCases(t, []evalCase{
		{name: "three deep", body: `{"a":{"b":{"c":"x"}}}`, rules: r("a.b.c"), want: matched, field: "a.b.c"},
		{name: "missing key", body: `{"a":{}}`, rules: r("a.b"), want: unjudgeable},
		{name: "keys are case-sensitive", body: `{"A":"x"}`, rules: r("a"), want: unjudgeable},
		{name: "empty middle segment", body: `{"a":{"":{"b":"x"}}}`, rules: r("a..b"), want: unjudgeable},
		{name: "leading dot", body: `{"":{"a":"x"}}`, rules: r(".a"), want: unjudgeable},
		{name: "trailing dot", body: `{"a":{"":"x"}}`, rules: r("a."), want: unjudgeable},
		{name: "step into array", body: `{"a":[{"b":"x"}]}`, rules: r("a.0"), want: unjudgeable},
		{name: "step into string", body: `{"a":"x"}`, rules: r("a.b"), want: unjudgeable},
		{name: "step into number", body: `{"a":1}`, rules: r("a.b"), want: unjudgeable},
		{name: "step into true", body: `{"a":true}`, rules: r("a.b"), want: unjudgeable},
		{name: "step into null", body: `{"a":null}`, rules: r("a.b"), want: unjudgeable},
		{name: "object value is present and never matches", body: `{"a":{"b":1}}`, rules: r("a"), want: judgedOK},
		{name: "array value is present and never matches", body: `{"a":["x"]}`, rules: r("a"), want: judgedOK},
		{name: "top-level array", body: `["x"]`, rules: r("a"), want: unjudgeable},
		{name: "top-level string", body: `"x"`, rules: r("a"), want: unjudgeable},
		{name: "top-level number", body: `1`, rules: r("a"), want: unjudgeable},
		{name: "duplicate key takes the last (match)", body: `{"a":"y","a":"x"}`, rules: r("a"), want: matched, field: "a"},
		{name: "duplicate key takes the last (no match)", body: `{"a":"x","a":"y"}`, rules: r("a"), want: judgedOK},
	})
}

func TestEvaluateJSONRules_Modes(t *testing.T) {
	three := []domain.JSONRule{rule("a", "1"), rule("b", "2"), rule("c", "3")}
	runEvalCases(t, []evalCase{
		{name: "any: one of three matches", body: `{"a":"0","b":"2","c":"0"}`, rules: three, mode: domain.JSONRuleModeAny, want: matched, field: "b"},
		{name: "any: none match", body: `{"a":"0","b":"0","c":"0"}`, rules: three, mode: domain.JSONRuleModeAny, want: judgedOK},
		{name: "any: first matching in saved order", body: `{"a":"1","b":"2","c":"3"}`, rules: three, mode: domain.JSONRuleModeAny, want: matched, field: "a"},
		{name: "any: one matches, another missing", body: `{"b":"2"}`, rules: three, mode: domain.JSONRuleModeAny, want: matched, field: "b"},
		{name: "any: nothing matches and one missing", body: `{"a":"0","b":"0"}`, rules: three, mode: domain.JSONRuleModeAny, want: unjudgeable},
		{name: "empty mode is any", body: `{"a":"0","b":"2","c":"0"}`, rules: three, mode: "", want: matched, field: "b"},
		{name: "all: every rule matches, first field reported", body: `{"a":"1","b":"2","c":"3"}`, rules: three, mode: domain.JSONRuleModeAll, want: matched, field: "a"},
		{name: "all: one differs, all present", body: `{"a":"1","b":"2","c":"0"}`, rules: three, mode: domain.JSONRuleModeAll, want: judgedOK},
		{name: "all: one matches, one missing", body: `{"a":"1","b":"2"}`, rules: three, mode: domain.JSONRuleModeAll, want: unjudgeable},
	})
}

func TestEvaluateJSONRules_ValidJSON(t *testing.T) {
	one := []domain.JSONRule{rule("a", "x")}
	for _, body := range []string{"", "  \n\t ", "{", "hello", "\xef\xbb\xbf{\"a\":\"x\"}", `{"a":"x"} x`, `{"a":"x"}{}`, `{"a":"x"} {}`} {
		t.Run("not valid: "+body, func(t *testing.T) {
			got := evaluateJSONRules([]byte(body), false, one, "")
			assert.Equal(t, jsonVerdict{Unjudgeable: true}, got)
		})
	}
	t.Run("white space around a value is fine", func(t *testing.T) {
		got := evaluateJSONRules([]byte(" \n{\"a\":\"x\"}\r\n "), false, one, "")
		assert.Equal(t, jsonVerdict{Failed: true, Field: "a"}, got)
	})
	t.Run("too large is not valid whatever its content", func(t *testing.T) {
		got := evaluateJSONRules([]byte(`{"a":"x"}`), true, one, "")
		assert.Equal(t, jsonVerdict{Unjudgeable: true}, got)
	})
	t.Run("deep nesting is an error", func(t *testing.T) {
		deep := strings.Repeat("[", 20000) + strings.Repeat("]", 20000)
		got := evaluateJSONRules([]byte(deep), false, one, "")
		assert.Equal(t, jsonVerdict{Unjudgeable: true}, got)
	})
}

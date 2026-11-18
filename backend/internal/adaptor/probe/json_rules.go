package probe

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"

	"monitory/internal/domain"
)

// jsonVerdict is what the JSON rules say about one response body (FR-42, FR-48).
type jsonVerdict struct {
	// Failed is true when the rules fail the check by the mode (a match under any,
	// every rule matching under all).
	Failed bool
	// Field is the field of the first matching rule in saved order; set with Failed.
	Field string
	// Unjudgeable is true when the body is not valid JSON (or too large) or at least
	// one rule's field is missing.
	Unjudgeable bool
}

// evaluateJSONRules judges a response body against rules by mode. tooLarge says the
// body went over the configured limit, which counts as not valid JSON (FR-73). It
// reads no network and no clock.
func evaluateJSONRules(body []byte, tooLarge bool, rules []domain.JSONRule, mode domain.JSONRuleMode) jsonVerdict {
	root, ok := parseJSONBody(body, tooLarge)
	if !ok {
		return jsonVerdict{Unjudgeable: true}
	}
	var verdict jsonVerdict
	matched, missing := 0, false
	for _, rule := range rules {
		value, found := lookupField(root, rule.Field)
		switch {
		case !found:
			missing = true
		case ruleMatches(value, rule.FailingValue):
			if matched == 0 {
				verdict.Field = rule.Field
			}
			matched++
		}
	}
	if mode == domain.JSONRuleModeAll {
		verdict.Failed = len(rules) > 0 && matched == len(rules)
	} else {
		verdict.Failed = matched > 0
	}
	if !verdict.Failed {
		verdict.Field = ""
	}
	verdict.Unjudgeable = missing
	return verdict
}

// parseJSONBody parses the whole body as one JSON value, keeping numbers as written.
func parseJSONBody(body []byte, tooLarge bool) (any, bool) {
	if tooLarge {
		return nil, false
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return nil, false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		return nil, false
	}
	return root, true
}

// lookupField follows a dotted path through nested objects. Anything that is not an
// object on the way, an empty segment or an absent key means the field is missing.
func lookupField(root any, path string) (any, bool) {
	current := root
	for _, key := range strings.Split(path, ".") {
		obj, ok := current.(map[string]any)
		if !ok || key == "" {
			return nil, false
		}
		current, ok = obj[key]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

// ruleMatches compares a present value with a failing value (FR-45): a string rule
// matches a string, a number's text or null's text; a bool rule only a JSON bool.
func ruleMatches(value, failing any) bool {
	switch want := failing.(type) {
	case string:
		switch got := value.(type) {
		case string:
			return got == want
		case json.Number:
			return string(got) == want
		case nil:
			return want == "null"
		}
	case bool:
		got, ok := value.(bool)
		return ok && got == want
	}
	return false
}

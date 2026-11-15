package domain

import "strings"

// ServiceNameKey returns what service names are compared and ordered by: the name in
// lower case by Unicode rules (FR-59).
func ServiceNameKey(name string) string {
	return strings.ToLower(name)
}

// TargetValueKey returns what a target's contact is compared by within one alert list
// (FR-88): an email address ignores case, a webhook URL is compared exactly.
func TargetValueKey(t TargetType, value string) string {
	if t == TargetTypeEmail {
		return strings.ToLower(value)
	}
	return value
}

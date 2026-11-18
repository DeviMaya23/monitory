package domain

import "time"

// HTTPCheck is one HTTP(S) check attempt to make (FR-33, FR-41).
type HTTPCheck struct {
	Method  string
	URL     string
	Timeout time.Duration
	// QueryParams, Headers, BodyType and BodyContent are the saved request (FR-35,
	// FR-37). Their zero values add nothing; an empty BodyType is BodyTypeNone.
	QueryParams []NameValue
	Headers     []NameValue
	BodyType    BodyType
	BodyContent string
}

// CheckFailure says why a check attempt failed (FR-61). HTTPStatus is set only for
// FailureNon2xxStatus; JSONRuleField only for FailureJSONRuleMatched.
type CheckFailure struct {
	Code          FailureCode
	HTTPStatus    *int
	JSONRuleField *string
}

// CheckResult is the outcome of one check attempt. Failure is nil exactly when Healthy
// is true.
type CheckResult struct {
	Healthy bool
	Failure *CheckFailure
}

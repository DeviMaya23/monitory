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

	// JSONRules and JSONRuleMode are judged against the response body (FR-42, FR-44,
	// FR-47). With no rules the body is not read. An empty mode means any.
	JSONRules    []JSONRule
	JSONRuleMode JSONRuleMode

	// CertificateCheck fails the check when fewer than CertMinDaysLeft whole days
	// remain on the certificate (FR-34, FR-50). IgnoreCertificateErrors accepts an
	// invalid certificate (FR-64).
	CertificateCheck        bool
	CertMinDaysLeft         int
	IgnoreCertificateErrors bool
}

// TCPCheck is one TCP check attempt to make: a connection to Host and Port that must be
// accepted within Timeout, the name lookup included (FR-49, FR-41).
type TCPCheck struct {
	Host    string
	Port    int
	Timeout time.Duration
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

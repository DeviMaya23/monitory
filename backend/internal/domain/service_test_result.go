package domain

// ServiceTestResult is the outcome of testing a check (FR-104). Failure is nil exactly
// when Healthy is true. HTTPStatus is set only for an HTTP(S) check that got a
// response, and then Body holds the start of the response body (at most the configured
// limit, valid UTF-8) and BodyTruncated says it was cut off. It is never saved.
type ServiceTestResult struct {
	Healthy       bool
	Failure       *CheckFailure
	DurationMs    int
	HTTPStatus    *int
	Body          string
	BodyTruncated bool
}

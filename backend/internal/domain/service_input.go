package domain

// ServiceInput is what the admin sent to add a service, in domain terms and still
// unvalidated. An optional value is a pointer, so that "absent" can be told from zero.
type ServiceInput struct {
	Name  string
	Check CheckInput

	CheckIntervalSeconds *int
	TimeoutSeconds       *int
	RetryCount           *int
	RetryIntervalSeconds *int

	AlertsEnabled     *bool
	ShownOnPublicView *bool

	// The messages are empty when absent.
	UnhealthyMessage string
	RecoveryMessage  string
}

// CheckInput is the check of a ServiceInput. Type is a plain string, so that
// validation rejects an unknown one. Only the part that matches Type is used.
type CheckInput struct {
	Type string
	HTTP HTTPCheckInput
	TCP  TCPCheckInput
}

// HTTPCheckInput is an HTTP check as sent. Empty means absent for the strings.
type HTTPCheckInput struct {
	Method      string
	URL         string
	QueryParams []NameValue
	Headers     []NameValue
	BodyType    string
	BodyContent string

	// A rule's FailingValue is nil when absent, otherwise a string or a bool.
	JSONRules    []JSONRule
	JSONRuleMode string

	CertificateCheckEnabled bool
	CertMinDaysLeft         *int
	IgnoreCertificateErrors bool
}

// TCPCheckInput is a TCP check as sent. A missing port reads as 0.
type TCPCheckInput struct {
	Host string
	Port int
}

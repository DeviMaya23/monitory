package domain

// TargetInput is what the admin sent to add or edit a notification target, in domain
// terms and still unvalidated. Type is a plain string, so that validation rejects an
// unknown one. Only the part that matches Type is used: Address for an email, URL and
// Headers for a webhook.
type TargetInput struct {
	Type    string
	Name    string
	Address string
	URL     string
	Headers []NameValue
}

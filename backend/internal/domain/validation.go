package domain

// FieldErrorCode is the code of one field error inside a validation failure.
type FieldErrorCode string

// The field error codes. Later tasks add the others in docs/openapi.yaml.
const (
	FieldErrorRequired FieldErrorCode = "required"
)

// FieldError is one rejected field. Field is its path in the contract's syntax and
// Message is shown to the admin as it is.
type FieldError struct {
	Field   string
	Code    FieldErrorCode
	Message string
}

// ValidationError is a rejected request with every field error found. Usecases return
// it as a value; handlers find it with errors.As and answer 422 validation_failed.
type ValidationError struct {
	Fields []FieldError
}

// Error implements error.
func (e ValidationError) Error() string { return "validation failed" }

var _ error = ValidationError{}

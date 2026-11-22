package domain

// TargetTestResult is the outcome of a completed test alert (FR-107): whether it was
// delivered and, when it was not, the reason. FailureReason is empty when delivered.
// FailureCause is a fixed word for the log only; it is never shown to the admin.
type TargetTestResult struct {
	Delivered     bool
	FailureReason string
	FailureCause  string
}

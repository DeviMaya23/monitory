package domain

import "time"

// The limits the requirements fix. Every other limit comes from platform/config and
// is passed in (CONVENTIONS.md, rule 6).
const (
	// MessageMaxLength is the longest unhealthy or recovery message (FR-65).
	MessageMaxLength = 500
	// TargetNameMaxLength is the longest notification target name (FR-87).
	TargetNameMaxLength = 50
	// SessionLifetime is how long a session lasts from sign-in (FR-5).
	SessionLifetime = 30 * 24 * time.Hour
	// MaxFailedSignIns is how many failed sign-ins in a row lock the account (FR-2).
	MaxFailedSignIns = 5
	// SignInLockout is how long the account stays locked (FR-2).
	SignInLockout = 15 * time.Minute
)

// Range is a per-service setting's default and the limits a value must stay within
// (FR-57). It is built from the configuration; domain does not import it.
type Range struct {
	Default int
	Min     int
	Max     int
}

// ServiceLimits are the configured limits that saving a service applies (FR-38, FR-57,
// FR-59, FR-60). main.go builds it from the configuration.
type ServiceLimits struct {
	CheckInterval Range // seconds
	Timeout       Range // seconds
	RetryCount    Range
	RetryInterval Range // seconds

	ServiceNameMaxLength  int
	MaxServices           int
	MaxJSONRules          int
	RequestURLMaxLength   int
	RequestMaxQueryParams int
	RequestMaxHeaders     int
	HeaderNameMaxLength   int
	HeaderValueMaxLength  int
	RequestBodyMaxBytes   int
}

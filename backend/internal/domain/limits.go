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

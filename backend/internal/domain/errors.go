package domain

import "errors"

// Sentinel errors. Usecases return them; handler/problem.go maps each to its code and
// status in docs/openapi.yaml.
var (
	// ErrUnauthenticated: the request has no valid session (FR-4).
	ErrUnauthenticated = errors.New("unauthenticated")
	// ErrCSRFFailed: a gated request that sends data did not carry the session's CSRF token (NFR-8).
	ErrCSRFFailed = errors.New("csrf check failed")
	// ErrNotFound: the service or target does not exist.
	ErrNotFound = errors.New("not found")
	// ErrServicePaused: the service is paused: a check result is not saved (FR-76). Only
	// the state repository returns it, and only the check result usecase handles it; it
	// never reaches the handler.
	ErrServicePaused = errors.New("service paused")

	// ErrInvalidCredentials: the username or the password is wrong (FR-1). It never says which.
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrHTTPSRequired: sign-in over plain HTTP while "require HTTPS" is on (FR-97).
	ErrHTTPSRequired = errors.New("https required")

	// ErrServiceNameTaken: another service has the same name, ignoring case (FR-59).
	ErrServiceNameTaken = errors.New("service name taken")
	// ErrServiceLimitReached: the service limit is reached (FR-60).
	ErrServiceLimitReached = errors.New("service limit reached")

	// ErrAlertListFull: the service's alert list holds the most targets allowed (FR-19).
	ErrAlertListFull = errors.New("alert list full")
	// ErrTargetDuplicate: the same contact is already in the alert list (FR-88).
	ErrTargetDuplicate = errors.New("target duplicate")
)

// ErrPublicViewUnavailable says the public view is off (FR-29).
var ErrPublicViewUnavailable = errors.New("the public view is off")

// RateLimitedError says the client address made more requests than the public view allows
// in the current window (FR-32). RetryAfterSeconds is what is left of the window, at
// least 1.
type RateLimitedError struct {
	RetryAfterSeconds int
}

func (RateLimitedError) Error() string { return "rate limited" }

// SignInLockedError says the account is locked after too many failed sign-ins in a row
// (FR-2). RetryAfterSeconds is what is left of the lock, at least 1.
type SignInLockedError struct {
	RetryAfterSeconds int
}

func (SignInLockedError) Error() string { return "sign-in locked" }

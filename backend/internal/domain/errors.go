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
)

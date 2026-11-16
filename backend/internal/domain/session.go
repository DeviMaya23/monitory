package domain

import "time"

// Session is the admin's signed-in session. Sessions live in memory only and end at a
// restart (FR-114).
type Session struct {
	Token     string    // the session cookie's value; set by the store, never logged or sent in a body
	CSRFToken string    // sent back by the pages in X-CSRF-Token (NFR-8)
	ExpiresAt time.Time // SessionLifetime after sign-in (FR-5)
}

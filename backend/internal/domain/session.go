package domain

import "time"

// Session is the admin's signed-in session. Sessions live in memory only and end at a
// restart (FR-114).
type Session struct {
	CSRFToken string    // sent back by the pages in X-CSRF-Token (NFR-8)
	ExpiresAt time.Time // SessionLifetime after sign-in (FR-5)
}

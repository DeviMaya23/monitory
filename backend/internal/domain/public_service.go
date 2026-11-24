package domain

import "time"

// PublicRateLimitWindow is the fixed window of the public view's rate limit (FR-32).
// The number of requests allowed in it is configured.
const PublicRateLimitWindow = time.Minute

// PublicService is what the public view shows of a service, and nothing else (FR-40,
// FR-63).
type PublicService struct {
	Name          string
	Status        Status
	LastCheckedAt time.Time
}

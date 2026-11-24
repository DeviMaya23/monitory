package memstore

import (
	"sync"
	"time"

	"monitory/pkg/clock"
)

// Lockout counts failed sign-ins in a row for the one account and locks it after too
// many (FR-2). It is empty at every start (FR-114) and safe for concurrent use.
type Lockout struct {
	clock       clock.Clock
	maxFailures int
	duration    time.Duration

	mu        sync.Mutex
	failures  int
	lockedEnd time.Time // zero while no lock has been set
}

// NewLockout returns a store that locks after maxFailures failed attempts in a row, for
// the given duration. Both values must be positive.
func NewLockout(clock clock.Clock, maxFailures int, duration time.Duration) *Lockout {
	return &Lockout{clock: clock, maxFailures: maxFailures, duration: duration}
}

// Attempt checks the lock and the credentials in one step, so two concurrent requests
// are never both let through past the limit.
//
// While a lock runs, it returns locked with wait the time left, does not call matches
// and changes nothing. Otherwise it calls matches: true resets the count; false adds one,
// and the failure that reaches the maximum starts the lock and resets the count (that
// attempt itself is not locked). The lock is over at exactly its end.
//
// matches runs while the store's lock is held: it must be quick and must not call the store.
func (l *Lockout) Attempt(matches func() bool) (matched, locked bool, wait time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.clock.Now()
	if now.Before(l.lockedEnd) {
		return false, true, l.lockedEnd.Sub(now)
	}

	if matches() {
		l.failures = 0
		return true, false, 0
	}
	l.failures++
	if l.failures == l.maxFailures {
		l.lockedEnd = now.Add(l.duration)
		l.failures = 0
	}
	return false, false, 0
}

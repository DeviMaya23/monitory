package memstore

import (
	"sync"
	"time"

	"monitory/pkg/clock"
)

// RateLimiter counts requests per key in fixed windows. It is empty at every start
// (FR-114) and safe for concurrent use.
type RateLimiter struct {
	clock  clock.Clock
	limit  int
	window time.Duration

	mu      sync.Mutex
	windows map[string]rateWindow
	// started lists the running windows in the order they began. Every window has the
	// same length, so they also end in that order: ended ones are taken from the
	// front (started[head:]), and the removal stops at the first running one.
	started []startedWindow
	head    int
}

type startedWindow struct {
	key string
	end time.Time
}

type rateWindow struct {
	end   time.Time
	count int
}

// NewRateLimiter returns a limiter that allows limit requests per key in each window
// of the given length.
func NewRateLimiter(clock clock.Clock, limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{clock: clock, limit: limit, window: window, windows: map[string]rateWindow{}}
}

// Allow counts a request of key. A window starts at the first request of a key that
// has no running window and ends one window length later. Inside it, requests up to
// the limit are allowed; the others are refused, are not counted and leave the window
// as it was, and wait is the time left until it ends. When allowed, wait is 0. Every
// call first removes the keys whose window has ended.
func (l *RateLimiter) Allow(key string) (allowed bool, wait time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.clock.Now()
	l.expire(now)

	w, ok := l.windows[key]
	if !ok {
		w = rateWindow{end: now.Add(l.window)}
		l.started = append(l.started, startedWindow{key: key, end: w.end})
	}
	if w.count >= l.limit {
		return false, w.end.Sub(now)
	}
	w.count++
	l.windows[key] = w
	return true, 0
}

// Len returns how many keys the limiter holds.
func (l *RateLimiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.windows)
}

// expire removes the windows that have ended, oldest first, and stops at the first
// running one. The caller holds the lock.
func (l *RateLimiter) expire(now time.Time) {
	for l.head < len(l.started) && !now.Before(l.started[l.head].end) {
		delete(l.windows, l.started[l.head].key)
		l.started[l.head] = startedWindow{} // let the key's string be collected
		l.head++
	}
	switch {
	case l.head == len(l.started):
		l.started, l.head = l.started[:0], 0
	case l.head >= 1024 && l.head*2 >= len(l.started):
		// Move the live tail down so the consumed front does not grow without bound.
		n := copy(l.started, l.started[l.head:])
		clear(l.started[n:])
		l.started, l.head = l.started[:n], 0
	}
}

package clock

import (
	"sync"
	"time"
)

// Fake is a Clock that moves only when a test calls Advance. It is safe for
// concurrent use.
type Fake struct {
	mu     sync.Mutex
	now    time.Time
	timers []*fakeTimer
}

// NewFake returns a Fake set to start, in UTC.
func NewFake(start time.Time) *Fake {
	return &Fake{now: start.UTC()}
}

// Now returns the fake's current time.
func (f *Fake) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

// NewTimer returns a timer that fires when Advance reaches d from now. A duration of
// zero or less fires at once.
func (f *Fake) NewTimer(d time.Duration) Timer {
	f.mu.Lock()
	defer f.mu.Unlock()
	t := &fakeTimer{clock: f, at: f.now.Add(d), ch: make(chan time.Time, 1)}
	if d <= 0 {
		t.fired = true
		t.ch <- f.now
		return t
	}
	f.timers = append(f.timers, t)
	return t
}

// Advance moves the clock forward by d and fires every timer that is due, in the
// order they come due.
func (f *Fake) Advance(d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	target := f.now.Add(d)
	for {
		next := f.nextDue(target)
		if next == nil {
			break
		}
		f.now = next.at
		next.fired = true
		next.ch <- f.now
		f.remove(next)
	}
	f.now = target
}

// Pending returns how many timers are waiting to fire. A test uses it to wait until
// the code under test has started its timer before advancing.
func (f *Fake) Pending() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.timers)
}

// nextDue returns the earliest waiting timer due at or before target, or nil.
func (f *Fake) nextDue(target time.Time) *fakeTimer {
	var next *fakeTimer
	for _, t := range f.timers {
		if t.at.After(target) {
			continue
		}
		if next == nil || t.at.Before(next.at) {
			next = t
		}
	}
	return next
}

func (f *Fake) remove(t *fakeTimer) {
	for i, other := range f.timers {
		if other == t {
			f.timers = append(f.timers[:i], f.timers[i+1:]...)
			return
		}
	}
}

type fakeTimer struct {
	clock *Fake
	at    time.Time
	ch    chan time.Time
	fired bool
}

func (t *fakeTimer) C() <-chan time.Time { return t.ch }

func (t *fakeTimer) Stop() bool {
	t.clock.mu.Lock()
	defer t.clock.mu.Unlock()
	if t.fired {
		return false
	}
	t.fired = true
	t.clock.remove(t)
	return true
}

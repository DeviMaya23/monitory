// Package clock is the only source of time for the app. Code takes a Clock and never
// calls time.Now, time.Sleep, time.After or time.NewTimer itself, so tests can drive
// time with Fake.
package clock

import "time"

// Clock tells the time and makes timers.
type Clock interface {
	// Now returns the current time in UTC.
	Now() time.Time
	// NewTimer returns a timer that fires once, d from now.
	NewTimer(d time.Duration) Timer
}

// Timer is a single-shot timer.
type Timer interface {
	// C receives the time once, when the timer fires.
	C() <-chan time.Time
	// Stop prevents the timer from firing. It reports whether it stopped the timer
	// before it fired.
	Stop() bool
}

// Real is the wall clock.
type Real struct{}

// Now returns the current time in UTC.
func (Real) Now() time.Time { return time.Now().UTC() }

// NewTimer returns a timer backed by the runtime.
func (Real) NewTimer(d time.Duration) Timer { return realTimer{time.NewTimer(d)} }

type realTimer struct{ t *time.Timer }

func (r realTimer) C() <-chan time.Time { return r.t.C }
func (r realTimer) Stop() bool          { return r.t.Stop() }

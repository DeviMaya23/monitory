package clock_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/pkg/clock"
)

var start = time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)

func fired(t clock.Timer) bool {
	select {
	case <-t.C():
		return true
	default:
		return false
	}
}

func TestFake_NowMovesOnlyOnAdvance(t *testing.T) {
	c := clock.NewFake(start)
	assert.Equal(t, start, c.Now())

	c.Advance(90 * time.Second)
	assert.Equal(t, start.Add(90*time.Second), c.Now())
}

func TestFake_TimerFiresAtItsDurationAndNotBefore(t *testing.T) {
	c := clock.NewFake(start)
	timer := c.NewTimer(10 * time.Second)

	c.Advance(10*time.Second - time.Nanosecond)
	require.False(t, fired(timer), "one step before the duration")
	assert.Equal(t, 1, c.Pending())

	c.Advance(time.Nanosecond)
	assert.True(t, fired(timer), "at the duration")
	assert.Equal(t, 0, c.Pending())
}

func TestFake_StoppedTimerNeverFires(t *testing.T) {
	c := clock.NewFake(start)
	timer := c.NewTimer(time.Second)

	assert.True(t, timer.Stop())
	c.Advance(time.Minute)

	assert.False(t, fired(timer))
	assert.False(t, timer.Stop(), "a second Stop reports that nothing was stopped")
}

func TestFake_TimersFireInTheOrderTheyComeDue(t *testing.T) {
	c := clock.NewFake(start)
	late := c.NewTimer(30 * time.Second)
	early := c.NewTimer(10 * time.Second)

	c.Advance(time.Minute)

	assert.Equal(t, start.Add(10*time.Second), <-early.C())
	assert.Equal(t, start.Add(30*time.Second), <-late.C())
}

func TestFake_ZeroDurationFiresAtOnce(t *testing.T) {
	c := clock.NewFake(start)
	assert.True(t, fired(c.NewTimer(0)))
}

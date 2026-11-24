package memstore_test

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/memstore"
	"monitory/pkg/clock"
)

// probe is a matches function that counts its calls.
type probe struct {
	result bool
	calls  int
}

func (p *probe) matches() bool {
	p.calls++
	return p.result
}

func newLockout() (*memstore.Lockout, *clock.Fake) {
	c := clock.NewFake(start)
	return memstore.NewLockout(c, domain.MaxFailedSignIns, domain.SignInLockout), c
}

// fail makes n failing attempts and requires each to be answered as a plain failure.
func fail(t *testing.T, l *memstore.Lockout, n int) {
	t.Helper()
	for i := 1; i <= n; i++ {
		p := &probe{}
		matched, locked, wait := l.Attempt(p.matches)
		require.Equal(t, 1, p.calls, "failure %d must call matches", i)
		require.False(t, matched, "failure %d", i)
		require.False(t, locked, "failure %d", i)
		require.Zero(t, wait, "failure %d", i)
	}
}

// lockedNow makes the five failures that lock, at the current time.
func lockedNow(t *testing.T, l *memstore.Lockout) {
	t.Helper()
	fail(t, l, domain.MaxFailedSignIns)
}

func TestLockout_NewStoreIsNotLocked(t *testing.T) {
	l, _ := newLockout()
	p := &probe{}

	_, locked, wait := l.Attempt(p.matches)

	assert.False(t, locked)
	assert.Zero(t, wait)
	assert.Equal(t, 1, p.calls)
}

func TestLockout_FourFailuresDoNotLock(t *testing.T) {
	l, _ := newLockout()
	fail(t, l, domain.MaxFailedSignIns-1)

	p := &probe{}
	_, locked, _ := l.Attempt(p.matches)

	assert.False(t, locked)
	assert.Equal(t, 1, p.calls, "the fifth attempt is still compared")
}

func TestLockout_FifthFailureLocksTheSixthAttempt(t *testing.T) {
	l, _ := newLockout()
	lockedNow(t, l)

	p := &probe{}
	matched, locked, wait := l.Attempt(p.matches)

	assert.False(t, matched)
	assert.True(t, locked)
	assert.Equal(t, domain.SignInLockout, wait)
	assert.Zero(t, p.calls)
}

func TestLockout_RefusesCorrectCredentialsWhileLocked(t *testing.T) {
	l, _ := newLockout()
	lockedNow(t, l)

	p := &probe{result: true}
	matched, locked, _ := l.Attempt(p.matches)

	assert.False(t, matched)
	assert.True(t, locked)
	assert.Zero(t, p.calls)
}

func TestLockout_WaitIsTheTimeLeft(t *testing.T) {
	l, c := newLockout()
	lockedNow(t, l)

	c.Advance(time.Second)
	_, locked, wait := l.Attempt((&probe{}).matches)

	assert.True(t, locked)
	assert.Equal(t, domain.SignInLockout-time.Second, wait)
}

func TestLockout_LockEndsExactlyAtTheDuration(t *testing.T) {
	l, c := newLockout()
	lockedNow(t, l)

	c.Advance(domain.SignInLockout - time.Nanosecond)
	p := &probe{}
	_, locked, wait := l.Attempt(p.matches)
	assert.True(t, locked, "one nanosecond before the end")
	assert.Equal(t, time.Nanosecond, wait)
	assert.Zero(t, p.calls)

	c.Advance(time.Nanosecond)
	_, locked, wait = l.Attempt(p.matches)
	assert.False(t, locked, "at the end")
	assert.Zero(t, wait)
	assert.Equal(t, 1, p.calls)
}

func TestLockout_RefusedAttemptDoesNotExtendTheLock(t *testing.T) {
	l, c := newLockout()
	lockedNow(t, l)

	c.Advance(domain.SignInLockout / 2)
	_, locked, _ := l.Attempt((&probe{}).matches)
	require.True(t, locked)

	c.Advance(domain.SignInLockout / 2)
	p := &probe{}
	_, locked, _ = l.Attempt(p.matches)
	assert.False(t, locked)
	assert.Equal(t, 1, p.calls)
}

func TestLockout_CountIsZeroAfterTheLockEnds(t *testing.T) {
	l, c := newLockout()
	lockedNow(t, l)
	c.Advance(domain.SignInLockout)

	fail(t, l, domain.MaxFailedSignIns)

	_, locked, _ := l.Attempt((&probe{}).matches)
	assert.True(t, locked, "five new failures lock again")
}

func TestLockout_MatchResetsTheCount(t *testing.T) {
	t.Run("with a match in between", func(t *testing.T) {
		l, _ := newLockout()
		fail(t, l, domain.MaxFailedSignIns-1)
		matched, locked, _ := l.Attempt((&probe{result: true}).matches)
		require.True(t, matched)
		require.False(t, locked)

		fail(t, l, domain.MaxFailedSignIns-1) // would be locked by now without the reset
		p := &probe{}
		_, locked, _ = l.Attempt(p.matches)
		assert.False(t, locked)
		assert.Equal(t, 1, p.calls, "the fifth failure after the match is still compared")
		_, locked, _ = l.Attempt((&probe{}).matches)
		assert.True(t, locked)
	})

	t.Run("without the match it locks one attempt earlier", func(t *testing.T) {
		l, _ := newLockout()
		fail(t, l, domain.MaxFailedSignIns-1)

		fail(t, l, 1) // the fifth failure
		_, locked, _ := l.Attempt((&probe{}).matches)
		assert.True(t, locked)
	})
}

func TestLockout_MatchOnFreshStore(t *testing.T) {
	l, _ := newLockout()
	p := &probe{result: true}

	matched, locked, wait := l.Attempt(p.matches)

	assert.True(t, matched)
	assert.False(t, locked)
	assert.Zero(t, wait)
	assert.Equal(t, 1, p.calls)
}

func TestLockout_OtherValues(t *testing.T) {
	c := clock.NewFake(start)
	l := memstore.NewLockout(c, 1, time.Minute)
	fail(t, l, 1)

	_, locked, wait := l.Attempt((&probe{}).matches)
	assert.True(t, locked)
	assert.Equal(t, time.Minute, wait)

	c.Advance(time.Minute - time.Nanosecond)
	_, locked, _ = l.Attempt((&probe{}).matches)
	assert.True(t, locked)

	c.Advance(time.Nanosecond)
	_, locked, _ = l.Attempt((&probe{}).matches)
	assert.False(t, locked)
}

func TestLockout_ConcurrentAttempts(t *testing.T) {
	l, _ := newLockout()
	const goroutines = 50
	var compared, refused atomic.Int32
	var wg sync.WaitGroup
	for range goroutines {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, locked, _ := l.Attempt(func() bool {
				compared.Add(1)
				return false
			})
			if locked {
				refused.Add(1)
			}
		}()
	}
	wg.Wait()

	assert.EqualValues(t, domain.MaxFailedSignIns, compared.Load())
	assert.EqualValues(t, goroutines-domain.MaxFailedSignIns, refused.Load())
}

package memstore_test

import (
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/memstore"
	"monitory/pkg/clock"
)

const (
	testLimit  = 3
	testWindow = time.Minute
)

func newLimiter() (*memstore.RateLimiter, *clock.Fake) {
	c := clock.NewFake(start)
	return memstore.NewRateLimiter(c, testLimit, testWindow), c
}

func TestRateLimiter_AllowsUpToTheLimitThenRefuses(t *testing.T) {
	l, _ := newLimiter()

	for i := 1; i <= testLimit; i++ {
		allowed, wait := l.Allow("a")
		assert.True(t, allowed, "request %d", i)
		assert.Zero(t, wait, "request %d", i)
	}
	allowed, wait := l.Allow("a")
	assert.False(t, allowed)
	assert.Equal(t, testWindow, wait)
}

func TestRateLimiter_WaitIsTheTimeLeftInTheWindow(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}

	_, wait := l.Allow("a")
	assert.Equal(t, 60*time.Second, wait)

	c.Advance(20 * time.Second)
	_, wait = l.Allow("a")
	assert.Equal(t, 40*time.Second, wait)
}

func TestRateLimiter_WindowEndsAtExactlyItsLength(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}

	c.Advance(testWindow - time.Nanosecond)
	allowed, wait := l.Allow("a")
	assert.False(t, allowed)
	assert.Equal(t, time.Nanosecond, wait)

	c.Advance(time.Nanosecond)
	for i := 1; i <= testLimit; i++ {
		allowed, wait = l.Allow("a")
		assert.True(t, allowed, "request %d of the new window", i)
		assert.Zero(t, wait)
	}
	c.Advance(15 * time.Second)
	allowed, wait = l.Allow("a")
	assert.False(t, allowed)
	assert.Equal(t, testWindow-15*time.Second, wait)
}

func TestRateLimiter_RefusedRequestDoesNotExtendTheWindow(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}
	c.Advance(30 * time.Second)
	allowed, _ := l.Allow("a")
	require.False(t, allowed)
	c.Advance(10 * time.Second)
	allowed, _ = l.Allow("a")
	require.False(t, allowed)

	c.Advance(20 * time.Second) // 60 s after the window began
	allowed, wait := l.Allow("a")

	assert.True(t, allowed)
	assert.Zero(t, wait)
}

func TestRateLimiter_WindowStartsAtTheFirstRequestNotAtConstruction(t *testing.T) {
	l, c := newLimiter()
	c.Advance(5 * time.Minute)
	for range testLimit {
		allowed, _ := l.Allow("a")
		require.True(t, allowed)
	}

	_, wait := l.Allow("a")
	assert.Equal(t, testWindow, wait)

	c.Advance(testWindow)
	allowed, _ := l.Allow("a")
	assert.True(t, allowed)
}

func TestRateLimiter_KeysAreIndependent(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}
	allowedA, _ := l.Allow("a")
	require.False(t, allowedA)

	c.Advance(25 * time.Second)
	for range testLimit {
		allowed, _ := l.Allow("b")
		require.True(t, allowed)
	}
	allowed, wait := l.Allow("b")

	assert.False(t, allowed)
	assert.Equal(t, testWindow, wait) // B's own start, not A's
	_, waitA := l.Allow("a")
	assert.Equal(t, 35*time.Second, waitA)
}

func TestRateLimiter_LimitOneRefusesTheSecondRequest(t *testing.T) {
	c := clock.NewFake(start)
	l := memstore.NewRateLimiter(c, 1, testWindow)

	first, _ := l.Allow("a")
	second, _ := l.Allow("a")

	assert.True(t, first)
	assert.False(t, second)
}

func TestRateLimiter_ExpiredKeysAreRemovedOnTheNextCall(t *testing.T) {
	l, c := newLimiter()
	for i := range 10 {
		l.Allow("key-" + strconv.Itoa(i))
	}
	require.Equal(t, 10, l.Len())

	c.Advance(testWindow)
	l.Allow("another")

	assert.Equal(t, 1, l.Len())
}

func TestRateLimiter_NewLimiterIsEmpty(t *testing.T) {
	l, _ := newLimiter()
	assert.Zero(t, l.Len())
}

func TestRateLimiter_ConcurrentRequestsOfOneKeyAreCountedExactly(t *testing.T) {
	c := clock.NewFake(start)
	l := memstore.NewRateLimiter(c, 50, testWindow)
	var allowed atomic.Int32
	var wg sync.WaitGroup

	for range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := l.Allow("a"); ok {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()

	assert.EqualValues(t, 50, allowed.Load())
}

// Keys are the exact strings given: forms of one IPv6 address are different clients
// (the task's "Known gaps"), and two addresses taking turns keep separate budgets.
func TestRateLimiter_KeysAreExactStringsAndTakeTurnsIndependently(t *testing.T) {
	c := clock.NewFake(start)
	l := memstore.NewRateLimiter(c, 1, testWindow)

	for _, key := range []string{"2001:db8::1", "2001:DB8::1", "2001:db8:0:0:0:0:0:1", "10.0.0.1"} {
		ok, _ := l.Allow(key)
		assert.True(t, ok, key)
	}
	for _, key := range []string{"2001:db8::1", "10.0.0.1"} {
		ok, wait := l.Allow(key)
		assert.False(t, ok, key)
		assert.Equal(t, testWindow, wait, key)
	}
	assert.Equal(t, 4, l.Len())
}

func TestRateLimiter_ConcurrentRequestsOfManyKeysAreCountedPerKey(t *testing.T) {
	c := clock.NewFake(start)
	l := memstore.NewRateLimiter(c, 5, testWindow)
	var allowed atomic.Int32
	var wg sync.WaitGroup

	for i := range 200 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := l.Allow("key-" + strconv.Itoa(i%20)); ok {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()

	assert.EqualValues(t, 20*5, allowed.Load())
	assert.Equal(t, 20, l.Len())
}

func TestRateLimiter_StaggeredWindowsLeaveInOrder(t *testing.T) {
	l, c := newLimiter()
	l.Allow("a")
	c.Advance(30 * time.Second)
	l.Allow("b")
	l.Allow("c")

	c.Advance(30 * time.Second) // T + 60 s: a's window has ended
	l.Allow("d")
	assert.Equal(t, 3, l.Len(), "b, c, d")

	c.Advance(30 * time.Second) // T + 90 s: b and c have ended
	l.Allow("e")
	assert.Equal(t, 2, l.Len(), "d, e")
}

func TestRateLimiter_ManyKeysStartedTogetherAllGoInOneCall(t *testing.T) {
	l, c := newLimiter()
	for i := range 1000 {
		l.Allow("key-" + strconv.Itoa(i))
	}
	require.Equal(t, 1000, l.Len())

	c.Advance(testWindow)
	l.Allow("another")

	assert.Equal(t, 1, l.Len())
}

func TestRateLimiter_ReturningKeyGetsAFreshWindowAndOneEntry(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}
	c.Advance(testWindow)

	allowed, _ := l.Allow("a")
	require.True(t, allowed)
	l.Allow("a")
	assert.Equal(t, 1, l.Len())

	// Counted from 1 again: the limit is reached after testLimit new requests, not fewer.
	allowed, _ = l.Allow("a")
	assert.True(t, allowed, "request %d of the new window", testLimit)
	allowed, wait := l.Allow("a")
	assert.False(t, allowed)
	assert.Equal(t, testWindow, wait)
	assert.Equal(t, 1, l.Len())
}

func TestRateLimiter_RefusedRequestAddsNoEntryAndKeepsTheWindowEnd(t *testing.T) {
	l, c := newLimiter()
	for range testLimit {
		l.Allow("a")
	}
	for i := 1; i <= 5; i++ {
		c.Advance(10 * time.Second)
		allowed, wait := l.Allow("a")
		require.False(t, allowed)
		require.Equal(t, testWindow-time.Duration(i)*10*time.Second, wait)
		require.Equal(t, 1, l.Len())
	}

	c.Advance(10 * time.Second) // 60 s after the window began
	l.Allow("b")

	assert.Equal(t, 1, l.Len(), "a's window ended at its original time")
}

// This test measures CPU work with the real clock, not waiting on a timer: a fake clock
// cannot show the cost of a call. The user's approval of the task is what allows it
// (TESTING.md says memstore tests use the fake clock). Both sizes run on the same
// machine, so a slow runner scales both sides.
func TestRateLimiter_CostDoesNotGrowWithLiveKeys(t *testing.T) {
	const calls = 2000
	filled := func(keys int) *memstore.RateLimiter {
		l := memstore.NewRateLimiter(clock.NewFake(start), 1_000_000, testWindow)
		for i := range keys {
			l.Allow("key-" + strconv.Itoa(i))
		}
		return l
	}
	mean := func(l *memstore.RateLimiter) time.Duration {
		best := time.Duration(1<<63 - 1)
		for range 5 {
			begin := time.Now()
			for range calls {
				l.Allow("key-0")
			}
			best = min(best, time.Since(begin)/calls)
		}
		return best
	}
	small, large := filled(50), filled(50_000)

	meanSmall := mean(small)
	meanLarge := mean(large)

	t.Logf("mean per call: 50 keys %v, 50,000 keys %v", meanSmall, meanLarge)
	assert.Less(t, meanLarge, 50*meanSmall+5*time.Microsecond)
}

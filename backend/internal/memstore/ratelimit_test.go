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

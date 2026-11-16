package memstore_test

import (
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/memstore"
	"monitory/pkg/clock"
)

var start = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

func newStore() (*memstore.Sessions, *clock.Fake) {
	c := clock.NewFake(start)
	return memstore.NewSessions(c), c
}

func session(token string, expiresAt time.Time) domain.Session {
	return domain.Session{Token: token, CSRFToken: "csrf-" + token, ExpiresAt: expiresAt}
}

func TestSessions_NewStoreIsEmpty(t *testing.T) {
	store, _ := newStore()

	_, ok := store.Session("anything")

	assert.False(t, ok)
	assert.Equal(t, 0, store.Len())
}

func TestSessions_FindByToken(t *testing.T) {
	store, _ := newStore()
	want := session("tok", start.Add(time.Hour))
	store.Put(want)

	got, ok := store.Session("tok")
	require.True(t, ok)
	assert.Equal(t, want, got)

	_, ok = store.Session("other")
	assert.False(t, ok, "unknown token")
	_, ok = store.Session("")
	assert.False(t, ok, "empty token")
}

func TestSessions_ExpiresAtBoundary(t *testing.T) {
	store, c := newStore()
	expires := start.Add(domain.SessionLifetime)
	store.Put(session("tok", expires))

	c.Advance(domain.SessionLifetime - time.Second)
	_, ok := store.Session("tok")
	assert.True(t, ok, "one second before ExpiresAt")

	c.Advance(time.Second)
	_, ok = store.Session("tok")
	assert.False(t, ok, "exactly at ExpiresAt")
}

func TestSessions_LookupDoesNotExtend(t *testing.T) {
	store, c := newStore()
	expires := start.Add(time.Hour)
	store.Put(session("tok", expires))

	for range 5 {
		c.Advance(time.Minute)
		got, ok := store.Session("tok")
		require.True(t, ok)
		assert.Equal(t, expires, got.ExpiresAt)
	}
}

func TestSessions_Delete(t *testing.T) {
	store, _ := newStore()
	store.Put(session("a", start.Add(time.Hour)))
	store.Put(session("b", start.Add(time.Hour)))

	store.Delete("a")

	_, ok := store.Session("a")
	assert.False(t, ok)
	_, ok = store.Session("b")
	assert.True(t, ok)
}

func TestSessions_PutPurgesExpired(t *testing.T) {
	store, c := newStore()
	store.Put(session("first", start.Add(time.Minute)))
	c.Advance(time.Minute)

	store.Put(session("second", start.Add(time.Hour)))

	assert.Equal(t, 1, store.Len())
}

func TestSessions_LookupRemovesExpired(t *testing.T) {
	store, c := newStore()
	store.Put(session("tok", start.Add(time.Minute)))
	c.Advance(time.Minute)
	require.Equal(t, 1, store.Len())

	_, ok := store.Session("tok")

	assert.False(t, ok)
	assert.Equal(t, 0, store.Len())
}

func TestSessions_Concurrent(t *testing.T) {
	store, _ := newStore()
	var wg sync.WaitGroup
	for i := range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			token := "tok" + strconv.Itoa(i)
			store.Put(session(token, start.Add(time.Hour)))
			store.Session(token)
			store.Len()
			store.Delete(token)
		}()
	}
	wg.Wait()

	assert.Equal(t, 0, store.Len())
}

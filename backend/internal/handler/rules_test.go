package handler

import (
	"reflect"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// operationRules reads the contract once per process: a second call returns the very
// same maps. Without the cache every router built in a test parses the contract again.
func TestOperationRules_AreReadOnceAndUnchanged(t *testing.T) {
	public1, body1, err := operationRules()
	require.NoError(t, err)
	public2, body2, err := operationRules()
	require.NoError(t, err)

	assert.Equal(t, reflect.ValueOf(public1).Pointer(), reflect.ValueOf(public2).Pointer(), "public is a fresh map")
	assert.Equal(t, reflect.ValueOf(body1).Pointer(), reflect.ValueOf(body2).Pointer(), "bodyRequired is a fresh map")

	// receiveAlert says `security: []` too, but lives under `webhooks:`, which the
	// contract's paths do not hold.
	assert.Equal(t, map[string]bool{
		"POST /api/session":         true,
		"GET /api/public/dashboard": true,
		"GET /health":               true,
	}, public1)
	assert.Equal(t, map[string]bool{
		"POST /api/session":                              true,
		"POST /api/services":                             true,
		"PUT /api/services/:serviceId":                   true,
		"POST /api/service-tests":                        true,
		"POST /api/services/:serviceId/targets":          true,
		"PUT /api/services/:serviceId/targets/:targetId": true,
		"POST /api/services/:serviceId/target-tests":     true,
		"PUT /api/settings/public-view":                  true,
	}, body1)
}

// Routers are built in parallel by a server's tests and by parallel callers: every
// concurrent first call gets the same maps and no error (run under -race).
func TestOperationRules_ConcurrentCallsShareOneResult(t *testing.T) {
	const callers = 32
	type result struct {
		public, body uintptr
		err          error
	}
	results := make([]result, callers)
	var wg sync.WaitGroup
	for i := range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			public, body, err := operationRules()
			results[i] = result{reflect.ValueOf(public).Pointer(), reflect.ValueOf(body).Pointer(), err}
		}()
	}
	wg.Wait()
	for _, r := range results {
		require.NoError(t, r.err)
		assert.Equal(t, results[0], r)
	}
}

package handler_test

import (
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/testutil"
)

// FR-96: reachable without sign-in, says only that the app is running.
func TestGetHealth(t *testing.T) {
	e := newRouter(t, routerOptions{})

	res := do(e, http.MethodGet, "/health", "")

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "getHealth", res)
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"status":"ok"}`, string(body))
}

package handler_test

import (
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/testutil"
)

func TestGetPublicViewSettings(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		e := newRouter(t, routerOptions{settings: &settingsSpy{enabled: enabled}})

		res := do(e, http.MethodGet, "/api/settings/public-view", "", withSession)

		require.Equal(t, http.StatusOK, res.StatusCode)
		testutil.AssertConforms(t, "getPublicViewSettings", res)
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		if enabled {
			assert.JSONEq(t, `{"enabled":true}`, string(body))
		} else {
			assert.JSONEq(t, `{"enabled":false}`, string(body))
		}
	}
}

func TestUpdatePublicViewSettings(t *testing.T) {
	spy := &settingsSpy{}
	e := newRouter(t, routerOptions{settings: spy})

	res := do(e, http.MethodPut, "/api/settings/public-view", `{"enabled":true}`, withSession, withCSRF, withJSON)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "updatePublicViewSettings", res)
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"enabled":true}`, string(body))
	assert.Equal(t, []bool{true}, spy.set)
}

func TestUpdatePublicViewSettings_EmptyBodyIsMalformed(t *testing.T) {
	spy := &settingsSpy{}
	e := newRouter(t, routerOptions{settings: spy})

	res := do(e, http.MethodPut, "/api/settings/public-view", "", withSession, withCSRF)

	require.Equal(t, http.StatusBadRequest, res.StatusCode)
	testutil.AssertConforms(t, "updatePublicViewSettings", res)
	assert.Empty(t, spy.set, "nothing is saved")
}

// An unexpected error becomes the contract's 500 internal_error with no internal detail.
func TestSettings_UnexpectedErrorHidesItsText(t *testing.T) {
	e := newRouter(t, routerOptions{settings: &settingsSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

	res := do(e, http.MethodGet, "/api/settings/public-view", "", withSession)

	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "getPublicViewSettings", res)
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), `"code":"internal_error"`)
	assert.NotContains(t, string(body), "disk")
	assert.NotContains(t, string(body), "/data")
}

package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/api"
	"monitory/internal/handler/middleware"
	"monitory/internal/testutil"
)

func problemCode(t *testing.T, res *http.Response) string {
	t.Helper()
	assert.Equal(t, "application/problem+json", res.Header.Get(echo.HeaderContentType))
	var problem api.Problem
	require.NoError(t, json.NewDecoder(res.Body).Decode(&problem))
	assert.Equal(t, res.StatusCode, problem.Status)
	return string(problem.Code)
}

// The contract decides which operations are public. If this list changes, the
// contract changed: check that it was meant.
func TestRouter_PublicOperationsAreExactlyTheContracts(t *testing.T) {
	var public []string
	for _, op := range operations(t) {
		if op.public {
			public = append(public, op.id)
		}
	}
	assert.ElementsMatch(t, []string{"signIn", "getPublicDashboard", "getHealth"}, public)
}

// FR-4: every gated operation is refused without a session, and every public one is
// not. A new operation is covered without touching this test.
func TestRouter_Gate(t *testing.T) {
	e := newRouter(t, routerOptions{})
	for _, op := range operations(t) {
		t.Run(op.id+" without a session", func(t *testing.T) {
			res := do(e, op.method, op.path, "")
			if op.public {
				assert.NotEqual(t, http.StatusUnauthorized, res.StatusCode)
				return
			}
			require.Equal(t, http.StatusUnauthorized, res.StatusCode)
			testutil.AssertConforms(t, op.id, res)
			assert.Equal(t, "unauthenticated", problemCode(t, res))
		})
		if op.public {
			continue
		}
		t.Run(op.id+" with an unknown session", func(t *testing.T) {
			res := do(e, op.method, op.path, "", func(r *http.Request) {
				r.AddCookie(&http.Cookie{Name: middleware.SessionCookie, Value: "not-a-session"})
			})
			assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
		})
	}
}

// NFR-8: a gated operation that sends data is refused without the session's CSRF
// token, and passes the check with it.
func TestRouter_CSRF(t *testing.T) {
	e := newRouter(t, routerOptions{})
	for _, op := range operations(t) {
		if op.public {
			continue
		}
		if !sendsData(op.method) {
			t.Run(op.id+" reads and needs no token", func(t *testing.T) {
				res := do(e, op.method, op.path, "", withSession)
				assert.NotEqual(t, http.StatusForbidden, res.StatusCode)
				assert.NotEqual(t, http.StatusUnauthorized, res.StatusCode)
			})
			continue
		}
		t.Run(op.id+" without the token", func(t *testing.T) {
			res := do(e, op.method, op.path, "", withSession)
			require.Equal(t, http.StatusForbidden, res.StatusCode)
			testutil.AssertConforms(t, op.id, res)
			assert.Equal(t, "csrf_failed", problemCode(t, res))
		})
		t.Run(op.id+" with a wrong token", func(t *testing.T) {
			res := do(e, op.method, op.path, "", withSession, func(r *http.Request) {
				r.Header.Set(middleware.CSRFHeader, "another-token")
			})
			assert.Equal(t, http.StatusForbidden, res.StatusCode)
		})
		t.Run(op.id+" with the token", func(t *testing.T) {
			res := do(e, op.method, op.path, "", withSession, withCSRF)
			assert.NotEqual(t, http.StatusForbidden, res.StatusCode)
			assert.NotEqual(t, http.StatusUnauthorized, res.StatusCode)
		})
	}
}

// The gate comes before the CSRF check: without a session the answer is 401 even when
// a token is sent.
func TestRouter_GateComesBeforeCSRF(t *testing.T) {
	e := newRouter(t, routerOptions{})

	res := do(e, http.MethodPut, "/api/settings/public-view", `{"enabled":true}`, withCSRF, withJSON)

	assert.Equal(t, http.StatusUnauthorized, res.StatusCode)
}

// FR-38: a request over the limit is refused before anything else is checked, so the
// answer is 413 even without a session.
func TestRouter_RequestSizeLimit(t *testing.T) {
	e := newRouter(t, routerOptions{maxRequestBytes: 64})
	atLimit := `{"enabled":true,"pad":"` + strings.Repeat("x", 64-len(`{"enabled":true,"pad":""}`)) + `"}`
	require.Len(t, atLimit, 64)

	t.Run("at the limit passes", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", atLimit, withSession, withCSRF, withJSON)
		assert.Equal(t, http.StatusOK, res.StatusCode)
	})
	t.Run("one byte over is refused", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", atLimit+" ", withSession, withCSRF, withJSON)
		require.Equal(t, http.StatusRequestEntityTooLarge, res.StatusCode)
		testutil.AssertConforms(t, "updatePublicViewSettings", res)
		assert.Equal(t, "payload_too_large", problemCode(t, res))
	})
	t.Run("the limit comes before the gate", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", atLimit+" ", withJSON)
		assert.Equal(t, http.StatusRequestEntityTooLarge, res.StatusCode)
	})
}

func TestRouter_BodyMustBeJSON(t *testing.T) {
	spy := &settingsSpy{}
	e := newRouter(t, routerOptions{settings: spy})

	t.Run("another content type is refused", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", `{"enabled":true}`, withSession, withCSRF,
			func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "text/plain") })
		require.Equal(t, http.StatusUnsupportedMediaType, res.StatusCode)
		testutil.AssertConforms(t, "updatePublicViewSettings", res)
		assert.Equal(t, "unsupported_media_type", problemCode(t, res))
		assert.Empty(t, spy.set, "nothing is saved")
	})
	t.Run("a malformed body is refused", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", `{"enabled":`, withSession, withCSRF, withJSON)
		require.Equal(t, http.StatusBadRequest, res.StatusCode)
		testutil.AssertConforms(t, "updatePublicViewSettings", res)
		assert.Equal(t, "malformed_request", problemCode(t, res))
		assert.Empty(t, spy.set, "nothing is saved")
	})
	t.Run("a charset parameter and another case are accepted", func(t *testing.T) {
		res := do(e, http.MethodPut, "/api/settings/public-view", `{"enabled":true}`, withSession, withCSRF,
			func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "Application/JSON; charset=utf-8") })
		assert.Equal(t, http.StatusOK, res.StatusCode)
	})
}

func TestRouter_UnimplementedOperationAnswers501(t *testing.T) {
	e := newRouter(t, routerOptions{})

	res := do(e, http.MethodGet, "/api/services/a-service", "", withSession)

	require.Equal(t, http.StatusNotImplemented, res.StatusCode)
	assert.Equal(t, "not_implemented", problemCode(t, res))
}

func TestRouter_UnknownPaths(t *testing.T) {
	appPage := func(c echo.Context) error { return c.String(http.StatusOK, "app page") }
	e := newRouter(t, routerOptions{web: appPage})

	t.Run("an unknown API path is a 404 problem, not the app page", func(t *testing.T) {
		res := do(e, http.MethodGet, "/api/nothing-here", "")
		require.Equal(t, http.StatusNotFound, res.StatusCode)
		assert.Equal(t, "not_found", problemCode(t, res))
	})
	t.Run("any other path is the frontend", func(t *testing.T) {
		res := do(e, http.MethodGet, "/services/new", "")
		assert.Equal(t, http.StatusOK, res.StatusCode)
	})
	t.Run("the health endpoint is not the frontend", func(t *testing.T) {
		res := do(e, http.MethodGet, "/health", "")
		assert.Contains(t, res.Header.Get(echo.HeaderContentType), "application/json")
	})
}

// FR-99: forwarding headers count only when the installer said to trust the proxy.
func TestRouter_SchemeAndClientAddress(t *testing.T) {
	forwarded := func(r *http.Request) {
		r.RemoteAddr = "10.0.0.9:4000"
		r.Header.Set("X-Forwarded-Proto", "https")
		r.Header.Add("X-Forwarded-For", "203.0.113.7, 198.51.100.4")
		r.Header.Set("Fly-Client-IP", "192.0.2.55")
	}
	tests := []struct {
		name string
		opts routerOptions
		want middleware.RequestInfo
	}{
		{
			name: "trust off: plain HTTP and the connecting address, whatever the headers say",
			opts: routerOptions{trustProxy: false},
			want: middleware.RequestInfo{HTTPS: false, ClientAddr: "10.0.0.9"},
		},
		{
			name: "trust on: the forwarded scheme and the last X-Forwarded-For entry",
			opts: routerOptions{trustProxy: true},
			want: middleware.RequestInfo{HTTPS: true, ClientAddr: "198.51.100.4"},
		},
		{
			name: "trust on with another header: that header's value",
			opts: routerOptions{trustProxy: true, clientIPHeader: "Fly-Client-IP"},
			want: middleware.RequestInfo{HTTPS: true, ClientAddr: "192.0.2.55"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got middleware.RequestInfo
			spy := &contextSpy{seen: func(ctx context.Context) { got = middleware.RequestInfoFrom(ctx) }}
			tt.opts.settings = spy
			e := newRouter(t, tt.opts)

			res := do(e, http.MethodGet, "/api/settings/public-view", "", withSession, forwarded)

			require.Equal(t, http.StatusOK, res.StatusCode)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestRouter_TrustOnWithoutTheHeaderFallsBackToTheConnectingAddress(t *testing.T) {
	var got middleware.RequestInfo
	spy := &contextSpy{seen: func(ctx context.Context) { got = middleware.RequestInfoFrom(ctx) }}
	e := newRouter(t, routerOptions{settings: spy, trustProxy: true})

	res := do(e, http.MethodGet, "/api/settings/public-view", "", withSession,
		func(r *http.Request) { r.RemoteAddr = "10.0.0.9:4000" })

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, middleware.RequestInfo{HTTPS: false, ClientAddr: "10.0.0.9"}, got)
}

// contextSpy is a handler.SettingsService that hands the request context to the test.
type contextSpy struct {
	seen func(context.Context)
}

func (s *contextSpy) PublicViewEnabled(ctx context.Context) (bool, error) {
	s.seen(ctx)
	return false, nil
}

func (s *contextSpy) SetPublicViewEnabled(context.Context, bool) error { return nil }

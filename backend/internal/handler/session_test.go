package handler_test

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
)

const signInBody = `{"username":"admin","password":"s3cret-pass"}`

var spySession = domain.Session{
	Token:     "spy-session-token",
	CSRFToken: "spy-csrf-token",
	ExpiresAt: time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC),
}

func readBody(t *testing.T, res *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return string(body)
}

func TestSignIn_Success(t *testing.T) {
	spy := &authSpy{session: spySession}
	e := newRouter(t, routerOptions{auth: spy})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	assert.JSONEq(t, `{"csrf_token":"spy-csrf-token","expires_at":"2026-05-06T07:08:09Z"}`, readBody(t, res))
	cookies := res.Cookies()
	require.Len(t, cookies, 1)
	c := cookies[0]
	assert.Equal(t, "session", c.Name)
	assert.Equal(t, "spy-session-token", c.Value)
	assert.Equal(t, "/", c.Path)
	assert.True(t, c.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, c.SameSite)
	assert.Equal(t, 2592000, c.MaxAge)
	assert.Empty(t, c.Domain)
	assert.True(t, c.Expires.IsZero(), "no Expires attribute")
	assert.Equal(t, []signInCall{{"admin", "s3cret-pass", false}}, spy.signIns)
}

func TestSignIn_CookieSecureFollowsSetting(t *testing.T) {
	for _, requireHTTPS := range []bool{true, false} {
		e := newRouter(t, routerOptions{auth: &authSpy{session: spySession}, requireHTTPS: requireHTTPS})

		res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

		require.Equal(t, http.StatusOK, res.StatusCode)
		require.Len(t, res.Cookies(), 1)
		assert.Equal(t, requireHTTPS, res.Cookies()[0].Secure, "require HTTPS %v", requireHTTPS)
	}
}

func TestSignIn_SchemePassedToUsecase(t *testing.T) {
	forwarded := func(r *http.Request) { r.Header.Set("X-Forwarded-Proto", "https") }
	tests := []struct {
		name       string
		trustProxy bool
		opts       []requestOption
		want       bool
	}{
		{"trusted proxy says https", true, []requestOption{forwarded}, true},
		{"trusted proxy says nothing", true, nil, false},
		{"header ignored when trust is off", false, []requestOption{forwarded}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &authSpy{session: spySession}
			e := newRouter(t, routerOptions{auth: spy, trustProxy: tt.trustProxy})

			do(e, http.MethodPost, "/api/session", signInBody, append([]requestOption{withJSON}, tt.opts...)...)

			require.Len(t, spy.signIns, 1)
			assert.Equal(t, tt.want, spy.signIns[0].https)
		})
	}
}

func TestSignIn_InvalidCredentials(t *testing.T) {
	var logs bytes.Buffer
	e := newRouter(t, routerOptions{auth: &authSpy{err: domain.ErrInvalidCredentials}, logOutput: &logs})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusUnauthorized, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	body := readBody(t, res)
	assert.Contains(t, body, `"code":"invalid_credentials"`)
	assert.Contains(t, body, `"title":"Invalid credentials"`)
	assert.NotContains(t, body, "detail")
	assert.NotContains(t, body, "errors")
	assert.NotContains(t, body, "admin")
	assert.NotContains(t, body, "s3cret-pass")
	assert.Contains(t, logs.String(), "sign-in failed")
	assert.Contains(t, logs.String(), "level=WARN")
	assert.NotContains(t, logs.String(), "admin")
	assert.NotContains(t, logs.String(), "s3cret-pass")
}

func TestSignIn_Locked(t *testing.T) {
	var logs bytes.Buffer
	spy := &authSpy{err: domain.SignInLockedError{RetryAfterSeconds: 292}}
	e := newRouter(t, routerOptions{auth: spy, logOutput: &logs})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusTooManyRequests, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	assert.Equal(t, "application/problem+json", res.Header.Get("Content-Type"))
	assert.Equal(t, "292", res.Header.Get("Retry-After"))
	assert.Empty(t, res.Header.Values("Set-Cookie"))
	body := readBody(t, res)
	assert.JSONEq(t, `{"title":"Sign-in locked","status":429,"code":"sign_in_locked"}`, body)
	assert.NotContains(t, body, "detail")
	assert.NotContains(t, body, "errors")
	assert.NotContains(t, body, "admin")
	assert.NotContains(t, body, "s3cret-pass")
	for name, values := range res.Header {
		for _, v := range values {
			assert.NotContains(t, v, "admin", name)
			assert.NotContains(t, v, "s3cret-pass", name)
		}
	}
}

func TestSignIn_LockedWrapped(t *testing.T) {
	err := fmt.Errorf("x: %w", domain.SignInLockedError{RetryAfterSeconds: 292})
	e := newRouter(t, routerOptions{auth: &authSpy{err: err}})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusTooManyRequests, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	assert.Equal(t, "292", res.Header.Get("Retry-After"))
	assert.JSONEq(t, `{"title":"Sign-in locked","status":429,"code":"sign_in_locked"}`, readBody(t, res))
}

func TestSignIn_LockedRetryAfterPassesThrough(t *testing.T) {
	for _, seconds := range []int{1, 900} {
		t.Run(strconv.Itoa(seconds), func(t *testing.T) {
			e := newRouter(t, routerOptions{auth: &authSpy{err: domain.SignInLockedError{RetryAfterSeconds: seconds}}})

			res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

			require.Equal(t, http.StatusTooManyRequests, res.StatusCode)
			testutil.AssertConforms(t, "signIn", res)
			assert.Equal(t, strconv.Itoa(seconds), res.Header.Get("Retry-After"))
		})
	}
}

func TestSignIn_LockedLog(t *testing.T) {
	line := regexp.MustCompile(`^time=\S+ level=WARN msg="sign-in locked"$`)

	var locked bytes.Buffer
	e := newRouter(t, routerOptions{auth: &authSpy{err: domain.SignInLockedError{RetryAfterSeconds: 5}}, logOutput: &locked})
	do(e, http.MethodPost, "/api/session", signInBody, withJSON)
	assert.Regexp(t, line, strings.TrimSpace(locked.String()))

	var failed bytes.Buffer
	e = newRouter(t, routerOptions{auth: &authSpy{err: domain.ErrInvalidCredentials}, logOutput: &failed})
	do(e, http.MethodPost, "/api/session", signInBody, withJSON)
	assert.Contains(t, failed.String(), `msg="sign-in failed"`)
	assert.NotContains(t, failed.String(), "sign-in locked")
}

func TestSignIn_ExpiresAtIsUTC(t *testing.T) {
	zone := time.FixedZone("UTC+5", 5*3600)
	session := spySession
	session.ExpiresAt = time.Date(2026, 5, 6, 12, 8, 9, 0, zone)
	e := newRouter(t, routerOptions{auth: &authSpy{session: session}})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Contains(t, readBody(t, res), `"expires_at":"2026-05-06T07:08:09Z"`)
}

func TestSignIn_NullsReachUsecaseAsEmpty(t *testing.T) {
	tests := []struct {
		body string
		want signInCall
	}{
		{`null`, signInCall{"", "", false}},
		{`{"username":null,"password":"x"}`, signInCall{"", "x", false}},
	}
	for _, tt := range tests {
		t.Run(tt.body, func(t *testing.T) {
			spy := &authSpy{err: domain.ValidationError{}}
			e := newRouter(t, routerOptions{auth: spy})

			res := do(e, http.MethodPost, "/api/session", tt.body, withJSON)

			assert.Equal(t, http.StatusUnprocessableEntity, res.StatusCode, "not a 400")
			assert.Equal(t, []signInCall{tt.want}, spy.signIns)
		})
	}
}

func TestSignIn_HTTPSRequired(t *testing.T) {
	e := newRouter(t, routerOptions{auth: &authSpy{err: domain.ErrHTTPSRequired}})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	require.Equal(t, http.StatusForbidden, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	assert.JSONEq(t, `{
		"status": 403,
		"code": "https_required",
		"title": "HTTPS required",
		"detail": "Sign-in is only allowed over HTTPS. If the app is behind an HTTPS proxy, set TRUST_PROXY=true. To allow sign-in over plain HTTP, set REQUIRE_HTTPS=false. Restart the app after changing either setting."
	}`, readBody(t, res))
}

func TestSignIn_ValidationFailed(t *testing.T) {
	err := domain.ValidationError{Fields: []domain.FieldError{
		{Field: "username", Code: domain.FieldErrorRequired, Message: "Enter the username."},
		{Field: "password", Code: domain.FieldErrorRequired, Message: "Enter the password."},
	}}
	e := newRouter(t, routerOptions{auth: &authSpy{err: err}})

	res := do(e, http.MethodPost, "/api/session", `{}`, withJSON)

	require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode)
	testutil.AssertConforms(t, "signIn", res)
	assert.JSONEq(t, `{
		"status": 422,
		"code": "validation_failed",
		"title": "Validation failed",
		"errors": [
			{"field": "username", "code": "required", "message": "Enter the username."},
			{"field": "password", "code": "required", "message": "Enter the password."}
		]
	}`, readBody(t, res))
}

func TestSignIn_BindingFailures(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		opts   []requestOption
		limit  int
		status int
	}{
		{"no body", "", []requestOption{withJSON}, 0, http.StatusBadRequest},
		{"truncated json", `{"username":`, []requestOption{withJSON}, 0, http.StatusBadRequest},
		{"username is a number", `{"username":5,"password":"x"}`, []requestOption{withJSON}, 0, http.StatusBadRequest},
		{"body is a list", `[]`, []requestOption{withJSON}, 0, http.StatusBadRequest},
		{"text/plain", signInBody, []requestOption{func(r *http.Request) { r.Header.Set("Content-Type", "text/plain") }}, 0, http.StatusUnsupportedMediaType},
		{"one byte over the limit", signInBody + " ", []requestOption{withJSON}, len(signInBody), http.StatusRequestEntityTooLarge},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &authSpy{session: spySession}
			e := newRouter(t, routerOptions{auth: spy, maxRequestBytes: tt.limit})

			res := do(e, http.MethodPost, "/api/session", tt.body, tt.opts...)

			assert.Equal(t, tt.status, res.StatusCode)
			testutil.AssertConforms(t, "signIn", res)
			assert.Empty(t, spy.signIns)
		})
	}

	t.Run("a body at the limit is accepted", func(t *testing.T) {
		spy := &authSpy{session: spySession}
		e := newRouter(t, routerOptions{auth: spy, maxRequestBytes: len(signInBody)})

		res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

		assert.Equal(t, http.StatusOK, res.StatusCode)
	})
}

func TestSignIn_NeedsNoSessionOrCSRF(t *testing.T) {
	e := newRouter(t, routerOptions{auth: &authSpy{session: spySession}})

	res := do(e, http.MethodPost, "/api/session", signInBody, withJSON)

	assert.Equal(t, http.StatusOK, res.StatusCode)
}

func TestGetSession(t *testing.T) {
	e := newRouter(t, routerOptions{})

	t.Run("returns the session the gate found", func(t *testing.T) {
		for range 2 {
			res := do(e, http.MethodGet, "/api/session", "", withSession)

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "getSession", res)
			assert.JSONEq(t, `{"csrf_token":"the-csrf-token","expires_at":"2026-04-01T12:00:00Z"}`, readBody(t, res))
		}
	})
	t.Run("without a cookie is 401", func(t *testing.T) {
		res := do(e, http.MethodGet, "/api/session", "")

		require.Equal(t, http.StatusUnauthorized, res.StatusCode)
		testutil.AssertConforms(t, "getSession", res)
		assert.Contains(t, readBody(t, res), `"code":"unauthenticated"`)
	})
}

func TestSignOut(t *testing.T) {
	t.Run("ends the request's session", func(t *testing.T) {
		spy := &authSpy{}
		e := newRouter(t, routerOptions{auth: spy})

		res := do(e, http.MethodDelete, "/api/session", "", withSession, withCSRF)

		require.Equal(t, http.StatusNoContent, res.StatusCode)
		testutil.AssertConforms(t, "signOut", res)
		assert.Empty(t, readBody(t, res))
		assert.Empty(t, res.Header.Values("Set-Cookie"))
		assert.Equal(t, []string{validToken}, spy.signOuts)
	})
	t.Run("without the CSRF token is 403", func(t *testing.T) {
		spy := &authSpy{}
		e := newRouter(t, routerOptions{auth: spy})

		res := do(e, http.MethodDelete, "/api/session", "", withSession)

		require.Equal(t, http.StatusForbidden, res.StatusCode)
		testutil.AssertConforms(t, "signOut", res)
		assert.Contains(t, readBody(t, res), `"code":"csrf_failed"`)
		assert.Empty(t, spy.signOuts)
	})
	t.Run("without a session is 401", func(t *testing.T) {
		spy := &authSpy{}
		e := newRouter(t, routerOptions{auth: spy})

		res := do(e, http.MethodDelete, "/api/session", "", withCSRF)

		require.Equal(t, http.StatusUnauthorized, res.StatusCode)
		testutil.AssertConforms(t, "signOut", res)
		assert.Empty(t, spy.signOuts)
	})
}

func TestSession_UnexpectedErrorHidesItsText(t *testing.T) {
	for _, tt := range []struct {
		name, operation, method, body string
		opts                          []requestOption
	}{
		{"signIn", "signIn", http.MethodPost, signInBody, []requestOption{withJSON}},
		{"signOut", "signOut", http.MethodDelete, "", []requestOption{withSession, withCSRF}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{auth: &authSpy{err: errors.New("random source /dev/urandom failed")}})

			res := do(e, tt.method, "/api/session", tt.body, tt.opts...)

			require.Equal(t, http.StatusInternalServerError, res.StatusCode)
			testutil.AssertConforms(t, tt.operation, res)
			body := readBody(t, res)
			assert.Contains(t, body, `"code":"internal_error"`)
			assert.False(t, strings.Contains(body, "urandom"), body)
		})
	}
}

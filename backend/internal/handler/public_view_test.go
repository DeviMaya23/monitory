package handler_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/api"
	"monitory/internal/domain"
	"monitory/internal/testutil"
)

const publicPath = "/api/public/dashboard"

var publicChecked = time.Date(2026, 6, 7, 8, 9, 10, 0, time.UTC)

func TestGetPublicDashboard_ReturnsOnlyNameStatusAndLastCheckedAt(t *testing.T) {
	spy := &publicViewSpy{services: []domain.PublicService{
		{Name: "Web", Status: domain.StatusHealthy, LastCheckedAt: publicChecked},
		{Name: "Db", Status: domain.StatusUnhealthy, LastCheckedAt: publicChecked.Add(time.Minute)},
	}}
	e := newRouter(t, routerOptions{public: spy})

	res := do(e, http.MethodGet, publicPath, "")

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "getPublicDashboard", res)
	var body struct {
		Services []map[string]any `json:"services"`
	}
	require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &body))
	require.Len(t, body.Services, 2)
	for _, s := range body.Services {
		keys := make([]string, 0, len(s))
		for k := range s {
			keys = append(keys, k)
		}
		assert.ElementsMatch(t, []string{"name", "status", "last_checked_at"}, keys)
	}
	assert.Equal(t, "Web", body.Services[0]["name"])
	assert.Equal(t, "healthy", body.Services[0]["status"])
	assert.Equal(t, "2026-06-07T08:09:10Z", body.Services[0]["last_checked_at"])
	assert.Equal(t, "Db", body.Services[1]["name"])
	assert.Equal(t, "unhealthy", body.Services[1]["status"])
	assert.Equal(t, "2026-06-07T08:10:10Z", body.Services[1]["last_checked_at"])
}

func TestGetPublicDashboard_TimeIsInUTC(t *testing.T) {
	local := time.FixedZone("UTC+3", 3*3600)
	spy := &publicViewSpy{services: []domain.PublicService{
		{Name: "Web", Status: domain.StatusHealthy, LastCheckedAt: time.Date(2026, 6, 7, 11, 9, 10, 0, local)},
	}}
	e := newRouter(t, routerOptions{public: spy})

	res := do(e, http.MethodGet, publicPath, "")

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Contains(t, readBody(t, res), `"last_checked_at":"2026-06-07T08:09:10Z"`)
}

func TestGetPublicDashboard_NoServicesIsAnEmptyList(t *testing.T) {
	for name, services := range map[string][]domain.PublicService{"nil": nil, "empty": {}} {
		t.Run(name, func(t *testing.T) {
			e := newRouter(t, routerOptions{public: &publicViewSpy{services: services}})

			res := do(e, http.MethodGet, publicPath, "")

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "getPublicDashboard", res)
			assert.JSONEq(t, `{"services":[]}`, readBody(t, res))
		})
	}
}

func TestGetPublicDashboard_ViewOffIs404(t *testing.T) {
	e := newRouter(t, routerOptions{public: &publicViewSpy{err: domain.ErrPublicViewUnavailable}})

	res := do(e, http.MethodGet, publicPath, "")

	require.Equal(t, http.StatusNotFound, res.StatusCode)
	testutil.AssertConforms(t, "getPublicDashboard", res)
	var problem api.Problem
	require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &problem))
	assert.Equal(t, api.ProblemCodePublicViewUnavailable, problem.Code)
	assert.Equal(t, "Public view unavailable", problem.Title)
	assert.Equal(t, "application/problem+json", res.Header.Get("Content-Type"))
}

func TestGetPublicDashboard_RateLimitedIs429WithRetryAfter(t *testing.T) {
	for _, seconds := range []int{37, 1} {
		t.Run(strconv.Itoa(seconds), func(t *testing.T) {
			e := newRouter(t, routerOptions{public: &publicViewSpy{err: domain.RateLimitedError{RetryAfterSeconds: seconds}}})

			res := do(e, http.MethodGet, publicPath, "")

			require.Equal(t, http.StatusTooManyRequests, res.StatusCode)
			assert.Equal(t, map[int]string{37: "37", 1: "1"}[seconds], res.Header.Get("Retry-After"))
			testutil.AssertConforms(t, "getPublicDashboard", res)
			var problem api.Problem
			require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &problem))
			assert.Equal(t, api.ProblemCodeRateLimited, problem.Code)
			assert.Equal(t, "Too many requests", problem.Title)
			assert.Nil(t, problem.Detail)
			assert.Equal(t, "application/problem+json", res.Header.Get("Content-Type"))
		})
	}
}

func TestGetPublicDashboard_OtherErrorIs500WithoutItsText(t *testing.T) {
	e := newRouter(t, routerOptions{public: &publicViewSpy{err: errors.New("secret database detail")}})

	res := do(e, http.MethodGet, publicPath, "")

	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "getPublicDashboard", res)
	body := readBody(t, res)
	assert.NotContains(t, body, "secret database detail")
	var problem api.Problem
	require.NoError(t, json.Unmarshal([]byte(body), &problem))
	assert.Equal(t, api.ProblemCodeInternalError, problem.Code)
}

func TestGetPublicDashboard_NeedsNoSessionAndASessionDoesNoHarm(t *testing.T) {
	services := []domain.PublicService{{Name: "Web", Status: domain.StatusHealthy, LastCheckedAt: publicChecked}}
	e := newRouter(t, routerOptions{public: &publicViewSpy{services: services}})

	anonymous := do(e, http.MethodGet, publicPath, "")
	signedIn := do(e, http.MethodGet, publicPath, "", withSession)

	for name, res := range map[string]*http.Response{"anonymous": anonymous, "signed in": signedIn} {
		require.Equal(t, http.StatusOK, res.StatusCode, name)
		assert.Empty(t, res.Header.Values("Set-Cookie"), name)
		testutil.AssertConforms(t, "getPublicDashboard", res)
	}
	assert.Equal(t, readBody(t, anonymous), readBody(t, signedIn))
}

// FR-99: the address is the router's, not a header the handler read.
func TestGetPublicDashboard_PassesTheRoutersClientAddress(t *testing.T) {
	forwarded := func(r *http.Request) {
		r.RemoteAddr = "10.0.0.9:4000"
		r.Header.Set("X-Forwarded-For", "203.0.113.7, 198.51.100.4")
	}
	for name, tt := range map[string]struct {
		trust bool
		want  string
	}{
		"trust off: the connecting address": {false, "10.0.0.9"},
		"trust on: the proxy's header":      {true, "198.51.100.4"},
	} {
		t.Run(name, func(t *testing.T) {
			spy := &publicViewSpy{}
			e := newRouter(t, routerOptions{public: spy, trustProxy: tt.trust})

			res := do(e, http.MethodGet, publicPath, "", forwarded)

			require.Equal(t, http.StatusOK, res.StatusCode)
			assert.Equal(t, []string{tt.want}, spy.addrs)
		})
	}
}

func TestGetPublicDashboard_LogsNothingOfItsOwn(t *testing.T) {
	forwarded := func(r *http.Request) { r.RemoteAddr = "10.0.0.9:4000" }

	t.Run("a served request and a refused one", func(t *testing.T) {
		var logs bytes.Buffer
		spy := &publicViewSpy{}
		e := newRouter(t, routerOptions{public: spy, logOutput: &logs})
		do(e, http.MethodGet, publicPath, "", forwarded)
		spy.err = domain.RateLimitedError{RetryAfterSeconds: 5}
		do(e, http.MethodGet, publicPath, "", forwarded)

		assert.Empty(t, logs.String())
	})
	t.Run("a 500 leaves only the shared line, without the address", func(t *testing.T) {
		var logs bytes.Buffer
		e := newRouter(t, routerOptions{public: &publicViewSpy{err: errors.New("boom")}, logOutput: &logs})

		res := do(e, http.MethodGet, publicPath, "", forwarded)

		require.Equal(t, http.StatusInternalServerError, res.StatusCode)
		lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
		require.Len(t, lines, 1)
		assert.Contains(t, lines[0], "unexpected error")
		assert.NotContains(t, lines[0], "10.0.0.9")
	})
}

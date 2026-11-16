package probe

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
)

const longTimeout = 2 * time.Second

func run(t *testing.T, maxRedirects int, check domain.HTTPCheck) domain.CheckResult {
	t.Helper()
	res, err := NewHTTPProber(maxRedirects).CheckHTTP(context.Background(), check)
	require.NoError(t, err)
	return res
}

func get(url string, timeout time.Duration) domain.HTTPCheck {
	return domain.HTTPCheck{Method: http.MethodGet, URL: url, Timeout: timeout}
}

func requireHealthy(t *testing.T, res domain.CheckResult) {
	t.Helper()
	assert.True(t, res.Healthy)
	assert.Nil(t, res.Failure)
}

func requireFailed(t *testing.T, res domain.CheckResult, code domain.FailureCode) {
	t.Helper()
	assert.False(t, res.Healthy)
	require.NotNil(t, res.Failure)
	assert.Equal(t, code, res.Failure.Code)
	assert.Nil(t, res.Failure.JSONRuleField)
	if code != domain.FailureNon2xxStatus {
		assert.Nil(t, res.Failure.HTTPStatus)
	}
}

func requireStatus(t *testing.T, res domain.CheckResult, status int) {
	t.Helper()
	requireFailed(t, res, domain.FailureNon2xxStatus)
	require.NotNil(t, res.Failure.HTTPStatus)
	assert.Equal(t, status, *res.Failure.HTTPStatus)
}

// chain scripts /r0 -> /r1 -> ... -> /r(n-1) -> /end (200) and returns the first URL.
// With n = 0 it is /end itself.
func chain(ts *testutil.TargetServer, n int) string {
	ts.Script("/end", testutil.Route{})
	if n == 0 {
		return ts.URL() + "/end"
	}
	for i := range n {
		next := "/end"
		if i < n-1 {
			next = fmt.Sprintf("/r%d", i+1)
		}
		ts.Script(fmt.Sprintf("/r%d", i), testutil.Route{RedirectTo: next})
	}
	return ts.URL() + "/r0"
}

func TestCheckHTTP_Status(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/200", testutil.Route{Status: 200})
	requireHealthy(t, run(t, 3, get(ts.URL()+"/200", longTimeout)))

	for _, code := range []int{204, 299} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			ts.Script("/s", testutil.Route{Status: code})
			requireHealthy(t, run(t, 3, get(ts.URL()+"/s", longTimeout)))
		})
	}
	for _, code := range []int{300, 304, 404, 500} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			ts.Script("/s", testutil.Route{Status: code})
			requireStatus(t, run(t, 3, get(ts.URL()+"/s", longTimeout)), code)
		})
	}
}

func TestCheckHTTP_RequestShape(t *testing.T) {
	for _, method := range []string{"GET", "HEAD", "POST", "DELETE"} {
		t.Run(method, func(t *testing.T) {
			ts := testutil.NewTargetServer(t)
			ts.Script("/path", testutil.Route{})
			res := run(t, 3, domain.HTTPCheck{Method: method, URL: ts.URL() + "/path?a=1&b=two", Timeout: longTimeout})
			requireHealthy(t, res)

			reqs := ts.Requests()
			require.Len(t, reqs, 1)
			assert.Equal(t, method, reqs[0].Method)
			assert.Equal(t, "/path", reqs[0].Path)
			assert.Equal(t, "a=1&b=two", reqs[0].RawQuery)
			assert.Equal(t, "Monitory", reqs[0].Header.Get("User-Agent"))
			assert.Empty(t, reqs[0].Body)
		})
	}
	t.Run("User-Agent on every hop of a redirect chain", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		requireHealthy(t, run(t, 3, get(chain(ts, 2), longTimeout)))
		reqs := ts.Requests()
		require.Len(t, reqs, 3)
		for _, r := range reqs {
			assert.Equal(t, "Monitory", r.Header.Get("User-Agent"), r.Path)
		}
	})
	t.Run("fragment is not sent", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/f", testutil.Route{})
		requireHealthy(t, run(t, 3, get(ts.URL()+"/f?q=1#frag", longTimeout)))
		require.Len(t, ts.Requests(), 1)
		assert.Equal(t, "/f", ts.Requests()[0].Path)
		assert.Equal(t, "q=1", ts.Requests()[0].RawQuery)
	})
	t.Run("user and password in the URL become Authorization", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/a", testutil.Route{})
		u := strings.Replace(ts.URL(), "http://", "http://user:pw@", 1)
		requireHealthy(t, run(t, 3, get(u+"/a", longTimeout)))
		require.Len(t, ts.Requests(), 1)
		assert.Equal(t, "Basic dXNlcjpwdw==", ts.Requests()[0].Header.Get("Authorization"))
	})
	t.Run("empty method is GET", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/", testutil.Route{})
		requireHealthy(t, run(t, 3, domain.HTTPCheck{URL: ts.URL() + "/", Timeout: longTimeout}))
		assert.Equal(t, http.MethodGet, ts.Requests()[0].Method)
	})
}

func TestCheckHTTP_RedirectLimit(t *testing.T) {
	tests := []struct {
		name         string
		limit, hops  int
		healthy      bool
		wantRequests int
	}{
		{"limit 2, 2 hops", 2, 2, true, 3},
		{"limit 2, 3 hops", 2, 3, false, 3},
		{"limit 0, 1 hop", 0, 1, false, 1},
		{"limit 0, no hop", 0, 0, true, 1},
		{"limit 5, 3 hops", 5, 3, true, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := testutil.NewTargetServer(t)
			res := run(t, tt.limit, get(chain(ts, tt.hops), longTimeout))
			if tt.healthy {
				requireHealthy(t, res)
			} else {
				requireFailed(t, res, domain.FailureTooManyRedirects)
				assert.Empty(t, ts.RequestsTo("/end"), "the final response must never be requested")
			}
			assert.Len(t, ts.Requests(), tt.wantRequests)
		})
	}

	t.Run("redirect loop", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/loop", testutil.Route{RedirectTo: "/loop"})
		requireFailed(t, run(t, 3, get(ts.URL()+"/loop", longTimeout)), domain.FailureTooManyRedirects)
	})
}

func TestCheckHTTP_RedirectToNotFound(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/r", testutil.Route{Status: 301, RedirectTo: "/missing"})
	requireStatus(t, run(t, 3, get(ts.URL()+"/r", longTimeout)), 404)
}

func TestCheckHTTP_Timeout(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/slow", testutil.Route{Delay: 150 * time.Millisecond})
	ts.Script("/quick", testutil.Route{Delay: 20 * time.Millisecond})

	requireFailed(t, run(t, 3, get(ts.URL()+"/slow", 50*time.Millisecond)), domain.FailureTimedOut)
	requireHealthy(t, run(t, 3, get(ts.URL()+"/quick", 200*time.Millisecond)))

	// A listener that accepts and never answers: the deadline must stop the wait at the
	// request headers (http) and at the TLS handshake (https).
	for _, scheme := range []string{"http", "https"} {
		t.Run("silent server, "+scheme, func(t *testing.T) {
			l, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", "127.0.0.1:0")
			require.NoError(t, err)
			t.Cleanup(func() { _ = l.Close() })
			conns := make(chan net.Conn, 1)
			go func() {
				c, err := l.Accept()
				if err == nil {
					conns <- c
				}
			}()
			requireFailed(t, run(t, 3, get(scheme+"://"+l.Addr().String()+"/", 100*time.Millisecond)), domain.FailureTimedOut)
			select {
			case c := <-conns:
				_ = c.Close()
			default:
			}
		})
	}

	t.Run("late response is timed out whatever its status", func(t *testing.T) {
		ts.Script("/late500", testutil.Route{Status: 500, Delay: 150 * time.Millisecond})
		requireFailed(t, run(t, 3, get(ts.URL()+"/late500", 50*time.Millisecond)), domain.FailureTimedOut)
	})
}

func TestCheckHTTP_TimeoutCoversRedirects(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/a", testutil.Route{RedirectTo: "/b", Delay: 40 * time.Millisecond})
	ts.Script("/b", testutil.Route{RedirectTo: "/c", Delay: 40 * time.Millisecond})
	ts.Script("/c", testutil.Route{})

	requireFailed(t, run(t, 3, get(ts.URL()+"/a", 60*time.Millisecond)), domain.FailureTimedOut)
	// Baseline: the same chain within a longer timeout is healthy.
	requireHealthy(t, run(t, 3, get(ts.URL()+"/a", longTimeout)))
}

func TestCheckHTTP_ZeroTimeout(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/", testutil.Route{})

	for _, timeout := range []time.Duration{0, -time.Second} {
		requireFailed(t, run(t, 3, get(ts.URL()+"/", timeout)), domain.FailureTimedOut)
	}
	assert.Empty(t, ts.Requests())

	// Baseline: a positive timeout does reach the server.
	requireHealthy(t, run(t, 3, get(ts.URL()+"/", longTimeout)))
	assert.Len(t, ts.Requests(), 1)
}

func TestCheckHTTP_UnfollowedRedirectStatus(t *testing.T) {
	for _, code := range []int{300, 305} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			ts := testutil.NewTargetServer(t)
			ts.Script("/r", testutil.Route{Status: code, RedirectTo: "/target"})
			ts.Script("/target", testutil.Route{})
			requireStatus(t, run(t, 3, get(ts.URL()+"/r", longTimeout)), code)
			assert.Empty(t, ts.RequestsTo("/target"))
		})
	}
}

func TestCheckHTTP_CouldNotConnect(t *testing.T) {
	t.Run("closed port", func(t *testing.T) {
		l, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", "127.0.0.1:0")
		require.NoError(t, err)
		addr := l.Addr().String()
		require.NoError(t, l.Close())
		requireFailed(t, run(t, 3, get("http://"+addr+"/", longTimeout)), domain.FailureCouldNotConnect)
	})

	ts := testutil.NewTargetServer(t)
	ts.Script("/ftp", testutil.Route{RedirectTo: "ftp://example.com/file"})
	ts.Script("/hangup", testutil.Route{CloseWithoutAnswer: true})
	tests := []struct {
		name  string
		check domain.HTTPCheck
	}{
		{"unparsable URL", get("http://exa mple.com/%zz", longTimeout)},
		{"empty URL", get("", longTimeout)},
		{"no host", get("http://", longTimeout)},
		{"ftp scheme", get("ftp://example.com/", longTimeout)},
		{"bad method", domain.HTTPCheck{Method: "BAD METHOD", URL: ts.URL() + "/", Timeout: longTimeout}},
		{"redirect to ftp", get(ts.URL()+"/ftp", longTimeout)},
		{"connection closed without an answer", get(ts.URL()+"/hangup", longTimeout)},
		{"https to a plain-HTTP server", get(strings.Replace(ts.URL(), "http://", "https://", 1)+"/", longTimeout)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requireFailed(t, run(t, 3, tt.check), domain.FailureCouldNotConnect)
		})
	}
}

func TestCheckHTTP_CertificateProblem(t *testing.T) {
	secure := testutil.NewTargetServer(t, testutil.TargetTLS())
	secure.Script("/", testutil.Route{})
	requireFailed(t, run(t, 3, get(secure.URL()+"/", longTimeout)), domain.FailureCertificateProblem)

	plain := testutil.NewTargetServer(t)
	plain.Script("/go", testutil.Route{RedirectTo: secure.URL() + "/"})
	requireFailed(t, run(t, 3, get(plain.URL()+"/go", longTimeout)), domain.FailureCertificateProblem)
}

func TestCheckHTTP_TrustedRoots(t *testing.T) {
	secure := testutil.NewTargetServer(t, testutil.TargetTLS())
	secure.Script("/", testutil.Route{})
	p := NewHTTPProber(3)
	p.roots = secure.Pool()

	// The certificate names 127.0.0.1, so the address it is reached by is accepted.
	res, err := p.CheckHTTP(context.Background(), get(secure.URL()+"/", longTimeout))
	require.NoError(t, err)
	requireHealthy(t, res)

	// It does not name localhost.
	other := strings.Replace(secure.URL(), "127.0.0.1", "localhost", 1)
	res, err = p.CheckHTTP(context.Background(), get(other+"/", longTimeout))
	require.NoError(t, err)
	requireFailed(t, res, domain.FailureCertificateProblem)
}

func TestCheckHTTP_CallerContext(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/slow", testutil.Route{Delay: 100 * time.Millisecond})
	// A path of its own: Arrived is closed for good by the first request to a path, so
	// sharing /slow with the baseline would make the cancel subtest cancel before the
	// request is sent.
	ts.Script("/slow-cancel", testutil.Route{Delay: 100 * time.Millisecond})
	check := get(ts.URL()+"/slow", 500*time.Millisecond)

	t.Run("baseline returns a result", func(t *testing.T) {
		res, err := NewHTTPProber(3).CheckHTTP(context.Background(), check)
		require.NoError(t, err)
		requireHealthy(t, res)
	})

	t.Run("cancel while the server delays", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		type outcome struct {
			res domain.CheckResult
			err error
		}
		done := make(chan outcome, 1)
		go func() {
			res, err := NewHTTPProber(3).CheckHTTP(ctx, get(ts.URL()+"/slow-cancel", 500*time.Millisecond))
			done <- outcome{res, err}
		}()
		<-ts.Arrived("/slow-cancel")
		cancel()
		got := <-done
		assert.Len(t, ts.RequestsTo("/slow-cancel"), 1, "the request must have reached the server before the cancel")
		require.ErrorIs(t, got.err, context.Canceled)
		assert.Equal(t, domain.CheckResult{}, got.res)
	})

	t.Run("caller deadline shorter than the timeout", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		defer cancel()
		res, err := NewHTTPProber(3).CheckHTTP(ctx, check)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.Equal(t, domain.CheckResult{}, res)
	})

	t.Run("already cancelled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := NewHTTPProber(3).CheckHTTP(ctx, check)
		require.ErrorIs(t, err, context.Canceled)
	})
}

func TestCheckHTTP_Concurrent(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/slow", testutil.Route{Delay: 100 * time.Millisecond})
	ts.Script("/fast500", testutil.Route{Status: 500})
	p := NewHTTPProber(3)

	var wg sync.WaitGroup
	results := make([]domain.CheckResult, 20)
	errs := make([]error, 20)
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			path := "/slow"
			if i%2 == 1 {
				path = "/fast500"
			}
			results[i], errs[i] = p.CheckHTTP(context.Background(), get(ts.URL()+path, longTimeout))
		}()
	}
	wg.Wait()

	for i, res := range results {
		require.NoError(t, errs[i])
		if i%2 == 0 {
			requireHealthy(t, res)
		} else {
			requireStatus(t, res, 500)
		}
	}
}

func TestCheckHTTP_NewConnectionPerAttempt(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/", testutil.Route{})
	p := NewHTTPProber(3)
	for range 2 {
		res, err := p.CheckHTTP(context.Background(), get(ts.URL()+"/", longTimeout))
		require.NoError(t, err)
		requireHealthy(t, res)
	}
	reqs := ts.Requests()
	require.Len(t, reqs, 2)
	assert.NotEqual(t, reqs[0].RemoteAddr, reqs[1].RemoteAddr)
}

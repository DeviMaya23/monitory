package probe

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
	"monitory/pkg/clock"
)

const longTimeout = 2 * time.Second

func run(t *testing.T, maxRedirects int, check domain.HTTPCheck) domain.CheckResult {
	t.Helper()
	res, err := NewHTTPProber(maxRedirects, 65536, clock.Real{}).CheckHTTP(context.Background(), check)
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
	p := NewHTTPProber(3, 65536, clock.Real{})
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
		res, err := NewHTTPProber(3, 65536, clock.Real{}).CheckHTTP(context.Background(), check)
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
			res, err := NewHTTPProber(3, 65536, clock.Real{}).CheckHTTP(ctx, get(ts.URL()+"/slow-cancel", 500*time.Millisecond))
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
		res, err := NewHTTPProber(3, 65536, clock.Real{}).CheckHTTP(ctx, check)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.Equal(t, domain.CheckResult{}, res)
	})

	t.Run("already cancelled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := NewHTTPProber(3, 65536, clock.Real{}).CheckHTTP(ctx, check)
		require.ErrorIs(t, err, context.Canceled)
	})
}

func TestCheckHTTP_Concurrent(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/slow", testutil.Route{Delay: 100 * time.Millisecond})
	ts.Script("/fast500", testutil.Route{Status: 500})
	p := NewHTTPProber(3, 65536, clock.Real{})

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
	p := NewHTTPProber(3, 65536, clock.Real{})
	for range 2 {
		res, err := p.CheckHTTP(context.Background(), get(ts.URL()+"/", longTimeout))
		require.NoError(t, err)
		requireHealthy(t, res)
	}
	reqs := ts.Requests()
	require.Len(t, reqs, 2)
	assert.NotEqual(t, reqs[0].RemoteAddr, reqs[1].RemoteAddr)
}

// send runs a check against a fresh receiver that answers 200 at /p and returns the
// only request it saw.
func send(t *testing.T, check domain.HTTPCheck) testutil.RecordedRequest {
	t.Helper()
	ts := testutil.NewTargetServer(t)
	ts.Script("/p", testutil.Route{})
	if check.URL == "" {
		check.URL = ts.URL() + "/p"
	} else {
		check.URL = ts.URL() + check.URL
	}
	if check.Method == "" {
		check.Method = http.MethodGet
	}
	check.Timeout = longTimeout
	requireHealthy(t, run(t, 3, check))
	reqs := ts.Requests()
	require.Len(t, reqs, 1)
	return reqs[0]
}

func nv(pairs ...string) []domain.NameValue {
	var out []domain.NameValue
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, domain.NameValue{Name: pairs[i], Value: pairs[i+1]})
	}
	return out
}

func TestCheckHTTP_QueryParams(t *testing.T) {
	twenty := make([]domain.NameValue, 20)
	var want []string
	for i := range twenty {
		twenty[i] = domain.NameValue{Name: fmt.Sprintf("k%02d", 19-i), Value: fmt.Sprint(i)}
		want = append(want, fmt.Sprintf("k%02d=%d", 19-i, i))
	}
	cases := []struct {
		name   string
		url    string
		params []domain.NameValue
		query  string
	}{
		{"two in order", "/p", nv("a", "1", "b", "2"), "a=1&b=2"},
		{"not sorted", "/p", nv("b", "2", "a", "1"), "b=2&a=1"},
		{"after the URL's own query", "/p?x=1", nv("a", "1"), "x=1&a=1"},
		{"bare question mark", "/p?", nv("a", "1"), "a=1"},
		{"query ending in ampersand", "/p?x=1&", nv("a", "1"), "x=1&a=1"},
		{"twenty whole and in order", "/p", twenty, strings.Join(want, "&")},
		{"same name twice", "/p", nv("a", "1", "a", "2"), "a=1&a=2"},
		{"empty value", "/p", nv("a", ""), "a="},
		{"empty name", "/p", nv("", "v"), "=v"},
		{"none given keeps the query", "/p?x=1&y=%20", nil, "x=1&y=%20"},
		{"fragment dropped", "/p?x=1#frag", nv("a", "1"), "x=1&a=1"},
		{"fragment dropped, no query", "/p#frag", nv("a", "1"), "a=1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := send(t, domain.HTTPCheck{URL: c.url, QueryParams: c.params})
			assert.Equal(t, c.query, got.RawQuery)
		})
	}
	t.Run("special characters stay inside one parameter", func(t *testing.T) {
		name, value := "a&b=c d é", "x&y=z w ü"
		got := send(t, domain.HTTPCheck{QueryParams: nv(name, value)})
		parsed, err := url.ParseQuery(got.RawQuery)
		require.NoError(t, err)
		assert.Equal(t, url.Values{name: {value}}, parsed)
	})
}

func TestCheckHTTP_Headers(t *testing.T) {
	t.Run("none given leaves only the User-Agent", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{})
		assert.Equal(t, []string{"Monitory"}, got.Header.Values("User-Agent"))
		assert.Empty(t, got.Header.Values("Content-Type"))
	})
	t.Run("values as saved, name in canonical form", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Headers: nv("x-api-key", "k1", "Authorization", "Bearer t")})
		assert.Equal(t, []string{"k1"}, got.Header.Values("X-Api-Key"))
		assert.Equal(t, []string{"Bearer t"}, got.Header.Values("Authorization"))
		assert.Equal(t, []string{"Monitory"}, got.Header.Values("User-Agent"))
	})
	t.Run("two with one name arrive in order", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Headers: nv("X-A", "1", "x-a", "2")})
		assert.Equal(t, []string{"1", "2"}, got.Header.Values("X-A"))
	})
	t.Run("saved User-Agent replaces the default", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Headers: nv("user-agent", "Mine")})
		assert.Equal(t, []string{"Mine"}, got.Header.Values("User-Agent"))
	})
	t.Run("two saved User-Agents, no default; the library writes only the first", func(t *testing.T) {
		// The task asks for both values; net/http writes a single User-Agent line
		// (the first), so this pins what can be sent. Reported as a deviation.
		got := send(t, domain.HTTPCheck{Headers: nv("User-Agent", "A", "User-Agent", "B")})
		assert.Equal(t, []string{"A"}, got.Header.Values("User-Agent"))
	})
	t.Run("saved Content-Type replaces the default of a body", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Method: "POST", BodyType: domain.BodyTypeJSON, BodyContent: "{}", Headers: nv("Content-Type", "application/vnd.x+json")})
		assert.Equal(t, []string{"application/vnd.x+json"}, got.Header.Values("Content-Type"))
	})
	t.Run("two saved Content-Types, no default", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Method: "POST", BodyType: domain.BodyTypeText, BodyContent: "x", Headers: nv("Content-Type", "a/b", "content-type", "c/d")})
		assert.Equal(t, []string{"a/b", "c/d"}, got.Header.Values("Content-Type"))
	})
	t.Run("authorization and Authorization together arrive as two values in order", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Headers: nv("authorization", "one", "Authorization", "two")})
		assert.Equal(t, []string{"one", "two"}, got.Header.Values("Authorization"))
	})
	t.Run("a long value and twenty headers arrive whole", func(t *testing.T) {
		long := strings.Repeat("v", 4096)
		var hs []domain.NameValue
		for i := range 20 {
			hs = append(hs, domain.NameValue{Name: fmt.Sprintf("X-H%02d", i), Value: long})
		}
		got := send(t, domain.HTTPCheck{Headers: hs})
		for _, h := range hs {
			assert.Equal(t, []string{long}, got.Header.Values(h.Name), h.Name)
		}
	})
}

func TestCheckHTTP_Body(t *testing.T) {
	types := []struct {
		bodyType    domain.BodyType
		contentType string
	}{
		{domain.BodyTypeJSON, "application/json"},
		{domain.BodyTypeText, "text/plain"},
		{domain.BodyTypeForm, "application/x-www-form-urlencoded"},
	}
	for _, c := range types {
		t.Run(string(c.bodyType), func(t *testing.T) {
			got := send(t, domain.HTTPCheck{Method: "POST", BodyType: c.bodyType, BodyContent: `{"a":1}`})
			assert.Equal(t, `{"a":1}`, got.Body)
			assert.Equal(t, []string{c.contentType}, got.Header.Values("Content-Type"))
		})
	}
	for _, bt := range []domain.BodyType{domain.BodyTypeNone, "", "xml"} {
		t.Run("no body for type "+string(bt), func(t *testing.T) {
			got := send(t, domain.HTTPCheck{Method: "POST", BodyType: bt, BodyContent: "ignored"})
			assert.Empty(t, got.Body)
			assert.Empty(t, got.Header.Values("Content-Type"))
		})
	}
	t.Run("json with empty content is an empty body with its content type", func(t *testing.T) {
		got := send(t, domain.HTTPCheck{Method: "POST", BodyType: domain.BodyTypeJSON})
		assert.Empty(t, got.Body)
		assert.Equal(t, []string{"application/json"}, got.Header.Values("Content-Type"))
	})
	t.Run("64 KB arrives whole", func(t *testing.T) {
		body := strings.Repeat("x", 65536)
		got := send(t, domain.HTTPCheck{Method: "POST", BodyType: domain.BodyTypeText, BodyContent: body})
		assert.Equal(t, body, got.Body)
	})
	t.Run("non-ASCII and a line break byte for byte", func(t *testing.T) {
		body := "héllo\r\nwörld ✓\n"
		got := send(t, domain.HTTPCheck{Method: "POST", BodyType: domain.BodyTypeText, BodyContent: body})
		assert.Equal(t, body, got.Body)
	})
	for _, m := range []string{"POST", "PUT", "PATCH", "DELETE", "GET"} {
		t.Run("body with "+m, func(t *testing.T) {
			got := send(t, domain.HTTPCheck{Method: m, BodyType: domain.BodyTypeJSON, BodyContent: `{"m":"` + m + `"}`})
			assert.Equal(t, m, got.Method)
			assert.Equal(t, `{"m":"`+m+`"}`, got.Body)
		})
	}
}

func TestCheckHTTP_RequestOutcome(t *testing.T) {
	full := func(url string, timeout time.Duration) domain.HTTPCheck {
		return domain.HTTPCheck{
			Method: "POST", URL: url, Timeout: timeout,
			QueryParams: nv("a", "1"), Headers: nv("X-K", "v"),
			BodyType: domain.BodyTypeJSON, BodyContent: `{}`,
		}
	}
	ts := testutil.NewTargetServer(t)
	ts.Script("/ok", testutil.Route{})
	ts.Script("/err", testutil.Route{Status: 500})
	ts.Script("/slow", testutil.Route{Delay: 2 * time.Second})
	requireHealthy(t, run(t, 3, full(ts.URL()+"/ok", longTimeout)))
	requireStatus(t, run(t, 3, full(ts.URL()+"/err", longTimeout)), 500)
	requireFailed(t, run(t, 3, full(ts.URL()+"/slow", 100*time.Millisecond)), domain.FailureTimedOut)
}

func TestCheckHTTP_RefusedHeader(t *testing.T) {
	for name, h := range map[string][]domain.NameValue{
		"CR in value":   nv("X-A", "a\rb"),
		"LF in value":   nv("X-A", "a\nb"),
		"empty name":    nv("", "v"),
		"CR in a name":  nv("X-A\r", "v"),
		"after a valid": nv("X-Ok", "1", "X-Bad", "a\r\nb"),
	} {
		t.Run(name, func(t *testing.T) {
			ts := testutil.NewTargetServer(t)
			ts.Script("/p", testutil.Route{})
			check := get(ts.URL()+"/p", longTimeout)
			requireHealthy(t, run(t, 3, check)) // baseline: the same check without the header sends
			before := len(ts.Requests())
			check.Headers = h
			requireFailed(t, run(t, 3, check), domain.FailureCouldNotConnect)
			assert.Len(t, ts.Requests(), before)
		})
	}
}

func TestCheckHTTP_RedirectsCarrySavedRequest(t *testing.T) {
	saved := nv("Authorization", "Bearer t", "Cookie", "s=1", "X-Api-Key", "k")
	requireSaved := func(t *testing.T, r testutil.RecordedRequest) {
		t.Helper()
		assert.Equal(t, []string{"Bearer t"}, r.Header.Values("Authorization"), r.Path)
		assert.Equal(t, []string{"s=1"}, r.Header.Values("Cookie"), r.Path)
		assert.Equal(t, []string{"k"}, r.Header.Values("X-Api-Key"), r.Path)
		assert.Equal(t, []string{"Monitory"}, r.Header.Values("User-Agent"), r.Path)
	}
	t.Run("two 302 hops on one host", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		check := get(chain(ts, 2), longTimeout)
		check.Headers = saved
		requireHealthy(t, run(t, 3, check))
		reqs := ts.Requests()
		require.Len(t, reqs, 3)
		for _, r := range reqs {
			requireSaved(t, r)
		}
	})
	t.Run("a different host name still gets them", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		_, port, found := strings.Cut(strings.TrimPrefix(ts.URL(), "http://"), ":")
		require.True(t, found)
		ts.Script("/start", testutil.Route{RedirectTo: "http://localhost:" + port + "/end"})
		ts.Script("/end", testutil.Route{})
		check := get("http://127.0.0.1:"+port+"/start", longTimeout)
		check.Headers = saved
		requireHealthy(t, run(t, 3, check))
		reqs := ts.Requests()
		require.Len(t, reqs, 2)
		requireSaved(t, reqs[1])
	})
	t.Run("302 after POST is a GET with no body and the saved Content-Type", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/start", testutil.Route{RedirectTo: "/end"})
		ts.Script("/end", testutil.Route{})
		check := domain.HTTPCheck{
			Method: "POST", URL: ts.URL() + "/start", Timeout: longTimeout,
			BodyType: domain.BodyTypeJSON, BodyContent: `{"a":1}`,
			Headers: append(nv("Content-Type", "application/x-saved"), saved...),
		}
		requireHealthy(t, run(t, 3, check))
		reqs := ts.Requests()
		require.Len(t, reqs, 2)
		assert.Equal(t, "GET", reqs[1].Method)
		assert.Empty(t, reqs[1].Body)
		assert.Equal(t, []string{"application/x-saved"}, reqs[1].Header.Values("Content-Type"))
		requireSaved(t, reqs[1])
	})
	t.Run("302 after POST without a saved Content-Type sends none", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/start", testutil.Route{RedirectTo: "/end"})
		ts.Script("/end", testutil.Route{})
		check := domain.HTTPCheck{Method: "POST", URL: ts.URL() + "/start", Timeout: longTimeout, BodyType: domain.BodyTypeJSON, BodyContent: "{}"}
		requireHealthy(t, run(t, 3, check))
		assert.Empty(t, ts.Requests()[1].Header.Values("Content-Type"))
	})
	t.Run("307 after POST repeats method, body and saved headers", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/start", testutil.Route{Status: 307, RedirectTo: "/end"})
		ts.Script("/end", testutil.Route{})
		check := domain.HTTPCheck{
			Method: "POST", URL: ts.URL() + "/start", Timeout: longTimeout,
			BodyType: domain.BodyTypeJSON, BodyContent: `{"a":1}`, Headers: saved,
		}
		requireHealthy(t, run(t, 3, check))
		reqs := ts.Requests()
		require.Len(t, reqs, 2)
		assert.Equal(t, "POST", reqs[1].Method)
		assert.Equal(t, `{"a":1}`, reqs[1].Body)
		assert.Equal(t, []string{"application/json"}, reqs[1].Header.Values("Content-Type"))
		requireSaved(t, reqs[1])
	})
	t.Run("308 after POST repeats a 64 KB body and the saved headers", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/start", testutil.Route{Status: 308, RedirectTo: "/end"})
		ts.Script("/end", testutil.Route{})
		body := strings.Repeat("y", 65536)
		check := domain.HTTPCheck{
			Method: "POST", URL: ts.URL() + "/start", Timeout: longTimeout,
			BodyType: domain.BodyTypeText, BodyContent: body, Headers: saved,
		}
		requireHealthy(t, run(t, 3, check))
		reqs := ts.Requests()
		require.Len(t, reqs, 2)
		assert.Equal(t, "POST", reqs[1].Method)
		assert.Equal(t, body, reqs[1].Body)
		requireSaved(t, reqs[1])
	})
	t.Run("a POST chain of four 307 hops with the limit 3 fails", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/end", testutil.Route{})
		for i := range 4 {
			next := "/end"
			if i < 3 {
				next = fmt.Sprintf("/r%d", i+1)
			}
			ts.Script(fmt.Sprintf("/r%d", i), testutil.Route{Status: 307, RedirectTo: next})
		}
		check := domain.HTTPCheck{Method: "POST", URL: ts.URL() + "/r0", Timeout: longTimeout, BodyType: domain.BodyTypeJSON, BodyContent: "{}", Headers: saved}
		requireFailed(t, run(t, 3, check), domain.FailureTooManyRedirects)
	})
	t.Run("a saved User-Agent is on every hop", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		check := get(chain(ts, 2), longTimeout)
		check.Headers = nv("User-Agent", "Mine")
		requireHealthy(t, run(t, 3, check))
		for _, r := range ts.Requests() {
			assert.Equal(t, []string{"Mine"}, r.Header.Values("User-Agent"), r.Path)
		}
	})
	t.Run("a chain over the limit still fails", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		check := get(chain(ts, 4), longTimeout)
		check.Headers = saved
		requireFailed(t, run(t, 3, check), domain.FailureTooManyRedirects)
	})
}

func TestCheckHTTP_ConcurrentHeaders(t *testing.T) {
	p := NewHTTPProber(3, 65536, clock.Real{})
	var wg sync.WaitGroup
	servers := make([]*testutil.TargetServer, 2)
	for i := range servers {
		servers[i] = testutil.NewTargetServer(t)
		servers[i].Script("/start", testutil.Route{RedirectTo: "/end"})
		servers[i].Script("/end", testutil.Route{})
	}
	errs := make([]error, 20)
	results := make([]domain.CheckResult, 20)
	for i := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s := i % 2
			results[i], errs[i] = p.CheckHTTP(context.Background(), domain.HTTPCheck{
				Method: "GET", URL: servers[s].URL() + "/start", Timeout: longTimeout,
				Headers: nv("X-Who", fmt.Sprint(s), "Authorization", fmt.Sprint("tok", s)),
			})
		}()
	}
	wg.Wait()
	for i := range results {
		require.NoError(t, errs[i])
		requireHealthy(t, results[i])
	}
	for s, ts := range servers {
		reqs := ts.Requests()
		require.Len(t, reqs, 20)
		for _, r := range reqs {
			assert.Equal(t, []string{fmt.Sprint(s)}, r.Header.Values("X-Who"))
			assert.Equal(t, []string{fmt.Sprint("tok", s)}, r.Header.Values("Authorization"))
		}
	}
}

// --- JSON rules ---

func withRules(check domain.HTTPCheck, mode domain.JSONRuleMode, rules ...domain.JSONRule) domain.HTTPCheck {
	check.JSONRules = rules
	check.JSONRuleMode = mode
	return check
}

func runLimit(t *testing.T, limit int, check domain.HTTPCheck) domain.CheckResult {
	t.Helper()
	res, err := NewHTTPProber(3, limit, clock.Real{}).CheckHTTP(context.Background(), check)
	require.NoError(t, err)
	return res
}

func requireRuleMatched(t *testing.T, res domain.CheckResult, field string) {
	t.Helper()
	assert.False(t, res.Healthy)
	require.NotNil(t, res.Failure)
	assert.Equal(t, domain.FailureJSONRuleMatched, res.Failure.Code)
	require.NotNil(t, res.Failure.JSONRuleField)
	assert.Equal(t, field, *res.Failure.JSONRuleField)
	assert.Nil(t, res.Failure.HTTPStatus)
}

func TestCheckHTTP_JSONRules(t *testing.T) {
	statusDown := domain.JSONRule{Field: "status", FailingValue: "down"}
	serve := func(status int, body string) string {
		ts := testutil.NewTargetServer(t)
		ts.Script("/", testutil.Route{Status: status, Body: body})
		return ts.URL() + "/"
	}
	check := func(url string) domain.HTTPCheck {
		return withRules(get(url, longTimeout), "", statusDown)
	}

	t.Run("200 with a non-matching body is healthy", func(t *testing.T) {
		requireHealthy(t, run(t, 3, check(serve(200, `{"status":"ok"}`))))
	})
	t.Run("200 with a matching body", func(t *testing.T) {
		requireRuleMatched(t, run(t, 3, check(serve(200, `{"status":"down"}`))), "status")
	})
	t.Run("nested field", func(t *testing.T) {
		c := withRules(get(serve(200, `{"checks":{"db":{"status":"down"}}}`), longTimeout), "",
			domain.JSONRule{Field: "checks.db.status", FailingValue: "down"})
		requireRuleMatched(t, run(t, 3, c), "checks.db.status")
	})
	t.Run("500 with a matching body: the rule beats the status", func(t *testing.T) {
		requireRuleMatched(t, run(t, 3, check(serve(500, `{"status":"down"}`))), "status")
	})
	t.Run("500 with a non-matching body", func(t *testing.T) {
		requireStatus(t, run(t, 3, check(serve(500, `{"status":"ok"}`))), 500)
	})
	t.Run("500 with no JSON body", func(t *testing.T) {
		requireStatus(t, run(t, 3, check(serve(500, `<html>oops</html>`))), 500)
	})
	t.Run("200 with no JSON body", func(t *testing.T) {
		requireFailed(t, run(t, 3, check(serve(200, `<html>ok</html>`))), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("200 with an empty body", func(t *testing.T) {
		requireFailed(t, run(t, 3, check(serve(200, ``))), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("204 with rules", func(t *testing.T) {
		requireFailed(t, run(t, 3, check(serve(204, ``))), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("200 lacking the field", func(t *testing.T) {
		requireFailed(t, run(t, 3, check(serve(200, `{"other":"down"}`))), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("HEAD with rules and 2xx", func(t *testing.T) {
		c := check(serve(200, `{"status":"down"}`))
		c.Method = http.MethodHead
		requireFailed(t, run(t, 3, c), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("rules judge the final response after a redirect", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/start", testutil.Route{Status: 302, RedirectTo: "/end", Body: `{"status":"ok"}`})
		ts.Script("/end", testutil.Route{Body: `{"status":"down"}`})
		requireRuleMatched(t, run(t, 3, check(ts.URL()+"/start")), "status")

		ts.Script("/start2", testutil.Route{Status: 302, RedirectTo: "/fine", Body: `{"status":"down"}`})
		ts.Script("/fine", testutil.Route{Body: `{"status":"ok"}`})
		requireHealthy(t, run(t, 3, check(ts.URL()+"/start2")))
	})
}

func TestCheckHTTP_JSONRuleModes(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/", testutil.Route{Body: `{"a":"1","b":"0"}`})
	ts.Script("/both", testutil.Route{Body: `{"a":"1","b":"2"}`})
	ra := domain.JSONRule{Field: "a", FailingValue: "1"}
	rb := domain.JSONRule{Field: "b", FailingValue: "2"}

	requireRuleMatched(t, run(t, 3, withRules(get(ts.URL()+"/", longTimeout), domain.JSONRuleModeAny, ra, rb)), "a")
	requireHealthy(t, run(t, 3, withRules(get(ts.URL()+"/", longTimeout), domain.JSONRuleModeAll, ra, rb)))
	requireRuleMatched(t, run(t, 3, withRules(get(ts.URL()+"/both", longTimeout), domain.JSONRuleModeAll, ra, rb)), "a")
}

func TestCheckHTTP_JSONBodyLimit(t *testing.T) {
	rules := []domain.JSONRule{{Field: "status", FailingValue: "down"}}
	// jsonOfSize is a valid object of exactly n bytes that does not match the rule.
	jsonOfSize := func(n int) string {
		const frame = `{"status":"ok","pad":""}`
		return `{"status":"ok","pad":"` + strings.Repeat("a", n-len(frame)) + `"}`
	}

	for _, limit := range []int{64, 1024} {
		t.Run(fmt.Sprintf("limit %d", limit), func(t *testing.T) {
			ts := testutil.NewTargetServer(t)
			ts.Script("/exact", testutil.Route{Body: jsonOfSize(limit)})
			ts.Script("/over", testutil.Route{Body: jsonOfSize(limit + 1)})
			// A valid JSON value in its first limit bytes, then more.
			ts.Script("/prefix", testutil.Route{Body: jsonOfSize(limit) + " "})
			c := func(path string) domain.HTTPCheck {
				return withRules(get(ts.URL()+path, longTimeout), "", rules...)
			}
			requireHealthy(t, runLimit(t, limit, c("/exact")))
			requireFailed(t, runLimit(t, limit, c("/over")), domain.FailureInvalidOrMissingJSON)
			requireFailed(t, runLimit(t, limit, c("/prefix")), domain.FailureInvalidOrMissingJSON)
		})
	}

	t.Run("an endless body is not read past the limit", func(t *testing.T) {
		url := rawServer(t, func(w http.ResponseWriter, r *http.Request) {
			chunk := []byte(strings.Repeat("a", 512))
			for r.Context().Err() == nil {
				if _, err := w.Write(chunk); err != nil {
					return
				}
				w.(http.Flusher).Flush()
			}
		})
		requireFailed(t, runLimit(t, 64, withRules(get(url, longTimeout), "", rules...)), domain.FailureInvalidOrMissingJSON)
	})
	t.Run("large body: rules fail it, no rules do not", func(t *testing.T) {
		ts := testutil.NewTargetServer(t)
		ts.Script("/", testutil.Route{Body: jsonOfSize(1 << 20)})
		c := get(ts.URL()+"/", longTimeout)
		c.JSONRules = []domain.JSONRule{}
		requireHealthy(t, run(t, 3, c))
		requireFailed(t, run(t, 3, withRules(c, "", rules...)), domain.FailureInvalidOrMissingJSON)
	})
}

// rawServer starts a server whose handler runs fn, and returns its URL.
func rawServer(t *testing.T, fn http.HandlerFunc) string {
	t.Helper()
	srv := httptest.NewServer(fn)
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestCheckHTTP_JSONBodyReadInsideTimeout(t *testing.T) {
	rules := []domain.JSONRule{{Field: "status", FailingValue: "down"}}
	const timeout = 150 * time.Millisecond

	// slow sends headers and the start of a body at once, the rest after the timeout.
	slow := func(status int) string {
		return rawServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"status":`))
			w.(http.Flusher).Flush()
			select {
			case <-time.After(3 * timeout):
				_, _ = w.Write([]byte(`"down"}`))
			case <-r.Context().Done():
			}
		})
	}
	// cutOff declares a length (or chunks) and closes the connection mid-body.
	cutOff := func(status int, chunked bool) string {
		return rawServer(t, func(w http.ResponseWriter, _ *http.Request) {
			if !chunked {
				w.Header().Set("Content-Length", "100")
			}
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"status":`))
			w.(http.Flusher).Flush()
			conn, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				_ = conn.Close()
			}
		})
	}

	t.Run("slow 2xx body times out with rules, healthy without", func(t *testing.T) {
		url := slow(200)
		requireFailed(t, run(t, 3, withRules(get(url, timeout), "", rules...)), domain.FailureTimedOut)
		requireHealthy(t, run(t, 3, get(url, timeout)))
	})
	t.Run("slow 500 body times out", func(t *testing.T) {
		requireFailed(t, run(t, 3, withRules(get(slow(500), timeout), "", rules...)), domain.FailureTimedOut)
	})
	t.Run("cut-off body with a declared length", func(t *testing.T) {
		requireFailed(t, run(t, 3, withRules(get(cutOff(200, false), longTimeout), "", rules...)), domain.FailureCouldNotConnect)
		requireStatus(t, run(t, 3, withRules(get(cutOff(500, false), longTimeout), "", rules...)), 500)
	})
	t.Run("cut-off chunked body", func(t *testing.T) {
		requireFailed(t, run(t, 3, withRules(get(cutOff(200, true), longTimeout), "", rules...)), domain.FailureCouldNotConnect)
		requireStatus(t, run(t, 3, withRules(get(cutOff(500, true), longTimeout), "", rules...)), 500)
	})
	t.Run("caller cancelled during the read", func(t *testing.T) {
		started := make(chan struct{})
		url := rawServer(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"status":`))
			w.(http.Flusher).Flush()
			close(started)
			<-r.Context().Done()
		})
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() {
			<-started
			cancel()
		}()
		res, err := NewHTTPProber(3, 65536, clock.Real{}).CheckHTTP(ctx, withRules(get(url, longTimeout), "", rules...))
		require.ErrorIs(t, err, context.Canceled)
		assert.Equal(t, domain.CheckResult{}, res)
	})
}

// certProber returns a prober on a fake clock set to `before` ahead of the receiver's
// certificate expiry (negative: after it), trusting the receiver's certificate when
// trusted is set.
func certProber(t *testing.T, ts *testutil.TargetServer, trusted bool, before time.Duration) *HTTPProber {
	t.Helper()
	p := NewHTTPProber(3, 65536, clock.NewFake(certNotAfter(t, ts).Add(-before)))
	if trusted {
		p.roots = ts.Pool()
	}
	return p
}

func certNotAfter(t *testing.T, ts *testutil.TargetServer) time.Time {
	t.Helper()
	resp, err := ts.Client().Get(ts.URL() + "/")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.NotEmpty(t, resp.TLS.PeerCertificates)
	return resp.TLS.PeerCertificates[0].NotAfter
}

func certCheck(url string, ignore bool, minDays int) domain.HTTPCheck {
	c := get(url, longTimeout)
	c.IgnoreCertificateErrors = ignore
	if minDays > 0 {
		c.CertificateCheck = true
		c.CertMinDaysLeft = minDays
	}
	return c
}

func probeOne(t *testing.T, p *HTTPProber, check domain.HTTPCheck) domain.CheckResult {
	t.Helper()
	res, err := p.CheckHTTP(context.Background(), check)
	require.NoError(t, err)
	return res
}

const (
	day  = 24 * time.Hour
	year = 365 * day
)

func TestCertOptions_IgnoreErrors(t *testing.T) {
	t.Run("untrusted certificate", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/", testutil.Route{})
		p := NewHTTPProber(3, 65536, clock.Real{})
		requireFailed(t, probeOne(t, p, certCheck(ts.URL()+"/", false, 0)), domain.FailureCertificateProblem)
		requireHealthy(t, probeOne(t, p, certCheck(ts.URL()+"/", true, 0)))
	})
	t.Run("host name mismatch", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/", testutil.Route{})
		p := certProber(t, ts, true, year)
		other := strings.Replace(ts.URL(), "127.0.0.1", "localhost", 1) + "/"
		requireFailed(t, probeOne(t, p, certCheck(other, false, 0)), domain.FailureCertificateProblem)
		requireHealthy(t, probeOne(t, p, certCheck(other, true, 0)))
	})
	t.Run("expired certificate", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/", testutil.Route{})
		p := certProber(t, ts, true, -day)
		requireFailed(t, probeOne(t, p, certCheck(ts.URL()+"/", false, 0)), domain.FailureCertificateProblem)
		requireHealthy(t, probeOne(t, p, certCheck(ts.URL()+"/", true, 0)))
	})
	t.Run("redirect from plain http", func(t *testing.T) {
		secure := testutil.NewTargetServer(t, testutil.TargetTLS())
		secure.Script("/", testutil.Route{})
		plain := testutil.NewTargetServer(t)
		plain.Script("/go", testutil.Route{RedirectTo: secure.URL() + "/"})
		p := NewHTTPProber(3, 65536, clock.Real{})
		requireFailed(t, probeOne(t, p, certCheck(plain.URL()+"/go", false, 0)), domain.FailureCertificateProblem)
		requireHealthy(t, probeOne(t, p, certCheck(plain.URL()+"/go", true, 0)))
	})
	t.Run("second hop is untrusted", func(t *testing.T) {
		secure := testutil.NewTargetServer(t, testutil.TargetTLS())
		secure.Script("/", testutil.Route{})
		plain := testutil.NewTargetServer(t)
		plain.Script("/a", testutil.Route{RedirectTo: "/b"})
		plain.Script("/b", testutil.Route{RedirectTo: secure.URL() + "/"})
		p := NewHTTPProber(3, 65536, clock.Real{})
		requireFailed(t, probeOne(t, p, certCheck(plain.URL()+"/a", false, 0)), domain.FailureCertificateProblem)
		requireHealthy(t, probeOne(t, p, certCheck(plain.URL()+"/a", true, 0)))
	})
	t.Run("a TLS to TLS redirect chain", func(t *testing.T) {
		first := testutil.NewTargetServer(t, testutil.TargetTLS())
		second := testutil.NewTargetServer(t, testutil.TargetTLS())
		second.Script("/", testutil.Route{})
		first.Script("/go", testutil.Route{RedirectTo: second.URL() + "/"})
		p := NewHTTPProber(3, 65536, clock.Real{})
		requireHealthy(t, probeOne(t, p, certCheck(first.URL()+"/go", true, 0)))
	})
	t.Run("a 500 is still non_2xx_status", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/", testutil.Route{Status: 500})
		res := probeOne(t, NewHTTPProber(3, 65536, clock.Real{}), certCheck(ts.URL()+"/", true, 0))
		requireStatus(t, res, 500)
	})
	t.Run("saved headers go on the redirected request", func(t *testing.T) {
		secure := testutil.NewTargetServer(t, testutil.TargetTLS())
		secure.Script("/", testutil.Route{})
		plain := testutil.NewTargetServer(t)
		plain.Script("/go", testutil.Route{RedirectTo: secure.URL() + "/"})
		check := certCheck(plain.URL()+"/go", true, 0)
		check.Headers = nv("X-Key", "k1", "User-Agent", "Mine")
		requireHealthy(t, probeOne(t, NewHTTPProber(3, 65536, clock.Real{}), check))
		reqs := secure.Requests()
		require.Len(t, reqs, 1)
		assert.Equal(t, []string{"k1"}, reqs[0].Header.Values("X-Key"))
		assert.Equal(t, []string{"Mine"}, reqs[0].Header.Values("User-Agent"))
	})
	t.Run("the redirect limit still applies", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/end", testutil.Route{})
		for i := range 4 {
			next := "/end"
			if i < 3 {
				next = fmt.Sprintf("/r%d", i+1)
			}
			ts.Script(fmt.Sprintf("/r%d", i), testutil.Route{Status: 307, RedirectTo: next})
		}
		p := NewHTTPProber(3, 65536, clock.Real{})
		requireFailed(t, probeOne(t, p, certCheck(ts.URL()+"/r0", true, 0)), domain.FailureTooManyRedirects)
	})
	t.Run("concurrent checks with different settings", func(t *testing.T) {
		ts := testutil.NewTargetServer(t, testutil.TargetTLS())
		ts.Script("/", testutil.Route{})
		p := NewHTTPProber(3, 65536, clock.Real{})
		const n = 8
		results := make([]domain.CheckResult, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				res, err := p.CheckHTTP(context.Background(), certCheck(ts.URL()+"/", i%2 == 0, 0))
				assert.NoError(t, err)
				results[i] = res
			}()
		}
		wg.Wait()
		for i, res := range results {
			if i%2 == 0 {
				requireHealthy(t, res)
			} else {
				requireFailed(t, res, domain.FailureCertificateProblem)
			}
		}
	})
}

func TestCertOptions_ExpiryDays(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	tests := []struct {
		name    string
		left    time.Duration
		minDays int
		healthy bool
	}{
		{"13 days 23 hours, minimum 14", 13*day + 23*time.Hour, 14, false},
		{"exactly 14 days, minimum 14", 14 * day, 14, true},
		{"14 days 1 hour, minimum 15", 14*day + time.Hour, 15, false},
		{"well over the minimum", 200 * day, 14, true},
		{"one second under 14 days, minimum 14", 14*day - time.Second, 14, false},
		{"exactly 1 day, minimum 1", day, 1, true},
		{"under 1 day, minimum 1", day - time.Second, 1, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, ignore := range []bool{true, false} {
				p := certProber(t, ts, !ignore, tt.left)
				res := probeOne(t, p, certCheck(ts.URL()+"/", ignore, tt.minDays))
				if tt.healthy {
					requireHealthy(t, res)
				} else {
					requireFailed(t, res, domain.FailureCertificateProblem)
				}
			}
		})
	}
}

func TestCertOptions_ExpiredCountsAsZero(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	for _, after := range []time.Duration{time.Second, 400 * day} {
		p := certProber(t, ts, false, -after)
		requireFailed(t, probeOne(t, p, certCheck(ts.URL()+"/", true, 1)), domain.FailureCertificateProblem)
	}
}

func TestCertOptions_CheckOffIgnored(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	// Check off: a certificate one day from expiry is healthy.
	requireHealthy(t, probeOne(t, certProber(t, ts, false, day), certCheck(ts.URL()+"/", true, 0)))
	requireHealthy(t, probeOne(t, certProber(t, ts, true, day), certCheck(ts.URL()+"/", false, 0)))
	// Baseline: the same receiver fails with the check on.
	requireFailed(t, probeOne(t, certProber(t, ts, true, day), certCheck(ts.URL()+"/", false, 2)), domain.FailureCertificateProblem)
}

func TestCertOptions_UntrustedWithExpiryCheck(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	p := certProber(t, ts, false, 100*day)
	requireFailed(t, probeOne(t, p, certCheck(ts.URL()+"/", false, 14)), domain.FailureCertificateProblem)
	requireHealthy(t, probeOne(t, p, certCheck(ts.URL()+"/", true, 14)))
}

func TestCertOptions_ExpiryBeforeBodyAndStatus(t *testing.T) {
	rules := []domain.JSONRule{{Field: "status", FailingValue: "down"}}
	tests := []struct {
		name   string
		status int
		body   string
		// baselineHealthy: with enough days left the response is healthy.
		baselineHealthy bool
	}{
		{"200 with a body no rule matches", 200, `{"status":"up"}`, true},
		{"500", 500, `{"status":"up"}`, false},
		{"a matching rule", 200, `{"status":"down"}`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := testutil.NewTargetServer(t, testutil.TargetTLS())
			ts.Script("/", testutil.Route{Status: tt.status, Body: tt.body})
			check := withRules(certCheck(ts.URL()+"/", true, 14), "", rules...)
			requireFailed(t, probeOne(t, certProber(t, ts, false, 3*day), check), domain.FailureCertificateProblem)
			// Baseline: with enough days the same response is judged by body and status.
			res := probeOne(t, certProber(t, ts, false, 30*day), check)
			if tt.baselineHealthy {
				requireHealthy(t, res)
				return
			}
			require.NotNil(t, res.Failure)
			assert.NotEqual(t, domain.FailureCertificateProblem, res.Failure.Code)
		})
	}
}

func TestCertOptions_RedirectToPlainHTTPSkipsExpiry(t *testing.T) {
	plain := testutil.NewTargetServer(t)
	plain.Script("/", testutil.Route{})
	secure := testutil.NewTargetServer(t, testutil.TargetTLS())
	secure.Script("/go", testutil.Route{RedirectTo: plain.URL() + "/"})
	p := certProber(t, secure, false, day)
	requireHealthy(t, probeOne(t, p, certCheck(secure.URL()+"/go", true, 14)))
	// The final response's status decides.
	plain.Script("/", testutil.Route{Status: 503})
	requireStatus(t, probeOne(t, p, certCheck(secure.URL()+"/go", true, 14)), 503)
	// Baseline: without the redirect the same certificate fails the check.
	secure.Script("/", testutil.Route{})
	requireFailed(t, probeOne(t, p, certCheck(secure.URL()+"/", true, 14)), domain.FailureCertificateProblem)
}

func TestCertOptions_UsesInjectedClock(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	notAfter := certNotAfter(t, ts)
	fake := clock.NewFake(notAfter.Add(-20 * day))
	p := NewHTTPProber(3, 65536, fake)
	check := certCheck(ts.URL()+"/", true, 14)
	requireHealthy(t, probeOne(t, p, check))
	fake.Advance(7 * day)
	requireFailed(t, probeOne(t, p, check), domain.FailureCertificateProblem)
}

func TestCertOptions_ZeroMinNeverFails(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/", testutil.Route{})
	check := certCheck(ts.URL()+"/", true, 0)
	check.CertificateCheck = true
	requireHealthy(t, probeOne(t, certProber(t, ts, false, -day), check))
	check.CertMinDaysLeft = 1
	requireFailed(t, probeOne(t, certProber(t, ts, false, -day), check), domain.FailureCertificateProblem)
}

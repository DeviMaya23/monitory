package testutil_test

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/testutil"
	"monitory/pkg/clock"
)

func get(t *testing.T, c *http.Client, url string, header http.Header) (*http.Response, string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	require.NoError(t, err)
	for k, v := range header {
		req.Header[k] = v
	}
	resp, err := c.Do(req)
	require.NoError(t, err)
	defer func() { require.NoError(t, resp.Body.Close()) }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resp, string(body)
}

func noRedirects() *http.Client {
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
}

func TestTargetServer_ScriptedAndUnscripted(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/teapot", testutil.Route{Status: http.StatusTeapot, Body: "short and stout"})
	ts.Script("/ok", testutil.Route{})

	resp, body := get(t, http.DefaultClient, ts.URL()+"/teapot", nil)
	assert.Equal(t, http.StatusTeapot, resp.StatusCode)
	assert.Equal(t, "short and stout", body)

	resp, _ = get(t, http.DefaultClient, ts.URL()+"/ok", nil)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	resp, _ = get(t, http.DefaultClient, ts.URL()+"/nothing", nil)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestTargetServer_DelayAndRedirect(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/slow", testutil.Route{Delay: 100 * time.Millisecond})
	ts.Script("/go", testutil.Route{Status: http.StatusMovedPermanently, RedirectTo: "/slow"})
	ts.Script("/abs", testutil.Route{RedirectTo: "http://example.invalid/x"})

	// A scripted delay is observed: the answer comes no sooner than the delay. (That an
	// undelayed route answers quickly is not asserted: an upper bound on a wall clock
	// fails on a slow machine.)
	wall := clock.Real{}
	start := wall.Now()
	get(t, http.DefaultClient, ts.URL()+"/slow", nil)
	slow := wall.Now().Sub(start)
	assert.GreaterOrEqual(t, slow, 100*time.Millisecond)

	resp, _ := get(t, noRedirects(), ts.URL()+"/go", nil)
	assert.Equal(t, http.StatusMovedPermanently, resp.StatusCode)
	assert.Equal(t, "/slow", resp.Header.Get("Location"))

	resp, _ = get(t, noRedirects(), ts.URL()+"/abs", nil)
	assert.Equal(t, http.StatusFound, resp.StatusCode)
	assert.Equal(t, "http://example.invalid/x", resp.Header.Get("Location"))
}

func TestTargetServer_RecordsRequests(t *testing.T) {
	ts := testutil.NewTargetServer(t)
	ts.Script("/a", testutil.Route{})
	ts.Script("/b", testutil.Route{})

	get(t, http.DefaultClient, ts.URL()+"/a?x=1", http.Header{"X-Test": {"one"}})
	get(t, http.DefaultClient, ts.URL()+"/b", http.Header{"X-Test": {"two"}})

	reqs := ts.Requests()
	require.Len(t, reqs, 2)
	assert.Equal(t, "/a", reqs[0].Path)
	assert.Equal(t, "x=1", reqs[0].RawQuery)
	assert.Equal(t, http.MethodGet, reqs[0].Method)
	assert.Equal(t, "one", reqs[0].Header.Get("X-Test"))
	assert.NotEmpty(t, reqs[0].RemoteAddr)
	assert.Equal(t, "/b", reqs[1].Path)
	assert.Equal(t, "two", reqs[1].Header.Get("X-Test"))
	assert.Len(t, ts.RequestsTo("/b"), 1)

	select {
	case <-ts.Arrived("/a"):
	default:
		t.Fatal("Arrived(/a) is not closed after a request to /a")
	}
	select {
	case <-ts.Arrived("/never"):
		t.Fatal("Arrived(/never) closed without a request")
	default:
	}
}

func TestTargetServer_HTTPS(t *testing.T) {
	ts := testutil.NewTargetServer(t, testutil.TargetTLS())
	ts.Script("/ok", testutil.Route{Body: "secure"})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL()+"/ok", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		require.NoError(t, resp.Body.Close())
	}
	require.Error(t, err, "the default client must refuse the stub's certificate")

	_, body := get(t, ts.Client(), ts.URL()+"/ok", nil)
	assert.Equal(t, "secure", body)
	assert.NotNil(t, ts.Pool())
}

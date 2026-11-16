package testutil

import (
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"monitory/pkg/clock"
)

// Route scripts the answer to one path of a TargetServer. The zero Route answers 200
// with an empty body.
type Route struct {
	// Status is the status code; zero means 200.
	Status int
	// Body is the response body.
	Body string
	// Delay is waited, in real time, before the response.
	Delay time.Duration
	// RedirectTo, when set, makes the route a redirect: a path or an absolute URL,
	// sent as Location with Status (302 when Status is zero).
	RedirectTo string
	// CloseWithoutAnswer closes the connection without writing a response.
	CloseWithoutAnswer bool
}

// RecordedRequest is one request a TargetServer received.
type RecordedRequest struct {
	Method     string
	Path       string
	RawQuery   string
	Header     http.Header
	Body       string
	RemoteAddr string
}

// TargetOption changes how NewTargetServer starts the server.
type TargetOption func(*targetConfig)

type targetConfig struct{ tls bool }

// TargetTLS starts the server as HTTPS, with httptest's own certificate, which the
// default trust store rejects.
func TargetTLS() TargetOption { return func(c *targetConfig) { c.tls = true } }

// TargetServer is an in-process HTTP(S) server that answers as a test scripts it and
// records what it receives. It is safe for concurrent requests.
type TargetServer struct {
	srv *httptest.Server

	mu       sync.Mutex
	routes   map[string]Route
	requests []RecordedRequest
	arrived  map[string]chan struct{}
}

// NewTargetServer starts a target server and stops it when the test ends. An unscripted
// path answers 404.
func NewTargetServer(t testing.TB, opts ...TargetOption) *TargetServer {
	t.Helper()
	var cfg targetConfig
	for _, o := range opts {
		o(&cfg)
	}
	ts := &TargetServer{
		routes:  map[string]Route{},
		arrived: map[string]chan struct{}{},
	}
	ts.srv = httptest.NewUnstartedServer(http.HandlerFunc(ts.handle))
	if cfg.tls {
		ts.srv.StartTLS()
	} else {
		ts.srv.Start()
	}
	t.Cleanup(ts.srv.Close)
	return ts
}

// Script sets the answer for path, replacing an earlier one.
func (ts *TargetServer) Script(path string, r Route) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.routes[path] = r
}

// URL is the server's base URL, without a trailing slash.
func (ts *TargetServer) URL() string { return ts.srv.URL }

// Requests returns every request received so far, in order.
func (ts *TargetServer) Requests() []RecordedRequest {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	return append([]RecordedRequest(nil), ts.requests...)
}

// RequestsTo returns the requests received for path, in order.
func (ts *TargetServer) RequestsTo(path string) []RecordedRequest {
	var out []RecordedRequest
	for _, r := range ts.Requests() {
		if r.Path == path {
			out = append(out, r)
		}
	}
	return out
}

// Arrived returns a channel that is closed once a request has arrived at path (it is
// already closed if one has). A test receives from it to wait without polling.
func (ts *TargetServer) Arrived(path string) <-chan struct{} {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	return ts.arrivedLocked(path)
}

func (ts *TargetServer) arrivedLocked(path string) chan struct{} {
	ch, ok := ts.arrived[path]
	if !ok {
		ch = make(chan struct{})
		ts.arrived[path] = ch
	}
	return ch
}

// Pool is the certificate pool that trusts the HTTPS server's certificate.
func (ts *TargetServer) Pool() *x509.CertPool {
	pool := x509.NewCertPool()
	pool.AddCert(ts.srv.Certificate())
	return pool
}

// Client is an HTTP client that trusts this server's certificate.
func (ts *TargetServer) Client() *http.Client { return ts.srv.Client() }

func (ts *TargetServer) handle(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)

	ts.mu.Lock()
	ts.requests = append(ts.requests, RecordedRequest{
		Method:     r.Method,
		Path:       r.URL.Path,
		RawQuery:   r.URL.RawQuery,
		Header:     r.Header.Clone(),
		Body:       string(body),
		RemoteAddr: r.RemoteAddr,
	})
	route, ok := ts.routes[r.URL.Path]
	arrived := ts.arrivedLocked(r.URL.Path)
	select {
	case <-arrived:
	default:
		close(arrived)
	}
	ts.mu.Unlock()

	if !ok {
		http.NotFound(w, r)
		return
	}
	if route.Delay > 0 {
		timer := clock.Real{}.NewTimer(route.Delay)
		select {
		case <-timer.C():
		case <-r.Context().Done():
			timer.Stop()
			return
		}
	}
	if route.CloseWithoutAnswer {
		if hj, ok := w.(http.Hijacker); ok {
			if conn, _, err := hj.Hijack(); err == nil {
				_ = conn.Close()
			}
		}
		return
	}
	status := route.Status
	if route.RedirectTo != "" {
		if status == 0 {
			status = http.StatusFound
		}
		w.Header().Set("Location", route.RedirectTo)
	}
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	if route.Body != "" {
		_, _ = io.Copy(w, strings.NewReader(route.Body))
	}
}

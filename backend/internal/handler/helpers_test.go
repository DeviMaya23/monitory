package handler_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"monitory/internal/api"
	"monitory/internal/domain"
	"monitory/internal/handler"
	"monitory/internal/handler/middleware"
)

// sessionExpiry is the ExpiresAt of the session oneSession knows.
var sessionExpiry = time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)

const (
	validToken = "valid-session-token"
	csrfToken  = "the-csrf-token"
)

// oneSession is a middleware.SessionReader that knows exactly one session.
type oneSession struct{}

func (oneSession) Session(token string) (domain.Session, bool) {
	if token != validToken {
		return domain.Session{}, false
	}
	return domain.Session{Token: validToken, CSRFToken: csrfToken, ExpiresAt: sessionExpiry}, true
}

// settingsSpy is a handler.SettingsService that returns canned values and records
// what it was asked to set.
type settingsSpy struct {
	enabled bool
	err     error
	set     []bool
}

func (s *settingsSpy) PublicViewEnabled(context.Context) (bool, error) { return s.enabled, s.err }

func (s *settingsSpy) SetPublicViewEnabled(_ context.Context, enabled bool) error {
	s.set = append(s.set, enabled)
	return s.err
}

// serviceSpy is a handler.ServiceService that returns canned values and records the
// inputs, list calls and deleted ids it was given.
type serviceSpy struct {
	view      domain.ServiceView
	views     []domain.ServiceView
	err       error
	inputs    []domain.ServiceInput
	listCalls int
	deleted   []string
}

func (s *serviceSpy) ListServices(context.Context) ([]domain.ServiceView, error) {
	s.listCalls++
	return s.views, s.err
}

func (s *serviceSpy) DeleteService(_ context.Context, id string) error {
	s.deleted = append(s.deleted, id)
	return s.err
}

func (s *serviceSpy) CreateService(_ context.Context, input domain.ServiceInput) (domain.ServiceView, error) {
	s.inputs = append(s.inputs, input)
	return s.view, s.err
}

// authSpy is a handler.AuthService that returns canned values and records its calls.
type authSpy struct {
	session domain.Session
	err     error

	signIns  []signInCall
	signOuts []string
}

type signInCall struct {
	username, password string
	https              bool
}

func (a *authSpy) SignIn(_ context.Context, username, password string, https bool) (domain.Session, error) {
	a.signIns = append(a.signIns, signInCall{username, password, https})
	return a.session, a.err
}

func (a *authSpy) SignOut(_ context.Context, token string) error {
	a.signOuts = append(a.signOuts, token)
	return a.err
}

type routerOptions struct {
	settings        handler.SettingsService
	services        handler.ServiceService
	auth            handler.AuthService
	requireHTTPS    bool
	logOutput       io.Writer
	maxRequestBytes int
	trustProxy      bool
	clientIPHeader  string
	web             echo.HandlerFunc
}

func newRouter(t *testing.T, opts routerOptions) *echo.Echo {
	t.Helper()
	if opts.settings == nil {
		opts.settings = &settingsSpy{}
	}
	if opts.services == nil {
		opts.services = &serviceSpy{}
	}
	if opts.auth == nil {
		opts.auth = &authSpy{}
	}
	if opts.logOutput == nil {
		opts.logOutput = io.Discard
	}
	log := slog.New(slog.NewTextHandler(opts.logOutput, nil))
	if opts.maxRequestBytes == 0 {
		opts.maxRequestBytes = 1 << 20
	}
	if opts.clientIPHeader == "" {
		opts.clientIPHeader = "X-Forwarded-For"
	}
	e, err := handler.NewRouter(handler.Deps{
		Server:          handler.NewServer(opts.settings, opts.services, opts.auth, log, opts.requireHTTPS),
		Sessions:        oneSession{},
		Log:             log,
		MaxRequestBytes: opts.maxRequestBytes,
		TrustProxy:      opts.trustProxy,
		ClientIPHeader:  opts.clientIPHeader,
		Web:             opts.web,
	})
	require.NoError(t, err)
	return e
}

type requestOption func(*http.Request)

func withSession(r *http.Request) {
	r.AddCookie(&http.Cookie{Name: middleware.SessionCookie, Value: validToken})
}

func withCSRF(r *http.Request) { r.Header.Set(middleware.CSRFHeader, csrfToken) }

func withJSON(r *http.Request) { r.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON) }

func do(e *echo.Echo, method, target, body string, opts ...requestOption) *http.Response {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	for _, opt := range opts {
		opt(req)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec.Result()
}

// operation is one operation of docs/openapi.yaml, with a path a request can use.
type operation struct {
	id     string
	method string
	path   string
	public bool
}

func operations(t *testing.T) []operation {
	t.Helper()
	spec, err := api.GetSwagger()
	require.NoError(t, err)
	var ops []operation
	for path, item := range spec.Paths.Map() {
		for method, op := range item.Operations() {
			ops = append(ops, operation{
				// The generator capitalises operation ids in the embedded contract.
				id:     strings.ToLower(op.OperationID[:1]) + op.OperationID[1:],
				method: method,
				path:   strings.NewReplacer("{serviceId}", "a-service", "{targetId}", "a-target").Replace(path),
				public: op.Security != nil && len(*op.Security) == 0,
			})
		}
	}
	require.NotEmpty(t, ops)
	return ops
}

func sendsData(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

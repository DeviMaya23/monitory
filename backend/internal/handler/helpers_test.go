package handler_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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
	got       []string // ids given to GetService
	updatedID []string // ids given to UpdateService, its inputs are in inputs
	paused    []string // ids given to PauseService
	resumed   []string // ids given to ResumeService
}

func (s *serviceSpy) PauseService(_ context.Context, id string) (domain.ServiceView, error) {
	s.paused = append(s.paused, id)
	return s.view, s.err
}

func (s *serviceSpy) ResumeService(_ context.Context, id string) (domain.ServiceView, error) {
	s.resumed = append(s.resumed, id)
	return s.view, s.err
}

func (s *serviceSpy) GetService(_ context.Context, id string) (domain.ServiceView, error) {
	s.got = append(s.got, id)
	return s.view, s.err
}

func (s *serviceSpy) UpdateService(_ context.Context, id string, input domain.ServiceInput) (domain.ServiceView, error) {
	s.updatedID = append(s.updatedID, id)
	s.inputs = append(s.inputs, input)
	return s.view, s.err
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

// targetSpy is a handler.TargetService that returns canned values and records the
// ids and inputs it was given.
type targetSpy struct {
	target  domain.Target
	targets []domain.Target
	err     error

	listed  []string
	inputs  []domain.TargetInput
	updated []string // "serviceID/targetID"
	deleted []string // "serviceID/targetID"
}

func (s *targetSpy) ListTargets(_ context.Context, serviceID string) ([]domain.Target, error) {
	s.listed = append(s.listed, serviceID)
	return s.targets, s.err
}

func (s *targetSpy) CreateTarget(_ context.Context, _ string, input domain.TargetInput) (domain.Target, error) {
	s.inputs = append(s.inputs, input)
	return s.target, s.err
}

func (s *targetSpy) UpdateTarget(_ context.Context, serviceID, targetID string, input domain.TargetInput) (domain.Target, error) {
	s.updated = append(s.updated, serviceID+"/"+targetID)
	s.inputs = append(s.inputs, input)
	return s.target, s.err
}

func (s *targetSpy) DeleteTarget(_ context.Context, serviceID, targetID string) error {
	s.deleted = append(s.deleted, serviceID+"/"+targetID)
	return s.err
}

// testerSpy is a handler.TargetTester that returns a canned result or error and records
// the service ids and inputs it was given.
type testerSpy struct {
	result domain.TargetTestResult
	err    error

	serviceIDs []string
	inputs     []domain.TargetInput
}

func (s *testerSpy) TestTarget(_ context.Context, serviceID string, input domain.TargetInput) (domain.TargetTestResult, error) {
	s.serviceIDs = append(s.serviceIDs, serviceID)
	s.inputs = append(s.inputs, input)
	return s.result, s.err
}

// checkTesterSpy is a handler.ServiceCheckTester that returns a canned result or error
// and records the inputs it was given.
type checkTesterSpy struct {
	result domain.ServiceTestResult
	err    error

	inputs []domain.ServiceTestInput
}

func (s *checkTesterSpy) TestServiceCheck(_ context.Context, input domain.ServiceTestInput) (domain.ServiceTestResult, error) {
	s.inputs = append(s.inputs, input)
	return s.result, s.err
}

type routerOptions struct {
	settings        handler.SettingsService
	services        handler.ServiceService
	targets         handler.TargetService
	tester          handler.TargetTester
	checkTester     handler.ServiceCheckTester
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
	if opts.targets == nil {
		opts.targets = &targetSpy{}
	}
	if opts.tester == nil {
		opts.tester = &testerSpy{result: domain.TargetTestResult{Delivered: true}}
	}
	if opts.checkTester == nil {
		opts.checkTester = &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true}}
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
		Server:          handler.NewServer(opts.settings, opts.services, opts.targets, opts.tester, opts.checkTester, opts.auth, log, opts.requireHTTPS),
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

// contractOperations reads the contract once per test binary run. Callers only range
// over the result.
var contractOperations = sync.OnceValues(func() ([]operation, error) {
	spec, err := api.GetSwagger()
	if err != nil {
		return nil, err
	}
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
	return ops, nil
})

func operations(t *testing.T) []operation {
	t.Helper()
	ops, err := contractOperations()
	require.NoError(t, err)
	require.NotEmpty(t, ops)
	return ops
}

func sendsData(method string) bool {
	return method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions
}

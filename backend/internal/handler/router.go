package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"monitory/internal/api"
	"monitory/internal/handler/middleware"
)

// Deps is everything the router needs.
type Deps struct {
	Server   api.StrictServerInterface
	Sessions middleware.SessionReader
	Log      *slog.Logger

	// MaxRequestBytes is the largest request the app accepts (FR-38).
	MaxRequestBytes int
	// TrustProxy and ClientIPHeader decide the scheme and client address of a request (FR-99).
	TrustProxy     bool
	ClientIPHeader string

	// Web serves every path that is not the API: the built frontend. Nil answers 404.
	Web echo.HandlerFunc
}

// NewRouter builds the Echo instance with every route registered.
func NewRouter(deps Deps) (*echo.Echo, error) {
	public, bodyRequired, err := operationRules()
	if err != nil {
		return nil, err
	}

	e := echo.New()
	e.HideBanner = true
	e.HidePort = true
	e.HTTPErrorHandler = NewErrorHandler(deps.Log)

	// Order matters. The scheme and client address are resolved first, for everything
	// after. The size limit comes next: a request that is too large is refused before
	// anything else is checked (FR-38). The limit is an exact byte count.
	e.Use(middleware.ResolveRequestInfo(deps.TrustProxy, deps.ClientIPHeader))
	e.Use(echomw.BodyLimit(fmt.Sprintf("%dB", deps.MaxRequestBytes)))

	router := policyRouter{
		echo:         e,
		public:       public,
		bodyRequired: bodyRequired,
		session:      middleware.RequireSession(deps.Sessions),
		csrf:         middleware.RequireCSRF(),
	}
	api.RegisterHandlers(router, api.NewStrictHandler(deps.Server, nil))

	// A path under the API that no operation matches is a 404 problem, never the app page.
	notFound := func(echo.Context) error { return echo.ErrNotFound }
	e.Any("/api", notFound)
	e.Any("/api/*", notFound)
	if deps.Web != nil {
		e.GET("/*", deps.Web)
	}
	return e, nil
}

// operationRules reads two rules per operation from docs/openapi.yaml, each keyed as
// "METHOD /echo/:path": the operations that declare `security: []` and so are public
// (every other operation is gated, so a new operation is gated unless the contract
// marks it public), and the operations whose request body is required.
func operationRules() (public, bodyRequired map[string]bool, err error) {
	rules, err := loadOperationRules()
	return rules.public, rules.bodyRequired, err
}

type rulesPair struct{ public, bodyRequired map[string]bool }

// loadOperationRules reads the contract once per process. The maps are read-only once
// built: policyRouter only reads them.
var loadOperationRules = sync.OnceValues(func() (rulesPair, error) {
	spec, err := api.GetSwagger()
	if err != nil {
		return rulesPair{}, fmt.Errorf("load the embedded contract: %w", err)
	}
	public, bodyRequired := map[string]bool{}, map[string]bool{}
	for path, item := range spec.Paths.Map() {
		for method, operation := range item.Operations() {
			key := routeKey(method, echoPath(path))
			if operation.Security != nil && len(*operation.Security) == 0 {
				public[key] = true
			}
			if operation.RequestBody != nil && operation.RequestBody.Value != nil && operation.RequestBody.Value.Required {
				bodyRequired[key] = true
			}
		}
	}
	return rulesPair{public: public, bodyRequired: bodyRequired}, nil
})

// echoPath turns a contract path (/services/{serviceId}) into Echo's (/services/:serviceId).
func echoPath(path string) string {
	return strings.NewReplacer("{", ":", "}", "").Replace(path)
}

func routeKey(method, path string) string {
	return method + " " + path
}

// policyRouter is the router the generated code registers its routes on. It is where
// the cross-cutting rules are applied, once, for every operation:
//   - the gate: the session is required unless the contract marks the operation public;
//   - the CSRF token on every gated operation that sends data (any method but GET, HEAD
//     and OPTIONS);
//   - the JSON content type on any request that has a body, and a body on every
//     operation whose contract requires one.
//
// Handlers therefore never check the session, the CSRF token, the content type or
// whether a body was sent.
type policyRouter struct {
	echo         *echo.Echo
	public       map[string]bool
	bodyRequired map[string]bool
	session      echo.MiddlewareFunc
	csrf         echo.MiddlewareFunc
}

func (p policyRouter) add(method, path string, h echo.HandlerFunc, extra []echo.MiddlewareFunc) *echo.Route {
	var mw []echo.MiddlewareFunc
	if !p.public[routeKey(method, path)] {
		mw = append(mw, p.session)
		switch method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			mw = append(mw, p.csrf)
		}
	}
	mw = append(mw, requireJSON)
	if p.bodyRequired[routeKey(method, path)] {
		mw = append(mw, requireBody)
	}
	mw = append(mw, extra...)
	return p.echo.Add(method, path, h, mw...)
}

// The methods below satisfy api.EchoRouter.

func (p policyRouter) CONNECT(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodConnect, path, h, m)
}

func (p policyRouter) DELETE(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodDelete, path, h, m)
}

func (p policyRouter) GET(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodGet, path, h, m)
}

func (p policyRouter) HEAD(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodHead, path, h, m)
}

func (p policyRouter) OPTIONS(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodOptions, path, h, m)
}

func (p policyRouter) PATCH(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPatch, path, h, m)
}

func (p policyRouter) POST(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPost, path, h, m)
}

func (p policyRouter) PUT(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodPut, path, h, m)
}

func (p policyRouter) TRACE(path string, h echo.HandlerFunc, m ...echo.MiddlewareFunc) *echo.Route {
	return p.add(http.MethodTrace, path, h, m)
}

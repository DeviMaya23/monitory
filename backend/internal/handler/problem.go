package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/labstack/echo/v4"

	"monitory/internal/api"
	"monitory/internal/domain"
)

const problemContentType = "application/problem+json"

// ErrNotImplemented is returned by operations that have no implementation yet. It
// disappears once every operation is implemented.
var ErrNotImplemented = errors.New("not implemented")

// errMalformedRequest is a request whose body is missing or cannot be read as the
// contract's shape.
var errMalformedRequest = echo.NewHTTPError(http.StatusBadRequest)

// Codes that are not in docs/openapi.yaml. codeNotImplemented is the temporary one for
// stubs (CONVENTIONS.md, rule 2). codeInternalError is the code of the generic 500.
const (
	codeNotImplemented api.ProblemCode = "not_implemented"
	codeInternalError  api.ProblemCode = "internal_error"
)

// domainProblems maps domain errors to the error codes in docs/openapi.yaml. Add a row
// whenever a usecase gains a sentinel error; the code must exist in the contract.
var domainProblems = []struct {
	err    error
	status int
	code   api.ProblemCode
	title  string
}{
	{domain.ErrUnauthenticated, http.StatusUnauthorized, api.ProblemCodeUnauthenticated, "Sign-in required"},
	{domain.ErrCSRFFailed, http.StatusForbidden, api.ProblemCodeCsrfFailed, "Request not accepted"},
	{domain.ErrNotFound, http.StatusNotFound, api.ProblemCodeNotFound, "Not found"},
}

// NewErrorHandler returns Echo's error handler. Every error response is
// application/problem+json with a stable `code`; internal error text never reaches the
// client. Unexpected errors are logged.
func NewErrorHandler(log *slog.Logger) echo.HTTPErrorHandler {
	return func(err error, c echo.Context) {
		if c.Response().Committed {
			return
		}

		problem := problemFor(err)
		if problem.Status == http.StatusInternalServerError {
			log.Error("unexpected error", "error", err.Error(), "method", c.Request().Method, "route", c.Path())
		}

		body, marshalErr := json.Marshal(problem)
		if marshalErr != nil {
			log.Error("encode problem", "error", marshalErr.Error())
			_ = c.NoContent(http.StatusInternalServerError)
			return
		}
		_ = c.Blob(problem.Status, problemContentType, body)
	}
}

func problemFor(err error) api.Problem {
	for _, m := range domainProblems {
		if errors.Is(err, m.err) {
			return newProblem(m.status, m.code, m.title)
		}
	}
	if errors.Is(err, ErrNotImplemented) {
		return newProblem(http.StatusNotImplemented, codeNotImplemented, "Not implemented")
	}

	// Errors Echo and the generated code raise themselves: bad parameters, bad JSON,
	// unknown routes, oversized bodies.
	var httpErr *echo.HTTPError
	if errors.As(err, &httpErr) {
		switch httpErr.Code {
		case http.StatusBadRequest:
			return newProblem(http.StatusBadRequest, api.ProblemCodeMalformedRequest, "Malformed request")
		case http.StatusNotFound, http.StatusMethodNotAllowed:
			return newProblem(http.StatusNotFound, api.ProblemCodeNotFound, "Not found")
		case http.StatusUnsupportedMediaType:
			return newProblem(http.StatusUnsupportedMediaType, api.ProblemCodeUnsupportedMediaType, "Unsupported media type")
		case http.StatusRequestEntityTooLarge:
			return newProblem(http.StatusRequestEntityTooLarge, api.ProblemCodePayloadTooLarge, "Request too large")
		}
	}

	return newProblem(http.StatusInternalServerError, codeInternalError, "Internal server error")
}

func newProblem(status int, code api.ProblemCode, title string) api.Problem {
	return api.Problem{Title: title, Status: status, Code: code}
}

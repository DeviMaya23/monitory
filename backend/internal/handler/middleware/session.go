package middleware

import (
	"context"
	"crypto/subtle"

	"github.com/labstack/echo/v4"

	"monitory/internal/domain"
)

// SessionCookie is the name of the session cookie (docs/openapi.yaml, sessionCookie).
const SessionCookie = "session"

// CSRFHeader carries the session's CSRF token on gated requests that send data.
const CSRFHeader = "X-CSRF-Token"

// SessionReader finds the session a cookie value belongs to. It reports false for an
// unknown or expired one.
type SessionReader interface {
	Session(token string) (domain.Session, bool)
}

type sessionKey struct{}

// SessionFrom returns the session the gate found for this request.
func SessionFrom(ctx context.Context) (domain.Session, bool) {
	session, ok := ctx.Value(sessionKey{}).(domain.Session)
	return session, ok
}

// RequireSession is the gate (FR-4): without a valid session cookie the request is
// refused with domain.ErrUnauthenticated. There is no bypass.
func RequireSession(sessions SessionReader) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			cookie, err := c.Cookie(SessionCookie)
			if err != nil || cookie.Value == "" {
				return domain.ErrUnauthenticated
			}
			session, ok := sessions.Session(cookie.Value)
			if !ok {
				return domain.ErrUnauthenticated
			}
			req := c.Request()
			c.SetRequest(req.WithContext(context.WithValue(req.Context(), sessionKey{}, session)))
			return next(c)
		}
	}
}

// RequireCSRF refuses a request whose X-CSRF-Token header is not the session's token
// (NFR-8). It runs after RequireSession.
func RequireCSRF() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			session, ok := SessionFrom(c.Request().Context())
			if !ok {
				return domain.ErrUnauthenticated
			}
			sent := c.Request().Header.Get(CSRFHeader)
			if sent == "" || subtle.ConstantTimeCompare([]byte(sent), []byte(session.CSRFToken)) != 1 {
				return domain.ErrCSRFFailed
			}
			return next(c)
		}
	}
}

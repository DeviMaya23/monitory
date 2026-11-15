// Package middleware holds the HTTP middleware the policy router applies.
package middleware

import (
	"context"
	"net"
	"strings"

	"github.com/labstack/echo/v4"
)

// RequestInfo is what the app believes about where a request came from (FR-99).
type RequestInfo struct {
	HTTPS      bool   // the request arrived over HTTPS
	ClientAddr string // the address the public view's rate limit counts (FR-32)
}

type requestInfoKey struct{}

// RequestInfoFrom returns the RequestInfo the policy router resolved for this request.
func RequestInfoFrom(ctx context.Context) RequestInfo {
	info, _ := ctx.Value(requestInfoKey{}).(RequestInfo)
	return info
}

// ResolveRequestInfo works out the scheme and the client address of each request and
// puts them in the request context. It is the only reader of forwarding headers.
//
// With trustProxy off, every request counts as plain HTTP and the client address is
// the address that connected. With it on, the scheme comes from X-Forwarded-Proto and
// the client address from clientIPHeader: for a list (X-Forwarded-For) the last
// entry, which is the one the trusted proxy added.
func ResolveRequestInfo(trustProxy bool, clientIPHeader string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			req := c.Request()
			info := RequestInfo{ClientAddr: hostOf(req.RemoteAddr)}
			if trustProxy {
				info.HTTPS = strings.EqualFold(strings.TrimSpace(req.Header.Get("X-Forwarded-Proto")), "https")
				if forwarded := lastEntry(req.Header.Values(clientIPHeader)); forwarded != "" {
					info.ClientAddr = forwarded
				}
			}
			c.SetRequest(req.WithContext(context.WithValue(req.Context(), requestInfoKey{}, info)))
			return next(c)
		}
	}
}

// lastEntry returns the last non-empty comma-separated entry across the header's values.
func lastEntry(values []string) string {
	for i := len(values) - 1; i >= 0; i-- {
		parts := strings.Split(values[i], ",")
		for j := len(parts) - 1; j >= 0; j-- {
			if entry := strings.TrimSpace(parts[j]); entry != "" {
				return entry
			}
		}
	}
	return ""
}

// hostOf strips the port from a connection address.
func hostOf(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

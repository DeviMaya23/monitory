package handler

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

// requireJSON refuses, with 415, a request that has a body whose Content-Type is not
// application/json, before the generated code decodes it. The policy router applies it
// to every operation.
//
// Only the media type is compared, ignoring case; parameters such as `; charset=utf-8`
// are allowed. A request with no body is not checked. It runs after the gate, the CSRF
// check and the request size limit.
func requireJSON(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		req := c.Request()
		withBody, err := hasBody(req)
		if err != nil {
			return err // for example the size limit, which Echo answers as 413
		}
		if !withBody {
			return next(c)
		}
		if !isJSON(req.Header.Get(echo.HeaderContentType)) {
			return echo.NewHTTPError(http.StatusUnsupportedMediaType)
		}
		// Echo's binder compares the type case-sensitively; it was accepted, so hand it
		// the lower-case spelling.
		contentType := echo.MIMEApplicationJSON
		if _, params, found := strings.Cut(req.Header.Get(echo.HeaderContentType), ";"); found {
			contentType += ";" + params
		}
		req.Header.Set(echo.HeaderContentType, contentType)
		return next(c)
	}
}

// hasBody reports whether the request carries any body bytes. A declared length
// decides. For an undeclared one (chunked) it reads the body, which also applies the
// size limit before the media type is judged, and puts the bytes back.
func hasBody(req *http.Request) (bool, error) {
	switch {
	case req.Body == nil || req.Body == http.NoBody || req.ContentLength == 0:
		return false, nil
	case req.ContentLength > 0:
		return true, nil
	}
	raw, err := io.ReadAll(req.Body)
	if err != nil {
		return false, err
	}
	req.Body = io.NopCloser(bytes.NewReader(raw))
	return len(raw) > 0, nil
}

func isJSON(contentType string) bool {
	mediaType, _, _ := strings.Cut(contentType, ";")
	return strings.EqualFold(strings.TrimSpace(mediaType), echo.MIMEApplicationJSON)
}

// requireBody refuses, as malformed, a request with no body to an operation whose
// contract requires one. Without it the generated code would decode nothing and hand
// the handler an empty value. It runs after requireJSON.
func requireBody(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		withBody, err := hasBody(c.Request())
		if err != nil {
			return err
		}
		if !withBody {
			return errMalformedRequest
		}
		return next(c)
	}
}

package web_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/web"
)

func serve(t *testing.T, h echo.HandlerFunc, target string) *httptest.ResponseRecorder {
	t.Helper()
	e := echo.New()
	e.GET("/*", h)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func TestHandlerFor(t *testing.T) {
	dist := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app page</html>")},
		"assets/app.js": {Data: []byte("console.log('app')")},
	}
	h := web.HandlerFor(dist)

	tests := []struct {
		name     string
		target   string
		wantBody string
	}{
		{"the root is the app page", "/", "<html>app page</html>"},
		{"a built file is served as itself", "/assets/app.js", "console.log('app')"},
		{"an app route falls back to the app page", "/services/new", "<html>app page</html>"},
		{"a nested app route falls back to the app page", "/services/abc/alerts", "<html>app page</html>"},
		{"a directory is not a file", "/assets", "<html>app page</html>"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, h, tt.target)
			assert.Equal(t, http.StatusOK, rec.Code)
			assert.Equal(t, tt.wantBody, rec.Body.String())
		})
	}
}

func TestHandlerFor_PathCannotClimbOutOfTheBuild(t *testing.T) {
	dist := fstest.MapFS{"index.html": {Data: []byte("<html>app page</html>")}}

	rec := serve(t, web.HandlerFor(dist), "/../../etc/passwd")

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestHandlerFor_WithoutABuildServesThePlaceholder(t *testing.T) {
	rec := serve(t, web.HandlerFor(fstest.MapFS{".gitkeep": {}}), "/services/new")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "not built into this binary")
}

func TestHandler_EmbeddedBuildHasAnAppPage(t *testing.T) {
	h, err := web.Handler()
	require.NoError(t, err)

	rec := serve(t, h, "/")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Header().Get("Content-Type"), "text/html")
}

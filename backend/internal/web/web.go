// Package web embeds the built frontend and serves it.
//
// `npm run build` in frontend/ writes into dist/. Only dist/.gitkeep is committed, so
// the backend builds and its tests run without the frontend; such a binary serves a
// placeholder page.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/labstack/echo/v4"
)

//go:embed all:dist
var embedded embed.FS

// Handler serves the embedded frontend.
func Handler() (echo.HandlerFunc, error) {
	dist, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, err
	}
	return HandlerFor(dist), nil
}

// HandlerFor serves the files in dist: the file a path names if there is one, and
// otherwise the app page, so that a reload on any app route (/services/new) works.
func HandlerFor(dist fs.FS) echo.HandlerFunc {
	return func(c echo.Context) error {
		name := strings.TrimPrefix(path.Clean("/"+c.Request().URL.Path), "/")
		if name == "" || !isFile(dist, name) {
			// The app page is never cached: it names the current build's files.
			c.Response().Header().Set("Cache-Control", "no-cache")
			name = "index.html"
			if !isFile(dist, name) {
				return c.HTML(http.StatusOK, placeholderPage)
			}
		}
		http.ServeFileFS(c.Response(), c.Request(), dist, name)
		return nil
	}
}

// placeholderPage is served when the frontend was not built into the binary.
const placeholderPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Monitory</title>
  </head>
  <body>
    <p>The frontend is not built into this binary. Run <code>make build</code>.</p>
  </body>
</html>
`

func isFile(dist fs.FS, name string) bool {
	info, err := fs.Stat(dist, name)
	return err == nil && !info.IsDir()
}

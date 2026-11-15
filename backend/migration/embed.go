// Package migration holds the numbered SQL migration pairs, embedded in the binary
// and applied at startup by platform/migrate.
package migration

import "embed"

// Files is every .sql file in this directory.
//
//go:embed *.sql
var Files embed.FS

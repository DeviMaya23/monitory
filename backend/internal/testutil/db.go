// Package testutil holds the helpers tests share: the test database and the
// contract-conformance check.
package testutil

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"monitory/internal/platform/database"
	"monitory/internal/platform/migrate"
	"monitory/migration"
)

// NewDB returns a SQLite database in the test's own temp directory with every
// migration applied. Each test gets its own file; it is closed and removed when the
// test ends.
func NewDB(t *testing.T) *gorm.DB {
	t.Helper()
	return OpenDB(t, filepath.Join(t.TempDir(), "test.db"))
}

// OpenDB opens the SQLite file at path and applies every migration. A test that
// proves data survives a restart closes the database with CloseDB and calls OpenDB
// again on the same path.
func OpenDB(t *testing.T, path string) *gorm.DB {
	t.Helper()
	db, err := database.Open(path)
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, migrate.Up(sqlDB, migration.Files))
	return db
}

// CloseDB closes db, as a stop of the app does.
func CloseDB(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
}

package database_test

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/platform/database"
)

func TestOpen_CreatesTheDirectoryAndAppliesTheConnectionSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "dir", "monitory.db")

	db, err := database.Open(path)
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	assert.FileExists(t, path)

	var foreignKeys, busyTimeout int
	var journalMode string
	require.NoError(t, db.Raw("PRAGMA foreign_keys").Scan(&foreignKeys).Error)
	require.NoError(t, db.Raw("PRAGMA journal_mode").Scan(&journalMode).Error)
	require.NoError(t, db.Raw("PRAGMA busy_timeout").Scan(&busyTimeout).Error)

	assert.Equal(t, 1, foreignKeys, "foreign keys are enforced")
	assert.Equal(t, "wal", journalMode)
	assert.Equal(t, 5000, busyTimeout)
}

// The settings must hold on every connection in the pool, not only the first.
func TestOpen_SettingsHoldOnEveryConnection(t *testing.T) {
	db, err := database.Open(filepath.Join(t.TempDir(), "monitory.db"))
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	ctx := t.Context()
	first, err := sqlDB.Conn(ctx)
	require.NoError(t, err)
	defer func() { _ = first.Close() }()
	second, err := sqlDB.Conn(ctx)
	require.NoError(t, err)
	defer func() { _ = second.Close() }()

	var foreignKeys int
	require.NoError(t, second.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys))
	assert.Equal(t, 1, foreignKeys)
}

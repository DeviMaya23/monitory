package migrate_test

import (
	"database/sql"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/platform/database"
	"monitory/internal/platform/migrate"
	"monitory/migration"
)

func openEmpty(t *testing.T) *sql.DB {
	t.Helper()
	db, err := database.Open(filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	return sqlDB
}

// tables lists the app's tables, leaving out golang-migrate's own.
func tables(t *testing.T, db *sql.DB) []string {
	t.Helper()
	rows, err := db.Query(`SELECT name FROM sqlite_master
		WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name`)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()
	var names []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		names = append(names, name)
	}
	require.NoError(t, rows.Err())
	return names
}

func TestUp_AppliesEveryMigrationToAnEmptyFile(t *testing.T) {
	db := openEmpty(t)

	require.NoError(t, migrate.Up(db, migration.Files))

	assert.Equal(t, []string{"app_settings", "service_states", "services", "targets"}, tables(t, db))
	version, err := migrate.Version(db)
	require.NoError(t, err)
	assert.Positive(t, version)

	var settingsRows int
	require.NoError(t, db.QueryRow("SELECT COUNT(*) FROM app_settings").Scan(&settingsRows))
	assert.Equal(t, 1, settingsRows, "the one settings row is inserted by the migration")
}

func TestUp_IsANoOpWhenCurrent(t *testing.T) {
	db := openEmpty(t)
	require.NoError(t, migrate.Up(db, migration.Files))
	before, err := migrate.Version(db)
	require.NoError(t, err)

	require.NoError(t, migrate.Up(db, migration.Files))

	after, err := migrate.Version(db)
	require.NoError(t, err)
	assert.Equal(t, before, after)
}

func TestDown_ReversesEveryMigration(t *testing.T) {
	db := openEmpty(t)
	require.NoError(t, migrate.Up(db, migration.Files))

	require.NoError(t, migrate.Down(db, migration.Files))

	assert.Empty(t, tables(t, db), "every down file drops what its up file made")
	version, err := migrate.Version(db)
	require.NoError(t, err)
	assert.Zero(t, version)

	require.NoError(t, migrate.Up(db, migration.Files), "the migrations apply again after a full reverse")
}

// A migration that fails halfway leaves nothing of itself behind and stops the run.
func TestUp_FailedMigrationIsRolledBack(t *testing.T) {
	db := openEmpty(t)
	files := fstest.MapFS{
		"000001_ok.up.sql":       {Data: []byte("CREATE TABLE first (id INTEGER);")},
		"000001_ok.down.sql":     {Data: []byte("DROP TABLE first;")},
		"000002_broken.up.sql":   {Data: []byte("CREATE TABLE second (id INTEGER); THIS IS NOT SQL;")},
		"000002_broken.down.sql": {Data: []byte("DROP TABLE second;")},
	}

	err := migrate.Up(db, files)

	require.Error(t, err)
	assert.Equal(t, []string{"first"}, tables(t, db))
}

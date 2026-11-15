package repository_test

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/repository"
	"monitory/internal/testutil"
)

var at = time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)

func TestSettingsRepository_PublicViewIsOffOnANewDatabase(t *testing.T) {
	repo := repository.NewSettingsRepository(testutil.NewDB(t))

	enabled, err := repo.PublicViewEnabled(t.Context())

	require.NoError(t, err)
	assert.False(t, enabled, "FR-26: off by default")
}

func TestSettingsRepository_SetPublicViewEnabled(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewSettingsRepository(db)

	require.NoError(t, repo.SetPublicViewEnabled(t.Context(), true, at))

	var stored domain.AppSettings
	require.NoError(t, db.First(&stored, domain.AppSettingsID).Error)
	assert.True(t, stored.PublicViewEnabled)
	assert.True(t, at.Equal(stored.UpdatedAt), "updated_at is the time given, got %s", stored.UpdatedAt)

	require.NoError(t, repo.SetPublicViewEnabled(t.Context(), false, at.Add(time.Minute)))
	enabled, err := repo.PublicViewEnabled(t.Context())
	require.NoError(t, err)
	assert.False(t, enabled)

	var rows int64
	require.NoError(t, db.Model(&domain.AppSettings{}).Count(&rows).Error)
	assert.EqualValues(t, 1, rows, "the setting is updated in place, never inserted")
}

// NFR-1: the setting is still there after the database is closed and reopened.
func TestSettingsRepository_SettingSurvivesAReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "monitory.db")
	db := testutil.OpenDB(t, path)
	require.NoError(t, repository.NewSettingsRepository(db).SetPublicViewEnabled(t.Context(), true, at))
	testutil.CloseDB(t, db)

	reopened := testutil.OpenDB(t, path)

	enabled, err := repository.NewSettingsRepository(reopened).PublicViewEnabled(t.Context())
	require.NoError(t, err)
	assert.True(t, enabled)
}

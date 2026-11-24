package repository_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"monitory/internal/domain"
	"monitory/internal/repository"
	"monitory/internal/testutil"
)

var publicChecked = time.Date(2026, 6, 7, 8, 9, 10, 0, time.UTC)

// seedPublic creates a service with the given public and paused flags and stored state.
func seedPublic(t *testing.T, db *gorm.DB, repo *repository.ServiceRepository, name string, shown, paused bool, status domain.Status, checked *time.Time) {
	t.Helper()
	service := httpService("id-"+name, name)
	service.ShownOnPublicView, service.Paused = shown, paused
	createAll(t, repo, service)
	setState(t, db, domain.ServiceState{ServiceID: service.ID, Status: status, LastCheckedAt: checked})
}

func TestServiceListPublic_ReturnsOnlyShownUnpausedCheckedServices(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	at := publicChecked
	seedPublic(t, db, repo, "shown-healthy", true, false, domain.StatusHealthy, &at)
	seedPublic(t, db, repo, "shown-unhealthy", true, false, domain.StatusUnhealthy, &at)
	seedPublic(t, db, repo, "shown-unchecked", true, false, domain.StatusNotYetChecked, nil)
	seedPublic(t, db, repo, "shown-paused", true, true, domain.StatusHealthy, &at)
	seedPublic(t, db, repo, "hidden-healthy", false, false, domain.StatusHealthy, &at)
	seedPublic(t, db, repo, "hidden-unhealthy", false, false, domain.StatusUnhealthy, &at)

	got, err := repo.ListPublic(t.Context())

	require.NoError(t, err)
	assert.Equal(t, []domain.PublicService{
		{Name: "shown-healthy", Status: domain.StatusHealthy, LastCheckedAt: publicChecked},
		{Name: "shown-unhealthy", Status: domain.StatusUnhealthy, LastCheckedAt: publicChecked},
	}, got)
}

func TestServiceListPublic_OrdersByNameIgnoringCase(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	at := publicChecked
	for _, name := range []string{"Zulu", "alpha", "Bravo"} {
		seedPublic(t, db, repo, name, true, false, domain.StatusHealthy, &at)
	}

	got, err := repo.ListPublic(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 3)
	assert.Equal(t, []string{"alpha", "Bravo", "Zulu"}, []string{got[0].Name, got[1].Name, got[2].Name})
}

func TestServiceListPublic_ReturnsTheStoredValuesInUTC(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	local := time.FixedZone("UTC+3", 3*3600)
	at := time.Date(2026, 7, 8, 9, 10, 11, 0, local)
	seedPublic(t, db, repo, "Web", true, false, domain.StatusUnhealthy, &at)

	got, err := repo.ListPublic(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "Web", got[0].Name)
	assert.Equal(t, domain.StatusUnhealthy, got[0].Status)
	assert.True(t, at.Equal(got[0].LastCheckedAt))
	assert.Equal(t, time.UTC, got[0].LastCheckedAt.Location())
}

func TestServiceListPublic_HealthyWithoutACheckTimeIsNotReturned(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	at := publicChecked
	seedPublic(t, db, repo, "baseline", true, false, domain.StatusHealthy, &at)
	seedPublic(t, db, repo, "no-time", true, false, domain.StatusHealthy, nil)

	got, err := repo.ListPublic(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "baseline", got[0].Name)
}

func TestServiceListPublic_NothingQualifyingIsAnEmptyNonNilSlice(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)

	empty, err := repo.ListPublic(t.Context())
	require.NoError(t, err)
	assert.NotNil(t, empty)
	assert.Empty(t, empty)

	at := publicChecked
	seedPublic(t, db, repo, "hidden", false, false, domain.StatusHealthy, &at)
	none, err := repo.ListPublic(t.Context())
	require.NoError(t, err)
	assert.NotNil(t, none)
	assert.Empty(t, none)
}

// A status that is not healthy or unhealthy is not shown, even with a check time stored.
func TestServiceListPublic_NotYetCheckedWithACheckTimeIsNotReturned(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	at := publicChecked
	seedPublic(t, db, repo, "baseline", true, false, domain.StatusHealthy, &at)
	seedPublic(t, db, repo, "odd-state", true, false, domain.StatusNotYetChecked, &at)

	got, err := repo.ListPublic(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "baseline", got[0].Name)
}

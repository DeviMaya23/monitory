package repository_test

import (
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"monitory/internal/domain"
	"monitory/internal/repository"
	"monitory/internal/testutil"
)

func newStateFixture(t *testing.T, id string) (*gorm.DB, *repository.ServiceStateRepository) {
	t.Helper()
	db := testutil.NewDB(t)
	require.NoError(t, repository.NewServiceRepository(db).Create(t.Context(), httpService(id, "svc-"+id), noLimit))
	return db, repository.NewServiceStateRepository(db)
}

func readState(t *testing.T, db *gorm.DB, id string) domain.ServiceState {
	t.Helper()
	var s domain.ServiceState
	require.NoError(t, db.Where("service_id = ?", id).Take(&s).Error)
	return s
}

func unhealthyState(id string, at time.Time) domain.ServiceState {
	return domain.ServiceState{
		ServiceID: id, Status: domain.StatusUnhealthy,
		LastCheckedAt: &at, LastStatusChangeAt: &at,
		FailureCode:          ptr(domain.FailureNon2xxStatus),
		FailureHTTPStatus:    ptr(503),
		FailureJSONRuleField: ptr("$.status"),
	}
}

func replaceWith(s domain.ServiceState) func(domain.ServiceState) domain.ServiceState {
	return func(domain.ServiceState) domain.ServiceState { return s }
}

func TestServiceStateUpdate_WritesEveryColumn(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	zone := time.FixedZone("x", 5*3600)
	checked := time.Date(2026, 6, 1, 12, 0, 0, 0, zone)
	changed := time.Date(2026, 6, 1, 11, 0, 0, 0, zone)
	want := unhealthyState("s1", checked)
	want.LastStatusChangeAt = &changed

	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(want)))

	got := readState(t, db, "s1")
	assert.Equal(t, domain.StatusUnhealthy, got.Status)
	require.NotNil(t, got.LastCheckedAt)
	require.NotNil(t, got.LastStatusChangeAt)
	assert.True(t, checked.Equal(*got.LastCheckedAt))
	assert.True(t, changed.Equal(*got.LastStatusChangeAt))
	assert.Equal(t, time.UTC, got.LastCheckedAt.Location())
	assert.Equal(t, time.UTC, got.LastStatusChangeAt.Location())
	assert.Equal(t, want.FailureCode, got.FailureCode)
	assert.Equal(t, want.FailureHTTPStatus, got.FailureHTTPStatus)
	assert.Equal(t, want.FailureJSONRuleField, got.FailureJSONRuleField)
}

func TestServiceStateUpdate_ClearsFailureColumns(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(unhealthyState("s1", at))))

	later := at.Add(time.Minute)
	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(domain.ServiceState{
		ServiceID: "s1", Status: domain.StatusHealthy, LastCheckedAt: &later, LastStatusChangeAt: &later,
	})))

	got := readState(t, db, "s1")
	assert.Equal(t, domain.StatusHealthy, got.Status)
	assert.Nil(t, got.FailureCode)
	assert.Nil(t, got.FailureHTTPStatus)
	assert.Nil(t, got.FailureJSONRuleField)
}

func TestServiceStateUpdate_ApplySeesStoredRow(t *testing.T) {
	_, repo := newStateFixture(t, "s1")
	var seen []domain.ServiceState
	record := func(s domain.ServiceState) domain.ServiceState {
		seen = append(seen, s)
		at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
		return unhealthyState("s1", at)
	}

	require.NoError(t, repo.Update(t.Context(), "s1", record))
	require.NoError(t, repo.Update(t.Context(), "s1", record))

	require.Len(t, seen, 2)
	assert.Equal(t, "s1", seen[0].ServiceID)
	assert.Equal(t, domain.StatusNotYetChecked, seen[0].Status)
	assert.Nil(t, seen[0].LastCheckedAt)
	assert.Equal(t, domain.StatusUnhealthy, seen[1].Status)
	require.NotNil(t, seen[1].FailureCode)
	assert.Equal(t, domain.FailureNon2xxStatus, *seen[1].FailureCode)
	assert.Equal(t, ptr(503), seen[1].FailureHTTPStatus)
	require.NotNil(t, seen[1].LastCheckedAt)
	assert.Equal(t, time.UTC, seen[1].LastCheckedAt.Location())
}

func TestServiceStateUpdate_MissingRow(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	before := count(t, db, &domain.ServiceState{})
	called := false

	err := repo.Update(t.Context(), "nope", func(s domain.ServiceState) domain.ServiceState {
		called = true
		return s
	})

	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.False(t, called)
	assert.Equal(t, before, count(t, db, &domain.ServiceState{}))
}

func TestServiceStateUpdate_AfterServiceDeleted(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	require.NoError(t, db.Exec("DELETE FROM services WHERE id = ?", "s1").Error)
	require.Zero(t, count(t, db, &domain.ServiceState{}))

	err := repo.Update(t.Context(), "s1", replaceWith(unhealthyState("s1", time.Now())))

	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.Zero(t, count(t, db, &domain.ServiceState{}))
}

func TestServiceStateUpdate_ZeroStateRefused(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(unhealthyState("s1", at))))
	before := readState(t, db, "s1")

	err := repo.Update(t.Context(), "s1", replaceWith(domain.ServiceState{}))

	require.Error(t, err)
	assert.Equal(t, before, readState(t, db, "s1"))
}

func TestServiceStateUpdate_KeepsServiceID(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	require.NoError(t, repository.NewServiceRepository(db).Create(t.Context(), httpService("s2", "svc-s2"), noLimit))
	at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)

	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(unhealthyState("s2", at))))
	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(unhealthyState("ghost", at))))

	assert.EqualValues(t, 2, count(t, db, &domain.ServiceState{}))
	assert.Equal(t, domain.StatusUnhealthy, readState(t, db, "s1").Status)
	assert.Equal(t, domain.StatusNotYetChecked, readState(t, db, "s2").Status)
}

func TestServiceStateUpdate_ConstraintRefused(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	require.NoError(t, repo.Update(t.Context(), "s1", replaceWith(unhealthyState("s1", at))))
	before := readState(t, db, "s1")

	bad := domain.ServiceState{
		ServiceID: "s1", Status: domain.StatusHealthy, LastCheckedAt: &at,
		FailureCode: ptr(domain.FailureTimedOut),
	}
	err := repo.Update(t.Context(), "s1", replaceWith(bad))

	require.Error(t, err)
	assert.Equal(t, before, readState(t, db, "s1"))
}

func TestServiceStateUpdate_SurvivesReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.db")
	db := testutil.OpenDB(t, path)
	require.NoError(t, repository.NewServiceRepository(db).Create(t.Context(), httpService("s1", "svc"), noLimit))
	at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	want := unhealthyState("s1", at)
	require.NoError(t, repository.NewServiceStateRepository(db).Update(t.Context(), "s1", replaceWith(want)))

	testutil.CloseDB(t, db)
	reopened := testutil.OpenDB(t, path)

	got := readState(t, reopened, "s1")
	assert.Equal(t, domain.StatusUnhealthy, got.Status)
	assert.True(t, at.Equal(*got.LastCheckedAt))
	assert.Equal(t, want.FailureCode, got.FailureCode)
	assert.Equal(t, want.FailureHTTPStatus, got.FailureHTTPStatus)
	assert.Equal(t, want.FailureJSONRuleField, got.FailureJSONRuleField)
}

func TestServiceStateUpdate_ConcurrentUpdatesDoNotLoseWrites(t *testing.T) {
	db, repo := newStateFixture(t, "s1")
	const n = 20
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			assert.NoError(t, repo.Update(t.Context(), "s1", func(s domain.ServiceState) domain.ServiceState {
				at := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
				if s.FailureHTTPStatus == nil {
					s.FailureHTTPStatus = ptr(0)
				}
				*s.FailureHTTPStatus++
				s.Status, s.FailureCode, s.LastCheckedAt = domain.StatusUnhealthy, ptr(domain.FailureNon2xxStatus), &at
				return s
			}))
		}()
	}
	wg.Wait()

	assert.Equal(t, ptr(n), readState(t, db, "s1").FailureHTTPStatus)
}

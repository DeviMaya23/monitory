package repository_test

import (
	"fmt"
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

var targetTime = time.Date(2026, 6, 7, 8, 9, 10, 0, time.UTC)

func emailTarget(id, serviceID, address string) domain.Target {
	return domain.Target{
		ID: id, ServiceID: serviceID, Name: "On call",
		Type: domain.TargetTypeEmail, Value: address,
		ValueKey:  domain.TargetValueKey(domain.TargetTypeEmail, address),
		Headers:   []domain.NameValue{},
		CreatedAt: targetTime, UpdatedAt: targetTime,
	}
}

func webhookTarget(id, serviceID, url string) domain.Target {
	return domain.Target{
		ID: id, ServiceID: serviceID,
		Type: domain.TargetTypeWebhook, Value: url,
		ValueKey:  domain.TargetValueKey(domain.TargetTypeWebhook, url),
		Headers:   []domain.NameValue{{Name: "Z-Last", Value: "1"}, {Name: "A-First", Value: ""}},
		CreatedAt: targetTime, UpdatedAt: targetTime,
	}
}

// targetFixture is a database with services s1 and s2.
func targetFixture(t *testing.T) (*gorm.DB, *repository.TargetRepository) {
	t.Helper()
	db := testutil.NewDB(t)
	createAll(t, repository.NewServiceRepository(db), httpService("s1", "one"), httpService("s2", "two"))
	return db, repository.NewTargetRepository(db)
}

func insertTarget(t *testing.T, db *gorm.DB, target domain.Target) {
	t.Helper()
	require.NoError(t, db.Create(&target).Error)
}

func TestTargetRepository_List(t *testing.T) {
	t.Run("only the service's targets, by created_at then id, with every field", func(t *testing.T) {
		db, repo := targetFixture(t)
		later := targetTime.Add(time.Hour)
		a := webhookTarget("a", "s1", "https://a")
		a.LastDeliveryFailed = true
		b := emailTarget("b", "s1", "b@x.io")
		c := emailTarget("c", "s1", "c@x.io")
		early := emailTarget("z", "s1", "z@x.io")
		early.CreatedAt = targetTime.Add(-time.Hour)
		late := emailTarget("d", "s1", "d@x.io")
		late.CreatedAt = later
		other := emailTarget("o", "s2", "o@x.io")
		for _, tg := range []domain.Target{late, c, other, b, a, early} {
			insertTarget(t, db, tg)
		}

		got, err := repo.List(t.Context(), "s1")

		require.NoError(t, err)
		require.Len(t, got, 5)
		assert.Equal(t, []string{"z", "a", "b", "c", "d"}, []string{got[0].ID, got[1].ID, got[2].ID, got[3].ID, got[4].ID})
		assert.Equal(t, a, got[1], "every field comes back, headers in the order sent")
		assert.True(t, got[1].LastDeliveryFailed)
		assert.False(t, got[2].LastDeliveryFailed)
		assert.Equal(t, []domain.NameValue{}, got[2].Headers)
	})
	t.Run("a service with no targets is an empty list", func(t *testing.T) {
		_, repo := targetFixture(t)
		got, err := repo.List(t.Context(), "s1")
		require.NoError(t, err)
		assert.NotNil(t, got)
		assert.Empty(t, got)
	})
	t.Run("an unknown service is ErrNotFound", func(t *testing.T) {
		_, repo := targetFixture(t)
		_, err := repo.List(t.Context(), "nope")
		require.ErrorIs(t, err, domain.ErrNotFound)
	})
}

func TestTargetRepository_Create(t *testing.T) {
	t.Run("saves an email and a webhook with headers unchanged", func(t *testing.T) {
		_, repo := targetFixture(t)
		email, hook := emailTarget("e", "s1", "Oncall@Example.com"), webhookTarget("w", "s1", "https://hook")
		hook.CreatedAt = targetTime.Add(time.Second)
		require.NoError(t, repo.Create(t.Context(), email, 5))
		require.NoError(t, repo.Create(t.Context(), hook, 5))

		got, err := repo.List(t.Context(), "s1")
		require.NoError(t, err)
		assert.Equal(t, []domain.Target{email, hook}, got)
	})
	t.Run("an unknown service is ErrNotFound and writes nothing", func(t *testing.T) {
		db, repo := targetFixture(t)
		err := repo.Create(t.Context(), emailTarget("e", "nope", "a@x.io"), 5)
		require.ErrorIs(t, err, domain.ErrNotFound)
		assert.Zero(t, count(t, db, &domain.Target{}))
	})
}

func TestTargetRepository_CreateCap(t *testing.T) {
	seed := func(t *testing.T, repo *repository.TargetRepository, serviceID string, n int) {
		t.Helper()
		for i := range n {
			require.NoError(t, repo.Create(t.Context(), emailTarget(fmt.Sprintf("%s-%d", serviceID, i), serviceID, fmt.Sprintf("u%d@x.io", i)), 3))
		}
	}
	t.Run("a fourth target at a limit of 3 is ErrAlertListFull", func(t *testing.T) {
		db, repo := targetFixture(t)
		seed(t, repo, "s1", 3)
		err := repo.Create(t.Context(), emailTarget("extra", "s1", "extra@x.io"), 3)
		require.ErrorIs(t, err, domain.ErrAlertListFull)
		assert.EqualValues(t, 3, count(t, db, &domain.Target{}))
	})
	t.Run("the third is saved at a limit of 3", func(t *testing.T) {
		db, repo := targetFixture(t)
		seed(t, repo, "s1", 2)
		require.NoError(t, repo.Create(t.Context(), emailTarget("third", "s1", "third@x.io"), 3))
		assert.EqualValues(t, 3, count(t, db, &domain.Target{}))
	})
	t.Run("a duplicate sent to a full list is ErrAlertListFull", func(t *testing.T) {
		_, repo := targetFixture(t)
		seed(t, repo, "s1", 3)
		err := repo.Create(t.Context(), emailTarget("dup", "s1", "u0@x.io"), 3)
		require.ErrorIs(t, err, domain.ErrAlertListFull)
		assert.NotErrorIs(t, err, domain.ErrTargetDuplicate)
	})
	t.Run("another service's targets are not counted", func(t *testing.T) {
		_, repo := targetFixture(t)
		seed(t, repo, "s2", 3)
		require.NoError(t, repo.Create(t.Context(), emailTarget("mine", "s1", "mine@x.io"), 3))
	})
}

func TestTargetRepository_CreateDuplicate(t *testing.T) {
	t.Run("the same type and value", func(t *testing.T) {
		_, repo := targetFixture(t)
		require.NoError(t, repo.Create(t.Context(), webhookTarget("a", "s1", "https://hook"), 5))
		err := repo.Create(t.Context(), webhookTarget("b", "s1", "https://hook"), 5)
		require.ErrorIs(t, err, domain.ErrTargetDuplicate)
	})
	t.Run("the same address in another case", func(t *testing.T) {
		_, repo := targetFixture(t)
		require.NoError(t, repo.Create(t.Context(), emailTarget("a", "s1", "a@x.io"), 5))
		err := repo.Create(t.Context(), emailTarget("b", "s1", "A@X.IO"), 5)
		require.ErrorIs(t, err, domain.ErrTargetDuplicate)
	})
	t.Run("the same URL in another case is not a duplicate", func(t *testing.T) {
		_, repo := targetFixture(t)
		require.NoError(t, repo.Create(t.Context(), webhookTarget("a", "s1", "https://hook/a"), 5))
		require.NoError(t, repo.Create(t.Context(), webhookTarget("b", "s1", "https://hook/A"), 5))
	})
	t.Run("an email and a webhook with the same text are two contacts", func(t *testing.T) {
		_, repo := targetFixture(t)
		require.NoError(t, repo.Create(t.Context(), emailTarget("a", "s1", "a@x.io"), 5))
		hook := webhookTarget("b", "s1", "a@x.io")
		require.NoError(t, repo.Create(t.Context(), hook, 5))
	})
	t.Run("the same contact on another service", func(t *testing.T) {
		_, repo := targetFixture(t)
		require.NoError(t, repo.Create(t.Context(), emailTarget("a", "s1", "a@x.io"), 5))
		require.NoError(t, repo.Create(t.Context(), emailTarget("b", "s2", "a@x.io"), 5))
	})
}

func TestTargetRepository_ConcurrentCreate(t *testing.T) {
	run := func(n int, create func(i int) error) []error {
		errs := make([]error, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs[i] = create(i)
			}()
		}
		wg.Wait()
		return errs
	}
	tally := func(t *testing.T, errs []error, sentinel error) (ok, refused int) {
		t.Helper()
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case assert.ErrorIs(t, err, sentinel):
				refused++
			}
		}
		return ok, refused
	}

	t.Run("different contacts at one below the limit leave exactly the limit", func(t *testing.T) {
		db, repo := targetFixture(t)
		for i := range 2 {
			require.NoError(t, repo.Create(t.Context(), emailTarget(fmt.Sprintf("seed-%d", i), "s1", fmt.Sprintf("seed%d@x.io", i)), 3))
		}
		errs := run(10, func(i int) error {
			return repo.Create(t.Context(), emailTarget(fmt.Sprintf("id-%d", i), "s1", fmt.Sprintf("n%d@x.io", i)), 3)
		})
		ok, refused := tally(t, errs, domain.ErrAlertListFull)
		assert.Equal(t, 1, ok)
		assert.Equal(t, 9, refused)
		assert.EqualValues(t, 3, count(t, db, &domain.Target{}))
	})
	t.Run("the same contact leaves one row", func(t *testing.T) {
		db, repo := targetFixture(t)
		errs := run(10, func(i int) error {
			return repo.Create(t.Context(), emailTarget(fmt.Sprintf("id-%d", i), "s1", "same@x.io"), 5)
		})
		ok, refused := tally(t, errs, domain.ErrTargetDuplicate)
		assert.Equal(t, 1, ok)
		assert.Equal(t, 9, refused)
		assert.EqualValues(t, 1, count(t, db, &domain.Target{}))
	})
}

func TestTargetRepository_Update(t *testing.T) {
	stored := func() domain.Target {
		tg := emailTarget("t1", "s1", "old@x.io")
		tg.LastDeliveryFailed = true
		return tg
	}
	t.Run("replaces the editable fields, keeps the rest, returns the stored row", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, stored())
		edit := webhookTarget("t1", "s1", "https://new")
		edit.Name = "Pager"
		edit.UpdatedAt = targetTime.Add(time.Hour)
		edit.CreatedAt = time.Time{}

		got, err := repo.Update(t.Context(), edit)

		require.NoError(t, err)
		want := edit
		want.CreatedAt = targetTime
		want.LastDeliveryFailed = true
		assert.Equal(t, want, got)
		list, err := repo.List(t.Context(), "s1")
		require.NoError(t, err)
		assert.Equal(t, []domain.Target{want}, list)
	})
	t.Run("a webhook can become an email with no headers", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, webhookTarget("t1", "s1", "https://h"))
		edit := emailTarget("t1", "s1", "a@x.io")
		got, err := repo.Update(t.Context(), edit)
		require.NoError(t, err)
		assert.Equal(t, domain.TargetTypeEmail, got.Type)
		assert.Equal(t, []domain.NameValue{}, got.Headers)
	})
	t.Run("unknown target, other service's target and unknown service are ErrNotFound", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, stored())
		for name, edit := range map[string]domain.Target{
			"unknown target":  emailTarget("zzz", "s1", "x@x.io"),
			"other service":   emailTarget("t1", "s2", "x@x.io"),
			"unknown service": emailTarget("t1", "nope", "x@x.io"),
		} {
			_, err := repo.Update(t.Context(), edit)
			require.ErrorIs(t, err, domain.ErrNotFound, name)
		}
		list, err := repo.List(t.Context(), "s1")
		require.NoError(t, err)
		assert.Equal(t, []domain.Target{stored()}, list)
	})
	t.Run("a contact already in the list is ErrTargetDuplicate and the row is unchanged", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, stored())
		insertTarget(t, db, emailTarget("t2", "s1", "taken@x.io"))
		_, err := repo.Update(t.Context(), emailTarget("t1", "s1", "TAKEN@x.io"))
		require.ErrorIs(t, err, domain.ErrTargetDuplicate)
		var row domain.Target
		require.NoError(t, db.First(&row, "id = ?", "t1").Error)
		assert.Equal(t, "old@x.io", row.Value)
	})
	t.Run("the target's own contact, or another case of it, is not a duplicate", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, stored())
		_, err := repo.Update(t.Context(), emailTarget("t1", "s1", "old@x.io"))
		require.NoError(t, err)
		got, err := repo.Update(t.Context(), emailTarget("t1", "s1", "OLD@x.io"))
		require.NoError(t, err)
		assert.Equal(t, "OLD@x.io", got.Value)
	})
}

func TestTargetRepository_Delete(t *testing.T) {
	t.Run("removes one row and leaves the others; the same id twice is nil then ErrNotFound", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, emailTarget("t1", "s1", "a@x.io"))
		insertTarget(t, db, emailTarget("t2", "s1", "b@x.io"))
		require.NoError(t, repo.Delete(t.Context(), "s1", "t1"))
		require.ErrorIs(t, repo.Delete(t.Context(), "s1", "t1"), domain.ErrNotFound)
		list, err := repo.List(t.Context(), "s1")
		require.NoError(t, err)
		require.Len(t, list, 1)
		assert.Equal(t, "t2", list[0].ID)
	})
	t.Run("a target id with another service's id is ErrNotFound and the row stays", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, emailTarget("t1", "s1", "a@x.io"))
		require.ErrorIs(t, repo.Delete(t.Context(), "s2", "t1"), domain.ErrNotFound)
		assert.EqualValues(t, 1, count(t, db, &domain.Target{}))
	})
	t.Run("concurrent deletes of one id leave one success", func(t *testing.T) {
		db, repo := targetFixture(t)
		insertTarget(t, db, emailTarget("t1", "s1", "a@x.io"))
		const n = 10
		errs := make([]error, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs[i] = repo.Delete(t.Context(), "s1", "t1")
			}()
		}
		wg.Wait()
		var ok, notFound int
		for _, err := range errs {
			switch {
			case err == nil:
				ok++
			case assert.ErrorIs(t, err, domain.ErrNotFound):
				notFound++
			}
		}
		assert.Equal(t, 1, ok)
		assert.Equal(t, n-1, notFound)
	})
}

func TestTargetRepository_ServiceDeleteRemovesItsTargets(t *testing.T) {
	db, _ := targetFixture(t)
	insertTarget(t, db, emailTarget("t1", "s1", "a@x.io"))
	insertTarget(t, db, webhookTarget("t2", "s1", "https://h"))
	require.NoError(t, repository.NewServiceRepository(db).Delete(t.Context(), "s1"))
	assert.Zero(t, count(t, db, &domain.Target{}))
}

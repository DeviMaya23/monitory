package repository_test

import (
	"fmt"
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

var serviceTime = time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)

const noLimit = 50

func ptr[T any](v T) *T { return &v }

func httpService(id, name string) domain.Service {
	return domain.Service{
		ID: id, Name: name, NameKey: domain.ServiceNameKey(name),
		CheckType:            domain.CheckTypeHTTP,
		HTTPMethod:           ptr("GET"),
		HTTPURL:              ptr("https://x"),
		HTTPQueryParams:      []domain.NameValue{},
		HTTPHeaders:          []domain.NameValue{},
		HTTPBodyType:         domain.BodyTypeNone,
		JSONRules:            []domain.JSONRule{},
		JSONRuleMode:         domain.JSONRuleModeAny,
		CheckIntervalSeconds: 60, TimeoutSeconds: 10, RetryCount: 1, RetryIntervalSeconds: 5,
		AlertsEnabled: true,
		CreatedAt:     serviceTime, UpdatedAt: serviceTime,
	}
}

func tcpService(id, name string) domain.Service {
	s := httpService(id, name)
	s.CheckType = domain.CheckTypeTCP
	s.HTTPMethod, s.HTTPURL = nil, nil
	s.TCPHost, s.TCPPort = ptr("db.local"), ptr(5432)
	return s
}

func count(t *testing.T, db *gorm.DB, model any) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Model(model).Count(&n).Error)
	return n
}

func readService(t *testing.T, db *gorm.DB, id string) domain.Service {
	t.Helper()
	var s domain.Service
	require.NoError(t, db.First(&s, "id = ?", id).Error)
	return s
}

func TestServiceCreate_RoundTripsEveryFieldOfAnHTTPService(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	want := httpService("id-1", "Full Service")
	want.HTTPMethod = ptr("PATCH")
	want.HTTPURL = ptr("https://x/y")
	want.HTTPQueryParams = []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}}
	want.HTTPHeaders = []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}}
	want.HTTPBodyType = domain.BodyTypeForm
	want.HTTPBodyContent = "k=v&é=ü"
	// A string "true" and a bool true are different values.
	want.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}, {Field: "x", FailingValue: false}}
	want.JSONRuleMode = domain.JSONRuleModeAll
	want.CertCheck, want.CertMinDaysLeft = true, ptr(14)
	want.IgnoreCertErrs = true
	want.CheckIntervalSeconds, want.TimeoutSeconds, want.RetryCount, want.RetryIntervalSeconds = 120, 5, 3, 4
	want.AlertsEnabled = false
	want.UnhealthyMessage, want.RecoveryMessage = "down", "up"
	want.ShownOnPublicView = true

	require.NoError(t, repo.Create(t.Context(), want, noLimit))

	got := readService(t, db, "id-1")
	assert.Equal(t, want.JSONRules, got.JSONRules)
	assert.IsType(t, "", got.JSONRules[0].FailingValue)
	assert.IsType(t, true, got.JSONRules[1].FailingValue)
	assert.True(t, want.CreatedAt.Equal(got.CreatedAt))
	assert.True(t, want.UpdatedAt.Equal(got.UpdatedAt))
	got.CreatedAt, got.UpdatedAt = want.CreatedAt, want.UpdatedAt
	assert.Equal(t, want, got)
}

func TestServiceCreate_RoundTripsATCPService(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	want := tcpService("id-1", "db")

	require.NoError(t, repo.Create(t.Context(), want, noLimit))

	got := readService(t, db, "id-1")
	assert.Equal(t, "db.local", *got.TCPHost)
	assert.Equal(t, 5432, *got.TCPPort)
	assert.Nil(t, got.HTTPMethod)
	assert.Nil(t, got.HTTPURL)
	assert.Equal(t, domain.BodyTypeNone, got.HTTPBodyType)
	assert.Equal(t, domain.JSONRuleModeAny, got.JSONRuleMode)
	assert.Equal(t, []domain.NameValue{}, got.HTTPHeaders)
}

func TestServiceCreate_WritesTheStateRowNotYetChecked(t *testing.T) {
	db := testutil.NewDB(t)
	require.NoError(t, repository.NewServiceRepository(db).Create(t.Context(), httpService("id-1", "api"), noLimit))

	var state domain.ServiceState
	require.NoError(t, db.First(&state, "service_id = ?", "id-1").Error)

	assert.Equal(t, domain.ServiceState{ServiceID: "id-1", Status: domain.StatusNotYetChecked}, state)
}

func TestServiceCreate_SurvivesReopeningTheDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "restart.db")
	db := testutil.OpenDB(t, path)
	require.NoError(t, repository.NewServiceRepository(db).Create(t.Context(), httpService("id-1", "api"), noLimit))
	testutil.CloseDB(t, db)

	reopened := testutil.OpenDB(t, path)

	assert.Equal(t, "api", readService(t, reopened, "id-1").Name)
	assert.EqualValues(t, 1, count(t, reopened, &domain.ServiceState{}))
}

func TestServiceCreate_NameClashIgnoresCaseButNotSpaces(t *testing.T) {
	cases := []struct {
		name, first, second string
		taken               bool
	}{
		{"ASCII case", "api", "API", true},
		{"Unicode case pair", "é", "É", true},
		{"trailing space is a different name", "api", "api ", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.NewDB(t)
			repo := repository.NewServiceRepository(db)
			require.NoError(t, repo.Create(t.Context(), httpService("id-1", tc.first), noLimit))

			err := repo.Create(t.Context(), httpService("id-2", tc.second), noLimit)

			if tc.taken {
				require.ErrorIs(t, err, domain.ErrServiceNameTaken)
				assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
				assert.EqualValues(t, 1, count(t, db, &domain.ServiceState{}), "no state row without a service")
			} else {
				require.NoError(t, err)
				assert.EqualValues(t, 2, count(t, db, &domain.Service{}))
				assert.EqualValues(t, 2, count(t, db, &domain.ServiceState{}))
			}
		})
	}
}

func TestServiceCreate_ServiceLimit(t *testing.T) {
	t.Run("a third service at a limit of two", func(t *testing.T) {
		db := testutil.NewDB(t)
		repo := repository.NewServiceRepository(db)
		require.NoError(t, repo.Create(t.Context(), httpService("id-1", "a"), 2))
		require.NoError(t, repo.Create(t.Context(), httpService("id-2", "b"), 2))

		err := repo.Create(t.Context(), httpService("id-3", "c"), 2)

		require.ErrorIs(t, err, domain.ErrServiceLimitReached)
		assert.EqualValues(t, 2, count(t, db, &domain.Service{}))
		assert.EqualValues(t, 2, count(t, db, &domain.ServiceState{}))
	})
	t.Run("a duplicate name at the limit is a limit error", func(t *testing.T) {
		db := testutil.NewDB(t)
		repo := repository.NewServiceRepository(db)
		require.NoError(t, repo.Create(t.Context(), httpService("id-1", "a"), 1))

		err := repo.Create(t.Context(), httpService("id-2", "A"), 1)

		require.ErrorIs(t, err, domain.ErrServiceLimitReached)
		require.NotErrorIs(t, err, domain.ErrServiceNameTaken)
	})
	t.Run("a limit lowered below the number saved", func(t *testing.T) {
		db := testutil.NewDB(t)
		repo := repository.NewServiceRepository(db)
		for i := range 3 {
			require.NoError(t, repo.Create(t.Context(), httpService(fmt.Sprintf("id-%d", i), fmt.Sprintf("s%d", i)), noLimit))
		}

		err := repo.Create(t.Context(), httpService("id-9", "new"), 2)

		require.ErrorIs(t, err, domain.ErrServiceLimitReached)
		assert.EqualValues(t, 3, count(t, db, &domain.Service{}))
	})
}

func TestServiceCreate_Concurrent(t *testing.T) {
	run := func(t *testing.T, n int, build func(i int) domain.Service, limit int, db *gorm.DB) []error {
		t.Helper()
		repo := repository.NewServiceRepository(db)
		errs := make([]error, n)
		var wg sync.WaitGroup
		for i := range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs[i] = repo.Create(t.Context(), build(i), limit)
			}()
		}
		wg.Wait()
		return errs
	}
	tally := func(errs []error, sentinel error) (ok, refused int) {
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

	t.Run("ten creates at one below the limit", func(t *testing.T) {
		db := testutil.NewDB(t)
		repo := repository.NewServiceRepository(db)
		for i := range 4 {
			require.NoError(t, repo.Create(t.Context(), httpService(fmt.Sprintf("seed-%d", i), fmt.Sprintf("seed%d", i)), 5))
		}

		errs := run(t, 10, func(i int) domain.Service {
			return httpService(fmt.Sprintf("id-%d", i), fmt.Sprintf("name%d", i))
		}, 5, db)

		ok, refused := tally(errs, domain.ErrServiceLimitReached)
		assert.Equal(t, 1, ok)
		assert.Equal(t, 9, refused)
		assert.EqualValues(t, 5, count(t, db, &domain.Service{}))
		assert.EqualValues(t, 5, count(t, db, &domain.ServiceState{}))
	})
	// One round can pass by luck without the transaction (the count and the insert race
	// only when the goroutines overlap), so release many creates together, many times.
	t.Run("creates released together never pass the limit, round after round", func(t *testing.T) {
		for round := range 10 {
			db := testutil.NewDB(t)
			repo := repository.NewServiceRepository(db)
			for i := range 4 {
				require.NoError(t, repo.Create(t.Context(), httpService(fmt.Sprintf("seed-%d", i), fmt.Sprintf("seed%d", i)), 5))
			}

			const n = 20
			errs := make([]error, n)
			start := make(chan struct{})
			var wg sync.WaitGroup
			for i := range n {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					errs[i] = repo.Create(t.Context(), httpService(fmt.Sprintf("id-%d", i), fmt.Sprintf("name%d", i)), 5)
				}()
			}
			close(start)
			wg.Wait()

			ok, refused := tally(errs, domain.ErrServiceLimitReached)
			require.Equal(t, 1, ok, "round %d", round)
			require.Equal(t, n-1, refused, "round %d", round)
			require.EqualValues(t, 5, count(t, db, &domain.Service{}), "round %d", round)
			require.EqualValues(t, 5, count(t, db, &domain.ServiceState{}), "round %d", round)
		}
	})
	t.Run("ten creates of the same name in different case", func(t *testing.T) {
		db := testutil.NewDB(t)

		errs := run(t, 10, func(i int) domain.Service {
			name := "api"
			if i%2 == 1 {
				name = "API"
			}
			return httpService(fmt.Sprintf("id-%d", i), name)
		}, noLimit, db)

		ok, refused := tally(errs, domain.ErrServiceNameTaken)
		assert.Equal(t, 1, ok)
		assert.Equal(t, 9, refused)
		assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
		assert.EqualValues(t, 1, count(t, db, &domain.ServiceState{}))
	})
}

func TestServiceCreate_OtherFailuresAreNotSentinelsAndLeaveNothing(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	require.NoError(t, repo.Create(t.Context(), httpService("same-id", "first"), noLimit))

	err := repo.Create(t.Context(), httpService("same-id", "second"), noLimit)

	require.Error(t, err)
	assert.NotErrorIs(t, err, domain.ErrServiceNameTaken)
	assert.NotErrorIs(t, err, domain.ErrServiceLimitReached)
	assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
	assert.EqualValues(t, 1, count(t, db, &domain.ServiceState{}))
	assert.Equal(t, "first", readService(t, db, "same-id").Name)
}

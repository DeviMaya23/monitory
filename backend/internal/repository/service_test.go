package repository_test

import (
	"errors"
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

func createAll(t *testing.T, repo *repository.ServiceRepository, services ...domain.Service) {
	t.Helper()
	for _, s := range services {
		require.NoError(t, repo.Create(t.Context(), s, noLimit))
	}
}

func setState(t *testing.T, db *gorm.DB, state domain.ServiceState) {
	t.Helper()
	require.NoError(t, db.Save(&state).Error)
}

func addTargets(t *testing.T, db *gorm.DB, serviceID string, n, failed int) {
	t.Helper()
	for i := range n {
		value := fmt.Sprintf("%s-%d@example.com", serviceID, i)
		require.NoError(t, db.Create(&domain.Target{
			ID: fmt.Sprintf("%s-t%d", serviceID, i), ServiceID: serviceID, Type: domain.TargetTypeEmail,
			Value: value, ValueKey: value, Headers: []domain.NameValue{},
			LastDeliveryFailed: i < failed,
			CreatedAt:          serviceTime, UpdatedAt: serviceTime,
		}).Error)
	}
}

func viewByName(t *testing.T, views []domain.ServiceView, name string) domain.ServiceView {
	t.Helper()
	for _, v := range views {
		if v.Service.Name == name {
			return v
		}
	}
	require.FailNow(t, "service not in list", name)
	return domain.ServiceView{}
}

func TestServiceList_EmptyIsNonNilEmptyList(t *testing.T) {
	repo := repository.NewServiceRepository(testutil.NewDB(t))

	got, err := repo.List(t.Context())

	require.NoError(t, err)
	assert.NotNil(t, got)
	assert.Empty(t, got)
}

func TestServiceList_ReturnsServicesAsCreated(t *testing.T) {
	repo := repository.NewServiceRepository(testutil.NewDB(t))
	full := httpService("id-1", "Full")
	full.HTTPQueryParams = []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}}
	full.HTTPHeaders = []domain.NameValue{{Name: "Z", Value: "secret"}, {Name: "A", Value: ""}}
	full.HTTPBodyType, full.HTTPBodyContent = domain.BodyTypeJSON, `{"k":1}`
	full.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}}
	full.JSONRuleMode = domain.JSONRuleModeAll
	full.CertCheck, full.CertMinDaysLeft = true, ptr(14)
	full.IgnoreCertErrs, full.AlertsEnabled, full.ShownOnPublicView = true, false, true
	full.UnhealthyMessage, full.RecoveryMessage = "down", "up"
	tcp := tcpService("id-2", "tcp")
	createAll(t, repo, full, tcp)

	got, err := repo.List(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, full, got[0].Service)
	assert.Equal(t, tcp, got[1].Service)
	assert.Equal(t, domain.ServiceState{ServiceID: "id-1", Status: domain.StatusNotYetChecked}, got[0].State)
}

func TestServiceList_OrdersByNameIgnoringCase(t *testing.T) {
	names := []string{"banana", "Apple", "cherry", "Äpfel", "apple2"}
	want := []string{"Apple", "apple2", "banana", "cherry", "Äpfel"}
	orders := [][]int{{0, 1, 2, 3, 4}, {4, 3, 2, 1, 0}, {2, 4, 0, 3, 1}}

	for _, order := range orders {
		repo := repository.NewServiceRepository(testutil.NewDB(t))
		for _, i := range order {
			createAll(t, repo, httpService(fmt.Sprintf("id-%d", i), names[i]))
		}

		got, err := repo.List(t.Context())

		require.NoError(t, err)
		var gotNames []string
		for _, v := range got {
			gotNames = append(gotNames, v.Service.Name)
		}
		assert.Equal(t, want, gotNames, "insert order %v", order)
	}
}

func TestServiceList_ReturnsStateAndFailureReason(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("s1", "a-healthy"), httpService("s2", "b-503"), httpService("s3", "c-rule"),
		httpService("s4", "d-timeout"), httpService("s5", "e-new"))
	zone := time.FixedZone("UTC+5", 5*3600)
	checked := time.Date(2026, 5, 6, 12, 0, 0, 0, zone)
	changed := time.Date(2026, 5, 6, 11, 0, 0, 0, zone)
	setState(t, db, domain.ServiceState{ServiceID: "s1", Status: domain.StatusHealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed})
	setState(t, db, domain.ServiceState{ServiceID: "s2", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed,
		FailureCode: ptr(domain.FailureNon2xxStatus), FailureHTTPStatus: ptr(503)})
	setState(t, db, domain.ServiceState{ServiceID: "s3", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed,
		FailureCode: ptr(domain.FailureJSONRuleMatched), FailureJSONRuleField: ptr("data.ok")})
	setState(t, db, domain.ServiceState{ServiceID: "s4", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed,
		FailureCode: ptr(domain.FailureTimedOut)})

	got, err := repo.List(t.Context())

	require.NoError(t, err)
	require.Len(t, got, 5)
	wantChecked, wantChanged := checked.UTC(), changed.UTC()

	healthy := viewByName(t, got, "a-healthy").State
	assert.Equal(t, domain.StatusHealthy, healthy.Status)
	require.NotNil(t, healthy.LastCheckedAt)
	assert.Equal(t, time.UTC, healthy.LastCheckedAt.Location())
	assert.True(t, wantChecked.Equal(*healthy.LastCheckedAt))
	require.NotNil(t, healthy.LastStatusChangeAt)
	assert.Equal(t, time.UTC, healthy.LastStatusChangeAt.Location())
	assert.True(t, wantChanged.Equal(*healthy.LastStatusChangeAt))
	assert.Nil(t, healthy.FailureCode)

	s503 := viewByName(t, got, "b-503").State
	assert.Equal(t, domain.StatusUnhealthy, s503.Status)
	assert.Equal(t, domain.FailureNon2xxStatus, *s503.FailureCode)
	assert.Equal(t, 503, *s503.FailureHTTPStatus)
	assert.Nil(t, s503.FailureJSONRuleField)

	rule := viewByName(t, got, "c-rule").State
	assert.Equal(t, domain.FailureJSONRuleMatched, *rule.FailureCode)
	assert.Equal(t, "data.ok", *rule.FailureJSONRuleField)
	assert.Nil(t, rule.FailureHTTPStatus)

	timeout := viewByName(t, got, "d-timeout").State
	assert.Equal(t, domain.FailureTimedOut, *timeout.FailureCode)
	assert.Nil(t, timeout.FailureHTTPStatus)
	assert.Nil(t, timeout.FailureJSONRuleField)

	fresh := viewByName(t, got, "e-new").State
	assert.Equal(t, domain.StatusNotYetChecked, fresh.Status)
	assert.Nil(t, fresh.LastCheckedAt)
	assert.Nil(t, fresh.LastStatusChangeAt)
	assert.Nil(t, fresh.FailureCode)
}

func TestServiceList_PausedKeepsStoredStatus(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	paused := httpService("s1", "paused")
	paused.Paused = true
	createAll(t, repo, paused, httpService("s2", "running"))
	setState(t, db, domain.ServiceState{ServiceID: "s1", Status: domain.StatusUnhealthy, FailureCode: ptr(domain.FailureTimedOut)})

	got, err := repo.List(t.Context())

	require.NoError(t, err)
	assert.True(t, viewByName(t, got, "paused").Service.Paused)
	assert.Equal(t, domain.StatusUnhealthy, viewByName(t, got, "paused").State.Status)
	assert.False(t, viewByName(t, got, "running").Service.Paused)
}

func TestServiceList_CountsTargetsPerService(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("s1", "none"), httpService("s2", "clean"), httpService("s3", "one-failed"), httpService("s4", "two"))
	addTargets(t, db, "s2", 3, 0)
	addTargets(t, db, "s3", 3, 1)
	addTargets(t, db, "s4", 2, 0)

	got, err := repo.List(t.Context())

	require.NoError(t, err)
	for name, want := range map[string]struct {
		count  int
		failed bool
	}{"none": {0, false}, "clean": {3, false}, "one-failed": {3, true}, "two": {2, false}} {
		v := viewByName(t, got, name)
		assert.Equal(t, want.count, v.TargetCount, name)
		assert.Equal(t, want.failed, v.AlertDeliveryFailed, name)
	}
}

func TestServiceDelete_RemovesServiceStateAndTargets(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("s1", "gone"), httpService("s2", "kept"))
	addTargets(t, db, "s1", 2, 1)
	addTargets(t, db, "s2", 3, 0)
	require.EqualValues(t, 2, count(t, db, &domain.ServiceState{}))
	require.EqualValues(t, 5, count(t, db, &domain.Target{}))

	require.NoError(t, repo.Delete(t.Context(), "s1"))

	assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
	assert.EqualValues(t, 1, count(t, db, &domain.ServiceState{}))
	assert.EqualValues(t, 3, count(t, db, &domain.Target{}))
	got, err := repo.List(t.Context())
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "kept", got[0].Service.Name)
	assert.Equal(t, 3, got[0].TargetCount)
}

func TestServiceDelete_UnknownIDAndRepeat(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("s1", "api"))

	err := repo.Delete(t.Context(), "nope")
	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
	assert.EqualValues(t, 1, count(t, db, &domain.ServiceState{}))

	require.NoError(t, repo.Delete(t.Context(), "s1"))
	require.ErrorIs(t, repo.Delete(t.Context(), "s1"), domain.ErrNotFound)
}

func TestServiceDelete_ConcurrentDeletesOneWins(t *testing.T) {
	repo := repository.NewServiceRepository(testutil.NewDB(t))
	createAll(t, repo, httpService("s1", "api"))
	const n = 10
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.Delete(t.Context(), "s1")
		}()
	}
	wg.Wait()
	close(errs)

	var ok, notFound int
	for err := range errs {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, domain.ErrNotFound):
			notFound++
		default:
			require.NoError(t, err)
		}
	}
	assert.Equal(t, 1, ok)
	assert.Equal(t, n-1, notFound)
}

func TestServiceDelete_SurvivesReopeningTheDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "restart.db")
	db := testutil.OpenDB(t, path)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("s1", "gone"), httpService("s2", "kept"))
	require.NoError(t, repo.Delete(t.Context(), "s1"))
	testutil.CloseDB(t, db)

	reopened := repository.NewServiceRepository(testutil.OpenDB(t, path))

	got, err := reopened.List(t.Context())
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "kept", got[0].Service.Name)
}

func TestServiceFind_ReturnsTheSavedService(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	zone := time.FixedZone("x", 7*3600)
	want := httpService("id-1", "Find Me")
	want.AlertsEnabled = true
	want.UnhealthyMessage, want.RecoveryMessage = "down", "up"
	want.CreatedAt = time.Date(2026, 5, 6, 14, 8, 9, 0, zone)
	want.UpdatedAt = time.Date(2026, 5, 6, 15, 8, 9, 0, zone)
	require.NoError(t, repo.Create(t.Context(), want, noLimit))
	require.NoError(t, repo.Create(t.Context(), httpService("id-2", "Other"), noLimit))

	got, err := repo.Find(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, "Find Me", got.Name)
	assert.True(t, got.AlertsEnabled)
	assert.Equal(t, "down", got.UnhealthyMessage)
	assert.Equal(t, "up", got.RecoveryMessage)
	assert.Equal(t, time.UTC, got.CreatedAt.Location())
	assert.Equal(t, time.UTC, got.UpdatedAt.Location())
	assert.True(t, want.CreatedAt.Equal(got.CreatedAt))
	assert.True(t, want.UpdatedAt.Equal(got.UpdatedAt))
}

func TestServiceFind_UnknownAndDeletedIDsAreNotFound(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	require.NoError(t, repo.Create(t.Context(), httpService("id-1", "A"), noLimit))

	_, err := repo.Find(t.Context(), "id-1")
	require.NoError(t, err, "baseline: the service is found before it is deleted")

	_, err = repo.Find(t.Context(), "nope")
	require.ErrorIs(t, err, domain.ErrNotFound)

	require.NoError(t, repo.Delete(t.Context(), "id-1"))
	services, states := count(t, db, &domain.Service{}), count(t, db, &domain.ServiceState{})
	_, err = repo.Find(t.Context(), "id-1")
	require.ErrorIs(t, err, domain.ErrNotFound)
	assert.Equal(t, services, count(t, db, &domain.Service{}))
	assert.Equal(t, states, count(t, db, &domain.ServiceState{}))
}

func TestServiceGet_ReturnsTheViewEqualToTheListed(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	zone := time.FixedZone("x", 7*3600)
	svc := httpService("id-1", "Get Me")
	svc.CreatedAt = time.Date(2026, 5, 6, 14, 8, 9, 0, zone)
	createAll(t, repo, svc, httpService("id-2", "Other"))
	checked := time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC)
	code := domain.FailureNon2xxStatus
	status := 503
	setState(t, db, domain.ServiceState{
		ServiceID: "id-1", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &checked,
		FailureCode: &code, FailureHTTPStatus: &status,
	})
	addTargets(t, db, "id-1", 2, 1)
	addTargets(t, db, "id-2", 5, 0)

	got, err := repo.Get(t.Context(), "id-1")

	require.NoError(t, err)
	listed, err := repo.List(t.Context())
	require.NoError(t, err)
	assert.Equal(t, viewByName(t, listed, "Get Me"), got)
	assert.Equal(t, 2, got.TargetCount)
	assert.True(t, got.AlertDeliveryFailed)
	assert.Equal(t, domain.StatusUnhealthy, got.State.Status)
	assert.Equal(t, time.UTC, got.Service.CreatedAt.Location())
	assert.Equal(t, time.UTC, got.State.LastCheckedAt.Location())
}

func TestServiceGet_UnknownIDIsNotFound(t *testing.T) {
	repo := repository.NewServiceRepository(testutil.NewDB(t))
	createAll(t, repo, httpService("id-1", "A"))

	_, err := repo.Get(t.Context(), "id-1")
	require.NoError(t, err, "baseline: the service is found")

	_, err = repo.Get(t.Context(), "nope")
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestServiceUpdate_ReplacesEveryFieldOfAnHTTPService(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("id-1", "Old"))
	want := httpService("id-1", "New Name")
	want.HTTPMethod, want.HTTPURL = ptr("POST"), ptr("https://new/y")
	want.HTTPQueryParams = []domain.NameValue{{Name: "a", Value: "1"}}
	want.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer secret-value"}}
	want.HTTPBodyType, want.HTTPBodyContent = domain.BodyTypeJSON, `{"k":1}`
	want.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: false}}
	want.JSONRuleMode = domain.JSONRuleModeAll
	want.CertCheck, want.CertMinDaysLeft, want.IgnoreCertErrs = true, ptr(14), true
	want.CheckIntervalSeconds, want.TimeoutSeconds, want.RetryCount, want.RetryIntervalSeconds = 120, 9, 2, 7
	want.AlertsEnabled, want.ShownOnPublicView = false, true
	want.UnhealthyMessage, want.RecoveryMessage = "down", "up"
	want.UpdatedAt = serviceTime.Add(time.Hour)

	view, err := repo.Update(t.Context(), want)

	require.NoError(t, err)
	assert.Equal(t, want, view.Service)
	assert.Equal(t, domain.StatusNotYetChecked, view.State.Status)
	again, err := repo.Get(t.Context(), "id-1")
	require.NoError(t, err)
	assert.Equal(t, view, again)
}

func TestServiceUpdate_TypeChangeClearsTheOtherTypesColumns(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	full := httpService("id-1", "S")
	full.HTTPQueryParams = []domain.NameValue{{Name: "a", Value: "1"}}
	full.HTTPHeaders = []domain.NameValue{{Name: "H", Value: "v"}}
	full.HTTPBodyType, full.HTTPBodyContent = domain.BodyTypeJSON, "{}"
	full.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: true}}
	full.JSONRuleMode = domain.JSONRuleModeAll
	full.CertCheck, full.CertMinDaysLeft, full.IgnoreCertErrs = true, ptr(10), true
	createAll(t, repo, full)

	t.Run("HTTP to TCP", func(t *testing.T) {
		tcp := tcpService("id-1", "S")
		view, err := repo.Update(t.Context(), tcp)
		require.NoError(t, err)

		got := view.Service
		assert.Nil(t, got.HTTPMethod)
		assert.Nil(t, got.HTTPURL)
		assert.Equal(t, []domain.NameValue{}, got.HTTPQueryParams)
		assert.Equal(t, []domain.NameValue{}, got.HTTPHeaders)
		assert.Equal(t, domain.BodyTypeNone, got.HTTPBodyType)
		assert.Empty(t, got.HTTPBodyContent)
		assert.Equal(t, []domain.JSONRule{}, got.JSONRules)
		assert.Equal(t, domain.JSONRuleModeAny, got.JSONRuleMode)
		assert.False(t, got.CertCheck)
		assert.Nil(t, got.CertMinDaysLeft)
		assert.False(t, got.IgnoreCertErrs)
		assert.Equal(t, "db.local", *got.TCPHost)
		assert.Equal(t, 5432, *got.TCPPort)
	})

	t.Run("TCP to HTTP", func(t *testing.T) {
		view, err := repo.Update(t.Context(), httpService("id-1", "S"))
		require.NoError(t, err)

		assert.Nil(t, view.Service.TCPHost)
		assert.Nil(t, view.Service.TCPPort)
		assert.Equal(t, "https://x", *view.Service.HTTPURL)
	})
}

func TestServiceUpdate_WritesFalseAndEmptyValues(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	before := httpService("id-1", "S")
	before.AlertsEnabled, before.ShownOnPublicView = true, true
	before.UnhealthyMessage, before.RecoveryMessage = "down", "up"
	before.HTTPHeaders = []domain.NameValue{{Name: "H", Value: "v"}}
	createAll(t, repo, before)
	require.True(t, readService(t, db, "id-1").ShownOnPublicView, "baseline: the flags start true")

	edit := httpService("id-1", "S")
	edit.AlertsEnabled = false
	view, err := repo.Update(t.Context(), edit) // false, empty, no headers

	require.NoError(t, err)
	assert.False(t, view.Service.AlertsEnabled)
	assert.False(t, view.Service.ShownOnPublicView)
	assert.Empty(t, view.Service.UnhealthyMessage)
	assert.Empty(t, view.Service.RecoveryMessage)
	assert.Equal(t, []domain.NameValue{}, view.Service.HTTPHeaders)
}

func TestServiceUpdate_KeepsIdentityPausedAndState(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("id-1", "S"))
	require.NoError(t, db.Model(&domain.Service{}).Where("id = ?", "id-1").Update("paused", true).Error)
	checked := time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC)
	changed := checked.Add(-time.Hour)
	code, status := domain.FailureNon2xxStatus, 500
	state := domain.ServiceState{
		ServiceID: "id-1", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed,
		FailureCode: &code, FailureHTTPStatus: &status,
	}
	setState(t, db, state)
	before := readService(t, db, "id-1")

	edit := tcpService("id-1", "S") // the type changes in the same call (FR-66)
	edit.CreatedAt = serviceTime.AddDate(-1, 0, 0)
	edit.Paused = false
	edit.UpdatedAt = serviceTime.Add(3 * time.Hour)
	view, err := repo.Update(t.Context(), edit)

	require.NoError(t, err)
	after := readService(t, db, "id-1")
	assert.Equal(t, before.ID, after.ID)
	assert.True(t, before.CreatedAt.Equal(after.CreatedAt), "created_at is kept")
	assert.True(t, after.Paused, "paused is kept")
	assert.True(t, edit.UpdatedAt.Equal(after.UpdatedAt), "updated_at is set")
	assert.Equal(t, domain.CheckTypeTCP, after.CheckType)
	assert.True(t, view.Service.Paused)

	var stateAfter domain.ServiceState
	require.NoError(t, db.First(&stateAfter, "service_id = ?", "id-1").Error)
	assert.Equal(t, domain.StatusUnhealthy, stateAfter.Status)
	assert.True(t, checked.Equal(*stateAfter.LastCheckedAt))
	assert.True(t, changed.Equal(*stateAfter.LastStatusChangeAt))
	assert.Equal(t, code, *stateAfter.FailureCode)
	assert.Equal(t, 500, *stateAfter.FailureHTTPStatus)
	assert.Equal(t, domain.StatusUnhealthy, view.State.Status)
}

func TestServiceUpdate_NameRules(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("id-1", "Alpha"), httpService("id-2", "Beta"))

	t.Run("another service's name in other case", func(t *testing.T) {
		clash := httpService("id-1", "BETA")
		clash.HTTPURL = ptr("https://changed")
		_, err := repo.Update(t.Context(), clash)
		require.ErrorIs(t, err, domain.ErrServiceNameTaken)
		assert.Equal(t, "Alpha", readService(t, db, "id-1").Name)
		assert.Equal(t, "https://x", *readService(t, db, "id-1").HTTPURL, "nothing saved")
	})

	t.Run("own name in other case", func(t *testing.T) {
		view, err := repo.Update(t.Context(), httpService("id-1", "ALPHA"))
		require.NoError(t, err)
		assert.Equal(t, "ALPHA", view.Service.Name)
		assert.Equal(t, "alpha", readService(t, db, "id-1").NameKey)
	})

	t.Run("unknown id", func(t *testing.T) {
		_, err := repo.Update(t.Context(), httpService("nope", "Gamma"))
		require.ErrorIs(t, err, domain.ErrNotFound)
		assert.EqualValues(t, 2, count(t, db, &domain.Service{}))
	})
}

func TestServiceSetPaused_PausesAndResumesKeepingEverythingElse(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("id-7", "Seven"))
	checked := time.Date(2026, 5, 6, 8, 0, 0, 0, time.UTC)
	changedAt := checked.Add(-time.Hour)
	code, status := domain.FailureNon2xxStatus, 502
	state := domain.ServiceState{
		ServiceID: "id-7", Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changedAt,
		FailureCode: &code, FailureHTTPStatus: &status,
	}
	setState(t, db, state)
	before := readService(t, db, "id-7")
	zone := time.FixedZone("x", 3*3600)
	first := time.Date(2026, 7, 8, 9, 10, 11, 0, zone)

	view, changed, err := repo.SetPaused(t.Context(), "id-7", true, first)

	require.NoError(t, err)
	assert.True(t, changed)
	assert.True(t, view.Service.Paused)
	assert.True(t, first.Equal(view.Service.UpdatedAt))
	assert.Equal(t, time.UTC, view.Service.UpdatedAt.Location())
	got, err := repo.Get(t.Context(), "id-7")
	require.NoError(t, err)
	assert.Equal(t, view, got)

	want := before
	want.Paused, want.UpdatedAt = true, first.UTC()
	after := readService(t, db, "id-7")
	after.CreatedAt, after.UpdatedAt = after.CreatedAt.UTC(), after.UpdatedAt.UTC()
	want.CreatedAt = want.CreatedAt.UTC()
	assert.Equal(t, want, after, "only paused and updated_at change")
	assert.Equal(t, domain.StatusUnhealthy, view.State.Status)
	assert.True(t, checked.Equal(*view.State.LastCheckedAt))
	assert.True(t, changedAt.Equal(*view.State.LastStatusChangeAt))
	assert.Equal(t, code, *view.State.FailureCode)
	assert.Equal(t, 502, *view.State.FailureHTTPStatus)

	// Again: nothing changes, updated_at stays the first time.
	later := first.Add(5 * time.Hour)
	view, changed, err = repo.SetPaused(t.Context(), "id-7", true, later)
	require.NoError(t, err)
	assert.False(t, changed)
	assert.True(t, view.Service.Paused)
	assert.True(t, first.Equal(view.Service.UpdatedAt))
	assert.True(t, first.Equal(readService(t, db, "id-7").UpdatedAt))

	// Resume.
	view, changed, err = repo.SetPaused(t.Context(), "id-7", false, later)
	require.NoError(t, err)
	assert.True(t, changed)
	assert.False(t, view.Service.Paused)
	assert.True(t, later.Equal(view.Service.UpdatedAt))
	assert.Equal(t, domain.StatusUnhealthy, view.State.Status)
	assert.Equal(t, code, *view.State.FailureCode)

	view, changed, err = repo.SetPaused(t.Context(), "id-7", false, later.Add(time.Hour))
	require.NoError(t, err)
	assert.False(t, changed)
	assert.True(t, later.Equal(view.Service.UpdatedAt))
}

func TestServiceSetPaused_UnknownIDIsNotFoundAndWritesNothing(t *testing.T) {
	db := testutil.NewDB(t)
	repo := repository.NewServiceRepository(db)
	createAll(t, repo, httpService("id-1", "One"))
	before := readService(t, db, "id-1")

	for _, paused := range []bool{true, false} {
		view, changed, err := repo.SetPaused(t.Context(), "no-such", paused, serviceTime.Add(time.Hour))
		require.ErrorIs(t, err, domain.ErrNotFound)
		assert.False(t, changed)
		assert.Equal(t, domain.ServiceView{}, view)
	}
	assert.Equal(t, before, readService(t, db, "id-1"))
	assert.EqualValues(t, 1, count(t, db, &domain.Service{}))
}

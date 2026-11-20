package usecase_test

import (
	"context"
	"errors"
	"regexp"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

// uuidV7 matches a version 7 UUID with the RFC 4122 variant.
var uuidV7 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

var serviceStart = time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)

type serviceSetup struct {
	svc       *usecase.ServiceService
	repo      *fakeServices
	scheduler *fakeScheduler
	events    *[]string
}

func newServiceSetup() serviceSetup {
	events := &[]string{}
	repo := &fakeServices{events: events}
	scheduler := &fakeScheduler{events: events}
	svc := usecase.NewServiceService(repo, scheduler, clock.NewFake(serviceStart), testLimits)
	return serviceSetup{svc, repo, scheduler, events}
}

func TestCreateService_SavesAnHTTPServiceAndReturnsItNotYetChecked(t *testing.T) {
	s := newServiceSetup()
	in := validHTTP()
	in.Name = "My API"

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	svc := view.Service
	assert.Regexp(t, uuidV7, svc.ID)
	assert.Equal(t, "My API", svc.Name)
	assert.Equal(t, "my api", svc.NameKey)
	assert.Equal(t, domain.CheckTypeHTTP, svc.CheckType)
	assert.Equal(t, "GET", *svc.HTTPMethod)
	assert.Equal(t, "https://x", *svc.HTTPURL)
	assert.Nil(t, svc.TCPHost)
	assert.Nil(t, svc.TCPPort)
	assert.Equal(t, []domain.NameValue{}, svc.HTTPQueryParams)
	assert.Equal(t, []domain.NameValue{}, svc.HTTPHeaders)
	assert.Equal(t, []domain.JSONRule{}, svc.JSONRules)
	assert.Equal(t, domain.BodyTypeNone, svc.HTTPBodyType)
	assert.Empty(t, svc.HTTPBodyContent)
	assert.Equal(t, domain.JSONRuleModeAny, svc.JSONRuleMode)
	assert.False(t, svc.CertCheck)
	assert.Nil(t, svc.CertMinDaysLeft)
	assert.False(t, svc.IgnoreCertErrs)
	assert.Equal(t, 90, svc.CheckIntervalSeconds)
	assert.Equal(t, 7, svc.TimeoutSeconds)
	assert.True(t, svc.AlertsEnabled)
	assert.False(t, svc.ShownOnPublicView)
	assert.False(t, svc.Paused)
	assert.Empty(t, svc.UnhealthyMessage)
	assert.Empty(t, svc.RecoveryMessage)
	assert.Equal(t, serviceStart, svc.CreatedAt)
	assert.Equal(t, serviceStart, svc.UpdatedAt)

	assert.Equal(t, domain.ServiceState{ServiceID: svc.ID, Status: domain.StatusNotYetChecked}, view.State)
	assert.Zero(t, view.TargetCount)
	assert.False(t, view.AlertDeliveryFailed)
	assert.Equal(t, []domain.Service{svc}, s.repo.services)
}

func TestCreateService_SavesATCPServiceWithoutHTTPColumns(t *testing.T) {
	s := newServiceSetup()
	in := validTCP()
	// Whatever else was sent for the other type is not saved.
	in.Check.HTTP = domain.HTTPCheckInput{Method: "GET", URL: "https://x", Headers: []domain.NameValue{{Name: "A"}}, BodyType: "json", BodyContent: "{}", JSONRuleMode: "all"}

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	svc := view.Service
	assert.Equal(t, domain.CheckTypeTCP, svc.CheckType)
	assert.Equal(t, "db.local", *svc.TCPHost)
	assert.Equal(t, 5432, *svc.TCPPort)
	assert.Nil(t, svc.HTTPMethod)
	assert.Nil(t, svc.HTTPURL)
	assert.Equal(t, []domain.NameValue{}, svc.HTTPHeaders)
	assert.Equal(t, domain.BodyTypeNone, svc.HTTPBodyType)
	assert.Empty(t, svc.HTTPBodyContent)
	assert.Equal(t, domain.JSONRuleModeAny, svc.JSONRuleMode)
}

func TestCreateService_SavesEverythingGiven(t *testing.T) {
	s := newServiceSetup()
	in := domain.ServiceInput{
		Name: "Full",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
			Method:       "POST",
			URL:          "https://x/y",
			QueryParams:  []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}},
			Headers:      []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}},
			BodyType:     "json",
			BodyContent:  `{"k":1}`,
			JSONRules:    []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}},
			JSONRuleMode: "all",

			CertificateCheckEnabled: true,
			CertMinDaysLeft:         ptr(14),
			IgnoreCertificateErrors: true,
		}},
		CheckIntervalSeconds: ptr(120),
		TimeoutSeconds:       ptr(5),
		RetryCount:           ptr(1),
		RetryIntervalSeconds: ptr(4),
		AlertsEnabled:        ptr(false),
		ShownOnPublicView:    ptr(true),
		UnhealthyMessage:     "  down  ",
		RecoveryMessage:      "\nup again\n",
	}

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	svc := view.Service
	assert.Equal(t, []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}}, svc.HTTPQueryParams)
	assert.Equal(t, []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}}, svc.HTTPHeaders)
	assert.Equal(t, domain.BodyTypeJSON, svc.HTTPBodyType)
	assert.Equal(t, `{"k":1}`, svc.HTTPBodyContent)
	assert.Equal(t, []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}}, svc.JSONRules)
	assert.Equal(t, domain.JSONRuleModeAll, svc.JSONRuleMode)
	assert.True(t, svc.CertCheck)
	assert.Equal(t, 14, *svc.CertMinDaysLeft)
	assert.True(t, svc.IgnoreCertErrs)
	assert.Equal(t, 120, svc.CheckIntervalSeconds)
	assert.Equal(t, 5, svc.TimeoutSeconds)
	assert.Equal(t, 1, svc.RetryCount)
	assert.Equal(t, 4, svc.RetryIntervalSeconds)
	assert.False(t, svc.AlertsEnabled)
	assert.True(t, svc.ShownOnPublicView)
	assert.Equal(t, "down", svc.UnhealthyMessage)
	assert.Equal(t, "up again", svc.RecoveryMessage)
}

func TestCreateService_DropsWhatTheTypeDoesNotKeep(t *testing.T) {
	s := newServiceSetup()
	in := withHTTP(func(c *domain.HTTPCheckInput) {
		c.BodyType, c.BodyContent = "none", "ignored"
		c.CertMinDaysLeft = ptr(0) // certificate check is off: the minimum is not saved
	})

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	assert.Empty(t, view.Service.HTTPBodyContent)
	assert.False(t, view.Service.CertCheck)
	assert.Nil(t, view.Service.CertMinDaysLeft)
}

func TestCreateService_PassesTheConfiguredServiceLimitToTheRepository(t *testing.T) {
	s := newServiceSetup()

	_, err := s.svc.CreateService(t.Context(), validHTTP())

	require.NoError(t, err)
	assert.Equal(t, []int{testLimits.MaxServices}, s.repo.maxServices)
}

func TestCreateService_StartsTheSchedulerOnceAfterTheWrite(t *testing.T) {
	s := newServiceSetup()

	view, err := s.svc.CreateService(t.Context(), validHTTP())

	require.NoError(t, err)
	assert.Equal(t, []domain.Service{view.Service}, s.scheduler.started)
	assert.Equal(t, []string{"create", "start"}, *s.events)
}

func TestCreateService_RejectedInputSavesNothingAndStartsNothing(t *testing.T) {
	// Baseline: the same input, made valid, saves and starts.
	good := newServiceSetup()
	_, err := good.svc.CreateService(t.Context(), validHTTP())
	require.NoError(t, err)
	require.Len(t, good.repo.services, 1)
	require.Len(t, good.scheduler.started, 1)

	bad := newServiceSetup()
	in := validHTTP()
	in.Name = ""
	in.Check.HTTP.Method = "FETCH"

	_, err = bad.svc.CreateService(t.Context(), in)

	var validation domain.ValidationError
	require.ErrorAs(t, err, &validation)
	assert.Equal(t, []domain.FieldError{
		fe("name", domain.FieldErrorRequired, "Enter a name."),
		fe("check.method", domain.FieldErrorInvalidValue, msgAllowed),
	}, validation.Fields)
	assert.Empty(t, bad.repo.services)
	assert.Empty(t, bad.repo.maxServices, "the repository is not called")
	assert.Empty(t, bad.scheduler.started)
}

func TestCreateService_RepositorySentinelsComeBackUnchangedAndStartNothing(t *testing.T) {
	for _, sentinel := range []error{domain.ErrServiceNameTaken, domain.ErrServiceLimitReached} {
		t.Run(sentinel.Error(), func(t *testing.T) {
			s := newServiceSetup()
			s.repo.err = sentinel

			_, err := s.svc.CreateService(t.Context(), validHTTP())

			require.ErrorIs(t, err, sentinel)
			assert.Empty(t, s.scheduler.started)
		})
	}
}

func TestCreateService_SavesTrimmedNamesAndLocations(t *testing.T) {
	s := newServiceSetup()
	in := domain.ServiceInput{
		Name: "  My API \n",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
			Method:      "GET",
			URL:         " https://x/y ",
			QueryParams: []domain.NameValue{{Name: " a ", Value: " keep "}},
			Headers:     []domain.NameValue{{Name: "\tX-Id ", Value: " keep "}},
			JSONRules:   []domain.JSONRule{{Field: " ok ", FailingValue: " x "}},
		}},
	}

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	svc := view.Service
	assert.Equal(t, "My API", svc.Name)
	assert.Equal(t, "my api", svc.NameKey)
	assert.Equal(t, "https://x/y", *svc.HTTPURL)
	assert.Equal(t, []domain.NameValue{{Name: "a", Value: " keep "}}, svc.HTTPQueryParams)
	assert.Equal(t, []domain.NameValue{{Name: "X-Id", Value: "keep"}}, svc.HTTPHeaders)
	assert.Equal(t, []domain.JSONRule{{Field: "ok", FailingValue: " x "}}, svc.JSONRules)
	assert.Equal(t, " a ", in.Check.HTTP.QueryParams[0].Name, "the caller's input is not changed")
	assert.Equal(t, " keep ", in.Check.HTTP.Headers[0].Value, "the caller's input is not changed")
}

func TestCreateService_SavesATrimmedHost(t *testing.T) {
	s := newServiceSetup()
	in := validTCP()
	in.Check.TCP.Host = " db.local "

	view, err := s.svc.CreateService(t.Context(), in)

	require.NoError(t, err)
	assert.Equal(t, "db.local", *view.Service.TCPHost)
}

// seeded returns a setup whose repository already holds a service with the id.
func seeded(id string) serviceSetup {
	s := newServiceSetup()
	s.repo.services = []domain.Service{{ID: id, Name: "api"}}
	return s
}

func TestDeleteService_StopsTheSchedulerOnceAfterTheDelete(t *testing.T) {
	s := seeded("id-1")

	require.NoError(t, s.svc.DeleteService(t.Context(), "id-1"))

	assert.Equal(t, []string{"id-1"}, s.repo.deleted)
	assert.Equal(t, []string{"id-1"}, s.scheduler.stopped)
	assert.Equal(t, []string{"delete", "stop"}, *s.events)
}

func TestDeleteService_FailedDeleteDoesNotStopTheScheduler(t *testing.T) {
	// Baseline: the same call, succeeding, stops the scheduler.
	baseline := seeded("id-1")
	require.NoError(t, baseline.svc.DeleteService(t.Context(), "id-1"))
	require.Equal(t, []string{"id-1"}, baseline.scheduler.stopped)

	tests := []struct {
		name string
		id   string
		err  error
		want error
	}{
		{"unknown id", "other", nil, domain.ErrNotFound},
		{"repository says not found", "id-1", domain.ErrNotFound, domain.ErrNotFound},
		{"any other error", "id-1", errors.New("disk full"), nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := seeded("id-1")
			s.repo.err = tc.err

			err := s.svc.DeleteService(t.Context(), tc.id)

			require.Error(t, err)
			if tc.want != nil {
				require.ErrorIs(t, err, tc.want)
			} else {
				assert.EqualError(t, err, "disk full")
			}
			assert.Empty(t, s.scheduler.stopped)
		})
	}
}

func TestDeleteService_SecondDeleteIsNotFoundAndStopsNothing(t *testing.T) {
	s := seeded("id-1")

	first := s.svc.DeleteService(t.Context(), "id-1")
	second := s.svc.DeleteService(t.Context(), "id-1")

	require.NoError(t, first)
	require.ErrorIs(t, second, domain.ErrNotFound)
	assert.Equal(t, []string{"id-1"}, s.scheduler.stopped)
}

func TestStartChecks_StartsEveryServiceThatIsNotPaused(t *testing.T) {
	s := newServiceSetup()
	s.repo.services = []domain.Service{
		{ID: "a", CheckIntervalSeconds: 45},
		{ID: "b", CheckIntervalSeconds: 60, Paused: true},
		{ID: "c", CheckIntervalSeconds: 90},
	}

	require.NoError(t, s.svc.StartChecks(t.Context()))

	assert.Equal(t, []domain.Service{s.repo.services[0], s.repo.services[2]}, s.scheduler.started)

	// Baseline: the same service, not paused, is started.
	s = newServiceSetup()
	s.repo.services = []domain.Service{{ID: "b", CheckIntervalSeconds: 60}}
	require.NoError(t, s.svc.StartChecks(t.Context()))
	assert.Len(t, s.scheduler.started, 1)
}

func TestStartChecks_NoServices(t *testing.T) {
	s := newServiceSetup()

	require.NoError(t, s.svc.StartChecks(t.Context()))

	assert.Empty(t, s.scheduler.started)
}

func TestStartChecks_ListErrorStartsNothing(t *testing.T) {
	s := newServiceSetup()
	s.repo.services = []domain.Service{{ID: "a", CheckIntervalSeconds: 45}}
	s.repo.err = errors.New("list failed")

	err := s.svc.StartChecks(t.Context())

	require.ErrorIs(t, err, s.repo.err)
	assert.Empty(t, s.scheduler.started)
}

// httpRow is the row the usecase builds for validHTTP() under the test limits, with the
// path id and the clock's time.
func httpRow(id string) domain.Service {
	return domain.Service{
		ID: id, Name: "api", NameKey: "api",
		CheckType:  domain.CheckTypeHTTP,
		HTTPMethod: ptr("GET"), HTTPURL: ptr("https://x"),
		HTTPQueryParams: []domain.NameValue{}, HTTPHeaders: []domain.NameValue{},
		HTTPBodyType: domain.BodyTypeNone,
		JSONRules:    []domain.JSONRule{}, JSONRuleMode: domain.JSONRuleModeAny,
		CheckIntervalSeconds: 90, TimeoutSeconds: 7, RetryCount: 2, RetryIntervalSeconds: 3,
		AlertsEnabled: true,
		CreatedAt:     serviceStart, UpdatedAt: serviceStart,
	}
}

// seededEdit returns a setup whose repository holds a service "id-1" of another type and
// other values than any edit below sets, so that a setting an edit forgets shows.
func seededEdit() serviceSetup {
	s := newServiceSetup()
	old := httpRow("id-1")
	old.Name, old.NameKey = "old", "old"
	old.HTTPMethod, old.HTTPURL = ptr("DELETE"), ptr("https://old")
	old.HTTPHeaders = []domain.NameValue{{Name: "Old", Value: "x"}}
	old.HTTPBodyType, old.HTTPBodyContent = domain.BodyTypeJSON, "{}"
	old.CertCheck, old.CertMinDaysLeft = true, ptr(3)
	old.CheckIntervalSeconds, old.TimeoutSeconds = 200, 15
	old.AlertsEnabled, old.ShownOnPublicView = false, true
	old.UnhealthyMessage = "old"
	s.repo.services = []domain.Service{old}
	return s
}

func (s serviceSetup) saved(t *testing.T) domain.Service {
	t.Helper()
	require.Len(t, s.repo.updates, 1)
	return s.repo.updates[0]
}

func TestGetService_ReturnsTheViewOfTheService(t *testing.T) {
	s := seededEdit()
	checked := serviceStart.Add(-time.Minute)
	s.repo.seedState(domain.ServiceState{ServiceID: "id-1", Status: domain.StatusHealthy, LastCheckedAt: &checked})

	view, err := s.svc.GetService(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, "old", view.Service.Name)
	assert.Equal(t, domain.StatusHealthy, view.State.Status)
	assert.Equal(t, &checked, view.State.LastCheckedAt)
}

func TestUpdateService_SavesEverythingGiven(t *testing.T) {
	s := seededEdit()
	in := domain.ServiceInput{
		Name: "Full",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
			Method:       "POST",
			URL:          "https://x/y",
			QueryParams:  []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}},
			Headers:      []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}},
			BodyType:     "json",
			BodyContent:  `{"k":1}`,
			JSONRules:    []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}},
			JSONRuleMode: "all",

			CertificateCheckEnabled: true,
			CertMinDaysLeft:         ptr(14),
			IgnoreCertificateErrors: true,
		}},
		CheckIntervalSeconds: ptr(120),
		TimeoutSeconds:       ptr(5),
		RetryCount:           ptr(1),
		RetryIntervalSeconds: ptr(4),
		AlertsEnabled:        ptr(false),
		ShownOnPublicView:    ptr(true),
		UnhealthyMessage:     "  down  ",
		RecoveryMessage:      "\nup again\n",
	}

	view, err := s.svc.UpdateService(t.Context(), "id-1", in)

	require.NoError(t, err)
	want := domain.Service{
		ID: "id-1", Name: "Full", NameKey: "full",
		CheckType:  domain.CheckTypeHTTP,
		HTTPMethod: ptr("POST"), HTTPURL: ptr("https://x/y"),
		HTTPQueryParams: []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}},
		HTTPHeaders:     []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}},
		HTTPBodyType:    domain.BodyTypeJSON, HTTPBodyContent: `{"k":1}`,
		JSONRules:    []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}},
		JSONRuleMode: domain.JSONRuleModeAll,
		CertCheck:    true, CertMinDaysLeft: ptr(14), IgnoreCertErrs: true,
		CheckIntervalSeconds: 120, TimeoutSeconds: 5, RetryCount: 1, RetryIntervalSeconds: 4,
		AlertsEnabled: false, UnhealthyMessage: "down", RecoveryMessage: "up again",
		ShownOnPublicView: true,
		CreatedAt:         serviceStart, UpdatedAt: serviceStart,
	}
	assert.Equal(t, want, s.saved(t))
	assert.Equal(t, want, view.Service)
}

func TestUpdateService_GroupsOfSettings(t *testing.T) {
	groups := []struct {
		name  string
		input func() domain.ServiceInput
		row   func(*domain.Service)
	}{
		{"name and flags", func() domain.ServiceInput {
			in := validHTTP()
			in.Name = "Renamed"
			in.AlertsEnabled, in.ShownOnPublicView = ptr(false), ptr(true)
			in.UnhealthyMessage, in.RecoveryMessage = "bad", "good"
			return in
		}, func(r *domain.Service) {
			r.Name, r.NameKey = "Renamed", "renamed"
			r.AlertsEnabled, r.ShownOnPublicView = false, true
			r.UnhealthyMessage, r.RecoveryMessage = "bad", "good"
		}},
		{"the HTTP request", func() domain.ServiceInput {
			return withHTTP(func(h *domain.HTTPCheckInput) {
				h.Method, h.URL = "PUT", "https://z/p"
				h.QueryParams = []domain.NameValue{{Name: "q", Value: "1"}}
				h.Headers = []domain.NameValue{{Name: "X", Value: "secret"}}
				h.BodyType, h.BodyContent = "text", "hi"
			})
		}, func(r *domain.Service) {
			r.HTTPMethod, r.HTTPURL = ptr("PUT"), ptr("https://z/p")
			r.HTTPQueryParams = []domain.NameValue{{Name: "q", Value: "1"}}
			r.HTTPHeaders = []domain.NameValue{{Name: "X", Value: "secret"}}
			r.HTTPBodyType, r.HTTPBodyContent = domain.BodyTypeText, "hi"
		}},
		{"JSON rules and the certificate", func() domain.ServiceInput {
			return withHTTP(func(h *domain.HTTPCheckInput) {
				h.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: false}}
				h.JSONRuleMode = "all"
				h.CertificateCheckEnabled, h.CertMinDaysLeft = true, ptr(21)
				h.IgnoreCertificateErrors = true
			})
		}, func(r *domain.Service) {
			r.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: false}}
			r.JSONRuleMode = domain.JSONRuleModeAll
			r.CertCheck, r.CertMinDaysLeft, r.IgnoreCertErrs = true, ptr(21), true
		}},
		{"the timing settings", func() domain.ServiceInput {
			in := validHTTP()
			in.CheckIntervalSeconds, in.TimeoutSeconds = ptr(100), ptr(4)
			in.RetryCount, in.RetryIntervalSeconds = ptr(3), ptr(5)
			return in
		}, func(r *domain.Service) {
			r.CheckIntervalSeconds, r.TimeoutSeconds, r.RetryCount, r.RetryIntervalSeconds = 100, 4, 3, 5
		}},
		{"HTTP to TCP", func() domain.ServiceInput {
			in := validTCP()
			in.Name = "api"
			return in
		}, func(r *domain.Service) {
			r.CheckType = domain.CheckTypeTCP
			r.HTTPMethod, r.HTTPURL = nil, nil
			r.TCPHost, r.TCPPort = ptr("db.local"), ptr(5432)
		}},
	}
	for _, g := range groups {
		t.Run(g.name, func(t *testing.T) {
			s := newServiceSetup()
			s.repo.services = []domain.Service{httpRow("id-1")}
			want := httpRow("id-1")
			g.row(&want)

			_, err := s.svc.UpdateService(t.Context(), "id-1", g.input())

			require.NoError(t, err)
			assert.Equal(t, want, s.saved(t))
		})
	}

	t.Run("TCP host and port", func(t *testing.T) {
		s := newServiceSetup()
		tcp := httpRow("id-1")
		tcp.CheckType, tcp.HTTPMethod, tcp.HTTPURL = domain.CheckTypeTCP, nil, nil
		tcp.TCPHost, tcp.TCPPort = ptr("old.local"), ptr(22)
		s.repo.services = []domain.Service{tcp}
		in := validTCP()
		in.Name = "api"
		in.Check.TCP = domain.TCPCheckInput{Host: "new.local", Port: 6379}

		_, err := s.svc.UpdateService(t.Context(), "id-1", in)

		require.NoError(t, err)
		want := tcp
		want.TCPHost, want.TCPPort = ptr("new.local"), ptr(6379)
		assert.Equal(t, want, s.saved(t))
	})

	t.Run("TCP to HTTP", func(t *testing.T) {
		s := newServiceSetup()
		tcp := httpRow("id-1")
		tcp.CheckType, tcp.HTTPMethod, tcp.HTTPURL = domain.CheckTypeTCP, nil, nil
		tcp.TCPHost, tcp.TCPPort = ptr("old.local"), ptr(22)
		s.repo.services = []domain.Service{tcp}

		_, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())

		require.NoError(t, err)
		assert.Equal(t, httpRow("id-1"), s.saved(t), "no host and port are left")
	})
}

func TestUpdateService_SavesTrimmedValues(t *testing.T) {
	s := seededEdit()
	in := domain.ServiceInput{
		Name: "  My API \n",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
			Method:  "GET",
			URL:     " https://x/y ",
			Headers: []domain.NameValue{{Name: "\tX-Id ", Value: " keep "}},
		}},
	}

	_, err := s.svc.UpdateService(t.Context(), "id-1", in)

	require.NoError(t, err)
	row := s.saved(t)
	assert.Equal(t, "My API", row.Name)
	assert.Equal(t, "my api", row.NameKey)
	assert.Equal(t, "https://x/y", *row.HTTPURL)
	assert.Equal(t, []domain.NameValue{{Name: "X-Id", Value: "keep"}}, row.HTTPHeaders)

	tcp := validTCP()
	tcp.Check.TCP.Host = " db.local "
	s2 := seededEdit()
	_, err = s2.svc.UpdateService(t.Context(), "id-1", tcp)
	require.NoError(t, err)
	assert.Equal(t, "db.local", *s2.saved(t).TCPHost)
}

func TestUpdateService_RejectedInputSavesNothing(t *testing.T) {
	cases := map[string]domain.ServiceInput{
		"empty name":       with(validHTTP(), func(in *domain.ServiceInput) { in.Name = " " }),
		"name too long":    with(validHTTP(), func(in *domain.ServiceInput) { in.Name = chars(11) }),
		"message too long": with(validHTTP(), func(in *domain.ServiceInput) { in.UnhealthyMessage = chars(501) }),
		"interval low":     with(validHTTP(), func(in *domain.ServiceInput) { in.CheckIntervalSeconds = ptr(29) }),
		"interval high":    with(validHTTP(), func(in *domain.ServiceInput) { in.CheckIntervalSeconds = ptr(301) }),
		"worst case over the interval": with(validHTTP(), func(in *domain.ServiceInput) {
			in.CheckIntervalSeconds, in.TimeoutSeconds, in.RetryCount, in.RetryIntervalSeconds = ptr(30), ptr(10), ptr(2), ptr(5)
		}),
		"bad URL": withHTTP(func(h *domain.HTTPCheckInput) { h.URL = "ftp://x" }),
	}
	for name, in := range cases {
		for _, id := range []string{"id-1", "missing"} {
			t.Run(name+" for "+id, func(t *testing.T) {
				s := seededEdit()

				_, err := s.svc.UpdateService(t.Context(), id, in)

				var verr domain.ValidationError
				require.ErrorAs(t, err, &verr)
				assert.NotEmpty(t, verr.Fields)
				_, createErr := newServiceSetup().svc.CreateService(t.Context(), in)
				var createVerr domain.ValidationError
				require.ErrorAs(t, createErr, &createVerr)
				assert.Equal(t, createVerr.Fields, verr.Fields, "the same fields as create")
				assert.Empty(t, s.repo.updates)
				assert.Empty(t, s.scheduler.restarted)
				assert.Empty(t, s.scheduler.started)
			})
		}
	}

	t.Run("a message of 500 characters passes", func(t *testing.T) {
		s := seededEdit()
		in := with(validHTTP(), func(in *domain.ServiceInput) { in.RecoveryMessage = chars(500) })
		_, err := s.svc.UpdateService(t.Context(), "id-1", in)
		require.NoError(t, err)
		assert.Len(t, s.saved(t).RecoveryMessage, 500)
	})
}

func TestUpdateService_OmittedValuesTakeTheDefaults(t *testing.T) {
	s := seededEdit() // its flags and settings differ from the defaults

	_, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())

	require.NoError(t, err)
	row := s.saved(t)
	assert.Equal(t, 90, row.CheckIntervalSeconds)
	assert.Equal(t, 7, row.TimeoutSeconds)
	assert.Equal(t, 2, row.RetryCount)
	assert.Equal(t, 3, row.RetryIntervalSeconds)
	assert.True(t, row.AlertsEnabled)
	assert.False(t, row.ShownOnPublicView)
	assert.Empty(t, row.UnhealthyMessage)
}

func TestUpdateService_FailedWriteDoesNotTouchTheScheduler(t *testing.T) {
	t.Run("not found", func(t *testing.T) {
		s := seededEdit()
		_, err := s.svc.UpdateService(t.Context(), "missing", validHTTP())
		require.ErrorIs(t, err, domain.ErrNotFound)
		assert.Empty(t, s.scheduler.restarted)
		assert.Empty(t, s.scheduler.started)
	})
	t.Run("name taken", func(t *testing.T) {
		s := seededEdit()
		other := httpRow("id-2")
		s.repo.services = append(s.repo.services, other)
		_, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP()) // "api" is id-2's name
		require.ErrorIs(t, err, domain.ErrServiceNameTaken)
		assert.Empty(t, s.scheduler.restarted)
		assert.Equal(t, "old", s.repo.services[0].Name, "nothing saved")
	})
	t.Run("another error", func(t *testing.T) {
		s := seededEdit()
		boom := errors.New("boom")
		s.repo.err = boom
		_, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())
		require.ErrorIs(t, err, boom)
		assert.Empty(t, s.scheduler.restarted)
	})
}

func TestUpdateService_RestartsTheScheduleOnceAfterTheWrite(t *testing.T) {
	s := seededEdit()

	view, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())

	require.NoError(t, err)
	assert.Equal(t, []string{"update", "restart"}, *s.events)
	require.Len(t, s.scheduler.restarted, 1)
	assert.Equal(t, view.Service, s.scheduler.restarted[0].service, "the service as saved")
	assert.Empty(t, s.scheduler.started, "an edit never starts a service")
}

func TestUpdateService_PausedServiceIsNotScheduled(t *testing.T) {
	s := seededEdit()
	s.repo.services[0].Paused = true

	view, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())

	require.NoError(t, err)
	assert.Equal(t, []string{"update"}, *s.events, "the write happens and the scheduler is not called")
	assert.True(t, view.Service.Paused, "paused is kept")
	assert.Equal(t, "api", s.repo.services[0].Name)
}

func TestUpdateService_NextCheckTime(t *testing.T) {
	now := serviceStart
	interval := 60 * time.Second
	at := func(d time.Duration) *time.Time { v := now.Add(d); return &v }
	cases := []struct {
		name string
		last *time.Time
		want time.Time
	}{
		{"never checked", nil, now.Add(interval)},
		{"one second before the boundary", at(-interval + time.Second), now.Add(time.Second)},
		{"exactly at the boundary", at(-interval), now.Add(interval)},
		{"long ago", at(-time.Hour), now.Add(interval)},
		{"a last check in the future is not corrected", at(1000 * time.Second), now.Add(1000*time.Second + interval)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := seededEdit() // its own interval is 200: the new one must be used
			s.repo.seedState(domain.ServiceState{ServiceID: "id-1", Status: domain.StatusHealthy, LastCheckedAt: c.last})
			in := validHTTP()
			in.CheckIntervalSeconds = ptr(60)
			in.TimeoutSeconds, in.RetryCount = ptr(5), ptr(1)

			_, err := s.svc.UpdateService(t.Context(), "id-1", in)

			require.NoError(t, err)
			require.Len(t, s.scheduler.restarted, 1)
			got := s.scheduler.restarted[0].at
			assert.Equal(t, c.want, got)
			assert.True(t, got.After(now), "an edit never checks at saving")
			assert.Empty(t, s.scheduler.started)
		})
	}
}

func TestUpdateService_ConcurrentEditsAreSerialized(t *testing.T) {
	for round := range 50 {
		s := seededEdit()
		var wg sync.WaitGroup
		for _, name := range []string{"first", "second"} {
			wg.Add(1)
			go func() {
				defer wg.Done()
				in := validHTTP()
				in.Name = name
				_, err := s.svc.UpdateService(t.Context(), "id-1", in)
				assert.NoError(t, err)
			}()
		}
		wg.Wait()

		require.Equal(t, []string{"update", "restart", "update", "restart"}, *s.events, "round %d", round)
	}
}

func TestUpdateService_AndDeleteAreSerialized(t *testing.T) {
	for round := range 50 {
		s := seededEdit()
		start := make(chan struct{})
		var wg sync.WaitGroup
		var updateErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, updateErr = s.svc.UpdateService(t.Context(), "id-1", validHTTP())
		}()
		go func() {
			defer wg.Done()
			<-start
			assert.NoError(t, s.svc.DeleteService(t.Context(), "id-1"))
		}()
		close(start)
		wg.Wait()

		if updateErr != nil {
			require.ErrorIs(t, updateErr, domain.ErrNotFound, "round %d", round)
			require.Equal(t, []string{"delete", "stop", "update"}, *s.events, "round %d: an update after the delete schedules nothing", round)
			assert.Empty(t, s.scheduler.restarted)
			continue
		}
		require.Equal(t, []string{"update", "restart", "delete", "stop"}, *s.events, "round %d", round)
	}
}

// pausedSetup returns a setup holding the unhealthy, checked service "id-1", paused or not.
func pausedSetup(paused bool) serviceSetup {
	s := seededEdit()
	s.repo.services[0].Paused = paused
	checked := serviceStart.Add(-time.Minute)
	s.repo.seedState(domain.ServiceState{
		ServiceID: "id-1", Status: domain.StatusUnhealthy, LastCheckedAt: &checked,
		LastStatusChangeAt: &checked, FailureCode: ptr(domain.FailureNon2xxStatus), FailureHTTPStatus: ptr(503),
	})
	return s
}

func TestPauseService_SavesTheFlagThenStopsTheSchedulerOnce(t *testing.T) {
	s := pausedSetup(false)

	view, err := s.svc.PauseService(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, []pauseCall{{"id-1", true, serviceStart}}, s.repo.pauseCalls)
	assert.Equal(t, []string{"set-paused", "stop"}, *s.events)
	assert.Equal(t, []string{"id-1"}, s.scheduler.stopped)
	assert.True(t, view.Service.Paused)
	assert.Equal(t, s.repo.states["id-1"], view.State, "the state is kept")
	assert.Equal(t, domain.StatusUnhealthy, view.State.Status)
}

func TestPauseService_StopsEvenWhenTheRequestIsCancelled(t *testing.T) {
	s := pausedSetup(false)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := s.svc.PauseService(ctx, "id-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"set-paused", "stop"}, *s.events)
}

func TestPauseService_WhenTheFlagDidNotChangeNothingIsCalled(t *testing.T) {
	s := pausedSetup(true)

	view, err := s.svc.PauseService(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"set-paused"}, *s.events, "baseline: the write is asked, the scheduler is not")
	assert.True(t, view.Service.Paused)
	assert.Equal(t, domain.StatusUnhealthy, view.State.Status)
}

func TestResumeService_RestartsOnceWithTheServiceAndTheClockTime(t *testing.T) {
	s := pausedSetup(true)

	view, err := s.svc.ResumeService(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, []pauseCall{{"id-1", false, serviceStart}}, s.repo.pauseCalls)
	assert.Equal(t, []string{"set-paused", "restart"}, *s.events)
	require.Len(t, s.scheduler.restarted, 1)
	assert.Equal(t, restartCall{view.Service, serviceStart}, s.scheduler.restarted[0])
	assert.False(t, s.scheduler.restarted[0].service.Paused)
	assert.Empty(t, s.scheduler.started)
	assert.Empty(t, s.scheduler.stopped)
	assert.False(t, view.Service.Paused)
	assert.Equal(t, s.repo.states["id-1"], view.State, "the state is kept")
}

func TestResumeService_WhenTheServiceIsNotPausedNothingIsCalled(t *testing.T) {
	s := pausedSetup(false)

	view, err := s.svc.ResumeService(t.Context(), "id-1")

	require.NoError(t, err)
	assert.Equal(t, []string{"set-paused"}, *s.events)
	assert.False(t, view.Service.Paused)
}

func TestPauseAndResume_FailuresComeBackAndCallNoScheduler(t *testing.T) {
	boom := errors.New("disk full")
	ops := map[string]func(s serviceSetup, id string) error{
		"pause":  func(s serviceSetup, id string) error { _, err := s.svc.PauseService(t.Context(), id); return err },
		"resume": func(s serviceSetup, id string) error { _, err := s.svc.ResumeService(t.Context(), id); return err },
	}
	for name, op := range ops {
		t.Run(name+" unknown id", func(t *testing.T) {
			s := pausedSetup(name == "resume")
			require.ErrorIs(t, op(s, "other"), domain.ErrNotFound)
			assert.Empty(t, *s.events)
		})
		t.Run(name+" other error", func(t *testing.T) {
			s := pausedSetup(name == "resume")
			s.repo.err = boom
			require.ErrorIs(t, op(s, "id-1"), boom)
			assert.Empty(t, *s.events)
		})
	}
}

// lastScheduler is the last scheduler event of a list, or "".
func lastScheduler(events []string) string {
	for i := len(events) - 1; i >= 0; i-- {
		if events[i] == "stop" || events[i] == "restart" {
			return events[i]
		}
	}
	return ""
}

func TestPauseAndResume_AreSerialized(t *testing.T) {
	for round := range 50 {
		s := pausedSetup(round%2 == 0)
		start := make(chan struct{})
		var wg sync.WaitGroup
		for _, op := range []func(){
			func() { _, err := s.svc.PauseService(t.Context(), "id-1"); assert.NoError(t, err) },
			func() { _, err := s.svc.ResumeService(t.Context(), "id-1"); assert.NoError(t, err) },
		} {
			wg.Add(1)
			go func() { defer wg.Done(); <-start; op() }()
		}
		close(start)
		wg.Wait()

		events := *s.events
		// Each operation is its write, then its scheduler call if the flag changed; the
		// other operation never comes in between.
		require.Len(t, events, 2+len(s.scheduler.stopped)+len(s.scheduler.restarted), "round %d: %v", round, events)
		for i, e := range events {
			if e == "set-paused" && i+1 < len(events) && events[i+1] == "set-paused" {
				// the first changed nothing: no scheduler call between two writes
				continue
			}
			if e == "stop" || e == "restart" {
				require.Equal(t, "set-paused", events[i-1], "round %d: %v", round, events)
			}
		}
		stored := s.repo.services[0].Paused
		if last := lastScheduler(events); last != "" {
			require.Equal(t, stored, last == "stop", "round %d: %v, stored paused %v", round, events, stored)
		}
	}
}

func TestResume_AndDeleteAreSerialized(t *testing.T) {
	for round := range 50 {
		s := pausedSetup(true)
		start := make(chan struct{})
		var wg sync.WaitGroup
		var resumeErr error
		wg.Add(2)
		go func() { defer wg.Done(); <-start; _, resumeErr = s.svc.ResumeService(t.Context(), "id-1") }()
		go func() { defer wg.Done(); <-start; assert.NoError(t, s.svc.DeleteService(t.Context(), "id-1")) }()
		close(start)
		wg.Wait()

		if resumeErr != nil {
			require.ErrorIs(t, resumeErr, domain.ErrNotFound, "round %d", round)
			require.Equal(t, []string{"delete", "stop"}, *s.events, "round %d: a resume after the delete schedules nothing", round)
			continue
		}
		require.Equal(t, []string{"set-paused", "restart", "delete", "stop"}, *s.events, "round %d: a restart never follows the stop of a delete", round)
	}
}

func TestResume_AndUpdateAfterAPauseAreSerialized(t *testing.T) {
	for round := range 50 {
		s := pausedSetup(false)
		_, err := s.svc.PauseService(t.Context(), "id-1")
		require.NoError(t, err)
		*s.events = nil
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, err := s.svc.ResumeService(t.Context(), "id-1")
			assert.NoError(t, err)
		}()
		go func() {
			defer wg.Done()
			<-start
			_, err := s.svc.UpdateService(t.Context(), "id-1", validHTTP())
			assert.NoError(t, err)
		}()
		close(start)
		wg.Wait()

		// Either order is whole: an update before the resume schedules nothing (paused),
		// one after it restarts; the resume always restarts once.
		events := *s.events
		if events[0] == "update" {
			require.Equal(t, []string{"update", "set-paused", "restart"}, events, "round %d", round)
		} else {
			require.Equal(t, []string{"set-paused", "restart", "update", "restart"}, events, "round %d", round)
		}
		assert.False(t, s.repo.services[0].Paused)
	}
}

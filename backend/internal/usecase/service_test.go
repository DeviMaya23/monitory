package usecase_test

import (
	"errors"
	"regexp"
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

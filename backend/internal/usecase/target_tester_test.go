package usecase_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

var testerStart = time.Date(2026, 11, 18, 21, 5, 59, 0, time.FixedZone("UTC+7", 7*60*60))

// testerFinder is a usecase.ServiceFinder with one service, or an error.
type testerFinder struct {
	service domain.Service
	err     error
	calls   int
}

func (f *testerFinder) Find(context.Context, string) (domain.Service, error) {
	f.calls++
	return f.service, f.err
}

type emailCall struct {
	to    string
	alert domain.Alert
}

// testerMail is a usecase.TestEmailSender that records its calls and returns err.
type testerMail struct {
	calls []emailCall
	err   error
}

func (m *testerMail) SendEmail(_ context.Context, to string, alert domain.Alert) error {
	m.calls = append(m.calls, emailCall{to, alert})
	return m.err
}

type webhookCall struct {
	url     string
	headers []domain.NameValue
	alert   domain.Alert
}

// testerWebhooks is a usecase.TestWebhookSender that records its calls and returns err.
type testerWebhooks struct {
	calls []webhookCall
	err   error
}

func (w *testerWebhooks) SendWebhook(_ context.Context, url string, headers []domain.NameValue, alert domain.Alert) error {
	w.calls = append(w.calls, webhookCall{url, headers, alert})
	return w.err
}

type testerSetup struct {
	svc      *usecase.TargetTestService
	finder   *testerFinder
	mail     *testerMail
	webhooks *testerWebhooks
}

func newTesterSetup() testerSetup {
	s := testerSetup{
		finder:   &testerFinder{service: domain.Service{ID: "svc-1", Name: "API", AlertsEnabled: true}},
		mail:     &testerMail{},
		webhooks: &testerWebhooks{},
	}
	s.svc = usecase.NewTargetTestService(s.finder, s.mail, s.webhooks, clock.NewFake(testerStart), testTargetLimits)
	return s
}

func wantTestAlert(name string) domain.Alert {
	return domain.Alert{
		ServiceID: "svc-1", ServiceName: name, Status: domain.AlertTest,
		ChangedAt: testerStart.UTC(), Message: usecase.TestAlertMessage,
	}
}

func TestTestTarget_Email(t *testing.T) {
	s := newTesterSetup()

	got, err := s.svc.TestTarget(t.Context(), "svc-1", domain.TargetInput{Type: "email", Address: "  ops@example.com "})

	require.NoError(t, err)
	assert.Equal(t, domain.TargetTestResult{Delivered: true}, got)
	assert.Equal(t, []emailCall{{"ops@example.com", wantTestAlert("API")}}, s.mail.calls)
	assert.Empty(t, s.webhooks.calls)
}

func TestTestTarget_Webhook(t *testing.T) {
	s := newTesterSetup()

	got, err := s.svc.TestTarget(t.Context(), "svc-1", domain.TargetInput{
		Type: "webhook", URL: " https://example.com/hook ",
		Headers: []domain.NameValue{{Name: " B ", Value: " 2 "}, {Name: "A", Value: "1"}},
	})

	require.NoError(t, err)
	assert.Equal(t, domain.TargetTestResult{Delivered: true}, got)
	assert.Equal(t, []webhookCall{{
		"https://example.com/hook",
		[]domain.NameValue{{Name: "B", Value: "2"}, {Name: "A", Value: "1"}},
		wantTestAlert("API"),
	}}, s.webhooks.calls)
	assert.Empty(t, s.mail.calls)
}

func TestTestTarget_FailedDeliveryIsAResult(t *testing.T) {
	reasons := []string{
		"no SMTP account configured",
		"the SMTP server did not accept the message",
		"could not connect to the webhook",
		"the webhook's certificate was rejected",
		"the webhook did not answer in time",
		"the webhook answered with status 503",
		"a custom header is not valid",
		"any other text",
	}
	for _, reason := range reasons {
		t.Run(reason, func(t *testing.T) {
			s := newTesterSetup()
			s.mail.err, s.webhooks.err = errors.New(reason), errors.New(reason)

			for _, in := range []domain.TargetInput{validEmailTarget(), validWebhookTarget()} {
				got, err := s.svc.TestTarget(t.Context(), "svc-1", in)

				require.NoError(t, err)
				assert.Equal(t, domain.TargetTestResult{Delivered: false, FailureReason: reason}, got)
			}
			assert.Len(t, s.mail.calls, 1, "one attempt, no retry")
			assert.Len(t, s.webhooks.calls, 1, "one attempt, no retry")
		})
	}
}

func TestTestTarget_AlertNameIsTheServicesSavedName(t *testing.T) {
	s := newTesterSetup()
	s.finder.service.Name = `<b>x</b> "q"`
	in := validEmailTarget()
	in.Name = "Pager duty"

	_, err := s.svc.TestTarget(t.Context(), "svc-1", in)

	require.NoError(t, err)
	require.Len(t, s.mail.calls, 1)
	assert.Equal(t, `<b>x</b> "q"`, s.mail.calls[0].alert.ServiceName)
	assert.Equal(t, wantTestAlert(`<b>x</b> "q"`), s.mail.calls[0].alert)
}

func TestTestTarget_InvalidInputSendsNothing(t *testing.T) {
	tooManyRows := make([]domain.NameValue, testTargetLimits.MaxHeaders+1)
	for i := range tooManyRows {
		tooManyRows[i] = domain.NameValue{Name: fmt.Sprintf("H%d", i), Value: "v"}
	}
	hook := func(mutate func(*domain.TargetInput)) domain.TargetInput {
		in := validWebhookTarget()
		mutate(&in)
		return in
	}
	tests := []struct {
		name string
		in   domain.TargetInput
	}{
		{"empty address", domain.TargetInput{Type: "email"}},
		{"malformed address", domain.TargetInput{Type: "email", Address: "not-an-address"}},
		{"address over the limit", domain.TargetInput{Type: "email", Address: strings.Repeat("a", testTargetLimits.EmailMaxLength) + "@x.io"}},
		{"url without a scheme", domain.TargetInput{Type: "webhook", URL: "ftp://example.com"}},
		{"url over the limit", domain.TargetInput{Type: "webhook", URL: "https://example.com/" + strings.Repeat("a", testTargetLimits.WebhookURLMaxLength)}},
		{"header with an empty name", hook(func(in *domain.TargetInput) { in.Headers = []domain.NameValue{{Name: " ", Value: "v"}} })},
		{"too many header rows", hook(func(in *domain.TargetInput) { in.Headers = tooManyRows })},
		{"name over 50 characters", hook(func(in *domain.TargetInput) { in.Name = strings.Repeat("n", 51) })},
		{"missing type", domain.TargetInput{Address: "ops@example.com"}},
		{"unknown type", domain.TargetInput{Type: "sms", Address: "ops@example.com"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newTesterSetup()
			want := newTargetSetup()
			_, createErr := want.svc.CreateTarget(t.Context(), "s1", tt.in)
			var wantErr domain.ValidationError
			require.ErrorAs(t, createErr, &wantErr, "the input is invalid for createTarget")

			_, err := s.svc.TestTarget(t.Context(), "svc-1", tt.in)

			var got domain.ValidationError
			require.ErrorAs(t, err, &got)
			assert.Equal(t, wantErr.Fields, got.Fields)
			assert.Empty(t, s.mail.calls)
			assert.Empty(t, s.webhooks.calls)
			assert.Zero(t, s.finder.calls, "Find comes after validation")
		})
	}
}

func TestTestTarget_LimitsAreTheConfiguredOnes(t *testing.T) {
	for name, in := range map[string]domain.TargetInput{
		"address at the limit": {Type: "email", Address: strings.Repeat("a", testTargetLimits.EmailMaxLength-len("@x.io")) + "@x.io"},
		"name at 50":           {Type: "email", Address: "ops@example.com", Name: strings.Repeat("n", 50)},
		"url at the limit":     {Type: "webhook", URL: "https://x.io/" + strings.Repeat("a", testTargetLimits.WebhookURLMaxLength-len("https://x.io/"))},
	} {
		t.Run(name, func(t *testing.T) {
			s := newTesterSetup()

			got, err := s.svc.TestTarget(t.Context(), "svc-1", in)

			require.NoError(t, err)
			assert.True(t, got.Delivered)
		})
	}
}

func TestTestTarget_AlertsOffStillSends(t *testing.T) {
	s := newTesterSetup()
	s.finder.service.AlertsEnabled = false

	got, err := s.svc.TestTarget(t.Context(), "svc-1", validEmailTarget())

	require.NoError(t, err)
	assert.Equal(t, domain.TargetTestResult{Delivered: true}, got)
	assert.Len(t, s.mail.calls, 1)
}

func TestTestTarget_FindErrors(t *testing.T) {
	t.Run("a service that does not exist", func(t *testing.T) {
		s := newTesterSetup()
		s.finder.err = domain.ErrNotFound

		_, err := s.svc.TestTarget(t.Context(), "gone", validEmailTarget())

		require.ErrorIs(t, err, domain.ErrNotFound)
		assert.Empty(t, s.mail.calls)
		assert.Empty(t, s.webhooks.calls)
	})
	t.Run("another error is wrapped", func(t *testing.T) {
		s := newTesterSetup()
		boom := errors.New("database is locked")
		s.finder.err = boom

		_, err := s.svc.TestTarget(t.Context(), "svc-1", validWebhookTarget())

		require.ErrorIs(t, err, boom)
		assert.NotErrorIs(t, err, domain.ErrNotFound)
		assert.Empty(t, s.mail.calls)
		assert.Empty(t, s.webhooks.calls)
	})
}

func TestTestTarget_EndedContextIsAnErrorNotAResult(t *testing.T) {
	s := newTesterSetup()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	s.mail.err, s.webhooks.err = errors.New("could not connect to the webhook"), errors.New("could not connect to the webhook")

	for _, in := range []domain.TargetInput{validEmailTarget(), validWebhookTarget()} {
		got, err := s.svc.TestTarget(ctx, "svc-1", in)

		require.ErrorIs(t, err, context.Canceled)
		assert.Equal(t, domain.TargetTestResult{}, got)
	}

	// Baseline: the same failure with a live context is a result.
	got, err := s.svc.TestTarget(t.Context(), "svc-1", validEmailTarget())
	require.NoError(t, err)
	assert.False(t, got.Delivered)
}

// offsetClock is a usecase.Clock that reports its time in a zone other than UTC, as a
// real clock on a server with a local zone does. clock.Fake converts to UTC itself, so
// it cannot show that the usecase does.
type offsetClock struct{ now time.Time }

func (c offsetClock) Now() time.Time { return c.now }

func TestTestTarget_AlertTimeIsUTCEvenWhenTheClockIsNot(t *testing.T) {
	s := newTesterSetup()
	local := time.Date(2026, 11, 18, 21, 5, 59, 0, time.FixedZone("UTC+7", 7*60*60))
	svc := usecase.NewTargetTestService(s.finder, s.mail, s.webhooks, offsetClock{local}, testTargetLimits)

	_, err := svc.TestTarget(t.Context(), "svc-1", validEmailTarget())

	require.NoError(t, err)
	require.Len(t, s.mail.calls, 1)
	got := s.mail.calls[0].alert.ChangedAt
	assert.Equal(t, time.UTC, got.Location())
	assert.True(t, got.Equal(local))
	assert.Equal(t, wantTestAlert("API"), s.mail.calls[0].alert)
}

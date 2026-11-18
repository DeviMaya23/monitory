package webhook_test

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/adaptor/webhook"
	"monitory/internal/domain"
	"monitory/internal/testutil"
)

const serviceID = "svc-9f3c1d-distinctive"

func newSender(t *testing.T, timeout time.Duration) *webhook.Sender {
	t.Helper()
	s, err := webhook.New(webhook.Config{Timeout: timeout})
	require.NoError(t, err)
	return s
}

func testAlert() domain.Alert {
	return domain.Alert{
		ServiceID: serviceID, ServiceName: "Billing API", Status: domain.AlertUnhealthy,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 0, 0, time.UTC), Message: "the check failed",
	}
}

func receiver(t *testing.T, opts ...testutil.TargetOption) *testutil.TargetServer {
	t.Helper()
	return testutil.NewTargetServer(t, opts...)
}

func TestSendWebhook_2xxIsDelivered(t *testing.T) {
	for _, status := range []int{200, 204, 299} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			ts := receiver(t)
			ts.Script("/hook", testutil.Route{Status: status})

			err := newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())

			require.NoError(t, err)
			reqs := ts.Requests()
			require.Len(t, reqs, 1)
			assert.Equal(t, http.MethodPost, reqs[0].Method)
			assert.Equal(t, "/hook", reqs[0].Path)
			assert.Equal(t, []string{"application/json"}, reqs[0].Header.Values("Content-Type"))
			assert.Equal(t, []string{"Monitory"}, reqs[0].Header.Values("User-Agent"))
		})
	}
}

func TestSendWebhook_BodyHasTheFourValuesOnly(t *testing.T) {
	for _, status := range []domain.AlertStatus{domain.AlertUnhealthy, domain.AlertHealthy} {
		t.Run(string(status), func(t *testing.T) {
			ts := receiver(t)
			ts.Script("/hook", testutil.Route{})
			alert := testAlert()
			alert.Status = status

			require.NoError(t, newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook",
				[]domain.NameValue{{Name: "X-Key", Value: "v"}}, alert))

			req := ts.Requests()[0]
			var got map[string]any
			require.NoError(t, json.Unmarshal([]byte(req.Body), &got))
			assert.Equal(t, map[string]any{
				"service_name": "Billing API", "status": string(status),
				"changed_at": "2026-11-18T14:05:00Z", "message": "the check failed",
			}, got)
			assert.NotContains(t, req.Body, serviceID)
			for name, values := range req.Header {
				assert.NotContains(t, strings.Join(values, ","), serviceID, name)
			}
		})
	}
}

func TestSendWebhook_ChangedAtIsUTCWithoutFraction(t *testing.T) {
	zone := time.FixedZone("UTC+7", 7*60*60)
	tests := []struct {
		name string
		at   time.Time
		want string
	}{
		{"a fraction is dropped, not rounded", time.Date(2026, 11, 18, 14, 5, 59, 900_000_000, time.UTC), "2026-11-18T14:05:59Z"},
		{"another zone is converted", time.Date(2026, 11, 18, 21, 5, 59, 0, zone), "2026-11-18T14:05:59Z"},
		{"a zone with a fraction", time.Date(2026, 11, 18, 21, 5, 59, 999_999_999, zone), "2026-11-18T14:05:59Z"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := receiver(t)
			ts.Script("/hook", testutil.Route{})
			alert := testAlert()
			alert.ChangedAt = tt.at

			require.NoError(t, newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, alert))

			var got map[string]string
			require.NoError(t, json.Unmarshal([]byte(ts.Requests()[0].Body), &got))
			assert.Equal(t, tt.want, got["changed_at"])
		})
	}
}

func TestSendWebhook_TextIsJSONNeverInterpreted(t *testing.T) {
	ts := receiver(t)
	ts.Script("/hook", testutil.Route{})
	text := "<b>x</b> \"quoted\"\nsecond line é中\U0001F600"
	alert := testAlert()
	alert.ServiceName = text
	alert.Message = text

	require.NoError(t, newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, alert))

	body := ts.Requests()[0].Body
	require.True(t, json.Valid([]byte(body)))
	var got map[string]string
	require.NoError(t, json.Unmarshal([]byte(body), &got))
	assert.Equal(t, text, got["service_name"])
	assert.Equal(t, text, got["message"])
}

func TestSendWebhook_TestStatus(t *testing.T) {
	ts := receiver(t)
	ts.Script("/hook", testutil.Route{})
	name := `<b>x</b> "quoted"`
	message := "This is a test alert from Monitory. No service has changed status."
	alert := domain.Alert{
		ServiceID: serviceID, ServiceName: name, Status: domain.AlertTest,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 7, 0, time.UTC), Message: message,
	}

	require.NoError(t, newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, alert))

	var got map[string]any
	require.NoError(t, json.Unmarshal([]byte(ts.Requests()[0].Body), &got))
	assert.Equal(t, map[string]any{
		"service_name": name, "status": "test",
		"changed_at": "2026-11-18T14:05:07Z", "message": message,
	}, got)
}

func TestSendWebhook_CustomHeaders(t *testing.T) {
	long := strings.Repeat("a", 4096)
	send := func(t *testing.T, headers []domain.NameValue) http.Header {
		t.Helper()
		ts := receiver(t)
		ts.Script("/hook", testutil.Route{})
		require.NoError(t, newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", headers, testAlert()))
		reqs := ts.Requests()
		require.Len(t, reqs, 1)
		return reqs[0].Header
	}

	t.Run("values as saved, names canonical", func(t *testing.T) {
		h := send(t, []domain.NameValue{{Name: "x-api-key", Value: "Secret Value"}, {Name: "X-Other", Value: "a\tb"}})
		assert.Equal(t, []string{"Secret Value"}, h.Values("X-Api-Key"))
		assert.Equal(t, []string{"a\tb"}, h.Values("X-Other"))
	})
	t.Run("a value of 4,096 characters arrives whole", func(t *testing.T) {
		assert.Equal(t, []string{long}, send(t, []domain.NameValue{{Name: "X-Long", Value: long}}).Values("X-Long"))
	})
	t.Run("two headers with one name keep their order", func(t *testing.T) {
		h := send(t, []domain.NameValue{{Name: "X-Dup", Value: "first"}, {Name: "x-dup", Value: "second"}})
		assert.Equal(t, []string{"first", "second"}, h.Values("X-Dup"))
	})
	t.Run("a custom Content-Type replaces the default", func(t *testing.T) {
		h := send(t, []domain.NameValue{{Name: "content-type", Value: "application/vnd.custom+json"}})
		assert.Equal(t, []string{"application/vnd.custom+json"}, h.Values("Content-Type"))
	})
	t.Run("a custom User-Agent replaces the default", func(t *testing.T) {
		h := send(t, []domain.NameValue{{Name: "USER-AGENT", Value: "Mine/1"}})
		assert.Equal(t, []string{"Mine/1"}, h.Values("User-Agent"))
	})
	t.Run("20 headers of 4,096 characters arrive whole", func(t *testing.T) {
		headers := make([]domain.NameValue, 20)
		for i := range headers {
			headers[i] = domain.NameValue{Name: "X-Big-" + strconv.Itoa(i), Value: long}
		}
		h := send(t, headers)
		for i := range headers {
			assert.Equal(t, []string{long}, h.Values("X-Big-"+strconv.Itoa(i)), headers[i].Name)
		}
	})
	t.Run("no custom headers sends the two defaults", func(t *testing.T) {
		h := send(t, nil)
		assert.Equal(t, []string{"application/json"}, h.Values("Content-Type"))
		assert.Equal(t, []string{"Monitory"}, h.Values("User-Agent"))
		assert.Empty(t, h.Values("X-Api-Key"))
	})
}

func TestSendWebhook_InvalidHeaderIsRefusedBeforeSending(t *testing.T) {
	good := domain.NameValue{Name: "X-Good", Value: "ok"}
	tests := []struct {
		name string
		bad  domain.NameValue
	}{
		{"empty name", domain.NameValue{Name: "", Value: "v"}},
		{"space in the name", domain.NameValue{Name: "X Bad", Value: "v"}},
		{"colon in the name", domain.NameValue{Name: "X:Bad", Value: "v"}},
		{"CR in the value", domain.NameValue{Name: "X-Bad", Value: "a\rb"}},
		{"LF in the value", domain.NameValue{Name: "X-Bad", Value: "a\nb"}},
		{"NUL in the value", domain.NameValue{Name: "X-Bad", Value: "a\x00b"}},
		{"DEL in the value", domain.NameValue{Name: "X-Bad", Value: "a\x7fb"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := receiver(t)
			ts.Script("/hook", testutil.Route{})
			s := newSender(t, 5*time.Second)

			// Baseline: the same call with only the good header sends.
			require.NoError(t, s.SendWebhook(context.Background(), ts.URL()+"/hook", []domain.NameValue{good}, testAlert()))
			require.Len(t, ts.Requests(), 1)

			for _, headers := range [][]domain.NameValue{{tt.bad}, {good, tt.bad}} {
				err := s.SendWebhook(context.Background(), ts.URL()+"/hook", headers, testAlert())
				require.ErrorIs(t, err, webhook.ErrInvalidHeader)
				assert.Equal(t, "a custom header is not valid", err.Error())
			}
			assert.Len(t, ts.Requests(), 1, "nothing was sent for an invalid header")
		})
	}
}

func TestSendWebhook_NonSuccessStatuses(t *testing.T) {
	for _, status := range []int{300, 301, 302, 307, 308, 404, 500} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			ts := receiver(t)
			ts.Script("/hook", testutil.Route{Status: status, RedirectTo: "/elsewhere"})
			ts.Script("/elsewhere", testutil.Route{})

			err := newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())

			var se *webhook.StatusError
			require.ErrorAs(t, err, &se)
			assert.Equal(t, status, se.Code)
			assert.Equal(t, "the webhook answered with status "+strconv.Itoa(status), err.Error())
			assert.Len(t, ts.Requests(), 1)
			assert.Empty(t, ts.RequestsTo("/elsewhere"), "a redirect is not followed")
		})
	}
}

func TestSendWebhook_CouldNotConnect(t *testing.T) {
	t.Run("a port nothing listens on", func(t *testing.T) {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		addr := l.Addr().String()
		require.NoError(t, l.Close())

		err = newSender(t, 5*time.Second).SendWebhook(context.Background(), "http://"+addr+"/hook", nil, testAlert())

		require.ErrorIs(t, err, webhook.ErrCouldNotConnect)
		assert.Equal(t, "could not connect to the webhook", err.Error())
	})
	t.Run("the connection is closed without an answer", func(t *testing.T) {
		ts := receiver(t)
		ts.Script("/hook", testutil.Route{CloseWithoutAnswer: true})

		err := newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())

		require.ErrorIs(t, err, webhook.ErrCouldNotConnect)
		assert.Equal(t, "could not connect to the webhook", err.Error())
		assert.Len(t, ts.Requests(), 1, "baseline: the request did reach the receiver")
	})
}

func TestSendWebhook_CertificateRejected(t *testing.T) {
	ts := receiver(t, testutil.TargetTLS())
	ts.Script("/hook", testutil.Route{})

	err := newSender(t, 5*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())

	require.ErrorIs(t, err, webhook.ErrCertificate)
	assert.Equal(t, "the webhook's certificate was rejected", err.Error())
	assert.Empty(t, ts.Requests())
}

func TestSendWebhook_Timeout(t *testing.T) {
	t.Run("an answer after the timeout fails fast", func(t *testing.T) {
		ts := receiver(t)
		ts.Script("/hook", testutil.Route{Delay: 200 * time.Millisecond})
		s := newSender(t, 50*time.Millisecond)

		start := time.Now()
		err := s.SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())
		elapsed := time.Since(start)

		require.ErrorIs(t, err, webhook.ErrTimedOut)
		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.Equal(t, "the webhook did not answer in time", err.Error())
		assert.Less(t, elapsed, 150*time.Millisecond)
	})
	t.Run("an answer inside the timeout is delivered", func(t *testing.T) {
		ts := receiver(t)
		ts.Script("/hook", testutil.Route{Delay: 20 * time.Millisecond})

		err := newSender(t, 2*time.Second).SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())

		require.NoError(t, err)
	})
}

func TestSendWebhook_CancelledContext(t *testing.T) {
	ts := receiver(t)
	ts.Script("/hook", testutil.Route{Delay: 200 * time.Millisecond})
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-ts.Arrived("/hook")
		cancel()
	}()

	err := newSender(t, 5*time.Second).SendWebhook(ctx, ts.URL()+"/hook", nil, testAlert())

	require.ErrorIs(t, err, context.Canceled)
	assert.False(t, errors.Is(err, webhook.ErrTimedOut))
}

func TestSendWebhook_ContextAlreadyCancelled(t *testing.T) {
	ts := receiver(t)
	ts.Script("/hook", testutil.Route{})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := newSender(t, 5*time.Second).SendWebhook(ctx, ts.URL()+"/hook", nil, testAlert())

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, ts.Requests())
}

func TestSendWebhook_FailureTextsHoldNoSecrets(t *testing.T) {
	secretHeader := domain.NameValue{Name: "X-Secret-Name", Value: "secret-value-123"}
	alert := testAlert()
	alert.Message = "secret message text"

	closed, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	closedAddr := closed.Addr().String()
	closedURL := "http://" + closedAddr
	require.NoError(t, closed.Close())

	plain := receiver(t)
	plain.Script("/secret-path", testutil.Route{Status: 503})
	plain.Script("/slow", testutil.Route{Delay: 200 * time.Millisecond})
	plain.Script("/drop", testutil.Route{CloseWithoutAnswer: true})
	tlsServer := receiver(t, testutil.TargetTLS())
	tlsServer.Script("/secret-path", testutil.Route{})

	cases := map[string]struct {
		url     string
		headers []domain.NameValue
		timeout time.Duration
	}{
		"status":      {plain.URL() + "/secret-path?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"refused":     {"http://" + closedAddr + "/secret-path?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"dropped":     {plain.URL() + "/drop?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"certificate": {tlsServer.URL() + "/secret-path?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"timeout":     {plain.URL() + "/slow?token=abc", []domain.NameValue{secretHeader}, 30 * time.Millisecond},
		"malformed":   {"http://[::1/secret-path?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"user info":   {strings.Replace(closedURL, "http://", "http://user:pass@", 1) + "/secret-path?token=abc", []domain.NameValue{secretHeader}, 5 * time.Second},
		"header":      {plain.URL() + "/secret-path?token=abc", []domain.NameValue{{Name: "X-Secret Name", Value: "secret-value-123"}}, 5 * time.Second},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			err := newSender(t, c.timeout).SendWebhook(context.Background(), c.url, c.headers, alert)

			require.Error(t, err, "baseline: the case fails")
			text := err.Error()
			hostPort := strings.TrimPrefix(strings.TrimPrefix(c.url, "https://"), "http://")
			hostPort, _, _ = strings.Cut(hostPort, "/")
			host, port, _ := net.SplitHostPort(hostPort)
			for _, secret := range []string{c.url, "token=abc", "secret-path", hostPort, host, port, "X-Secret", "secret-value-123", "secret message text", "127.0.0.1", "user:pass", "pass"} {
				if secret == "" {
					continue
				}
				assert.NotContains(t, text, secret)
			}
			var se *webhook.StatusError
			if !errors.As(err, &se) {
				assert.NotContains(t, text, "Post", "the Go error's own text is not used")
				assert.NotContains(t, text, "dial tcp")
			}
		})
	}
}

func TestNew_Timeout(t *testing.T) {
	for _, d := range []time.Duration{0, -time.Second} {
		_, err := webhook.New(webhook.Config{Timeout: d})
		assert.Error(t, err, d.String())
	}
	_, err := webhook.New(webhook.Config{Timeout: time.Second})
	assert.NoError(t, err)
}

func TestSendWebhook_Concurrent(t *testing.T) {
	ts := receiver(t)
	ts.Script("/hook", testutil.Route{})
	s := newSender(t, 5*time.Second)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = s.SendWebhook(context.Background(), ts.URL()+"/hook", nil, testAlert())
		}()
	}
	wg.Wait()

	assert.NoError(t, errs[0])
	assert.NoError(t, errs[1])
	assert.Len(t, ts.Requests(), 2)
}

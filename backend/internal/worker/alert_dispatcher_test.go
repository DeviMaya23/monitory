package worker_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/worker"
)

const (
	secretAddress = "secret.person@example.com"
	secretURL     = "https://hooks.example.com/secret-path"
	secretName    = "Secret Target Name"
	secretService = "Secret Service Name"
	secretMessage = "Secret alert message"
)

type mailCall struct {
	to    string
	alert domain.Alert
}

// fakeMailer records calls. A send's behaviour is chosen by the address it is sent to:
// behave[to] runs with the send's context; an address with no entry succeeds.
type fakeMailer struct {
	mu       sync.Mutex
	calls    []mailCall
	started  chan string // receives the address of every send as it starts
	behave   map[string]func(ctx context.Context) error
	done     map[string]bool
	returned int // sends that have returned
}

func newFakeMailer() *fakeMailer {
	return &fakeMailer{started: make(chan string, 100), behave: map[string]func(context.Context) error{}, done: map[string]bool{}}
}

func (m *fakeMailer) SendEmail(ctx context.Context, to string, alert domain.Alert) error {
	m.mu.Lock()
	m.calls = append(m.calls, mailCall{to, alert})
	fn := m.behave[to]
	m.mu.Unlock()
	m.started <- to
	var err error
	if fn != nil {
		err = fn(ctx)
	}
	m.mu.Lock()
	m.done[to] = true
	m.returned++
	m.mu.Unlock()
	return err
}

func (m *fakeMailer) callList() []mailCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]mailCall(nil), m.calls...)
}

func (m *fakeMailer) returnedCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.returned
}

func (m *fakeMailer) hasReturned(to string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.done[to]
}

// syncBuffer is a bytes.Buffer safe for the dispatcher's goroutines.
type syncBuffer struct {
	mu      sync.Mutex
	b       bytes.Buffer
	written chan struct{} // one signal per log line written
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.written != nil {
		s.written <- struct{}{}
	}
	return s.b.Write(p)
}

// waitLines blocks until n log lines have been written. Tests call it before Close
// when they expect the outcome of a send, because Close cancels the sends still running.
func (s *syncBuffer) waitLines(t *testing.T, n int) {
	t.Helper()
	for range n {
		select {
		case <-s.written:
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for a log line")
		}
	}
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func (s *syncBuffer) lines(t *testing.T) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(s.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &m))
		out = append(out, m)
	}
	return out
}

func newDispatcher(t *testing.T, mailer worker.Mailer) (*worker.AlertDispatcher, *syncBuffer) {
	t.Helper()
	buf := &syncBuffer{written: make(chan struct{}, 100)}
	d := worker.NewAlertDispatcher(mailer, slog.New(slog.NewJSONHandler(buf, nil)))
	t.Cleanup(d.Close)
	return d, buf
}

func testAlert(serviceID string) domain.Alert {
	return domain.Alert{
		ServiceID: serviceID, ServiceName: secretService, Status: domain.AlertUnhealthy,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 0, 0, time.UTC), Message: secretMessage,
	}
}

func emailTarget(id, to string) domain.Target {
	return domain.Target{ID: id, ServiceID: "svc", Name: secretName, Type: domain.TargetTypeEmail, Value: to}
}

func webhookTarget(id string) domain.Target {
	return domain.Target{ID: id, ServiceID: "svc", Name: secretName, Type: domain.TargetTypeWebhook, Value: secretURL}
}

func waitFor(t *testing.T, ch <-chan string, want string) {
	t.Helper()
	select {
	case got := <-ch:
		require.Equal(t, want, got)
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for a send to %q", want)
	}
}

func TestDispatch_EmailTargetIsSentOnceWithoutRetry(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behave[secretAddress] = func(context.Context) error { return errors.New("the SMTP server did not accept the message") }
	d, buf := newDispatcher(t, mailer)
	alert := testAlert("svc")

	d.Dispatch(alert, []domain.Target{emailTarget("t1", secretAddress)})
	buf.waitLines(t, 1)
	d.Close()

	assert.Equal(t, []mailCall{{to: secretAddress, alert: alert}}, mailer.callList())
}

func TestDispatch_ReturnsWhileASendIsBlocked(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["a@x"] = func(context.Context) error { <-release; return nil }
	d, _ := newDispatcher(t, mailer)

	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})

	// Dispatch has returned; the blocked send has started with no clock involved.
	waitFor(t, mailer.started, "a@x")
	assert.False(t, mailer.hasReturned("a@x"))
	close(release)
}

func TestDispatch_OneTargetDoesNotStopOrDelayTheOthers(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["first@x"] = func(context.Context) error { <-release; return nil }
	mailer.behave["second@x"] = func(context.Context) error { return errors.New("refused") }
	d, buf := newDispatcher(t, mailer)

	d.Dispatch(testAlert("svc"), []domain.Target{
		emailTarget("t1", "first@x"), emailTarget("t2", "second@x"), emailTarget("t3", "third@x"),
	})

	got := map[string]bool{}
	for range 3 {
		select {
		case to := <-mailer.started:
			got[to] = true
		case <-time.After(5 * time.Second):
			t.Fatal("a send did not start while the first was blocked")
		}
	}
	assert.Equal(t, map[string]bool{"first@x": true, "second@x": true, "third@x": true}, got)
	close(release)
	buf.waitLines(t, 3)
	d.Close()

	outcomes := map[string]string{}
	for _, l := range buf.lines(t) {
		outcomes[l["target_id"].(string)] = l["msg"].(string)
	}
	assert.Equal(t, map[string]string{"t1": "alert delivered", "t2": "alert delivery failed", "t3": "alert delivered"}, outcomes)
}

func TestDispatch_WebhookTargetIsSkippedAndLogged(t *testing.T) {
	t.Run("alone", func(t *testing.T) {
		mailer := newFakeMailer()
		d, buf := newDispatcher(t, mailer)

		d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1")})
		buf.waitLines(t, 1)
		d.Close()

		assert.Empty(t, mailer.callList())
		lines := buf.lines(t)
		require.Len(t, lines, 1)
		assert.Equal(t, "alert not delivered", lines[0]["msg"])
		assert.Equal(t, "WARN", lines[0]["level"])
		assert.Equal(t, "webhook delivery is not built yet", lines[0]["reason"])
	})
	t.Run("mixed with an email target the email is still sent", func(t *testing.T) {
		mailer := newFakeMailer()
		d, buf := newDispatcher(t, mailer)

		d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1"), emailTarget("t1", "a@x")})
		buf.waitLines(t, 2)
		d.Close()

		calls := mailer.callList()
		require.Len(t, calls, 1)
		assert.Equal(t, "a@x", calls[0].to)
	})
}

func TestDispatch_LogsOutcomesWithIdsOnly(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behave["bad@x"] = func(context.Context) error { return errors.New("the SMTP server did not accept the message") }
	d, buf := newDispatcher(t, mailer)

	d.Dispatch(testAlert("svc"), []domain.Target{
		emailTarget("ok", secretAddress), emailTarget("bad", "bad@x"), webhookTarget("hook"),
	})
	buf.waitLines(t, 3)
	d.Close()

	byTarget := map[string]map[string]any{}
	for _, l := range buf.lines(t) {
		assert.Equal(t, "svc", l["service_id"])
		assert.Equal(t, "unhealthy", l["status"])
		byTarget[l["target_id"].(string)] = l
	}
	require.Len(t, byTarget, 3)
	assert.Equal(t, "alert delivered", byTarget["ok"]["msg"])
	assert.Equal(t, "INFO", byTarget["ok"]["level"])
	assert.Equal(t, "alert delivery failed", byTarget["bad"]["msg"])
	assert.Equal(t, "WARN", byTarget["bad"]["level"])
	assert.Equal(t, "the SMTP server did not accept the message", byTarget["bad"]["reason"])
	for _, secret := range []string{secretAddress, secretURL, secretName, secretService, secretMessage} {
		assert.NotContains(t, buf.String(), secret)
	}
}

func TestClose_CancelsAndWaitsForSendsInProgress(t *testing.T) {
	mailer := newFakeMailer()
	gate := make(chan struct{})
	cancelled := make(chan struct{}, 2)
	for _, to := range []string{"a@x", "b@x"} {
		mailer.behave[to] = func(ctx context.Context) error {
			<-ctx.Done()
			cancelled <- struct{}{}
			<-gate // held until the test has seen Close still running
			return errors.New("the SMTP server did not accept the message")
		}
	}
	d, buf := newDispatcher(t, mailer)
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
	<-mailer.started
	<-mailer.started
	closed := make(chan struct{})

	go func() { d.Close(); close(closed) }()

	for range 2 {
		select {
		case <-cancelled:
		case <-time.After(5 * time.Second):
			t.Fatal("Close did not cancel a send in progress")
		}
	}
	select {
	case <-closed:
		t.Fatal("Close returned while sends were still running")
	case <-time.After(100 * time.Millisecond):
	}
	close(gate)
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return after the sends did")
	}
	assert.True(t, mailer.hasReturned("a@x"))
	assert.True(t, mailer.hasReturned("b@x"))
	lines := buf.lines(t)
	require.Len(t, lines, 2)
	for _, l := range lines {
		assert.Equal(t, "alert delivery abandoned", l["msg"])
		assert.NotContains(t, l, "reason")
	}
}

func TestClose_ASendThatSucceedsAfterCloseIsDelivered(t *testing.T) {
	mailer := newFakeMailer()
	gate := make(chan struct{})
	cancelled := make(chan struct{})
	mailer.behave["a@x"] = func(ctx context.Context) error { <-ctx.Done(); close(cancelled); <-gate; return nil }
	d, buf := newDispatcher(t, mailer)
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitFor(t, mailer.started, "a@x")

	go func() { <-cancelled; close(gate) }()
	d.Close()

	lines := buf.lines(t)
	require.Len(t, lines, 1)
	assert.Equal(t, "alert delivered", lines[0]["msg"])
}

func TestClose_SecondCallAndDispatchAfterClose(t *testing.T) {
	mailer := newFakeMailer()
	d, buf := newDispatcher(t, mailer)
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	buf.waitLines(t, 1)
	d.Close()
	require.Len(t, mailer.callList(), 1, "baseline: a dispatch before Close sends")

	d.Close()
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t2", "b@x")})
	d.Close()

	assert.Len(t, mailer.callList(), 1)
	lines := buf.lines(t)
	require.Len(t, lines, 2)
	assert.Equal(t, "alert dropped", lines[1]["msg"])
	assert.Equal(t, "WARN", lines[1]["level"])
	assert.Equal(t, "the app is stopping", lines[1]["reason"])
	assert.Equal(t, "svc", lines[1]["service_id"])
	assert.Equal(t, "unhealthy", lines[1]["status"])
}

func TestDispatch_RacingCloseNeverSendsAfterCloseReturned(t *testing.T) {
	for range 50 {
		mailer := newFakeMailer()
		d := worker.NewAlertDispatcher(mailer, slog.New(slog.NewJSONHandler(&syncBuffer{}, nil)))
		var wg sync.WaitGroup
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
			}()
		}

		d.Close()
		started, returned := len(mailer.callList()), mailer.returnedCount()
		wg.Wait()

		assert.Equal(t, started, returned, "every started send has returned when Close does")
		assert.Equal(t, started, len(mailer.callList()), "no send started after Close returned")
	}
}

func TestDispatch_ConcurrentServicesKeepTheirIDs(t *testing.T) {
	mailer := newFakeMailer()
	d, buf := newDispatcher(t, mailer)
	var wg sync.WaitGroup
	for _, id := range []string{"svc-a", "svc-b"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			d.Dispatch(testAlert(id), []domain.Target{emailTarget("t-"+id, id+"@x")})
		}()
	}
	wg.Wait()
	buf.waitLines(t, 2)
	d.Close()

	for _, c := range mailer.callList() {
		assert.Equal(t, c.alert.ServiceID+"@x", c.to)
	}
	lines := buf.lines(t)
	require.Len(t, lines, 2)
	for _, l := range lines {
		assert.Equal(t, "t-"+l["service_id"].(string), l["target_id"])
	}
}

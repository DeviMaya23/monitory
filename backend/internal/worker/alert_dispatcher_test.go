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
	"monitory/pkg/clock"
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

// callFn scripts one send: n is the number of the call to that address or URL (1-based).
type callFn func(ctx context.Context, n int) error

// fakeMailer records calls. A send's behaviour is chosen by the address it is sent to:
// behave[to] runs with the send's context; an address with no entry succeeds.
type fakeMailer struct {
	mu       sync.Mutex
	calls    []mailCall
	started  chan string // receives the address of every send as it starts
	behave   map[string]func(ctx context.Context) error
	behaveN  map[string]callFn // takes precedence over behave
	ctxs     []context.Context // the context of every send, in call order
	done     map[string]bool
	returned int // sends that have returned
}

func newFakeMailer() *fakeMailer {
	return &fakeMailer{started: make(chan string, 100), behave: map[string]func(context.Context) error{}, behaveN: map[string]callFn{}, done: map[string]bool{}}
}

func (m *fakeMailer) SendEmail(ctx context.Context, to string, alert domain.Alert) error {
	m.mu.Lock()
	m.calls = append(m.calls, mailCall{to, alert})
	m.ctxs = append(m.ctxs, ctx)
	n := 0
	for _, c := range m.calls {
		if c.to == to {
			n++
		}
	}
	fn, fnN := m.behave[to], m.behaveN[to]
	m.mu.Unlock()
	m.started <- to
	var err error
	if fnN != nil {
		err = fnN(ctx, n)
	} else if fn != nil {
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

type hookCall struct {
	url     string
	headers []domain.NameValue
	alert   domain.Alert
}

// fakeWebhooks records calls. A send's behaviour is chosen by the URL it is sent to:
// behave[url] runs with the send's context; a URL with no entry succeeds.
type fakeWebhooks struct {
	mu      sync.Mutex
	calls   []hookCall
	started chan string // receives the URL of every send as it starts
	behave  map[string]func(ctx context.Context) error
	behaveN map[string]callFn // takes precedence over behave
	ctxs    []context.Context // the context of every send, in call order
	done    map[string]bool
}

func newFakeWebhooks() *fakeWebhooks {
	return &fakeWebhooks{started: make(chan string, 100), behave: map[string]func(context.Context) error{}, behaveN: map[string]callFn{}, done: map[string]bool{}}
}

func (w *fakeWebhooks) SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error {
	w.mu.Lock()
	w.calls = append(w.calls, hookCall{url, headers, alert})
	w.ctxs = append(w.ctxs, ctx)
	n := 0
	for _, c := range w.calls {
		if c.url == url {
			n++
		}
	}
	fn, fnN := w.behave[url], w.behaveN[url]
	w.mu.Unlock()
	w.started <- url
	var err error
	if fnN != nil {
		err = fnN(ctx, n)
	} else if fn != nil {
		err = fn(ctx)
	}
	w.mu.Lock()
	w.done[url] = true
	w.mu.Unlock()
	return err
}

func (w *fakeWebhooks) callList() []hookCall {
	w.mu.Lock()
	defer w.mu.Unlock()
	return append([]hookCall(nil), w.calls...)
}

func (w *fakeWebhooks) hasReturned(url string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.done[url]
}

// syncBuffer is a bytes.Buffer safe for the dispatcher's goroutines.
type syncBuffer struct {
	mu      sync.Mutex
	b       bytes.Buffer
	written chan struct{}     // one signal per log line written
	hook    func(line string) // called before a line is stored, outside the lock; may block
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	if s.hook != nil {
		s.hook(string(p))
	}
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

// newDispatcher builds a dispatcher whose webhook sender succeeds.
func newDispatcher(t *testing.T, mailer worker.Mailer) (*worker.AlertDispatcher, *syncBuffer) {
	t.Helper()
	return newDispatcherWith(t, mailer, newFakeWebhooks())
}

func newDispatcherWith(t *testing.T, mailer worker.Mailer, hooks worker.WebhookSender) (*worker.AlertDispatcher, *syncBuffer) {
	t.Helper()
	d, buf, _ := newRetryDispatcher(t, mailer, hooks, worker.RetryPolicy{})
	return d, buf
}

// newRetryDispatcher builds a dispatcher on a fake clock with the given policy. Its
// cleanup closes the dispatcher under a deadline that fails the test.
func newRetryDispatcher(t *testing.T, mailer worker.Mailer, hooks worker.WebhookSender, policy worker.RetryPolicy) (*worker.AlertDispatcher, *syncBuffer, *clock.Fake) {
	t.Helper()
	buf := &syncBuffer{written: make(chan struct{}, 100)}
	clk := clock.NewFake(time.Date(2026, 11, 18, 14, 0, 0, 0, time.UTC))
	d := worker.NewAlertDispatcher(mailer, hooks, clk, policy, slog.New(slog.NewJSONHandler(buf, nil)))
	t.Cleanup(func() { closeWithin(t, d) })
	return d, buf, clk
}

// closeWithin closes the dispatcher and fails the test if Close does not return in time.
func closeWithin(t *testing.T, d *worker.AlertDispatcher) {
	t.Helper()
	done := make(chan struct{})
	go func() { d.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(deadline):
		t.Error("Close did not return within the deadline")
	}
}

const deadline = 2 * time.Second

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

func webhookTargetTo(id, url string, headers ...domain.NameValue) domain.Target {
	return domain.Target{ID: id, ServiceID: "svc", Name: secretName, Type: domain.TargetTypeWebhook, Value: url, Headers: headers}
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
	closeWithin(t, d)

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
	closeWithin(t, d)

	outcomes := map[string]string{}
	for _, l := range buf.lines(t) {
		outcomes[l["target_id"].(string)] = l["msg"].(string)
	}
	assert.Equal(t, map[string]string{"t1": "alert delivered", "t2": "alert delivery failed", "t3": "alert delivered"}, outcomes)
}

const secretHeaderName, secretHeaderValue = "X-Secret-Header", "secret-header-value"

func TestDispatch_WebhookTargetIsSentOnceWithoutRetry(t *testing.T) {
	headers := []domain.NameValue{{Name: secretHeaderName, Value: secretHeaderValue}, {Name: "X-Second", Value: "2"}}
	for name, fail := range map[string]bool{"delivered": false, "failed": true} {
		t.Run(name, func(t *testing.T) {
			mailer, hooks := newFakeMailer(), newFakeWebhooks()
			if fail {
				hooks.behave[secretURL] = func(context.Context) error { return errors.New("the webhook did not answer in time") }
			}
			d, buf := newDispatcherWith(t, mailer, hooks)
			alert := testAlert("svc")

			d.Dispatch(alert, []domain.Target{webhookTargetTo("w1", secretURL, headers...)})
			buf.waitLines(t, 1)
			closeWithin(t, d)

			assert.Equal(t, []hookCall{{url: secretURL, headers: headers, alert: alert}}, hooks.callList())
			assert.Empty(t, mailer.callList())
		})
	}
}

func TestDispatch_WebhookOutcomeLogs(t *testing.T) {
	hooks := newFakeWebhooks()
	hooks.behave["https://bad.example/hook"] = func(context.Context) error { return errors.New("the webhook answered with status 503") }
	d, buf := newDispatcherWith(t, newFakeMailer(), hooks)

	d.Dispatch(testAlert("svc"), []domain.Target{
		webhookTargetTo("ok", secretURL, domain.NameValue{Name: secretHeaderName, Value: secretHeaderValue}),
		webhookTargetTo("bad", "https://bad.example/hook", domain.NameValue{Name: secretHeaderName, Value: secretHeaderValue}),
	})
	buf.waitLines(t, 2)
	closeWithin(t, d)

	byTarget := map[string]map[string]any{}
	for _, l := range buf.lines(t) {
		assert.Equal(t, "svc", l["service_id"])
		assert.Equal(t, "unhealthy", l["status"])
		byTarget[l["target_id"].(string)] = l
	}
	require.Len(t, byTarget, 2)
	assert.Equal(t, "alert delivered", byTarget["ok"]["msg"])
	assert.Equal(t, "INFO", byTarget["ok"]["level"])
	assert.NotContains(t, byTarget["ok"], "reason")
	assert.Equal(t, "alert delivery failed", byTarget["bad"]["msg"])
	assert.Equal(t, "WARN", byTarget["bad"]["level"])
	assert.Equal(t, "the webhook answered with status 503", byTarget["bad"]["reason"])
	for _, secret := range []string{secretURL, "bad.example", secretHeaderName, secretHeaderValue, secretName, secretService, secretMessage} {
		assert.NotContains(t, buf.String(), secret)
	}
}

func TestDispatch_UnknownTargetTypeIsNotSent(t *testing.T) {
	mailer, hooks := newFakeMailer(), newFakeWebhooks()
	d, buf := newDispatcherWith(t, mailer, hooks)

	d.Dispatch(testAlert("svc"), []domain.Target{{ID: "x1", ServiceID: "svc", Name: secretName, Type: "sms", Value: secretAddress}})
	buf.waitLines(t, 1)
	closeWithin(t, d)

	assert.Empty(t, mailer.callList())
	assert.Empty(t, hooks.callList())
	lines := buf.lines(t)
	require.Len(t, lines, 1)
	assert.Equal(t, "alert not delivered", lines[0]["msg"])
	assert.Equal(t, "WARN", lines[0]["level"])
	assert.Equal(t, "unknown target type", lines[0]["reason"])
	assert.Equal(t, "svc", lines[0]["service_id"])
	assert.Equal(t, "x1", lines[0]["target_id"])
	assert.Equal(t, "unhealthy", lines[0]["status"])
	assert.NotContains(t, buf.String(), secretAddress)
}

func TestDispatch_WebhookAndEmailDoNotAffectEachOther(t *testing.T) {
	t.Run("a blocked webhook does not hold the email", func(t *testing.T) {
		mailer, hooks := newFakeMailer(), newFakeWebhooks()
		release := make(chan struct{})
		hooks.behave[secretURL] = func(context.Context) error { <-release; return nil }
		d, buf := newDispatcherWith(t, mailer, hooks)

		d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1"), emailTarget("e1", "a@x")})
		buf.waitLines(t, 1) // the email's outcome, while the webhook is still blocked

		require.Len(t, mailer.callList(), 1)
		assert.False(t, hooks.hasReturned(secretURL))
		close(release)
		buf.waitLines(t, 1)
		closeWithin(t, d)
		assert.Len(t, hooks.callList(), 1)
	})
	t.Run("a failing email does not stop the webhook", func(t *testing.T) {
		mailer, hooks := newFakeMailer(), newFakeWebhooks()
		mailer.behave["a@x"] = func(context.Context) error { return errors.New("refused") }
		d, buf := newDispatcherWith(t, mailer, hooks)

		d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("e1", "a@x"), webhookTarget("w1")})
		buf.waitLines(t, 2)
		closeWithin(t, d)

		outcomes := map[string]string{}
		for _, l := range buf.lines(t) {
			outcomes[l["target_id"].(string)] = l["msg"].(string)
		}
		assert.Equal(t, map[string]string{"e1": "alert delivery failed", "w1": "alert delivered"}, outcomes)
		assert.Len(t, hooks.callList(), 1)
		assert.Len(t, mailer.callList(), 1)
	})
}

func TestDispatch_ReturnsWhileAWebhookSendIsBlocked(t *testing.T) {
	hooks := newFakeWebhooks()
	release := make(chan struct{})
	hooks.behave[secretURL] = func(context.Context) error { <-release; return nil }
	d, _ := newDispatcherWith(t, newFakeMailer(), hooks)
	// Runs before the dispatcher's Close, so a failing run does not hang on the send.
	var once sync.Once
	t.Cleanup(func() { once.Do(func() { close(release) }) })

	returned := make(chan struct{})
	go func() {
		d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1")})
		close(returned)
	}()

	select {
	case <-returned:
	case <-time.After(5 * time.Second):
		t.Fatal("Dispatch did not return while a webhook send was blocked")
	}
	waitFor(t, hooks.started, secretURL)
	assert.False(t, hooks.hasReturned(secretURL))
	once.Do(func() { close(release) })
}

func TestClose_WebhookSends(t *testing.T) {
	t.Run("a blocked send is cancelled and waited for, whatever error it returns", func(t *testing.T) {
		for name, returned := range map[string]error{
			"context canceled": context.Canceled,
			"another error":    errors.New("the webhook did not answer in time"),
		} {
			t.Run(name, func(t *testing.T) {
				hooks := newFakeWebhooks()
				gate := make(chan struct{})
				cancelled := make(chan struct{})
				bail := make(chan struct{}) // closed by Cleanup so a failing run does not hang
				hooks.behave[secretURL] = func(ctx context.Context) error {
					select {
					case <-ctx.Done():
					case <-bail:
					}
					close(cancelled)
					select {
					case <-gate:
					case <-bail:
					}
					return returned
				}
				d, buf := newDispatcherWith(t, newFakeMailer(), hooks)
				t.Cleanup(func() { close(bail) })
				d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1")})
				waitFor(t, hooks.started, secretURL)
				closed := make(chan struct{})

				go func() { d.Close(); close(closed) }()

				select {
				case <-cancelled:
				case <-time.After(5 * time.Second):
					t.Fatal("Close did not cancel the send")
				}
				select {
				case <-closed:
					t.Fatal("Close returned while the send was running")
				case <-time.After(100 * time.Millisecond):
				}
				close(gate)
				select {
				case <-closed:
				case <-time.After(5 * time.Second):
					t.Fatal("Close did not return after the send did")
				}
				assert.True(t, hooks.hasReturned(secretURL))
				lines := buf.lines(t)
				require.Len(t, lines, 1)
				assert.Equal(t, "alert delivery abandoned", lines[0]["msg"])
				assert.NotContains(t, lines[0], "reason")
			})
		}
	})
	t.Run("a send that succeeds after Close is delivered", func(t *testing.T) {
		hooks := newFakeWebhooks()
		gate := make(chan struct{})
		cancelled := make(chan struct{})
		bail := make(chan struct{})
		hooks.behave[secretURL] = func(ctx context.Context) error {
			select {
			case <-ctx.Done():
			case <-bail:
			}
			close(cancelled)
			select {
			case <-gate:
			case <-bail:
			}
			return nil
		}
		d, buf := newDispatcherWith(t, newFakeMailer(), hooks)
		t.Cleanup(func() { close(bail) })
		d.Dispatch(testAlert("svc"), []domain.Target{webhookTarget("w1")})
		waitFor(t, hooks.started, secretURL)

		go func() { <-cancelled; close(gate) }()
		closed := make(chan struct{})
		go func() { d.Close(); close(closed) }()
		select {
		case <-closed:
		case <-time.After(5 * time.Second):
			t.Fatal("Close did not return")
		}

		lines := buf.lines(t)
		require.Len(t, lines, 1)
		assert.Equal(t, "alert delivered", lines[0]["msg"])
	})
}

func TestDispatch_ConcurrentWebhookServicesKeepTheirIDs(t *testing.T) {
	hooks := newFakeWebhooks()
	d, buf := newDispatcherWith(t, newFakeMailer(), hooks)
	var wg sync.WaitGroup
	for _, id := range []string{"svc-a", "svc-b"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			d.Dispatch(testAlert(id), []domain.Target{webhookTargetTo("t-"+id, "https://"+id+".example/hook")})
		}()
	}
	wg.Wait()
	buf.waitLines(t, 2)
	closeWithin(t, d)

	calls := hooks.callList()
	require.Len(t, calls, 2)
	for _, c := range calls {
		assert.Equal(t, "https://"+c.alert.ServiceID+".example/hook", c.url)
	}
	lines := buf.lines(t)
	require.Len(t, lines, 2)
	for _, l := range lines {
		assert.Equal(t, "t-"+l["service_id"].(string), l["target_id"])
	}
}

func TestDispatch_LogsOutcomesWithIdsOnly(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behave["bad@x"] = func(context.Context) error { return errors.New("the SMTP server did not accept the message") }
	d, buf := newDispatcher(t, mailer)

	d.Dispatch(testAlert("svc"), []domain.Target{
		emailTarget("ok", secretAddress), emailTarget("bad", "bad@x"), webhookTarget("hook"),
	})
	buf.waitLines(t, 3)
	closeWithin(t, d)

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
	closeWithin(t, d)

	lines := buf.lines(t)
	require.Len(t, lines, 1)
	assert.Equal(t, "alert delivered", lines[0]["msg"])
}

func TestClose_SecondCallAndDispatchAfterClose(t *testing.T) {
	mailer := newFakeMailer()
	d, buf := newDispatcher(t, mailer)
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	buf.waitLines(t, 1)
	closeWithin(t, d)
	require.Len(t, mailer.callList(), 1, "baseline: a dispatch before Close sends")

	closeWithin(t, d)
	d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t2", "b@x")})
	closeWithin(t, d)

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
		d := worker.NewAlertDispatcher(mailer, newFakeWebhooks(), clock.NewFake(start), worker.RetryPolicy{}, slog.New(slog.NewJSONHandler(&syncBuffer{}, nil)))
		var wg sync.WaitGroup
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
			}()
		}

		closeWithin(t, d)
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
	closeWithin(t, d)

	for _, c := range mailer.callList() {
		assert.Equal(t, c.alert.ServiceID+"@x", c.to)
	}
	lines := buf.lines(t)
	require.Len(t, lines, 2)
	for _, l := range lines {
		assert.Equal(t, "t-"+l["service_id"].(string), l["target_id"])
	}
}

func TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress(t *testing.T) {
	t.Run("a failing send to the secret address", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behave[secretAddress] = func(context.Context) error { return errors.New("the SMTP server did not accept the message") }
		d, buf := newDispatcher(t, mailer)

		d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", secretAddress)})
		buf.waitLines(t, 1)
		closeWithin(t, d)

		lines := buf.lines(t)
		require.Len(t, lines, 1)
		assert.Equal(t, "alert delivery failed", lines[0]["msg"], "baseline: the failure path was logged")
		assert.NotContains(t, buf.String(), secretAddress)
		assert.NotContains(t, buf.String(), secretService)
		assert.NotContains(t, buf.String(), secretMessage)
	})
	t.Run("a send abandoned by Close to the secret address", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behave[secretAddress] = func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
		d, buf := newDispatcher(t, mailer)
		d.Dispatch(testAlert("svc"), []domain.Target{emailTarget("t1", secretAddress)})
		waitFor(t, mailer.started, secretAddress)

		closeWithin(t, d)

		lines := buf.lines(t)
		require.Len(t, lines, 1)
		assert.Equal(t, "alert delivery abandoned", lines[0]["msg"], "baseline: the abandon path was logged")
		assert.NotContains(t, buf.String(), secretAddress)
	})
}

func TestDispatch_FiveTargetsOneBlockedOneFailing(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["t1@x"] = func(context.Context) error { <-release; return nil }
	mailer.behave["t3@x"] = func(context.Context) error { return errors.New("refused") }
	d, buf := newDispatcher(t, mailer)

	d.Dispatch(testAlert("svc"), []domain.Target{
		emailTarget("t1", "t1@x"), emailTarget("t2", "t2@x"), emailTarget("t3", "t3@x"),
		emailTarget("t4", "t4@x"), emailTarget("t5", "t5@x"),
	})
	buf.waitLines(t, 4) // every target but the blocked one has finished
	close(release)
	buf.waitLines(t, 1)
	closeWithin(t, d)

	outcomes := map[string]string{}
	for _, l := range buf.lines(t) {
		outcomes[l["target_id"].(string)] = l["msg"].(string)
	}
	assert.Equal(t, map[string]string{
		"t1": "alert delivered", "t2": "alert delivered", "t3": "alert delivery failed",
		"t4": "alert delivered", "t5": "alert delivered",
	}, outcomes)
	assert.Len(t, mailer.callList(), 5)
}

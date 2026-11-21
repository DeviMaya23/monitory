package worker_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"runtime"
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
	return newRecordingDispatcher(t, mailer, hooks, policy, newFakeOutcomes())
}

// newRecordingDispatcher is newRetryDispatcher with the recorder the test holds.
func newRecordingDispatcher(t *testing.T, mailer worker.Mailer, hooks worker.WebhookSender, policy worker.RetryPolicy, rec worker.OutcomeRecorder) (*worker.AlertDispatcher, *syncBuffer, *clock.Fake) {
	t.Helper()
	buf := &syncBuffer{written: make(chan struct{}, 100)}
	clk := clock.NewFake(time.Date(2026, 11, 18, 14, 0, 0, 0, time.UTC))
	d := worker.NewAlertDispatcher(mailer, hooks, clk, policy, rec, slog.New(slog.NewJSONHandler(buf, nil)))
	t.Cleanup(func() { closeWithin(t, d) })
	return d, buf, clk
}

type outcomeCall struct {
	serviceID, targetID string
	delivered           bool
}

// fakeOutcomes records every outcome with the context it received. It succeeds, unless
// err is set; when block is set every call waits for it to be closed.
type fakeOutcomes struct {
	mu       sync.Mutex
	calls    []outcomeCall
	ctxs     []context.Context
	returned int
	reported chan struct{} // one signal per call as it starts
	block    chan struct{}
	err      error
}

func newFakeOutcomes() *fakeOutcomes { return &fakeOutcomes{reported: make(chan struct{}, 100)} }

func (r *fakeOutcomes) RecordDeliveryOutcome(ctx context.Context, serviceID, targetID string, delivered bool) error {
	r.mu.Lock()
	r.calls = append(r.calls, outcomeCall{serviceID, targetID, delivered})
	r.ctxs = append(r.ctxs, ctx)
	block, err := r.block, r.err
	r.mu.Unlock()
	r.reported <- struct{}{}
	if block != nil {
		select {
		case <-block:
		case <-time.After(5 * time.Second):
		}
	}
	r.mu.Lock()
	r.returned++
	r.mu.Unlock()
	return err
}

func (r *fakeOutcomes) callList() []outcomeCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]outcomeCall(nil), r.calls...)
}

func (r *fakeOutcomes) returnedCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.returned
}

func (r *fakeOutcomes) ctxList() []context.Context {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]context.Context(nil), r.ctxs...)
}

// waitReports blocks until n recorder calls have started.
func (r *fakeOutcomes) waitReports(t *testing.T, n int) {
	t.Helper()
	for range n {
		select {
		case <-r.reported:
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for a report")
		}
	}
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

// waitGroupWithin waits for the group and fails the test if it takes longer than the
// deadline, so goroutines that are stuck fail by assertion and do not hang.
func waitGroupWithin(t *testing.T, wg *sync.WaitGroup) {
	t.Helper()
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(deadline):
		t.Fatal("goroutines did not finish within the deadline")
	}
}

// dispatchWithin calls Dispatch and fails the test if it does not return within the
// deadline, so a Dispatch that waits for the sends fails by assertion and does not hang.
func dispatchWithin(t *testing.T, d *worker.AlertDispatcher, alert domain.Alert, targets []domain.Target) {
	t.Helper()
	done := make(chan struct{})
	go func() { d.Dispatch(alert, targets); close(done) }()
	select {
	case <-done:
	case <-time.After(deadline):
		t.Fatal("Dispatch did not return within the deadline")
	}
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

	dispatchWithin(t, d, alert, []domain.Target{emailTarget("t1", secretAddress)})
	buf.waitLines(t, 1)
	closeWithin(t, d)

	assert.Equal(t, []mailCall{{to: secretAddress, alert: alert}}, mailer.callList())
}

func TestDispatch_ReturnsWhileASendIsBlocked(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["a@x"] = func(context.Context) error { <-release; return nil }
	d, _ := newDispatcher(t, mailer)
	var once sync.Once
	t.Cleanup(func() { once.Do(func() { close(release) }) })

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})

	// Dispatch has returned; the blocked send has started with no clock involved.
	waitFor(t, mailer.started, "a@x")
	assert.False(t, mailer.hasReturned("a@x"))
	once.Do(func() { close(release) })
}

func TestDispatch_OneTargetDoesNotStopOrDelayTheOthers(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["first@x"] = func(context.Context) error { <-release; return nil }
	mailer.behave["second@x"] = func(context.Context) error { return errors.New("refused") }
	d, buf := newDispatcher(t, mailer)
	var once sync.Once
	t.Cleanup(func() { once.Do(func() { close(release) }) })

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
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
	once.Do(func() { close(release) })
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

			dispatchWithin(t, d, alert, []domain.Target{webhookTargetTo("w1", secretURL, headers...)})
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

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
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

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{{ID: "x1", ServiceID: "svc", Name: secretName, Type: "sms", Value: secretAddress}})
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

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{webhookTarget("w1"), emailTarget("e1", "a@x")})
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

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("e1", "a@x"), webhookTarget("w1")})
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
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{webhookTarget("w1")})
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
				dispatchWithin(t, d, testAlert("svc"), []domain.Target{webhookTarget("w1")})
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
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{webhookTarget("w1")})
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
	waitGroupWithin(t, &wg)
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

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
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
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
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
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
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
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	buf.waitLines(t, 1)
	closeWithin(t, d)
	require.Len(t, mailer.callList(), 1, "baseline: a dispatch before Close sends")

	closeWithin(t, d)
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t2", "b@x")})
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
		d := worker.NewAlertDispatcher(mailer, newFakeWebhooks(), clock.NewFake(start), worker.RetryPolicy{}, newFakeOutcomes(), slog.New(slog.NewJSONHandler(&syncBuffer{}, nil)))
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
		waitGroupWithin(t, &wg)

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
	waitGroupWithin(t, &wg)
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

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", secretAddress)})
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
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", secretAddress)})
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

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
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

// ---- retry sequences ----

var retry3 = worker.RetryPolicy{Retries: 3, Interval: 7 * time.Second}

// eventually polls cond, yielding, until it holds or the deadline passes.
func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	end := time.Now().Add(deadline)
	for !cond() {
		if time.Now().After(end) {
			t.Fatalf("timed out waiting for %s", what)
		}
		runtime.Gosched()
	}
}

func waitPending(t *testing.T, clk *clock.Fake, n int) {
	t.Helper()
	eventually(t, fmt.Sprintf("%d pending timers (have %d)", n, clk.Pending()), func() bool { return clk.Pending() == n })
}

func waitMailCalls(t *testing.T, m *fakeMailer, n int) {
	t.Helper()
	eventually(t, fmt.Sprintf("%d email calls", n), func() bool { return len(m.callList()) >= n })
}

// linesOf returns the log lines of one target.
func (s *syncBuffer) linesOf(t *testing.T, targetID string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range s.lines(t) {
		if l["target_id"] == targetID {
			out = append(out, l)
		}
	}
	return out
}

func msgsOf(lines []map[string]any) []string {
	var out []string
	for _, l := range lines {
		out = append(out, l["msg"].(string))
	}
	return out
}

// waitMsg waits until the target has logged msg and returns that line.
func waitMsg(t *testing.T, buf *syncBuffer, targetID, msg string) map[string]any {
	t.Helper()
	var found map[string]any
	eventually(t, fmt.Sprintf("%q for %s", msg, targetID), func() bool {
		for _, l := range buf.linesOf(t, targetID) {
			if l["msg"] == msg {
				found = l
				return true
			}
		}
		return false
	})
	return found
}

// failFirst fails the first k calls with the reason "failure <n>", then succeeds.
func failFirst(k int) callFn {
	return func(_ context.Context, n int) error {
		if n <= k {
			return fmt.Errorf("failure %d", n)
		}
		return nil
	}
}

func alwaysFail() callFn { return failFirst(1 << 30) }

func TestSequence_SuccessAtOnce(t *testing.T) {
	mailer := newFakeMailer()
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	line := waitMsg(t, buf, "t1", "alert delivered")

	assert.Len(t, mailer.callList(), 1)
	assert.Equal(t, 0, clk.Pending())
	assert.Equal(t, "INFO", line["level"])
	assert.EqualValues(t, 1, line["attempts"])
	assert.Equal(t, []string{"alert delivered"}, msgsOf(buf.lines(t)))
}

func TestSequence_FailFailSucceed(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = failFirst(2)
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)
	require.Len(t, mailer.callList(), 1)

	clk.Advance(7*time.Second - time.Nanosecond)
	assert.Len(t, mailer.callList(), 1, "one nanosecond short of the interval")
	clk.Advance(time.Nanosecond)
	waitMailCalls(t, mailer, 2)
	buf.waitLines(t, 2)
	waitPending(t, clk, 1)
	assert.Len(t, mailer.callList(), 2)

	clk.Advance(7*time.Second - time.Nanosecond)
	assert.Len(t, mailer.callList(), 2, "one nanosecond short of the second interval")
	clk.Advance(time.Nanosecond)
	line := waitMsg(t, buf, "t1", "alert delivered")
	assert.EqualValues(t, 3, line["attempts"])

	clk.Advance(time.Hour)
	assert.Len(t, mailer.callList(), 3, "no fourth call")
	assert.Equal(t, 0, clk.Pending())
	lines := buf.lines(t)
	require.Equal(t, []string{"alert delivery attempt failed", "alert delivery attempt failed", "alert delivered"}, msgsOf(lines))
	for i, l := range lines[:2] {
		assert.EqualValues(t, i+1, l["attempt"])
		assert.Equal(t, fmt.Sprintf("failure %d", i+1), l["reason"])
		assert.Equal(t, "WARN", l["level"])
		assert.NotContains(t, l, "cause", "an error with no cause logs no cause key")
	}
}

func TestSequence_AlwaysFailing(t *testing.T) {
	mailer := newFakeMailer()
	clk0 := time.Date(2026, 11, 18, 14, 0, 0, 0, time.UTC)
	var clk *clock.Fake
	var mu sync.Mutex
	var at []time.Duration
	mailer.behaveN["a@x"] = func(_ context.Context, n int) error {
		mu.Lock()
		at = append(at, clk.Now().Sub(clk0))
		mu.Unlock()
		return fmt.Errorf("failure %d", n)
	}
	d, buf, c := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
	clk = c

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	for i := 1; i <= 3; i++ {
		waitMsg(t, buf, "t1", "alert delivery attempt failed")
		buf.waitLines(t, 0)
		eventually(t, "the timer", func() bool { return clk.Pending() == 1 && len(mailer.callList()) == i })
		clk.Advance(7 * time.Second)
	}
	line := waitMsg(t, buf, "t1", "alert delivery failed")
	clk.Advance(time.Hour)

	assert.Len(t, mailer.callList(), 4, "no fifth call")
	mu.Lock()
	assert.Equal(t, []time.Duration{0, 7 * time.Second, 14 * time.Second, 21 * time.Second}, at)
	mu.Unlock()
	assert.Equal(t, "WARN", line["level"])
	assert.Equal(t, "failure 4", line["reason"])
	assert.EqualValues(t, 4, line["attempts"])
	assert.Equal(t, []string{
		"alert delivery attempt failed", "alert delivery attempt failed", "alert delivery attempt failed", "alert delivery failed",
	}, msgsOf(buf.lines(t)))
}

func TestSequence_IntervalComesFromThePolicy(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = failFirst(1)
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 3, Interval: 45 * time.Second})

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)

	clk.Advance(30 * time.Second)
	assert.Len(t, mailer.callList(), 1, "not the 30 s default")
	clk.Advance(15*time.Second - time.Nanosecond)
	assert.Len(t, mailer.callList(), 1)
	clk.Advance(time.Nanosecond)
	waitMsg(t, buf, "t1", "alert delivered")
	assert.Len(t, mailer.callList(), 2)
}

func TestSequence_ZeroRetriesFailsAtOnce(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = alwaysFail()
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 0, Interval: 7 * time.Second})

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	line := waitMsg(t, buf, "t1", "alert delivery failed")

	assert.Equal(t, 0, clk.Pending())
	assert.EqualValues(t, 1, line["attempts"])
	assert.Equal(t, "failure 1", line["reason"])
	assert.NotContains(t, line, "cause")
	assert.Len(t, mailer.callList(), 1)
	assert.Equal(t, []string{"alert delivery failed"}, msgsOf(buf.lines(t)))
}

func TestSequence_EmailAndWebhook(t *testing.T) {
	mailer, hooks := newFakeMailer(), newFakeWebhooks()
	mailer.behaveN["a@x"] = failFirst(1)
	hooks.behaveN[secretURL] = failFirst(2)
	d, buf, clk := newRetryDispatcher(t, mailer, hooks, retry3)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("e1", "a@x"), webhookTarget("w1")})
	waitPending(t, clk, 2)
	clk.Advance(7 * time.Second)
	e := waitMsg(t, buf, "e1", "alert delivered")
	waitMsg(t, buf, "w1", "alert delivery attempt failed")
	eventually(t, "the webhook's second timer", func() bool { return clk.Pending() == 1 && len(hooks.callList()) == 2 })
	clk.Advance(7 * time.Second)
	w := waitMsg(t, buf, "w1", "alert delivered")

	assert.EqualValues(t, 2, e["attempts"])
	assert.EqualValues(t, 3, w["attempts"])
	assert.Len(t, mailer.callList(), 2)
	assert.Len(t, hooks.callList(), 3)
}

func TestSequence_TargetsAreIndependent(t *testing.T) {
	t.Run("a waiting target does not delay another", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behaveN["bad@x"] = alwaysFail()
		d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("bad", "bad@x"), emailTarget("good", "good@x")})

		waitMsg(t, buf, "good", "alert delivered")
		waitMsg(t, buf, "bad", "alert delivery attempt failed")
		assert.Equal(t, 1, clk.Pending(), "the failing target waits; the good one is done")
	})
	t.Run("two failing targets retry on the same tick", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = failFirst(1)
		mailer.behaveN["b@x"] = failFirst(1)
		d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
		waitPending(t, clk, 2)
		clk.Advance(7 * time.Second)

		waitMsg(t, buf, "t1", "alert delivered")
		waitMsg(t, buf, "t2", "alert delivered")
		assert.Len(t, mailer.callList(), 4)
	})
}

func TestSequence_LogsHoldIdsOnly(t *testing.T) {
	mailer, hooks := newFakeMailer(), newFakeWebhooks()
	mailer.behaveN[secretAddress] = alwaysFail()
	hooks.behaveN[secretURL] = failFirst(1)
	d, buf, clk := newRetryDispatcher(t, mailer, hooks, worker.RetryPolicy{Retries: 1, Interval: 7 * time.Second})

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
		emailTarget("e1", secretAddress),
		webhookTargetTo("w1", secretURL, domain.NameValue{Name: secretHeaderName, Value: secretHeaderValue}),
	})
	waitPending(t, clk, 2)
	clk.Advance(7 * time.Second)
	waitMsg(t, buf, "e1", "alert delivery failed")
	waitMsg(t, buf, "w1", "alert delivered")

	lines := buf.lines(t)
	require.Len(t, lines, 4)
	for _, l := range lines {
		assert.Equal(t, "svc", l["service_id"])
		assert.Equal(t, "unhealthy", l["status"])
		assert.Contains(t, l, "target_id")
	}
	for _, secret := range []string{secretAddress, secretURL, secretHeaderName, secretHeaderValue, secretName, secretService, secretMessage} {
		assert.NotContains(t, buf.String(), secret)
	}
	for _, l := range lines {
		assert.NotContains(t, l, "cause", "neither a plain email error nor a webhook error has a cause")
	}
}

// causedError is an error as the mailer returns it: its text is the visible reason, it
// has a cause for the log, and it wraps an error whose own text holds the address.
type causedError struct{ cause, wrapped string }

func (e *causedError) Error() string        { return "the SMTP server did not accept the message" }
func (e *causedError) FailureCause() string { return e.cause }
func (e *causedError) Unwrap() error        { return errors.New("rcpt " + e.wrapped + ": refused") }

func TestSequence_LogsTheFailureCause(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN[secretAddress] = func(context.Context, int) error {
		return &causedError{cause: "recipient refused", wrapped: secretAddress}
	}
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 1, Interval: 7 * time.Second})

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", secretAddress)})
	retried := waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)
	clk.Advance(7 * time.Second)
	last := waitMsg(t, buf, "t1", "alert delivery failed")

	for _, l := range []map[string]any{retried, last} {
		assert.Equal(t, "recipient refused", l["cause"])
		assert.Equal(t, "the SMTP server did not accept the message", l["reason"])
	}
	assert.NotContains(t, buf.String(), secretAddress)
}

func TestSequence_CauseOnTheLastAttemptOnly(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = func(_ context.Context, n int) error {
		if n < 2 {
			return fmt.Errorf("failure %d", n)
		}
		return &causedError{cause: "timed out", wrapped: "a@x"}
	}
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 1, Interval: 7 * time.Second})

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	retried := waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)
	clk.Advance(7 * time.Second)
	last := waitMsg(t, buf, "t1", "alert delivery failed")

	assert.NotContains(t, retried, "cause")
	assert.Equal(t, "timed out", last["cause"])
	assert.NotContains(t, buf.String(), "a@x")
}

func TestSequence_OtherLinesHaveNoCause(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["ok@x"] = failFirst(0)
	mailer.behaveN["gone@x"] = func(ctx context.Context, _ int) error { <-ctx.Done(); return &causedError{cause: "timed out"} }
	d, buf, _ := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("ok", "ok@x"), emailTarget("gone", "gone@x")})
	waitMsg(t, buf, "ok", "alert delivered")
	eventually(t, "both sends to start", func() bool { return len(mailer.callList()) == 2 })
	closeWithin(t, d)

	abandoned := waitMsg(t, buf, "gone", "alert delivery abandoned")
	delivered := waitMsg(t, buf, "ok", "alert delivered")
	assert.NotContains(t, abandoned, "cause")
	assert.NotContains(t, delivered, "cause")
}

func TestClose_WhileWaiting(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = alwaysFail()
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)

	closeWithin(t, d)

	assert.Equal(t, 0, clk.Pending(), "the timer is stopped")
	lines := buf.linesOf(t, "t1")
	require.Len(t, lines, 2)
	assert.Equal(t, "alert delivery abandoned", lines[1]["msg"])
	assert.NotContains(t, lines[1], "reason")
	clk.Advance(time.Hour)
	assert.Len(t, mailer.callList(), 1, "no call after Close")
}

func TestClose_LaterAttemptIsCancelled(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = func(ctx context.Context, n int) error {
		if n == 1 {
			return errors.New("failure 1")
		}
		<-ctx.Done()
		return errors.New("the SMTP server did not accept the message")
	}
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitPending(t, clk, 1)
	clk.Advance(7 * time.Second)
	waitMailCalls(t, mailer, 2)

	closeWithin(t, d)

	lines := buf.linesOf(t, "t1")
	require.Len(t, lines, 2)
	assert.Equal(t, "alert delivery abandoned", lines[1]["msg"])
	assert.NotContains(t, lines[1], "reason")
	assert.Equal(t, 0, clk.Pending())
	assert.Len(t, mailer.callList(), 2)
}

// ---- the newer alert rule ----

func TestSupersede_WaitingSequence(t *testing.T) {
	for name, status := range map[string]domain.AlertStatus{"same status": domain.AlertUnhealthy, "opposite status": domain.AlertHealthy} {
		t.Run(name, func(t *testing.T) {
			mailer := newFakeMailer()
			mailer.behaveN["a@x"] = alwaysFail()
			mailer.behaveN["b@x"] = failFirst(1)
			d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
			dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
			waitMsg(t, buf, "a", "alert delivery attempt failed")
			waitPending(t, clk, 1)

			newer := testAlert("svc")
			newer.Status = status
			dispatchWithin(t, d, newer, []domain.Target{emailTarget("b", "b@x")})

			line := waitMsg(t, buf, "a", "alert delivery superseded")
			assert.Equal(t, "WARN", line["level"])
			assert.EqualValues(t, 1, line["attempts"])
			assert.Equal(t, "unhealthy", line["status"], "the older alert's own status")
			assert.NotContains(t, line, "reason")
			waitMsg(t, buf, "b", "alert delivery attempt failed")
			waitPending(t, clk, 1) // b's timer only: a's is stopped

			clk.Advance(time.Hour)
			waitMsg(t, buf, "b", "alert delivered")
			aCalls := 0
			for _, c := range mailer.callList() {
				if c.to == "a@x" {
					aCalls++
				}
			}
			assert.Equal(t, 1, aCalls, "no further call for the superseded sequence")
			assert.Equal(t, 0, clk.Pending())
		})
	}
}

func TestSupersede_OtherServiceIsNotAffected(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["t@x"] = failFirst(1)
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
	dispatchWithin(t, d, testAlert("svc-t"), []domain.Target{emailTarget("t", "t@x")})
	waitMsg(t, buf, "t", "alert delivery attempt failed")
	waitPending(t, clk, 1)

	dispatchWithin(t, d, testAlert("svc-s"), []domain.Target{emailTarget("s", "s@x")})
	waitMsg(t, buf, "s", "alert delivered")
	clk.Advance(7 * time.Second)

	line := waitMsg(t, buf, "t", "alert delivered")
	assert.EqualValues(t, 2, line["attempts"])
	assert.NotContains(t, msgsOf(buf.linesOf(t, "t")), "alert delivery superseded")
}

func TestSupersede_AttemptInProgress(t *testing.T) {
	// blocked sets up a dispatcher whose first attempt blocks until the test releases it.
	blocked := func(t *testing.T, policy worker.RetryPolicy) (d *worker.AlertDispatcher, buf *syncBuffer, clk *clock.Fake, mailer *fakeMailer, release func(error)) {
		mailer = newFakeMailer()
		gate := make(chan error, 1)
		var once sync.Once
		release = func(err error) { once.Do(func() { gate <- err }) }
		mailer.behaveN["a@x"] = func(_ context.Context, n int) error {
			if n == 1 {
				select {
				case err := <-gate:
					return err
				case <-time.After(deadline):
					return errors.New("not released")
				}
			}
			return errors.New("later failure")
		}
		d, buf, clk = newRetryDispatcher(t, mailer, newFakeWebhooks(), policy)
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
		waitFor(t, mailer.started, "a@x")
		dispatchWithin(t, d, testAlert("svc"), nil) // the newer alert
		return
	}
	t.Run("the attempt is not cancelled", func(t *testing.T) {
		_, _, _, mailer, release := blocked(t, retry3)
		defer release(nil)
		mailer.mu.Lock()
		ctx := mailer.ctxs[0]
		mailer.mu.Unlock()
		// A cancel that a newer alert caused would arrive from another goroutine, so the
		// context is watched for a short real time, yielding, not read once.
		for end := time.Now().Add(50 * time.Millisecond); time.Now().Before(end); runtime.Gosched() {
			require.NoError(t, ctx.Err(), "the attempt in progress is not cancelled by a newer alert")
		}
	})
	t.Run("success counts", func(t *testing.T) {
		_, buf, _, _, release := blocked(t, retry3)
		release(nil)
		line := waitMsg(t, buf, "a", "alert delivered")
		assert.EqualValues(t, 1, line["attempts"])
	})
	t.Run("failure with retries left is superseded, with no wait", func(t *testing.T) {
		_, buf, clk, mailer, release := blocked(t, retry3)
		release(errors.New("refused"))
		line := waitMsg(t, buf, "a", "alert delivery superseded")
		assert.EqualValues(t, 1, line["attempts"])
		assert.Equal(t, 0, clk.Pending())
		clk.Advance(time.Hour)
		assert.Len(t, mailer.callList(), 1)
		assert.Equal(t, []string{"alert delivery superseded"}, msgsOf(buf.lines(t)))
	})
	t.Run("a superseded failure with a cause logs no cause", func(t *testing.T) {
		_, buf, _, _, release := blocked(t, retry3)
		release(&causedError{cause: "recipient refused", wrapped: "a@x"})
		line := waitMsg(t, buf, "a", "alert delivery superseded")
		assert.NotContains(t, line, "cause")
	})
	t.Run("failure on the last attempt is the final failure", func(t *testing.T) {
		_, buf, _, _, release := blocked(t, worker.RetryPolicy{Retries: 0, Interval: 7 * time.Second})
		release(errors.New("refused"))
		line := waitMsg(t, buf, "a", "alert delivery failed")
		assert.Equal(t, "refused", line["reason"])
		assert.EqualValues(t, 1, line["attempts"])
	})
	t.Run("a later attempt in progress is not cancelled either", func(t *testing.T) {
		mailer := newFakeMailer()
		gate := make(chan error, 1)
		mailer.behaveN["a@x"] = func(_ context.Context, n int) error {
			if n == 1 {
				return errors.New("failure 1")
			}
			select {
			case err := <-gate:
				return err
			case <-time.After(deadline):
				return errors.New("not released")
			}
		}
		d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 1, Interval: 7 * time.Second})
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
		waitPending(t, clk, 1)
		clk.Advance(7 * time.Second)
		waitMailCalls(t, mailer, 2)
		dispatchWithin(t, d, testAlert("svc"), nil)
		mailer.mu.Lock()
		assert.NoError(t, mailer.ctxs[1].Err())
		mailer.mu.Unlock()
		gate <- errors.New("failure 2")

		line := waitMsg(t, buf, "a", "alert delivery failed")
		assert.EqualValues(t, 2, line["attempts"])
	})
}

func TestSupersede_FirstAttemptIsAlwaysMade(t *testing.T) {
	for range 50 {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = alwaysFail()
		d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("b", "b@x")})

		line := waitMsg(t, buf, "a", "alert delivery superseded")
		waitMsg(t, buf, "b", "alert delivered")
		assert.EqualValues(t, 1, line["attempts"])
		assert.Equal(t, 1, countTo(mailer, "a@x"), "attempt 1 of the first alert was made")
		assert.Equal(t, 0, clk.Pending())
	}
}

func countTo(m *fakeMailer, to string) int {
	n := 0
	for _, c := range m.callList() {
		if c.to == to {
			n++
		}
	}
	return n
}

// holdAttemptFailed makes the log write of "alert delivery attempt failed" block until
// the returned release is called, with the timer already created.
func holdAttemptFailed(buf *syncBuffer) (held <-chan struct{}, release func()) {
	h := make(chan struct{}, 1)
	gate := make(chan struct{})
	var once sync.Once
	buf.hook = func(line string) {
		if strings.Contains(line, "alert delivery attempt failed") {
			h <- struct{}{}
			<-gate
		}
	}
	return h, func() { once.Do(func() { close(gate) }) }
}

func TestSupersede_RecheckAfterWakeUp(t *testing.T) {
	// The sequence is held after it created its timer. The timer fires and the second
	// event happens, then the sequence runs again with both ready: Go picks at random
	// between the ready channels, so the loop makes a skipped re-check fail.
	t.Run("timer fired and a newer alert was handed off", func(t *testing.T) {
		for range 40 {
			mailer := newFakeMailer()
			mailer.behaveN["a@x"] = alwaysFail()
			d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
			held, release := holdAttemptFailed(buf)
			dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
			select {
			case <-held:
			case <-time.After(deadline):
				t.Fatal("the sequence did not reach its wait")
			}
			clk.Advance(7 * time.Second)
			dispatchWithin(t, d, testAlert("svc"), nil)
			buf.hook = nil
			release()

			line := waitMsg(t, buf, "a", "alert delivery superseded")
			assert.EqualValues(t, 1, line["attempts"])
			assert.Len(t, mailer.callList(), 1, "no attempt 2")
		}
	})
	t.Run("timer fired and Close ran", func(t *testing.T) {
		for range 40 {
			mailer := newFakeMailer()
			mailer.behaveN["a@x"] = alwaysFail()
			d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)
			held, release := holdAttemptFailed(buf)
			dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
			select {
			case <-held:
			case <-time.After(deadline):
				t.Fatal("the sequence did not reach its wait")
			}
			clk.Advance(7 * time.Second)
			closed := make(chan struct{})
			go func() { d.Close(); close(closed) }()
			mailer.mu.Lock()
			ctx := mailer.ctxs[0]
			mailer.mu.Unlock()
			eventually(t, "Close to cancel the context", func() bool { return ctx.Err() != nil })
			buf.hook = nil
			release()
			select {
			case <-closed:
			case <-time.After(deadline):
				t.Fatal("Close did not return")
			}

			assert.Equal(t, "alert delivery abandoned", buf.linesOf(t, "a")[1]["msg"])
			assert.Len(t, mailer.callList(), 1, "no attempt 2")
		}
	})
}

func TestSupersede_EndedSequenceLogsNothing(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["bad@x"] = alwaysFail()
	d, buf, _ := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 0, Interval: 7 * time.Second})
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("ok", "ok@x"), emailTarget("bad", "bad@x")})
	waitMsg(t, buf, "ok", "alert delivered")
	waitMsg(t, buf, "bad", "alert delivery failed")

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("next", "next@x")})
	waitMsg(t, buf, "next", "alert delivered")

	assert.Equal(t, []string{"alert delivered"}, msgsOf(buf.linesOf(t, "ok")))
	assert.Equal(t, []string{"alert delivery failed"}, msgsOf(buf.linesOf(t, "bad")))
}

func TestSupersede_SecondDispatchIsNotSuperseded(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = alwaysFail()
	mailer.behaveN["b@x"] = failFirst(1)
	d, buf, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), retry3)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("b", "b@x")})
	waitMsg(t, buf, "a", "alert delivery superseded")
	waitMsg(t, buf, "b", "alert delivery attempt failed")
	waitPending(t, clk, 1)
	clk.Advance(7 * time.Second)

	waitMsg(t, buf, "b", "alert delivered")
	assert.NotContains(t, msgsOf(buf.linesOf(t, "b")), "alert delivery superseded")
}

func TestDispatch_RacingDispatchesAndClose(t *testing.T) {
	for range 30 {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = alwaysFail()
		d, _, clk := newRetryDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 3, Interval: time.Second})
		var wg sync.WaitGroup
		for i := range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				svc := fmt.Sprintf("svc-%d", i%3) // several services, some dispatched repeatedly
				d.Dispatch(testAlert(svc), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "a@x")})
				clk.Advance(time.Second)
			}()
		}

		closeWithin(t, d)
		started, returned := len(mailer.callList()), mailer.returnedCount()
		waitGroupWithin(t, &wg)

		assert.Equal(t, started, returned, "every started send has returned when Close does")
		assert.Equal(t, started, len(mailer.callList()), "no send started after Close returned")
		assert.Equal(t, 0, clk.Pending())
	}
}

// ---- the final outcome is reported ----

func TestOutcome_SuccessAtOnce(t *testing.T) {
	mailer := newFakeMailer()
	release := make(chan struct{})
	mailer.behave["a@x"] = func(context.Context) error { <-release; return nil }
	rec := newFakeOutcomes()
	d, _, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)
	var once sync.Once
	t.Cleanup(func() { once.Do(func() { close(release) }) })

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitFor(t, mailer.started, "a@x")
	assert.Empty(t, rec.callList(), "nothing is reported before the attempt returns")
	once.Do(func() { close(release) })
	rec.waitReports(t, 1)
	closeWithin(t, d)

	assert.Equal(t, []outcomeCall{{"svc", "t1", true}}, rec.callList())
}

func TestOutcome_FailFailSucceed(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = failFirst(2)
	rec := newFakeOutcomes()
	d, buf, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitMsg(t, buf, "t1", "alert delivery attempt failed")
	waitPending(t, clk, 1)
	assert.Empty(t, rec.callList(), "none after the first failure")
	clk.Advance(7 * time.Second)
	waitMailCalls(t, mailer, 2)
	eventually(t, "the second timer", func() bool { return clk.Pending() == 1 && len(buf.linesOf(t, "t1")) == 2 })
	assert.Empty(t, rec.callList(), "none after the second failure")
	clk.Advance(7 * time.Second)
	rec.waitReports(t, 1)
	clk.Advance(time.Hour)
	closeWithin(t, d)

	assert.Equal(t, []outcomeCall{{"svc", "t1", true}}, rec.callList())
	assert.Len(t, mailer.callList(), 3)
}

func TestOutcome_AlwaysFailing(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = alwaysFail()
	rec := newFakeOutcomes()
	d, buf, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	for i := 1; i <= 3; i++ {
		eventually(t, "the wait after attempt", func() bool {
			return clk.Pending() == 1 && len(mailer.callList()) == i && len(buf.linesOf(t, "t1")) == i
		})
		assert.Empty(t, rec.callList(), "no report after attempt %d", i)
		clk.Advance(7 * time.Second)
	}
	rec.waitReports(t, 1)
	clk.Advance(time.Hour)
	closeWithin(t, d)

	assert.Len(t, mailer.callList(), 4)
	assert.Equal(t, []outcomeCall{{"svc", "t1", false}}, rec.callList(), "one report, after the fourth failed attempt")
}

func TestOutcome_ZeroRetriesFailsAtOnce(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behaveN["a@x"] = alwaysFail()
	rec := newFakeOutcomes()
	d, _, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 0, Interval: 7 * time.Second}, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	rec.waitReports(t, 1)
	closeWithin(t, d)

	assert.Equal(t, []outcomeCall{{"svc", "t1", false}}, rec.callList())
}

func TestOutcome_Superseded(t *testing.T) {
	t.Run("a waiting sequence reports nothing; the newer one reports its own", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = alwaysFail()
		mailer.behaveN["b@x"] = failFirst(1)
		rec := newFakeOutcomes()
		d, buf, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
		waitMsg(t, buf, "a", "alert delivery attempt failed")
		waitPending(t, clk, 1)

		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("b", "b@x")})
		waitMsg(t, buf, "a", "alert delivery superseded")
		waitMsg(t, buf, "b", "alert delivery attempt failed")
		waitPending(t, clk, 1)
		clk.Advance(time.Hour)
		rec.waitReports(t, 1)
		closeWithin(t, d)

		assert.Equal(t, []outcomeCall{{"svc", "b", true}}, rec.callList(), "baseline: b reports, a does not")
	})
	// blocked sets up a first attempt that blocks until released, then a newer alert.
	blocked := func(t *testing.T, policy worker.RetryPolicy) (rec *fakeOutcomes, buf *syncBuffer, release func(error)) {
		mailer := newFakeMailer()
		gate := make(chan error, 1)
		release = func(err error) { gate <- err }
		mailer.behaveN["a@x"] = func(_ context.Context, n int) error {
			if n == 1 {
				select {
				case err := <-gate:
					return err
				case <-time.After(deadline):
					return errors.New("not released")
				}
			}
			return errors.New("later failure")
		}
		rec = newFakeOutcomes()
		d, buf, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), policy, rec)
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("a", "a@x")})
		waitFor(t, mailer.started, "a@x")
		dispatchWithin(t, d, testAlert("svc"), nil)
		return
	}
	t.Run("a success that returns after the newer alert reports delivered", func(t *testing.T) {
		rec, _, release := blocked(t, retry3)
		release(nil)
		rec.waitReports(t, 1)
		assert.Equal(t, []outcomeCall{{"svc", "a", true}}, rec.callList())
	})
	t.Run("a last attempt that fails after the newer alert reports failed", func(t *testing.T) {
		rec, _, release := blocked(t, worker.RetryPolicy{Retries: 0, Interval: 7 * time.Second})
		release(errors.New("refused"))
		rec.waitReports(t, 1)
		assert.Equal(t, []outcomeCall{{"svc", "a", false}}, rec.callList())
	})
	t.Run("a failure with retries left reports nothing", func(t *testing.T) {
		rec, buf, release := blocked(t, retry3)
		release(errors.New("refused"))
		waitMsg(t, buf, "a", "alert delivery superseded")
		assert.Empty(t, rec.callList())
	})
}

func TestOutcome_Abandoned(t *testing.T) {
	t.Run("Close during a wait", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = alwaysFail()
		rec := newFakeOutcomes()
		d, buf, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
		waitMsg(t, buf, "t1", "alert delivery attempt failed")
		waitPending(t, clk, 1)

		closeWithin(t, d)

		assert.Equal(t, "alert delivery abandoned", buf.linesOf(t, "t1")[1]["msg"], "baseline: the sequence was abandoned")
		assert.Empty(t, rec.callList())
	})
	t.Run("Close during an attempt that returns an error", func(t *testing.T) {
		mailer := newFakeMailer()
		mailer.behave["a@x"] = func(ctx context.Context) error { <-ctx.Done(); return errors.New("refused") }
		rec := newFakeOutcomes()
		d, buf, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 0, Interval: time.Second}, rec)
		dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
		waitFor(t, mailer.started, "a@x")

		closeWithin(t, d)

		assert.Equal(t, []string{"alert delivery abandoned"}, msgsOf(buf.linesOf(t, "t1")), "baseline: no final failure was decided")
		assert.Empty(t, rec.callList())
	})
}

func TestOutcome_SuccessAfterCloseIsRecorded(t *testing.T) {
	mailer := newFakeMailer()
	mailer.behave["a@x"] = func(ctx context.Context) error { <-ctx.Done(); return nil }
	rec := newFakeOutcomes()
	rec.block = make(chan struct{})
	var once sync.Once
	releaseRec := func() { once.Do(func() { close(rec.block) }) }
	t.Cleanup(releaseRec)
	d, _, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
	waitFor(t, mailer.started, "a@x")
	mailer.mu.Lock()
	sendCtx := mailer.ctxs[0]
	mailer.mu.Unlock()

	closed := make(chan struct{})
	go func() { d.Close(); close(closed) }()
	rec.waitReports(t, 1)

	require.Error(t, sendCtx.Err(), "baseline: Close cancelled the dispatcher's context")
	assert.NoError(t, rec.ctxList()[0].Err(), "the recorder's context is not cancelled")
	select {
	case <-closed:
		t.Fatal("Close returned before the recorder call returned")
	case <-time.After(50 * time.Millisecond):
	}
	releaseRec()
	select {
	case <-closed:
	case <-time.After(deadline):
		t.Fatal("Close did not return")
	}
	assert.Equal(t, 1, rec.returnedCount())
	assert.Equal(t, []outcomeCall{{"svc", "t1", true}}, rec.callList())
}

func TestOutcome_EmailAndWebhook(t *testing.T) {
	mailer, hooks := newFakeMailer(), newFakeWebhooks()
	mailer.behaveN["a@x"] = alwaysFail()
	rec := newFakeOutcomes()
	d, _, _ := newRecordingDispatcher(t, mailer, hooks, worker.RetryPolicy{Retries: 0, Interval: time.Second}, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("e1", "a@x"), webhookTarget("w1")})
	rec.waitReports(t, 2)
	closeWithin(t, d)

	assert.ElementsMatch(t, []outcomeCall{{"svc", "e1", false}, {"svc", "w1", true}}, rec.callList())
}

func TestOutcome_NothingForUnknownTypeOrAfterClose(t *testing.T) {
	rec := newFakeOutcomes()
	d, buf, _ := newRecordingDispatcher(t, newFakeMailer(), newFakeWebhooks(), retry3, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
		{ID: "x1", ServiceID: "svc", Type: "sms", Value: "123"}, emailTarget("t1", "a@x"),
	})
	rec.waitReports(t, 1)
	closeWithin(t, d)
	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t2", "b@x")})

	assert.Equal(t, []outcomeCall{{"svc", "t1", true}}, rec.callList(), "baseline: the email target reports, the others do not")
	assert.Equal(t, []string{"alert not delivered"}, msgsOf(buf.linesOf(t, "x1")))
}

func TestOutcome_BlockedRecorder(t *testing.T) {
	mailer := newFakeMailer()
	rec := newFakeOutcomes()
	rec.block = make(chan struct{})
	var once sync.Once
	releaseRec := func() { once.Do(func() { close(rec.block) }) }
	t.Cleanup(releaseRec)
	d, buf, _ := newRecordingDispatcher(t, mailer, newFakeWebhooks(), retry3, rec)

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
	rec.waitReports(t, 2) // both targets reached the recorder, which is blocked in each
	dispatchWithin(t, d, testAlert("other"), []domain.Target{{ID: "o1", ServiceID: "other", Type: domain.TargetTypeEmail, Value: "o@x"}})
	waitMsg(t, buf, "o1", "alert delivered")
	rec.waitReports(t, 1)
	assert.Zero(t, rec.returnedCount(), "baseline: the recorder is still blocked")

	closed := make(chan struct{})
	go func() { d.Close(); close(closed) }()
	select {
	case <-closed:
		t.Fatal("Close returned while a recorder call was in progress")
	case <-time.After(50 * time.Millisecond):
	}
	releaseRec()
	select {
	case <-closed:
	case <-time.After(deadline):
		t.Fatal("Close did not return")
	}
	assert.Equal(t, 3, rec.returnedCount())
}

func TestOutcome_RecorderError(t *testing.T) {
	for name, fail := range map[string]bool{"delivered": false, "failed": true} {
		t.Run(name, func(t *testing.T) {
			mailer := newFakeMailer()
			if fail {
				mailer.behaveN["a@x"] = alwaysFail()
			}
			rec := newFakeOutcomes()
			rec.err = errors.New("database is locked: /var/lib/monitory/secret.db")
			d, buf, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 0, Interval: time.Second}, rec)

			dispatchWithin(t, d, testAlert("svc"), []domain.Target{emailTarget("t1", "a@x")})
			waitMsg(t, buf, "t1", "alert outcome not saved")
			clk.Advance(time.Hour)
			closeWithin(t, d)

			lines := buf.linesOf(t, "t1")
			wantMsg := "alert delivered"
			if fail {
				wantMsg = "alert delivery failed"
			}
			require.Equal(t, []string{wantMsg, "alert outcome not saved"}, msgsOf(lines))
			l := lines[1]
			assert.Equal(t, "WARN", l["level"])
			assert.Equal(t, "svc", l["service_id"])
			assert.Equal(t, "t1", l["target_id"])
			assert.Equal(t, "unhealthy", l["status"])
			assert.Equal(t, fail == false, l["delivered"])
			assert.NotContains(t, l, "reason")
			assert.NotContains(t, buf.String(), "secret.db")
			assert.Len(t, rec.callList(), 1, "the write is not retried")
		})
	}
}

func TestOutcome_LogsHoldNoSecret(t *testing.T) {
	mailer, hooks := newFakeMailer(), newFakeWebhooks()
	mailer.behaveN[secretAddress] = alwaysFail()
	hooks.behaveN[secretURL] = alwaysFail()
	rec := newFakeOutcomes()
	rec.err = errors.New("write failed")
	d, buf, _ := newRecordingDispatcher(t, mailer, hooks, worker.RetryPolicy{Retries: 0, Interval: time.Second}, rec)
	headers := domain.NameValue{Name: secretHeaderName, Value: secretHeaderValue}

	dispatchWithin(t, d, testAlert("svc"), []domain.Target{
		emailTarget("e1", secretAddress), webhookTargetTo("w1", secretURL, headers), emailTarget("e2", "fine@x"),
	})
	rec.waitReports(t, 3)
	closeWithin(t, d)

	assert.Equal(t, 3, strings.Count(buf.String(), "alert outcome not saved"), "baseline: the new line was written")
	for _, secret := range []string{secretAddress, secretURL, "hooks.example.com", secretHeaderName, secretHeaderValue, secretName, secretService, secretMessage} {
		assert.NotContains(t, buf.String(), secret)
	}
}

func TestOutcome_RacingDispatchesAndClose(t *testing.T) {
	for range 30 {
		mailer := newFakeMailer()
		mailer.behaveN["a@x"] = failFirst(1)
		rec := newFakeOutcomes()
		d, _, clk := newRecordingDispatcher(t, mailer, newFakeWebhooks(), worker.RetryPolicy{Retries: 1, Interval: time.Second}, rec)
		var wg sync.WaitGroup
		for i := range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				d.Dispatch(testAlert(fmt.Sprintf("svc-%d", i%3)), []domain.Target{emailTarget("t1", "a@x"), emailTarget("t2", "b@x")})
				clk.Advance(time.Second)
			}()
		}

		closeWithin(t, d)
		started, returned := len(rec.callList()), rec.returnedCount()
		waitGroupWithin(t, &wg)

		assert.Equal(t, started, returned, "every recorder call has returned when Close does")
		assert.Equal(t, started, len(rec.callList()), "no recorder call started after Close returned")
		assert.Equal(t, mailer.returnedCount(), len(mailer.callList()))
	}
}

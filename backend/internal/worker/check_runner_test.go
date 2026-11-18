package worker_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/worker"
	"monitory/pkg/clock"
)

var start = time.Date(2026, 4, 5, 6, 7, 8, 0, time.UTC)

const waitLimit = 5 * time.Second // a failing test gives up after this; a passing one never waits for it

// eventLog is one ordered list of what the doubles saw.
type eventLog struct {
	mu     sync.Mutex
	events []string
}

func (l *eventLog) add(format string, args ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = append(l.events, fmt.Sprintf(format, args...))
}

func (l *eventLog) list() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string(nil), l.events...)
}

// countingClock wraps clock.Fake: it counts NewTimer calls, logs each wait, signals on
// created each time a timer is made, and remembers whether each timer was stopped.
type countingClock struct {
	*clock.Fake
	log     *eventLog
	created chan time.Duration
	// onTimer, when set, runs after each timer is made.
	onTimer func(d time.Duration)

	mu     sync.Mutex
	timers []*countingTimer
}

type countingTimer struct {
	clock.Timer
	mu      sync.Mutex
	stopped bool
}

func (t *countingTimer) Stop() bool {
	t.mu.Lock()
	t.stopped = true
	t.mu.Unlock()
	return t.Timer.Stop()
}

func (t *countingTimer) wasStopped() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.stopped
}

func newCountingClock(log *eventLog) *countingClock {
	return &countingClock{Fake: clock.NewFake(start), log: log, created: make(chan time.Duration, 20)}
}

func (c *countingClock) NewTimer(d time.Duration) clock.Timer {
	timer := &countingTimer{Timer: c.Fake.NewTimer(d)}
	c.mu.Lock()
	c.timers = append(c.timers, timer)
	c.mu.Unlock()
	c.log.add("wait %s", d)
	c.created <- d
	if c.onTimer != nil {
		c.onTimer(d)
	}
	return timer
}

func (c *countingClock) timerCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.timers)
}

func (c *countingClock) timer(i int) *countingTimer {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.timers[i]
}

// waitForTimer blocks until the runner has made a timer and returns its duration.
func (c *countingClock) waitForTimer(t *testing.T) time.Duration {
	t.Helper()
	select {
	case d := <-c.created:
		return d
	case <-time.After(waitLimit):
		require.FailNow(t, "the runner never started a wait")
		return 0
	}
}

// step is one scripted answer of the fake prober.
type step struct {
	result domain.CheckResult
	err    error
	block  bool   // wait for the context and return its error
	before func() // runs before the answer is returned
}

type fakeProber struct {
	log    *eventLog
	called chan struct{}

	mu     sync.Mutex
	script []step
	checks []domain.HTTPCheck
}

func newFakeProber(log *eventLog, script ...step) *fakeProber {
	return &fakeProber{log: log, called: make(chan struct{}, 20), script: script}
}

func (p *fakeProber) CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error) {
	p.mu.Lock()
	n := len(p.checks)
	p.checks = append(p.checks, check)
	var s step
	if n < len(p.script) {
		s = p.script[n]
	} else {
		s = step{err: errors.New("unscripted attempt")}
	}
	p.mu.Unlock()

	p.log.add("attempt")
	p.called <- struct{}{}
	if s.block {
		<-ctx.Done()
		return domain.CheckResult{}, ctx.Err()
	}
	if s.before != nil {
		s.before()
	}
	return s.result, s.err
}

func (p *fakeProber) callCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.checks)
}

func (p *fakeProber) waitForCall(t *testing.T) {
	t.Helper()
	select {
	case <-p.called:
	case <-time.After(waitLimit):
		require.FailNow(t, "the runner never made the attempt")
	}
}

type recorded struct {
	serviceID string
	result    domain.CheckResult
}

type fakeRecorder struct {
	log *eventLog
	err error

	mu      sync.Mutex
	records []recorded
}

func (r *fakeRecorder) RecordCheckResult(_ context.Context, id string, result domain.CheckResult) error {
	r.log.add("record")
	r.mu.Lock()
	defer r.mu.Unlock()
	r.records = append(r.records, recorded{id, result})
	return r.err
}

func (r *fakeRecorder) list() []recorded {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]recorded(nil), r.records...)
}

type rig struct {
	log      *eventLog
	clock    *countingClock
	prober   *fakeProber
	recorder *fakeRecorder
	runner   *worker.CheckRunner
}

func newRig(script ...step) *rig {
	log := &eventLog{}
	r := &rig{
		log:      log,
		clock:    newCountingClock(log),
		prober:   newFakeProber(log, script...),
		recorder: &fakeRecorder{log: log},
	}
	r.runner = worker.NewCheckRunner(r.prober, r.recorder, r.clock)
	return r
}

// run starts a sequence and returns the channel its error arrives on.
func (r *rig) run(ctx context.Context, svc domain.Service) <-chan error {
	done := make(chan error, 1)
	go func() { done <- r.runner.Run(ctx, svc) }()
	return done
}

func (r *rig) finish(t *testing.T, done <-chan error) error {
	t.Helper()
	select {
	case err := <-done:
		return err
	case <-time.After(waitLimit):
		require.FailNow(t, "the sequence did not end")
		return nil
	}
}

func ptr[T any](v T) *T { return &v }

func httpService(retries, intervalSeconds int) domain.Service {
	return domain.Service{
		ID: "svc-1", CheckType: domain.CheckTypeHTTP,
		HTTPMethod: ptr("HEAD"), HTTPURL: ptr("https://example.test/health"),
		TimeoutSeconds: 7, RetryCount: retries, RetryIntervalSeconds: intervalSeconds,
	}
}

func healthy() step { return step{result: domain.CheckResult{Healthy: true}} }

func failed(code domain.FailureCode) step {
	return step{result: domain.CheckResult{Failure: &domain.CheckFailure{Code: code}}}
}

func TestRun_HealthyFirstAttempt(t *testing.T) {
	r := newRig(healthy())

	require.NoError(t, r.runner.Run(t.Context(), httpService(3, 13)))

	assert.Equal(t, []string{"attempt", "record"}, r.log.list())
	assert.Zero(t, r.clock.timerCount())
	assert.Equal(t, []domain.HTTPCheck{{Method: "HEAD", URL: "https://example.test/health", Timeout: 7 * time.Second}}, r.prober.checks)
	require.Len(t, r.recorder.list(), 1)
	assert.Equal(t, "svc-1", r.recorder.list()[0].serviceID)
	assert.True(t, r.recorder.list()[0].result.Healthy)
}

func TestRun_AllAttemptsFail(t *testing.T) {
	r := newRig(failed(domain.FailureTimedOut), failed(domain.FailureTimedOut), failed(domain.FailureTimedOut))
	done := r.run(t.Context(), httpService(2, 13))

	r.prober.waitForCall(t)
	assert.Equal(t, 13*time.Second, r.clock.waitForTimer(t))
	r.clock.Advance(13 * time.Second)
	r.prober.waitForCall(t)
	assert.Equal(t, 13*time.Second, r.clock.waitForTimer(t))
	r.clock.Advance(13 * time.Second)
	require.NoError(t, r.finish(t, done))

	assert.Equal(t, []string{"attempt", "wait 13s", "attempt", "wait 13s", "attempt", "record"}, r.log.list())
	require.Len(t, r.recorder.list(), 1)
	assert.False(t, r.recorder.list()[0].result.Healthy)
}

func TestRun_RecordsLastFailure(t *testing.T) {
	r := newRig(failed(domain.FailureTimedOut), failed(domain.FailureCouldNotConnect), failed(domain.FailureTooManyRedirects))
	done := r.run(t.Context(), httpService(2, 3))
	for range 2 {
		r.clock.waitForTimer(t)
		r.clock.Advance(3 * time.Second)
	}
	require.NoError(t, r.finish(t, done))

	require.Len(t, r.recorder.list(), 1)
	assert.Equal(t, domain.FailureTooManyRedirects, r.recorder.list()[0].result.Failure.Code)
}

func TestRun_RetrySucceeds(t *testing.T) {
	r := newRig(failed(domain.FailureTimedOut), healthy(), failed(domain.FailureTimedOut))
	done := r.run(t.Context(), httpService(2, 9))
	r.clock.waitForTimer(t)
	r.clock.Advance(9 * time.Second)
	require.NoError(t, r.finish(t, done))

	assert.Equal(t, []string{"attempt", "wait 9s", "attempt", "record"}, r.log.list())
	assert.Equal(t, 2, r.prober.callCount())
	require.Len(t, r.recorder.list(), 1)
	assert.True(t, r.recorder.list()[0].result.Healthy)
}

func TestRun_NoRetries(t *testing.T) {
	r := newRig(failed(domain.FailureCouldNotConnect), healthy())

	require.NoError(t, r.runner.Run(t.Context(), httpService(0, 9)))

	assert.Equal(t, []string{"attempt", "record"}, r.log.list())
	assert.Zero(t, r.clock.timerCount())
	assert.Equal(t, domain.FailureCouldNotConnect, r.recorder.list()[0].result.Failure.Code)
}

func TestRun_NegativeRetryCount(t *testing.T) {
	r := newRig(failed(domain.FailureCouldNotConnect), healthy())

	require.NoError(t, r.runner.Run(t.Context(), httpService(-2, 9)))

	assert.Equal(t, []string{"attempt", "record"}, r.log.list())
	assert.Zero(t, r.clock.timerCount())
}

func TestRun_WaitBoundary(t *testing.T) {
	r := newRig(failed(domain.FailureTimedOut), healthy())
	done := r.run(t.Context(), httpService(1, 17))
	r.prober.waitForCall(t)
	assert.Equal(t, 17*time.Second, r.clock.waitForTimer(t))

	r.clock.Advance(16 * time.Second)
	assert.Equal(t, 1, r.clock.Pending(), "the timer still waits one second before the interval")
	assert.Equal(t, 1, r.prober.callCount())

	r.clock.Advance(time.Second)
	r.prober.waitForCall(t)
	require.NoError(t, r.finish(t, done))
	assert.Equal(t, 2, r.prober.callCount())
}

func TestRun_CancelDuringWait(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	r := newRig(failed(domain.FailureTimedOut), healthy())
	done := r.run(ctx, httpService(1, 17))
	r.clock.waitForTimer(t)

	cancel()

	require.ErrorIs(t, r.finish(t, done), context.Canceled)
	assert.True(t, r.clock.timer(0).wasStopped())
	assert.Zero(t, r.clock.Pending())
	assert.Equal(t, 1, r.prober.callCount())
	assert.Empty(t, r.recorder.list())
}

func TestRun_CancelDuringAttempt(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	r := newRig(step{block: true})
	done := r.run(ctx, httpService(2, 17))
	r.prober.waitForCall(t)

	cancel()

	require.ErrorIs(t, r.finish(t, done), context.Canceled)
	assert.Empty(t, r.recorder.list())
	assert.Zero(t, r.clock.timerCount())
}

func TestRun_CancelBeforeRecord(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	s := healthy()
	s.before = cancel
	r := newRig(s)

	require.ErrorIs(t, r.runner.Run(ctx, httpService(0, 1)), context.Canceled)
	assert.Empty(t, r.recorder.list())

	// Baseline: the same sequence on a live context records.
	r = newRig(healthy())
	require.NoError(t, r.runner.Run(t.Context(), httpService(0, 1)))
	assert.Len(t, r.recorder.list(), 1)
}

func TestRun_DeadlineInsteadOfCancel(t *testing.T) {
	ctx, cancel := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer cancel()
	r := newRig(healthy())

	require.ErrorIs(t, r.runner.Run(ctx, httpService(0, 1)), context.DeadlineExceeded)
	assert.Empty(t, r.recorder.list())
}

func TestRun_MaxRetriesLongInterval(t *testing.T) {
	script := make([]step, 6)
	for i := range script {
		script[i] = failed(domain.FailureTimedOut)
	}
	r := newRig(script...)
	done := r.run(t.Context(), httpService(5, 300))
	for range 5 {
		r.prober.waitForCall(t)
		assert.Equal(t, 300*time.Second, r.clock.waitForTimer(t))
		r.clock.Advance(300 * time.Second)
	}
	require.NoError(t, r.finish(t, done))

	assert.Equal(t, 6, r.prober.callCount())
	assert.Equal(t, 5, r.clock.timerCount())
	assert.Len(t, r.recorder.list(), 1)
}

func TestRun_ContextWinsOverFiredTimer(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	r := newRig(failed(domain.FailureTimedOut), healthy())
	r.clock.onTimer = func(d time.Duration) {
		cancel()
		r.clock.Advance(d) // the timer fires too, at the same moment
	}

	require.ErrorIs(t, r.runner.Run(ctx, httpService(1, 17)), context.Canceled)

	assert.Equal(t, 1, r.prober.callCount())
	assert.Empty(t, r.recorder.list())
}

func TestRun_TCPService(t *testing.T) {
	r := newRig(healthy())
	svc := httpService(2, 5)
	svc.CheckType = domain.CheckTypeTCP
	svc.HTTPMethod, svc.HTTPURL = nil, nil

	require.NoError(t, r.runner.Run(t.Context(), svc))

	assert.Zero(t, r.prober.callCount())
	assert.Empty(t, r.recorder.list())
	assert.Zero(t, r.clock.timerCount())

	// Baseline: the same settings as an HTTP service are probed and recorded.
	require.NoError(t, r.runner.Run(t.Context(), httpService(2, 5)))
	assert.Equal(t, 1, r.prober.callCount())
	assert.Len(t, r.recorder.list(), 1)
}

func TestRun_HTTPServiceMissingMethodOrURL(t *testing.T) {
	tests := map[string]func(*domain.Service){
		"nil url":    func(s *domain.Service) { s.HTTPURL = nil },
		"nil method": func(s *domain.Service) { s.HTTPMethod = nil },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			r := newRig(healthy())
			svc := httpService(1, 5)
			mutate(&svc)

			require.Error(t, r.runner.Run(t.Context(), svc))

			assert.Zero(t, r.prober.callCount())
			assert.Empty(t, r.recorder.list())
		})
	}
}

func TestRun_ProberError(t *testing.T) {
	errProbe := errors.New("probe broke")
	r := newRig(step{err: errProbe})

	require.ErrorIs(t, r.runner.Run(t.Context(), httpService(2, 5)), errProbe)

	assert.Empty(t, r.recorder.list())
	assert.Zero(t, r.clock.timerCount())
}

func TestRun_RecorderError(t *testing.T) {
	errRecord := errors.New("db down")
	r := newRig(healthy())
	r.recorder.err = errRecord

	require.ErrorIs(t, r.runner.Run(t.Context(), httpService(2, 5)), errRecord)

	assert.Len(t, r.recorder.list(), 1)
}

func TestRun_ConcurrentSequences(t *testing.T) {
	log := &eventLog{}
	var inFlight sync.WaitGroup
	inFlight.Add(2)
	both := make(chan struct{})
	go func() { inFlight.Wait(); close(both) }()

	byURL := map[string]domain.CheckResult{
		"https://a.test": {Failure: &domain.CheckFailure{Code: domain.FailureTimedOut}},
		"https://b.test": {Healthy: true},
	}
	prober := &urlProber{results: byURL, inFlight: &inFlight, both: both}
	recorder := &fakeRecorder{log: log}
	runner := worker.NewCheckRunner(prober, recorder, clock.NewFake(start))

	a, b := httpService(0, 1), httpService(0, 1)
	a.ID, a.HTTPURL = "svc-a", ptr("https://a.test")
	b.ID, b.HTTPURL = "svc-b", ptr("https://b.test")
	var wg sync.WaitGroup
	for _, svc := range []domain.Service{a, b} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			assert.NoError(t, runner.Run(t.Context(), svc))
		}()
	}
	wg.Wait()

	got := map[string]domain.CheckResult{}
	for _, rec := range recorder.list() {
		got[rec.serviceID] = rec.result
	}
	require.Len(t, got, 2)
	assert.False(t, got["svc-a"].Healthy)
	assert.Equal(t, domain.FailureTimedOut, got["svc-a"].Failure.Code)
	assert.True(t, got["svc-b"].Healthy)
}

// urlProber answers by URL and holds each call until both sequences are in flight.
type urlProber struct {
	results  map[string]domain.CheckResult
	inFlight *sync.WaitGroup
	both     chan struct{}
}

func (p *urlProber) CheckHTTP(_ context.Context, check domain.HTTPCheck) (domain.CheckResult, error) {
	p.inFlight.Done()
	<-p.both
	return p.results[check.URL], nil
}

func TestRun_PassesSavedRequest(t *testing.T) {
	svc := httpService(2, 5)
	svc.HTTPQueryParams = []domain.NameValue{{Name: "a", Value: "1"}, {Name: "a", Value: "2"}}
	svc.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer t"}}
	svc.HTTPBodyType = domain.BodyTypeJSON
	svc.HTTPBodyContent = `{"x":1}`
	r := newRig(failed(domain.FailureCouldNotConnect), failed(domain.FailureCouldNotConnect), healthy())
	done := r.run(t.Context(), svc)
	for i := 1; i <= 2; i++ {
		r.prober.waitForCall(t)
		assert.Equal(t, 5*time.Second, r.clock.waitForTimer(t))
		r.clock.Advance(5 * time.Second)
	}
	r.prober.waitForCall(t)
	require.NoError(t, r.finish(t, done))

	want := domain.HTTPCheck{
		Method: "HEAD", URL: "https://example.test/health", Timeout: 7 * time.Second,
		QueryParams: svc.HTTPQueryParams, Headers: svc.HTTPHeaders,
		BodyType: domain.BodyTypeJSON, BodyContent: `{"x":1}`,
	}
	require.Len(t, r.prober.checks, 3)
	for _, c := range r.prober.checks {
		assert.Equal(t, want, c)
	}
}

func TestRun_NoSavedRequestStaysEmpty(t *testing.T) {
	r := newRig(healthy())
	require.NoError(t, r.finish(t, r.run(t.Context(), httpService(0, 0))))
	require.Len(t, r.prober.checks, 1)
	c := r.prober.checks[0]
	assert.Nil(t, c.QueryParams)
	assert.Nil(t, c.Headers)
	assert.Empty(t, c.BodyType)
	assert.Empty(t, c.BodyContent)
}

func TestRun_PassesJSONRules(t *testing.T) {
	svc := httpService(2, 5)
	svc.JSONRules = []domain.JSONRule{{Field: "a.b", FailingValue: "down"}, {Field: "ok", FailingValue: false}}
	svc.JSONRuleMode = domain.JSONRuleModeAll
	r := newRig(failed(domain.FailureCouldNotConnect), failed(domain.FailureCouldNotConnect), healthy())
	done := r.run(t.Context(), svc)
	for range 2 {
		r.prober.waitForCall(t)
		r.clock.waitForTimer(t)
		r.clock.Advance(5 * time.Second)
	}
	r.prober.waitForCall(t)
	require.NoError(t, r.finish(t, done))

	require.Len(t, r.prober.checks, 3)
	for _, c := range r.prober.checks {
		assert.Equal(t, svc.JSONRules, c.JSONRules)
		assert.Equal(t, domain.JSONRuleModeAll, c.JSONRuleMode)
	}
}

func TestRun_NoJSONRulesStayEmpty(t *testing.T) {
	r := newRig(healthy())
	require.NoError(t, r.finish(t, r.run(t.Context(), httpService(0, 0))))
	require.Len(t, r.prober.checks, 1)
	assert.Nil(t, r.prober.checks[0].JSONRules)
	assert.Empty(t, r.prober.checks[0].JSONRuleMode)
}

func TestRun_RecordsJSONRuleField(t *testing.T) {
	matched := step{result: domain.CheckResult{Failure: &domain.CheckFailure{
		Code: domain.FailureJSONRuleMatched, JSONRuleField: ptr("checks.db.status"),
	}}}
	t.Run("recorded as given after the last attempt", func(t *testing.T) {
		r := newRig(matched, matched)
		done := r.run(t.Context(), httpService(1, 4))
		r.clock.waitForTimer(t)
		r.clock.Advance(4 * time.Second)
		require.NoError(t, r.finish(t, done))

		require.Len(t, r.recorder.list(), 1)
		f := r.recorder.list()[0].result.Failure
		require.NotNil(t, f)
		assert.Equal(t, domain.FailureJSONRuleMatched, f.Code)
		require.NotNil(t, f.JSONRuleField)
		assert.Equal(t, "checks.db.status", *f.JSONRuleField)
	})
	t.Run("a failing first attempt then a healthy one is healthy", func(t *testing.T) {
		r := newRig(matched, healthy())
		done := r.run(t.Context(), httpService(1, 4))
		r.clock.waitForTimer(t)
		r.clock.Advance(4 * time.Second)
		require.NoError(t, r.finish(t, done))

		require.Len(t, r.recorder.list(), 1)
		assert.True(t, r.recorder.list()[0].result.Healthy)
	})
}

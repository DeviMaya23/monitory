package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

var schedStart = time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)

// guard bounds every wait in a test; it only runs out when a test would fail.
const guard = 5 * time.Second

// countingClock wraps clock.Fake: it counts the timers made, signals each creation and
// each Stop, and can run a hook right after a timer is made.
type countingClock struct {
	*clock.Fake
	mu      sync.Mutex
	made    int
	created chan struct{}
	stopped chan struct{}
	onTimer func()
}

func newCountingClock() *countingClock {
	return &countingClock{
		Fake:    clock.NewFake(schedStart),
		created: make(chan struct{}, 1024),
		stopped: make(chan struct{}, 1024),
	}
}

func (c *countingClock) NewTimer(d time.Duration) clock.Timer {
	inner := c.Fake.NewTimer(d)
	c.mu.Lock()
	c.made++
	hook := c.onTimer
	c.mu.Unlock()
	c.created <- struct{}{}
	if hook != nil {
		hook()
	}
	return &countingTimer{Timer: inner, stopped: c.stopped}
}

func (c *countingClock) timersMade() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.made
}

type countingTimer struct {
	clock.Timer
	stopped chan struct{}
}

func (t *countingTimer) Stop() bool {
	// Stop the inner timer first: a test that gets the signal sees it stopped.
	stopped := t.Timer.Stop()
	t.stopped <- struct{}{}
	return stopped
}

// waitTimer waits until the code under test has made a timer.
func (c *countingClock) waitTimer(t *testing.T) {
	t.Helper()
	select {
	case <-c.created:
	case <-time.After(guard):
		t.Fatal("no timer was made")
	}
}

func (c *countingClock) waitStopped(t *testing.T) {
	t.Helper()
	select {
	case <-c.stopped:
	case <-time.After(guard):
		t.Fatal("no timer was stopped")
	}
}

type call struct {
	id string
	at time.Time
	n  int // the call's number for its service, from 1
}

// fakeSequence is a SequenceFunc that records and signals every call. behave, when set,
// decides what a call does and returns.
type fakeSequence struct {
	clk     clock.Clock
	signal  chan call
	behave  func(ctx context.Context, service domain.Service, c call) error
	mu      sync.Mutex
	calls   []call
	perID   map[string]int
	running map[string]int
	maxRun  map[string]int
	started int
	ended   int
}

func newFakeSequence(clk clock.Clock) *fakeSequence {
	return &fakeSequence{
		clk:     clk,
		signal:  make(chan call, 1024),
		perID:   map[string]int{},
		running: map[string]int{},
		maxRun:  map[string]int{},
	}
}

func (f *fakeSequence) run(ctx context.Context, service domain.Service) error {
	f.mu.Lock()
	f.perID[service.ID]++
	c := call{id: service.ID, at: f.clk.Now(), n: f.perID[service.ID]}
	f.calls = append(f.calls, c)
	f.started++
	f.running[service.ID]++
	f.maxRun[service.ID] = max(f.maxRun[service.ID], f.running[service.ID])
	f.mu.Unlock()
	f.signal <- c

	var err error
	if f.behave != nil {
		err = f.behave(ctx, service, c)
	}

	f.mu.Lock()
	f.running[service.ID]--
	f.ended++
	f.mu.Unlock()
	return err
}

func (f *fakeSequence) wait(t *testing.T) call {
	t.Helper()
	select {
	case c := <-f.signal:
		return c
	case <-time.After(guard):
		t.Fatal("no sequence was started")
		return call{}
	}
}

func (f *fakeSequence) count(id string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.perID[id]
}

func (f *fakeSequence) totals() (started, ended int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.started, f.ended
}

func (f *fakeSequence) maxRunning(id string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.maxRun[id]
}

func blockOnContext(ctx context.Context, _ domain.Service, _ call) error {
	<-ctx.Done()
	return ctx.Err()
}

// syncBuffer is a log destination safe for concurrent writes.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) lines() []map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(b.buf.String()), "\n") {
		if l == "" {
			continue
		}
		m := map[string]any{}
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			panic(err)
		}
		out = append(out, m)
	}
	return out
}

type schedSetup struct {
	clk   *countingClock
	seq   *fakeSequence
	sched *Scheduler
	log   *syncBuffer
}

func newSchedSetup(t *testing.T) schedSetup {
	t.Helper()
	clk := newCountingClock()
	seq := newFakeSequence(clk)
	logBuf := &syncBuffer{}
	sched := NewScheduler(seq.run, clk, slog.New(slog.NewJSONHandler(logBuf, nil)))
	t.Cleanup(sched.Close)
	return schedSetup{clk, seq, sched, logBuf}
}

func svc(id string, intervalSeconds int) domain.Service {
	return domain.Service{ID: id, Name: "name-" + id, CheckIntervalSeconds: intervalSeconds}
}

// returnsWithin fails the test if fn does not return in time.
func returnsWithin(t *testing.T, fn func()) {
	t.Helper()
	done := make(chan struct{})
	go func() { fn(); close(done) }()
	select {
	case <-done:
	case <-time.After(guard):
		t.Fatal("call did not return")
	}
}

func TestStart_RunsFirstSequenceAtOnce(t *testing.T) {
	s := newSchedSetup(t)
	var got domain.Service
	s.seq.behave = func(_ context.Context, service domain.Service, _ call) error { got = service; return nil }
	want := svc("a", 77)
	want.Name = "given"

	s.sched.Start(want)
	c := s.seq.wait(t)
	s.sched.Close()

	assert.Equal(t, schedStart, c.at)
	assert.Equal(t, want, got)
}

func TestScheduler_RunsAtTheInterval(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Start(svc("a", 45))
	s.seq.wait(t)
	s.clk.waitTimer(t)

	s.clk.Advance(44 * time.Second)
	assert.Equal(t, 1, s.clk.Pending(), "the timer has not fired one second early")
	assert.Equal(t, 1, s.seq.count("a"))

	s.clk.Advance(time.Second)
	second := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(45*time.Second), second.at)
	s.clk.waitTimer(t)

	s.clk.Advance(45 * time.Second)
	third := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(90*time.Second), third.at)

	s.sched.Close()
	assert.Equal(t, 3, s.seq.count("a"))
}

func TestScheduler_ServicesRunAtOwnRates(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Start(svc("a", 30))
	s.sched.Start(svc("b", 90))
	s.seq.wait(t)
	s.seq.wait(t)
	s.clk.waitTimer(t)
	s.clk.waitTimer(t)

	for step := 1; step <= 3; step++ {
		s.clk.Advance(30 * time.Second)
		due := 1
		if step == 3 {
			due = 2
		}
		for range due {
			s.seq.wait(t)
			s.clk.waitTimer(t)
		}
	}
	s.sched.Close()

	assert.Equal(t, 4, s.seq.count("a"))
	assert.Equal(t, 2, s.seq.count("b"))
}

func TestScheduler_OverrunStartsNextAtOnce(t *testing.T) {
	s := newSchedSetup(t)
	release := make(chan struct{})
	s.seq.behave = func(_ context.Context, _ domain.Service, c call) error {
		if c.n == 1 {
			<-release
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.clk.Advance(40 * time.Second)
	assert.Equal(t, 1, s.seq.count("a"), "no second sequence while the first runs")
	close(release)

	second := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(40*time.Second), second.at)
	s.clk.waitTimer(t)
	assert.Equal(t, 1, s.clk.timersMade(), "one timer, for the sequence after the late one")

	// Counted from the late start (40 s), not from the missed 30 s: no burst.
	s.clk.Advance(21 * time.Second) // 61 s: the missed 60 s slot must not run
	assert.Equal(t, 1, s.clk.Pending(), "the timer is still waiting")
	s.clk.Advance(8 * time.Second)
	assert.Equal(t, 1, s.clk.Pending())
	s.clk.Advance(time.Second)
	third := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(70*time.Second), third.at)
	s.clk.waitTimer(t)

	s.sched.Close()
	assert.Equal(t, 3, s.seq.count("a"))
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestScheduler_LateSequenceNoTimer(t *testing.T) {
	for name, takes := range map[string]time.Duration{"exactly at the next time": 30 * time.Second, "later": 41 * time.Second} {
		t.Run(name, func(t *testing.T) {
			s := newSchedSetup(t)
			s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
				if c.n == 1 {
					s.clk.Advance(takes)
					return nil
				}
				return blockOnContext(ctx, service, c)
			}

			s.sched.Start(svc("a", 30))
			s.seq.wait(t)
			second := s.seq.wait(t)

			assert.Equal(t, schedStart.Add(takes), second.at)
			assert.Equal(t, 0, s.clk.timersMade())
		})
	}
}

func TestScheduler_BlockedServiceDoesNotDelayAnother(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
		if service.ID == "a" {
			return blockOnContext(ctx, service, c)
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.sched.Start(svc("b", 50))
	s.seq.wait(t)
	s.seq.wait(t)
	s.clk.waitTimer(t)

	s.clk.Advance(49 * time.Second)
	assert.Equal(t, 1, s.seq.count("b"))
	s.clk.Advance(time.Second)
	c := s.seq.wait(t)

	assert.Equal(t, call{id: "b", at: schedStart.Add(50 * time.Second), n: 2}, c)
	assert.Equal(t, 1, s.seq.count("a"))
}

func TestScheduler_LogsSequenceErrorAndGoesOn(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = func(_ context.Context, _ domain.Service, c call) error {
		if c.n == 1 {
			return errors.New("boom")
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.clk.waitTimer(t)

	lines := s.log.lines()
	require.Len(t, lines, 1)
	assert.Equal(t, "check sequence failed", lines[0]["msg"])
	assert.Equal(t, "ERROR", lines[0]["level"])
	assert.Equal(t, "a", lines[0]["service_id"])
	assert.Equal(t, "boom", lines[0]["error"])

	s.clk.Advance(30 * time.Second)
	s.seq.wait(t)
	assert.Len(t, s.log.lines(), 1, "a sequence that succeeds logs nothing")
}

func TestScheduler_CancelledSequenceLogsNothing(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = blockOnContext
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.sched.Stop("a")
	s.sched.Close()

	assert.Empty(t, s.log.lines())
	assert.Equal(t, 0, s.clk.timersMade())
}

func TestStop_DuringWait(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.clk.waitTimer(t)

	s.sched.Stop("a")
	s.clk.waitStopped(t)
	assert.Equal(t, 0, s.clk.Pending(), "the timer is stopped")
	s.clk.Advance(90 * time.Second)
	s.sched.Close()

	assert.Equal(t, 1, s.seq.count("a"))
}

func TestStop_DuringSequence(t *testing.T) {
	s := newSchedSetup(t)
	cancelled := false
	s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
		err := blockOnContext(ctx, service, c)
		cancelled = errors.Is(ctx.Err(), context.Canceled)
		return err
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.sched.Stop("a")
	s.sched.Close()

	started, ended := s.seq.totals()
	assert.True(t, cancelled)
	assert.Equal(t, 1, started)
	assert.Equal(t, 1, ended)
	assert.Equal(t, 0, s.clk.timersMade())
}

func TestStop_UnknownTwiceAndAfterClose(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Stop("nobody")

	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.Stop("a")
	s.sched.Stop("a")
	s.sched.Close()
	s.sched.Stop("a")

	assert.Equal(t, 1, s.seq.count("a"))
}

func TestStop_FromInsideSequence(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = func(_ context.Context, service domain.Service, _ call) error {
		s.sched.Stop(service.ID)
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	returnsWithin(t, s.sched.Close)

	assert.Equal(t, 1, s.seq.count("a"))
	assert.Equal(t, 0, s.clk.timersMade())
}

func TestStart_ReplacesRunningService(t *testing.T) {
	s := newSchedSetup(t)
	oldCancelled := false
	// The second sequence reads the totals itself when it starts: reading them after
	// Start returns is too late, the new sequence may have run by then.
	type totalsAtSecond struct{ started, ended int }
	atSecond := make(chan totalsAtSecond, 1)
	s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
		if c.n == 1 {
			err := blockOnContext(ctx, service, c)
			oldCancelled = true
			return err
		}
		if c.n == 2 {
			started, ended := s.seq.totals()
			select {
			case atSecond <- totalsAtSecond{started, ended}:
			default:
			}
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.sched.Start(svc("a", 70))
	// Start returned: the old sequence has returned.
	assert.True(t, oldCancelled)

	second := s.seq.wait(t)
	assert.Equal(t, 2, second.n)
	select {
	case got := <-atSecond:
		assert.Equal(t, 2, got.started, "the second sequence is counted as started")
		assert.Equal(t, 1, got.ended, "the old sequence had returned when the new one began")
	case <-time.After(guard):
		t.Fatal("the second sequence did not report the totals")
	}
	s.clk.waitTimer(t)
	assert.Equal(t, 1, s.clk.timersMade())

	s.clk.Advance(69 * time.Second)
	assert.Equal(t, 2, s.seq.count("a"), "the new interval, not the old one")
	s.clk.Advance(time.Second)
	third := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(70*time.Second), third.at)
	s.clk.waitTimer(t)

	s.clk.Advance(70 * time.Second)
	s.seq.wait(t)
	s.clk.waitTimer(t)
	s.sched.Close()

	assert.Equal(t, 4, s.seq.count("a"), "one goroutine, one call per interval")
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestStart_ConcurrentSameID(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = blockOnContext

	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); s.sched.Start(svc("a", 30)) }()
	}
	wg.Wait()

	s.sched.mu.Lock()
	entries := len(s.sched.entries)
	s.sched.mu.Unlock()
	assert.Equal(t, 1, entries)

	s.seq.wait(t) // the surviving goroutine is running its sequence
	s.sched.Close()
	started, ended := s.seq.totals()
	assert.Equal(t, started, ended)
	assert.Equal(t, 1, s.seq.maxRunning("a"), "old and new never overlap")
}

func TestClose_WhileStartWaits(t *testing.T) {
	s := newSchedSetup(t)
	oldCancelled := make(chan struct{})
	release := make(chan struct{})
	s.seq.behave = func(ctx context.Context, _ domain.Service, _ call) error {
		<-ctx.Done()
		close(oldCancelled)
		<-release
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	startReturned := make(chan struct{})
	go func() { s.sched.Start(svc("a", 30)); close(startReturned) }()
	select {
	case <-oldCancelled:
	case <-time.After(guard):
		t.Fatal("the old sequence was not cancelled")
	}

	closeReturned := make(chan struct{})
	go func() { s.sched.Close(); close(closeReturned) }()
	deadline := time.Now().Add(guard)
	for !s.sched.isClosed() {
		require.True(t, time.Now().Before(deadline), "Close did not begin")
		runtime.Gosched()
	}
	close(release)

	for _, ch := range []chan struct{}{closeReturned, startReturned} {
		select {
		case <-ch:
		case <-time.After(guard):
			t.Fatal("Close or the waiting Start did not return")
		}
	}
	started, ended := s.seq.totals()
	assert.Equal(t, 1, started, "the waiting Start started nothing")
	assert.Equal(t, 1, ended)
}

func TestStart_InvalidInterval(t *testing.T) {
	for _, interval := range []int{0, -1} {
		t.Run(strconv.Itoa(interval), func(t *testing.T) {
			s := newSchedSetup(t)

			s.sched.Start(svc("a", interval))
			s.sched.Close()
			assert.Equal(t, 0, s.seq.count("a"))
			assert.Equal(t, 0, s.clk.timersMade())
			lines := s.log.lines()
			require.Len(t, lines, 1)
			assert.Equal(t, "service not scheduled", lines[0]["msg"])
			assert.Equal(t, "ERROR", lines[0]["level"])
			assert.Equal(t, "a", lines[0]["service_id"])
			assert.Equal(t, "invalid check interval", lines[0]["reason"])
		})

		t.Run(strconv.Itoa(interval)+" keeps a running entry", func(t *testing.T) {
			s := newSchedSetup(t)
			s.sched.Start(svc("a", 30))
			s.seq.wait(t)
			s.clk.waitTimer(t)

			s.sched.Start(svc("a", interval))
			s.clk.Advance(30 * time.Second)
			s.seq.wait(t)
			s.clk.waitTimer(t)

			assert.Equal(t, 2, s.seq.count("a"))
			assert.Equal(t, 2, s.clk.timersMade())
		})
	}
}

func TestScheduler_ContextWinsOverFiredTimer(t *testing.T) {
	// The timer fires and the service is stopped before the goroutine waits, so both
	// are ready; repeated so a random choice between them would show.
	for range 50 {
		s := newSchedSetup(t)
		hookDone := make(chan struct{}, 1)
		s.clk.onTimer = func() {
			s.clk.Advance(30 * time.Second)
			s.sched.Stop("a")
			select {
			case hookDone <- struct{}{}:
			default:
			}
		}
		s.sched.Start(svc("a", 30))
		s.seq.wait(t)
		select {
		case <-hookDone:
		case <-time.After(guard):
			t.Fatal("the timer hook did not finish")
		}
		s.sched.Close()

		assert.Equal(t, 1, s.seq.count("a"))
	}
}

func TestClose_CancelsRunningAndWaitingAndWaitsForBoth(t *testing.T) {
	s := newSchedSetup(t)
	release := make(chan struct{})
	s.seq.behave = func(ctx context.Context, service domain.Service, _ call) error {
		if service.ID == "a" {
			<-ctx.Done()
			<-release
			return ctx.Err()
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.sched.Start(svc("b", 30))
	s.seq.wait(t)
	s.seq.wait(t)
	s.clk.waitTimer(t)

	closed := make(chan struct{})
	go func() { s.sched.Close(); close(closed) }()
	select {
	case <-closed:
		t.Fatal("Close returned while a sequence was still running")
	default:
	}
	close(release)
	select {
	case <-closed:
	case <-time.After(guard):
		t.Fatal("Close did not return")
	}

	started, ended := s.seq.totals()
	assert.Equal(t, 2, started)
	assert.Equal(t, 2, ended)

	returnsWithin(t, s.sched.Close)
	s.sched.Start(svc("c", 30))
	s.clk.Advance(time.Hour)
	assert.Equal(t, 0, s.seq.count("c"))
	started, ended = s.seq.totals()
	assert.Equal(t, 2, started)
	assert.Equal(t, 2, ended)
}

func TestClose_ManyServices(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
		if c.id[len(c.id)-1]%2 == 0 {
			return blockOnContext(ctx, service, c)
		}
		return nil
	}
	for i := range 50 {
		s.sched.Start(svc("svc-"+strconv.Itoa(i), 30+i))
	}
	for range 50 {
		s.seq.wait(t)
	}

	s.sched.Close()

	started, ended := s.seq.totals()
	assert.Equal(t, 50, started)
	assert.Equal(t, 50, ended)
}

func TestScheduler_SchedulesFromTheStartOfTheSequence(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = func(_ context.Context, _ domain.Service, c call) error {
		if c.n == 1 {
			s.clk.Advance(10 * time.Second) // the sequence takes 10 s of the 30 s interval
		}
		return nil
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.clk.waitTimer(t)

	s.clk.Advance(19 * time.Second)
	assert.Equal(t, 1, s.seq.count("a"))
	s.clk.Advance(time.Second)
	second := s.seq.wait(t)

	assert.Equal(t, schedStart.Add(30*time.Second), second.at)
}

func TestScheduler_IntervalLimits(t *testing.T) {
	for _, interval := range []int{30, 86400} {
		t.Run(strconv.Itoa(interval), func(t *testing.T) {
			s := newSchedSetup(t)
			d := time.Duration(interval) * time.Second

			s.sched.Start(svc("a", interval))
			s.seq.wait(t)
			s.clk.waitTimer(t)

			s.clk.Advance(d - time.Second)
			assert.Equal(t, 1, s.seq.count("a"))
			s.clk.Advance(time.Second)
			second := s.seq.wait(t)
			assert.Equal(t, schedStart.Add(d), second.at)
		})
	}
}

func TestScheduler_StartStopCloseFromManyGoroutines(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = blockOnContext
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(3)
		id := "svc-" + strconv.Itoa(i%4)
		go func() { defer wg.Done(); s.sched.Start(svc(id, 30+i)) }()
		go func() { defer wg.Done(); s.sched.Stop(id) }()
		go func() { defer wg.Done(); s.sched.Start(svc(id, 40+i)) }()
	}
	returnsWithin(t, wg.Wait)
	returnsWithin(t, s.sched.Close)

	started, ended := s.seq.totals()
	assert.Equal(t, started, ended)
}

// holdFirst makes the first sequence of a service wait for its context to be cancelled,
// signal that on cancelled, and then return only when release is closed. Later
// sequences return at once.
func holdFirst(cancelled, release chan struct{}) func(context.Context, domain.Service, call) error {
	return func(ctx context.Context, _ domain.Service, c call) error {
		if c.n > 1 {
			return nil
		}
		<-ctx.Done()
		close(cancelled)
		<-release
		return ctx.Err()
	}
}

// spin gives other goroutines every chance to run. A test uses it before it asserts
// that something did not happen while an old sequence is held.
func spin() {
	for range 1000 {
		runtime.Gosched()
	}
}

func waitClosed(t *testing.T, ch chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(guard):
		t.Fatal(what)
	}
}

func notClosed(t *testing.T, ch chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
		t.Fatal(what)
	default:
	}
}

func inGoroutine(fn func()) chan struct{} {
	done := make(chan struct{})
	go func() { fn(); close(done) }()
	return done
}

func waitUntilClosed(t *testing.T, s *Scheduler) {
	t.Helper()
	deadline := time.Now().Add(guard)
	for !s.isClosed() {
		require.True(t, time.Now().Before(deadline), "Close did not begin")
		runtime.Gosched()
	}
}

func TestRestart_FirstSequenceRunsAtFirstCheckAt(t *testing.T) {
	s := newSchedSetup(t)
	at := schedStart.Add(50 * time.Second)

	s.sched.Restart(svc("a", 30), at)
	s.clk.waitTimer(t)
	spin()
	assert.Equal(t, 0, s.seq.count("a"), "nothing runs at once")

	s.clk.Advance(49 * time.Second)
	spin()
	assert.Equal(t, 0, s.seq.count("a"), "one second early")

	s.clk.Advance(time.Second)
	first := s.seq.wait(t)
	assert.Equal(t, at, first.at)
	s.clk.waitTimer(t)

	s.clk.Advance(29 * time.Second)
	spin()
	assert.Equal(t, 1, s.seq.count("a"))
	s.clk.Advance(time.Second)
	second := s.seq.wait(t)
	assert.Equal(t, at.Add(30*time.Second), second.at, "one interval after firstCheckAt, not after the edit")

	// The timer fires late (the clock moved past firstCheckAt in one step): the schedule
	// still counts from firstCheckAt, so a late wake-up does not shift later checks.
	t.Run("a late wake-up does not shift the schedule", func(t *testing.T) {
		s := newSchedSetup(t)
		s.sched.Restart(svc("a", 30), at)
		s.clk.waitTimer(t)
		s.clk.Advance(55 * time.Second)
		s.seq.wait(t)
		s.clk.waitTimer(t)

		s.clk.Advance(25 * time.Second)
		s.seq.wait(t)
		assert.Equal(t, 2, s.seq.count("a"), "the second runs at firstCheckAt plus the interval, not five seconds later")
	})
}

func TestRestart_UnknownIDStartsIt(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Restart(svc("new", 30), schedStart.Add(5*time.Second))
	s.clk.waitTimer(t)
	s.clk.Advance(5 * time.Second)

	assert.Equal(t, schedStart.Add(5*time.Second), s.seq.wait(t).at)
	s.sched.mu.Lock()
	assert.Len(t, s.sched.entries, 1)
	s.sched.mu.Unlock()
}

func TestRestart_TimeNotAfterNowRunsAtOnce(t *testing.T) {
	for name, offset := range map[string]time.Duration{
		"equal to now": 0,
		"in the past":  -time.Second,
		"far back":     -400 * 24 * time.Hour,
	} {
		t.Run(name, func(t *testing.T) {
			s := newSchedSetup(t)

			s.sched.Restart(svc("a", 45), schedStart.Add(offset))
			first := s.seq.wait(t)
			assert.Equal(t, schedStart, first.at)
			s.clk.waitTimer(t)
			assert.Equal(t, 1, s.clk.timersMade(), "the only timer is the one for the next sequence")

			s.clk.Advance(44 * time.Second)
			spin()
			assert.Equal(t, 1, s.seq.count("a"), "no burst of missed sequences")
			s.clk.Advance(time.Second)
			second := s.seq.wait(t)
			assert.Equal(t, schedStart.Add(45*time.Second), second.at, "counted from the start of the first")
			s.clk.waitTimer(t)
			s.sched.Close()
			assert.Equal(t, 2, s.seq.count("a"))
		})
	}
}

func TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	// A first check that is not after now would run at once in a goroutine that did not
	// wait for the old sequence.
	returnsWithin(t, func() { s.sched.Restart(svc("a", 70), schedStart) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	spin()
	assert.Equal(t, 1, s.seq.count("a"), "the new goroutine runs nothing while the old sequence is held")

	close(release)
	second := s.seq.wait(t)
	assert.Equal(t, 2, second.n)
	s.clk.waitTimer(t)
	s.clk.Advance(69 * time.Second)
	spin()
	assert.Equal(t, 2, s.seq.count("a"), "the new interval, not the old one")
	s.clk.Advance(time.Second)
	third := s.seq.wait(t)
	assert.Equal(t, schedStart.Add(70*time.Second), third.at)
	s.sched.Close()
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestRestart_ChainRunsOnlyTheLast(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	returnsWithin(t, func() { s.sched.Restart(svc("a", 40), schedStart.Add(10*time.Second)) })
	returnsWithin(t, func() { s.sched.Restart(svc("a", 50), schedStart.Add(20*time.Second)) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	s.clk.Advance(30 * time.Second) // past both firstCheckAt
	spin()
	assert.Equal(t, 1, s.seq.count("a"))

	close(release)
	last := s.seq.wait(t)
	assert.Equal(t, 2, last.n)
	assert.Equal(t, schedStart.Add(30*time.Second), last.at, "the late first sequence runs at once")
	s.clk.waitTimer(t)
	spin()
	s.sched.Close()

	assert.Equal(t, 2, s.seq.count("a"), "the middle goroutine ran no sequence")
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestStart_AfterRestartWaitsForTheChain(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.Restart(svc("a", 30), schedStart)

	started := inGoroutine(func() { s.sched.Start(svc("a", 60)) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	spin()
	notClosed(t, started, "Start returned while the old sequence was held")
	assert.Equal(t, 1, s.seq.count("a"))

	close(release)
	waitClosed(t, started, "Start did not return")
	second := s.seq.wait(t)
	assert.Equal(t, 2, second.n)
	assert.Equal(t, schedStart, second.at, "Start runs the first sequence at once")
	s.sched.Close()
	assert.Equal(t, 2, s.seq.count("a"), "the restarted goroutine ran nothing")
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestRestart_WhileStartWaits(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	hold := holdFirst(cancelled, release)
	s.seq.behave = func(ctx context.Context, service domain.Service, c call) error {
		if c.n > 1 {
			return blockOnContext(ctx, service, c) // the survivor keeps running
		}
		return hold(ctx, service, c)
	}
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	started := inGoroutine(func() { s.sched.Start(svc("a", 30)) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	spin() // Start is waiting for the old goroutine
	returnsWithin(t, func() { s.sched.Restart(svc("a", 30), schedStart) })

	close(release)
	waitClosed(t, started, "Start did not return")
	s.seq.wait(t) // a survivor runs
	returnsWithin(t, s.sched.Close)

	started2, ended := s.seq.totals()
	assert.Equal(t, started2, ended, "no goroutine is left")
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestRestart_ReplacesWaitingTimer(t *testing.T) {
	s := newSchedSetup(t)
	first, second := schedStart.Add(100*time.Second), schedStart.Add(200*time.Second)
	s.sched.Restart(svc("a", 30), first)
	s.clk.waitTimer(t)

	s.sched.Restart(svc("a", 30), second)
	s.clk.waitStopped(t)
	s.clk.waitTimer(t)
	assert.Equal(t, 1, s.clk.Pending(), "only the new timer is left")

	s.clk.Advance(100 * time.Second)
	spin()
	assert.Equal(t, 0, s.seq.count("a"), "the old timer does not fire")
	s.clk.Advance(100 * time.Second)
	assert.Equal(t, second, s.seq.wait(t).at)
}

func TestRestart_StopDuringFirstWait(t *testing.T) {
	s := newSchedSetup(t)
	s.sched.Restart(svc("a", 30), schedStart.Add(60*time.Second))
	s.clk.waitTimer(t)

	s.sched.Stop("a")
	s.clk.waitStopped(t)
	assert.Equal(t, 0, s.clk.Pending())
	s.clk.Advance(300 * time.Second)
	spin()
	s.sched.Close()
	assert.Equal(t, 0, s.seq.count("a"))
}

func TestStop_ThenStartWaitsForTheStoppedGoroutine(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.sched.Stop("a")
	started := inGoroutine(func() { s.sched.Start(svc("a", 30)) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	spin()
	assert.Equal(t, 1, s.seq.count("a"), "the new sequence waits for the old one")
	assert.Equal(t, 1, s.seq.maxRunning("a"))
	notClosed(t, started, "Start returned while the stopped goroutine was running")

	close(release)
	waitClosed(t, started, "Start did not return")
	assert.Equal(t, 2, s.seq.wait(t).n)
	s.sched.Close()
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestStop_ThenRestartWaitsForTheStoppedGoroutine(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)

	s.sched.Stop("a")
	returnsWithin(t, func() { s.sched.Restart(svc("a", 30), schedStart) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")
	spin()
	assert.Equal(t, 1, s.seq.count("a"), "the new sequence waits for the old one")
	assert.Equal(t, 1, s.seq.maxRunning("a"))

	close(release)
	assert.Equal(t, 2, s.seq.wait(t).n)
	s.sched.Close()
	assert.Equal(t, 1, s.seq.maxRunning("a"))
}

func TestStop_LeavesNoBookkeepingAfterTheGoroutineEnds(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = blockOnContext
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.mu.Lock()
	done := s.sched.entries["a"].done
	s.sched.mu.Unlock()

	s.sched.Stop("a")
	waitClosed(t, done, "the stopped goroutine did not end")

	s.sched.mu.Lock()
	defer s.sched.mu.Unlock()
	assert.Empty(t, s.sched.entries, "no record of the stopped service remains")
}

func TestClose_WaitsForAStoppedGoroutine(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.Stop("a")
	waitClosed(t, cancelled, "the sequence was not cancelled")

	closed := inGoroutine(s.sched.Close)
	spin()
	notClosed(t, closed, "Close returned while a stopped goroutine was running")
	close(release)
	waitClosed(t, closed, "Close did not return")
	started, ended := s.seq.totals()
	assert.Equal(t, started, ended)
}

func TestClose_WhileRestartWaits(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.Restart(svc("a", 30), schedStart)
	waitClosed(t, cancelled, "the old sequence was not cancelled")

	closed := inGoroutine(s.sched.Close)
	waitUntilClosed(t, s.sched)
	close(release)
	waitClosed(t, closed, "Close did not return")

	started, ended := s.seq.totals()
	assert.Equal(t, 1, started, "the restarted goroutine ran no sequence")
	assert.Equal(t, 1, ended)
	s.sched.mu.Lock()
	assert.Empty(t, s.sched.entries)
	s.sched.mu.Unlock()
}

func TestClose_WhileStartWaitsForAStoppedGoroutine(t *testing.T) {
	s := newSchedSetup(t)
	cancelled, release := make(chan struct{}), make(chan struct{})
	s.seq.behave = holdFirst(cancelled, release)
	s.sched.Start(svc("a", 30))
	s.seq.wait(t)
	s.sched.Stop("a")
	started := inGoroutine(func() { s.sched.Start(svc("a", 30)) })
	waitClosed(t, cancelled, "the old sequence was not cancelled")

	closed := inGoroutine(s.sched.Close)
	waitUntilClosed(t, s.sched)
	close(release)
	waitClosed(t, closed, "Close did not return")
	waitClosed(t, started, "the waiting Start did not return")

	n, ended := s.seq.totals()
	assert.Equal(t, 1, n, "the waiting Start started nothing")
	assert.Equal(t, 1, ended)
}

func TestRestart_InvalidInterval(t *testing.T) {
	for _, interval := range []int{0, -1} {
		t.Run(strconv.Itoa(interval), func(t *testing.T) {
			s := newSchedSetup(t)
			s.sched.Restart(svc("a", interval), schedStart)
			s.sched.Close()

			assert.Equal(t, 0, s.seq.count("a"))
			assert.Equal(t, 0, s.clk.timersMade())
			lines := s.log.lines()
			require.Len(t, lines, 1)
			assert.Equal(t, "service not scheduled", lines[0]["msg"])
			assert.Equal(t, "ERROR", lines[0]["level"])
			assert.Equal(t, "a", lines[0]["service_id"])
		})

		t.Run(strconv.Itoa(interval)+" keeps a running entry", func(t *testing.T) {
			s := newSchedSetup(t)
			s.sched.Start(svc("a", 30))
			s.seq.wait(t)
			s.clk.waitTimer(t)

			s.sched.Restart(svc("a", interval), schedStart)
			s.clk.Advance(30 * time.Second)
			s.seq.wait(t)
			s.clk.waitTimer(t)

			assert.Equal(t, 2, s.seq.count("a"))
			assert.Equal(t, 2, s.clk.timersMade())
		})
	}
}

func TestRestart_FromManyGoroutines(t *testing.T) {
	s := newSchedSetup(t)
	s.seq.behave = blockOnContext
	var wg sync.WaitGroup
	for g := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range 20 {
				s.sched.Restart(svc("a", 30+g+i), schedStart)
			}
		}()
	}
	returnsWithin(t, wg.Wait)
	returnsWithin(t, s.sched.Close)

	started, ended := s.seq.totals()
	assert.Equal(t, started, ended, "every started goroutine has ended")
	assert.LessOrEqual(t, s.seq.maxRunning("a"), 1)
}

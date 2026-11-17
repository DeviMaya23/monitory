package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// SequenceFunc runs one check sequence for a service and returns when it is done or
// when ctx ends.
type SequenceFunc func(ctx context.Context, service domain.Service) error

// entry is one started service: how to end its goroutine and a channel that closes
// when the goroutine has ended.
type entry struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// Scheduler runs the check sequence of every started service on its own goroutine, at
// the service's check interval. It makes no decision about which services run; the
// caller starts and stops them (usecase.Scheduler).
type Scheduler struct {
	sequence SequenceFunc
	clock    clock.Clock
	log      *slog.Logger

	// startMu only serializes Start calls, so Start can wait for an old goroutine
	// without holding mu.
	startMu sync.Mutex

	// mu guards entries and closed. No goroutine takes it, and nothing blocks while it
	// is held.
	mu      sync.Mutex
	entries map[string]*entry
	closed  bool

	// wg counts every goroutine started, including those already removed by Stop.
	wg sync.WaitGroup
}

// NewScheduler returns a Scheduler that runs sequence for each started service.
func NewScheduler(sequence SequenceFunc, clock clock.Clock, log *slog.Logger) *Scheduler {
	return &Scheduler{
		sequence: sequence,
		clock:    clock,
		log:      log,
		entries:  make(map[string]*entry),
	}
}

// Start begins checking service at once and then at its check interval (FR-10, FR-67,
// FR-111). A service already started is replaced: Start ends its goroutine and waits
// for it before starting the new one, so two sequences of one service never overlap.
// A sequence function must not call Start for its own service.
func (s *Scheduler) Start(service domain.Service) {
	if s.isClosed() {
		return
	}
	if service.CheckIntervalSeconds <= 0 {
		s.log.Error("service not scheduled", "service_id", service.ID, "reason", "invalid check interval")
		return
	}

	s.startMu.Lock()
	defer s.startMu.Unlock()

	s.mu.Lock()
	old := s.entries[service.ID]
	s.mu.Unlock()
	if old != nil {
		old.cancel()
		<-old.done
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	e := &entry{cancel: cancel, done: make(chan struct{})}
	s.entries[service.ID] = e
	s.wg.Add(1)
	go s.run(ctx, service, e.done)
}

// Stop ends the checking of a deleted service without waiting for it (FR-71). An unknown
// id does nothing.
func (s *Scheduler) Stop(serviceID string) {
	s.mu.Lock()
	e := s.entries[serviceID]
	delete(s.entries, serviceID)
	s.mu.Unlock()
	if e != nil {
		e.cancel()
	}
}

// Close stops accepting services, ends every goroutine and returns when all have ended.
// A second call is safe. A sequence function must not call it.
func (s *Scheduler) Close() {
	s.mu.Lock()
	s.closed = true
	entries := s.entries
	s.entries = make(map[string]*entry)
	s.mu.Unlock()

	for _, e := range entries {
		e.cancel()
	}
	s.wg.Wait()
}

func (s *Scheduler) isClosed() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.closed
}

// run is the loop of one service. It works on the copy it was given and checks ctx
// after every wait and before every sequence.
func (s *Scheduler) run(ctx context.Context, service domain.Service, done chan struct{}) {
	defer s.wg.Done()
	defer close(done)

	interval := time.Duration(service.CheckIntervalSeconds) * time.Second
	scheduledAt := s.clock.Now()
	for {
		if ctx.Err() != nil {
			return
		}
		err := s.sequence(ctx, service)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			s.log.Error("check sequence failed", "service_id", service.ID, "error", err.Error())
		}

		// Start to start. A sequence that overran starts the next at once, and the one
		// after is counted from that late start: no catch-up.
		next := scheduledAt.Add(interval)
		now := s.clock.Now()
		if !next.After(now) {
			scheduledAt = now
			continue
		}
		timer := s.clock.NewTimer(next.Sub(now))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C():
		}
		scheduledAt = next
	}
}

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

// entry is one started goroutine: how to end it and a channel that closes when it has
// ended. Stop cancels an entry but leaves it in the map until its goroutine has ended, so
// that a later Start or Restart of the same id can wait for it.
type entry struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// Scheduler runs the check sequence of every started service on its own goroutine, at
// the service's check interval. It makes no decision about which services run, and it
// never reads Service.Paused; the caller starts, restarts and stops them
// (usecase.Scheduler).
type Scheduler struct {
	sequence SequenceFunc
	clock    clock.Clock
	log      *slog.Logger

	// startMu serializes Start calls only, so Start can wait for an old goroutine
	// without holding mu.
	startMu sync.Mutex

	// mu guards entries and closed. A goroutine takes it for a moment when it begins
	// its first wait and when it ends; nothing blocks while it is held.
	mu      sync.Mutex
	entries map[string]*entry
	closed  bool

	// wg counts every goroutine started, including those no longer in entries.
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
// It also waits for a goroutine that Stop cancelled and a Restart that has not run yet.
// Start does not look at service.Paused: the caller decides which services to start. A
// sequence function must not call Start for its own service.
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

	for {
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			return
		}
		old := s.entries[service.ID]
		if old == nil {
			s.launch(service, nil, time.Time{})
			s.mu.Unlock()
			return
		}
		old.cancel()
		s.mu.Unlock()
		// A Restart may install a newer entry meanwhile: look again after the wait.
		<-old.done
	}
}

// Restart replaces the checking of service with a new schedule whose first sequence
// runs at firstCheckAt, then at every check interval after it (FR-66). It returns at
// once and never waits for the old goroutine: the new goroutine waits for the old one
// to end before it does anything, so two sequences of one service never overlap. A
// firstCheckAt that is not after the time the goroutine gets to it runs the first
// sequence at once, and the schedule counts from that start. A service not started yet
// is started. Restart does not look at service.Paused: the caller decides which
// services to restart. A sequence function must not call Restart for its own service.
func (s *Scheduler) Restart(service domain.Service, firstCheckAt time.Time) {
	if service.CheckIntervalSeconds <= 0 {
		s.log.Error("service not scheduled", "service_id", service.ID, "reason", "invalid check interval")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	old := s.entries[service.ID]
	if old != nil {
		old.cancel()
	}
	s.launch(service, old, firstCheckAt)
}

// launch installs an entry for service and starts its goroutine. The caller holds mu.
// prev, when not nil, is the entry the goroutine waits for; firstCheckAt, when not the
// zero time, is when its first sequence runs.
func (s *Scheduler) launch(service domain.Service, prev *entry, firstCheckAt time.Time) {
	ctx, cancel := context.WithCancel(context.Background())
	e := &entry{cancel: cancel, done: make(chan struct{})}
	s.entries[service.ID] = e
	s.wg.Add(1)
	go s.run(ctx, service, e, prev, firstCheckAt)
}

// Stop ends the checking of a deleted service without waiting for it (FR-71). The
// cancelled goroutine stays in entries until it has ended, so that a later Start or
// Restart of the same id waits for it. An unknown id does nothing.
func (s *Scheduler) Stop(serviceID string) {
	s.mu.Lock()
	e := s.entries[serviceID]
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
// after every wait and before every sequence. When it ends it removes its own entry
// (never a newer one), then closes done.
func (s *Scheduler) run(ctx context.Context, service domain.Service, e, prev *entry, firstCheckAt time.Time) {
	defer s.wg.Done()
	defer func() {
		s.mu.Lock()
		if s.entries[service.ID] == e {
			delete(s.entries, service.ID)
		}
		s.mu.Unlock()
		close(e.done)
	}()

	if prev != nil {
		// Only the end of the previous goroutine ends this wait, not ctx.
		<-prev.done
		// Close marks the scheduler closed before it cancels the entries, so ctx alone
		// could still be live here: look at the scheduler and the entry under mu.
		s.mu.Lock()
		current := !s.closed && s.entries[service.ID] == e
		s.mu.Unlock()
		if !current || ctx.Err() != nil {
			return
		}
	}

	interval := time.Duration(service.CheckIntervalSeconds) * time.Second
	scheduledAt := s.clock.Now()
	if now := scheduledAt; firstCheckAt.After(now) {
		timer := s.clock.NewTimer(firstCheckAt.Sub(now))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C():
		}
		scheduledAt = firstCheckAt
	}
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

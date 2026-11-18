package worker

import (
	"context"
	"log/slog"
	"sync"

	"monitory/internal/domain"
)

// Mailer sends one alert by email. The text of a returned error is the reason: it is
// logged as it is, so it must hold no address.
type Mailer interface {
	SendEmail(ctx context.Context, to string, alert domain.Alert) error
}

// AlertDispatcher delivers an alert to every target of a list, each in its own
// goroutine, with one attempt (FR-83, NFR-5). It owns the goroutines it starts; Close
// stops and waits for them.
type AlertDispatcher struct {
	mailer Mailer
	log    *slog.Logger

	ctx    context.Context
	cancel context.CancelFunc

	mu     sync.Mutex // guards closed and wg.Add
	closed bool
	wg     sync.WaitGroup
}

// NewAlertDispatcher returns an AlertDispatcher.
func NewAlertDispatcher(mailer Mailer, log *slog.Logger) *AlertDispatcher {
	ctx, cancel := context.WithCancel(context.Background())
	return &AlertDispatcher{mailer: mailer, log: log, ctx: ctx, cancel: cancel}
}

// Dispatch starts the delivery to every target and returns at once. After Close it
// starts nothing and logs that the alert was dropped.
func (d *AlertDispatcher) Dispatch(alert domain.Alert, targets []domain.Target) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.closed {
		d.log.Warn("alert dropped",
			"service_id", alert.ServiceID,
			"status", string(alert.Status),
			"reason", "the app is stopping")
		return
	}
	for _, target := range targets {
		d.wg.Add(1)
		go func() {
			defer d.wg.Done()
			d.deliver(alert, target)
		}()
	}
}

// deliver makes the one attempt for one target and logs its outcome. No log line holds
// an address, a URL, a name or the message (CONVENTIONS.md, Logging).
func (d *AlertDispatcher) deliver(alert domain.Alert, target domain.Target) {
	log := d.log.With("service_id", alert.ServiceID, "target_id", target.ID, "status", string(alert.Status))
	if target.Type != domain.TargetTypeEmail {
		log.Warn("alert not delivered", "reason", "webhook delivery is not built yet")
		return
	}
	err := d.mailer.SendEmail(d.ctx, target.Value, alert)
	switch {
	case err == nil:
		log.Info("alert delivered")
	case d.ctx.Err() != nil:
		log.Warn("alert delivery abandoned")
	default:
		log.Warn("alert delivery failed", "reason", err.Error())
	}
}

// Close stops accepting alerts, cancels the attempts in progress and returns once every
// goroutine has ended. A second call is safe.
func (d *AlertDispatcher) Close() {
	d.mu.Lock()
	d.closed = true
	d.mu.Unlock()
	d.cancel()
	d.wg.Wait()
}

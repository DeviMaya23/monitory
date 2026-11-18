package worker

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// Mailer sends one alert by email. The text of a returned error is the reason: it is
// logged as it is, so it must hold no address.
type Mailer interface {
	SendEmail(ctx context.Context, to string, alert domain.Alert) error
}

// WebhookSender sends one alert to a webhook URL with the target's custom headers. The
// text of a returned error is the reason: it is logged as it is, so it must hold no URL,
// header or message.
type WebhookSender interface {
	SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error
}

// OutcomeRecorder is told the final outcome of a delivery to one target: delivered, or
// failed after the last attempt (FR-86). A sequence that was stopped reports nothing.
type OutcomeRecorder interface {
	RecordDeliveryOutcome(ctx context.Context, serviceID, targetID string, delivered bool) error
}

// RetryPolicy says how often a failed delivery is tried again (FR-85). Retries is the
// number of attempts after the first; Interval is the wait between two attempts. The
// configuration guarantees Retries >= 0 and a positive Interval.
type RetryPolicy struct {
	Retries  int
	Interval time.Duration
}

// alertRecord is the latest alert of one service. Its channel is closed when a newer
// alert for the service replaces it, which supersedes every sequence that carries it.
type alertRecord struct {
	superseded chan struct{}
}

func (r *alertRecord) isSuperseded() bool {
	select {
	case <-r.superseded:
		return true
	default:
		return false
	}
}

// AlertDispatcher delivers an alert to every target of a list, each in its own
// goroutine, retrying a failed delivery by its RetryPolicy (FR-83, FR-85, NFR-5). A
// newer alert for a service ends the retries of the older one. It owns the goroutines
// it starts; Close stops and waits for them.
type AlertDispatcher struct {
	mailer   Mailer
	webhooks WebhookSender
	clock    clock.Clock
	retry    RetryPolicy
	outcomes OutcomeRecorder
	log      *slog.Logger

	ctx    context.Context
	cancel context.CancelFunc

	mu     sync.Mutex // guards closed, latest and wg.Add
	closed bool
	latest map[string]*alertRecord // by service id; replaced, never removed
	wg     sync.WaitGroup
}

// NewAlertDispatcher returns an AlertDispatcher.
func NewAlertDispatcher(mailer Mailer, webhooks WebhookSender, clk clock.Clock, retry RetryPolicy, outcomes OutcomeRecorder, log *slog.Logger) *AlertDispatcher {
	ctx, cancel := context.WithCancel(context.Background())
	return &AlertDispatcher{
		mailer: mailer, webhooks: webhooks, clock: clk, retry: retry, outcomes: outcomes, log: log,
		ctx: ctx, cancel: cancel, latest: map[string]*alertRecord{},
	}
}

// Dispatch starts the delivery to every target and returns at once. It supersedes the
// sequences of the earlier alert for the same service. After Close it starts nothing and
// logs that the alert was dropped.
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
	if older, ok := d.latest[alert.ServiceID]; ok {
		close(older.superseded)
	}
	rec := &alertRecord{superseded: make(chan struct{})}
	d.latest[alert.ServiceID] = rec
	for _, target := range targets {
		d.wg.Add(1)
		go func() {
			defer d.wg.Done()
			d.deliver(alert, target, rec)
		}()
	}
}

// deliver runs the sequence of one target and logs its end: delivered, failed,
// superseded or abandoned. Delivered and failed are reported to the OutcomeRecorder. No log line holds an address, a URL, a name or the message
// (CONVENTIONS.md, Logging).
func (d *AlertDispatcher) deliver(alert domain.Alert, target domain.Target, rec *alertRecord) {
	log := d.log.With("service_id", alert.ServiceID, "target_id", target.ID, "status", string(alert.Status))
	var send func() error
	switch target.Type {
	case domain.TargetTypeEmail:
		send = func() error { return d.mailer.SendEmail(d.ctx, target.Value, alert) }
	case domain.TargetTypeWebhook:
		send = func() error { return d.webhooks.SendWebhook(d.ctx, target.Value, target.Headers, alert) }
	default:
		log.Warn("alert not delivered", "reason", "unknown target type")
		return
	}
	for attempt := 1; ; attempt++ {
		// Attempt 1 is always made; only the waiting and later attempts are stopped.
		err := send()
		switch {
		case err == nil:
			log.Info("alert delivered", "attempts", attempt)
			d.record(log, alert, target, true)
			return
		case d.ctx.Err() != nil:
			log.Warn("alert delivery abandoned")
			return
		case attempt == 1+d.retry.Retries:
			log.Warn("alert delivery failed", "attempts", attempt, "reason", err.Error())
			d.record(log, alert, target, false)
			return
		case rec.isSuperseded():
			log.Warn("alert delivery superseded", "attempts", attempt)
			return
		}
		timer := d.clock.NewTimer(d.retry.Interval)
		log.Warn("alert delivery attempt failed", "attempt", attempt, "reason", err.Error())
		select {
		case <-timer.C():
		case <-d.ctx.Done():
		case <-rec.superseded:
		}
		timer.Stop()
		// Re-check in a fixed order: Go picks at random among ready channels.
		if d.ctx.Err() != nil {
			log.Warn("alert delivery abandoned")
			return
		}
		if rec.isSuperseded() {
			log.Warn("alert delivery superseded", "attempts", attempt)
			return
		}
	}
}

// record reports the final outcome of a sequence, from the sequence's own goroutine and
// outside the mutex. The context keeps the values of the dispatcher's but not its
// cancellation, so an outcome decided around Close is still written; the database layer
// bounds the write. A failed write is logged with no error text and not retried.
func (d *AlertDispatcher) record(log *slog.Logger, alert domain.Alert, target domain.Target, delivered bool) {
	ctx := context.WithoutCancel(d.ctx)
	if err := d.outcomes.RecordDeliveryOutcome(ctx, alert.ServiceID, target.ID, delivered); err != nil {
		log.Warn("alert outcome not saved", "delivered", delivered)
	}
}

// Close stops accepting alerts, cancels the attempts in progress and the waits, and
// returns once every goroutine has ended. A second call is safe.
func (d *AlertDispatcher) Close() {
	d.mu.Lock()
	d.closed = true
	d.mu.Unlock()
	d.cancel()
	d.wg.Wait()
}

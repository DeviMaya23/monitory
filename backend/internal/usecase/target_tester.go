package usecase

import (
	"context"
	"errors"
	"fmt"

	"monitory/internal/domain"
)

// ServiceFinder finds one service by id; it returns domain.ErrNotFound when there is none.
type ServiceFinder interface {
	Find(ctx context.Context, id string) (domain.Service, error)
}

// TestEmailSender sends one alert by email. The text of a returned error is the reason
// and holds no address.
type TestEmailSender interface {
	SendEmail(ctx context.Context, to string, alert domain.Alert) error
}

// TestWebhookSender sends one alert to a webhook. The text of a returned error is the
// reason and holds no URL, header or message.
type TestWebhookSender interface {
	SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error
}

// TargetTestService sends a test alert to a target that is not saved (FR-107). It can
// read a service's name and send; it has nothing that writes (FR-108).
type TargetTestService struct {
	services ServiceFinder
	mail     TestEmailSender
	webhooks TestWebhookSender
	clock    Clock
	limits   domain.TargetLimits
}

// NewTargetTestService returns a TargetTestService.
func NewTargetTestService(services ServiceFinder, mail TestEmailSender, webhooks TestWebhookSender, clock Clock, limits domain.TargetLimits) *TargetTestService {
	return &TargetTestService{services: services, mail: mail, webhooks: webhooks, clock: clock, limits: limits}
}

// TestTarget validates the input as createTarget does, then makes one attempt to deliver
// a test alert to that target only. A failed delivery is a result, not an error; an error
// is returned for invalid input, an unknown service, a failed lookup or an ended context.
func (s *TargetTestService) TestTarget(ctx context.Context, serviceID string, input domain.TargetInput) (domain.TargetTestResult, error) {
	if fields := ValidateTargetInput(input, s.limits); len(fields) > 0 {
		return domain.TargetTestResult{}, domain.ValidationError{Fields: fields}
	}
	input = normalizeTargetInput(input)

	service, err := s.services.Find(ctx, serviceID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.TargetTestResult{}, err
		}
		return domain.TargetTestResult{}, fmt.Errorf("find the service to test: %w", err)
	}
	alert := buildTestAlert(service, s.clock.Now())

	if domain.TargetType(input.Type) == domain.TargetTypeEmail {
		err = s.mail.SendEmail(ctx, input.Address, alert)
	} else {
		err = s.webhooks.SendWebhook(ctx, input.URL, input.Headers, alert)
	}
	switch {
	case err == nil:
		return domain.TargetTestResult{Delivered: true}, nil
	case ctx.Err() != nil:
		return domain.TargetTestResult{}, ctx.Err()
	default:
		return domain.TargetTestResult{FailureReason: err.Error(), FailureCause: domain.FailureCause(err)}, nil
	}
}

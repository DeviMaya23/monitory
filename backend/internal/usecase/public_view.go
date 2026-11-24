package usecase

import (
	"context"
	"time"

	"monitory/internal/domain"
)

// RateLimiter counts the requests of a client address.
type RateLimiter interface {
	// Allow counts a request of key. When it is refused, wait is the time left in the
	// window.
	Allow(key string) (allowed bool, wait time.Duration)
}

// PublicServiceRepository reads what the public view shows.
type PublicServiceRepository interface {
	// ListPublic returns the shown, unpaused services that are healthy or unhealthy,
	// ordered by name ignoring case. It never returns nil.
	ListPublic(ctx context.Context) ([]domain.PublicService, error)
}

// PublicViewService answers the anonymous visitor's request for the public view.
type PublicViewService struct {
	limiter  RateLimiter
	settings SettingsRepository
	services PublicServiceRepository
}

// NewPublicViewService returns a PublicViewService.
func NewPublicViewService(limiter RateLimiter, settings SettingsRepository, services PublicServiceRepository) *PublicViewService {
	return &PublicViewService{limiter: limiter, settings: settings, services: services}
}

// PublicDashboard returns the services the public view shows. The rate limit comes
// first, so every request that passes it counts, including one answered with
// domain.ErrPublicViewUnavailable (FR-32). It returns that error while the view is off
// (FR-29) and an empty, non-nil slice when no service is shown (FR-28).
func (s *PublicViewService) PublicDashboard(ctx context.Context, clientAddr string) ([]domain.PublicService, error) {
	if allowed, wait := s.limiter.Allow(clientAddr); !allowed {
		seconds := int((wait + time.Second - 1) / time.Second)
		return nil, domain.RateLimitedError{RetryAfterSeconds: max(seconds, 1)}
	}

	enabled, err := s.settings.PublicViewEnabled(ctx)
	if err != nil {
		return nil, err
	}
	if !enabled {
		return nil, domain.ErrPublicViewUnavailable
	}

	services, err := s.services.ListPublic(ctx)
	if err != nil {
		return nil, err
	}
	if services == nil {
		services = []domain.PublicService{}
	}
	return services, nil
}

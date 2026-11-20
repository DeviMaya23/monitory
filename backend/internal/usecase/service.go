package usecase

import (
	"context"
	"sync"
	"time"

	"monitory/internal/domain"
)

// Scheduler runs the checks of services. Start begins checking a saved service; Restart
// replaces the schedule of an edited one, with its first check at firstCheckAt; Stop
// ends the checking of a deleted one. The scheduler never looks at Service.Paused: the
// usecase decides which services are started or restarted.
type Scheduler interface {
	Start(service domain.Service)
	Restart(service domain.Service, firstCheckAt time.Time)
	Stop(serviceID string)
}

// ServiceService adds, and later lists and changes, the services the admin monitors.
type ServiceService struct {
	services  ServiceRepository
	scheduler Scheduler
	clock     Clock
	limits    domain.ServiceLimits

	// editMu makes each write of an edit or a delete and the scheduler call that follows
	// one step, so the schedule always matches the last write. Its zero value is usable.
	editMu sync.Mutex
}

// NewServiceService returns a ServiceService.
func NewServiceService(services ServiceRepository, scheduler Scheduler, clock Clock, limits domain.ServiceLimits) *ServiceService {
	return &ServiceService{services: services, scheduler: scheduler, clock: clock, limits: limits}
}

// CreateService validates the input, saves the service with its state and hands it to
// the scheduler (FR-6, FR-12). Nothing is saved, and the scheduler is not called, when
// the input is rejected or the save fails.
func (s *ServiceService) CreateService(ctx context.Context, input domain.ServiceInput) (domain.ServiceView, error) {
	input = normalizeServiceInput(input)
	if fields := ValidateServiceInput(input, s.limits); len(fields) > 0 {
		return domain.ServiceView{}, domain.ValidationError{Fields: fields}
	}

	id, err := domain.NewID()
	if err != nil {
		return domain.ServiceView{}, err
	}
	service := s.buildService(input, id, s.clock.Now().UTC())
	if err := s.services.Create(ctx, service, s.limits.MaxServices); err != nil {
		return domain.ServiceView{}, err
	}
	// Only after the transaction has committed (FR-67).
	s.scheduler.Start(service)

	return domain.ServiceView{
		Service: service,
		State:   domain.ServiceState{ServiceID: service.ID, Status: domain.StatusNotYetChecked},
	}, nil
}

// GetService returns one service with its state and the two computed values.
func (s *ServiceService) GetService(ctx context.Context, id string) (domain.ServiceView, error) {
	return s.services.Get(ctx, id)
}

// UpdateService replaces every editable setting of the service (FR-7). The input is
// normalized and validated before anything is read or written. The state, the paused
// flag and the alert list are kept. No check runs: when the service is not paused, the
// scheduler restarts its schedule, with the first check at the time nextCheckAt gives
// (FR-66). A paused service is not given to the scheduler.
func (s *ServiceService) UpdateService(ctx context.Context, id string, input domain.ServiceInput) (domain.ServiceView, error) {
	input = normalizeServiceInput(input)
	if fields := ValidateServiceInput(input, s.limits); len(fields) > 0 {
		return domain.ServiceView{}, domain.ValidationError{Fields: fields}
	}
	service := s.buildService(input, id, s.clock.Now().UTC())

	s.editMu.Lock()
	defer s.editMu.Unlock()
	view, err := s.services.Update(ctx, service)
	if err != nil {
		return domain.ServiceView{}, err
	}
	// Only after the transaction has committed.
	if !view.Service.Paused {
		s.scheduler.Restart(view.Service, nextCheckAt(view, s.clock.Now()))
	}
	return view, nil
}

// nextCheckAt is when the first check after an edit runs: one new interval after the
// last check, so the old rhythm is kept, or one new interval from now when there was no
// check or that time is not after now (FR-66). It is always after now, so an edit never
// checks at saving. A last check in the future is not corrected.
func nextCheckAt(view domain.ServiceView, now time.Time) time.Time {
	interval := time.Duration(view.Service.CheckIntervalSeconds) * time.Second
	if last := view.State.LastCheckedAt; last != nil {
		if next := last.Add(interval); next.After(now) {
			return next
		}
	}
	return now.Add(interval)
}

// ListServices returns every service with its state, in the order the repository gives.
func (s *ServiceService) ListServices(ctx context.Context) ([]domain.ServiceView, error) {
	return s.services.List(ctx)
}

// DeleteService deletes the service with its state and alert list, then tells the
// scheduler to stop it (FR-8, FR-70, FR-71). The scheduler is told only after the
// delete has succeeded.
func (s *ServiceService) DeleteService(ctx context.Context, id string) error {
	s.editMu.Lock()
	defer s.editMu.Unlock()
	if err := s.services.Delete(ctx, id); err != nil {
		return err
	}
	s.scheduler.Stop(id)
	return nil
}

// StartChecks hands every saved service that is not paused to the scheduler, so checks
// resume at start-up (FR-111, FR-76). A list error is returned and nothing is started.
func (s *ServiceService) StartChecks(ctx context.Context) error {
	views, err := s.services.List(ctx)
	if err != nil {
		return err
	}
	for _, v := range views {
		if v.Service.Paused {
			continue
		}
		s.scheduler.Start(v.Service)
	}
	return nil
}

// buildService makes the row to save from validated input, for a new service and for an
// edit: the same input gives the same row. The repository's Update ignores created_at
// and paused.
func (s *ServiceService) buildService(in domain.ServiceInput, id string, now time.Time) domain.Service {
	settings := effectiveSettings(in, s.limits)

	service := domain.Service{
		ID:                   id,
		Name:                 in.Name,
		NameKey:              domain.ServiceNameKey(in.Name),
		CheckType:            domain.CheckType(in.Check.Type),
		HTTPQueryParams:      []domain.NameValue{},
		HTTPHeaders:          []domain.NameValue{},
		HTTPBodyType:         domain.BodyTypeNone,
		JSONRules:            []domain.JSONRule{},
		JSONRuleMode:         domain.JSONRuleModeAny,
		CheckIntervalSeconds: settings.CheckIntervalSeconds,
		TimeoutSeconds:       settings.TimeoutSeconds,
		RetryCount:           settings.RetryCount,
		RetryIntervalSeconds: settings.RetryIntervalSeconds,
		AlertsEnabled:        true,
		UnhealthyMessage:     trimmedMessage(in.UnhealthyMessage),
		RecoveryMessage:      trimmedMessage(in.RecoveryMessage),
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if in.AlertsEnabled != nil {
		service.AlertsEnabled = *in.AlertsEnabled
	}
	if in.ShownOnPublicView != nil {
		service.ShownOnPublicView = *in.ShownOnPublicView
	}

	switch service.CheckType {
	case domain.CheckTypeHTTP:
		applyHTTPCheck(&service, in.Check.HTTP)
	case domain.CheckTypeTCP:
		host, port := in.Check.TCP.Host, in.Check.TCP.Port
		service.TCPHost, service.TCPPort = &host, &port
	}
	return service
}

func applyHTTPCheck(service *domain.Service, in domain.HTTPCheckInput) {
	method, url := in.Method, in.URL
	service.HTTPMethod, service.HTTPURL = &method, &url
	service.HTTPQueryParams = append([]domain.NameValue{}, in.QueryParams...)
	service.HTTPHeaders = append([]domain.NameValue{}, in.Headers...)
	service.JSONRules = append([]domain.JSONRule{}, in.JSONRules...)

	if in.BodyType != "" {
		service.HTTPBodyType = domain.BodyType(in.BodyType)
	}
	// With no body, the content is not kept.
	if service.HTTPBodyType != domain.BodyTypeNone {
		service.HTTPBodyContent = in.BodyContent
	}
	if in.JSONRuleMode != "" {
		service.JSONRuleMode = domain.JSONRuleMode(in.JSONRuleMode)
	}
	if in.CertificateCheckEnabled {
		days := *in.CertMinDaysLeft
		service.CertCheck, service.CertMinDaysLeft = true, &days
	}
	service.IgnoreCertErrs = in.IgnoreCertificateErrors
}

package usecase

import (
	"context"

	"monitory/internal/domain"
)

// ServiceRepository stores services and their state.
type ServiceRepository interface {
	// Create saves the service and its state row (status not_yet_checked) in one
	// transaction. It returns domain.ErrServiceLimitReached when maxServices services
	// exist already, and domain.ErrServiceNameTaken when the name is used (FR-59, FR-60).
	Create(ctx context.Context, service domain.Service, maxServices int) error
}

// Scheduler runs the checks of services. Start begins checking a saved service.
type Scheduler interface {
	Start(service domain.Service)
}

// ServiceService adds, and later lists and changes, the services the admin monitors.
type ServiceService struct {
	services  ServiceRepository
	scheduler Scheduler
	clock     Clock
	limits    domain.ServiceLimits
}

// NewServiceService returns a ServiceService.
func NewServiceService(services ServiceRepository, scheduler Scheduler, clock Clock, limits domain.ServiceLimits) *ServiceService {
	return &ServiceService{services: services, scheduler: scheduler, clock: clock, limits: limits}
}

// CreateService validates the input, saves the service with its state and hands it to
// the scheduler (FR-6, FR-12). Nothing is saved, and the scheduler is not called, when
// the input is rejected or the save fails.
func (s *ServiceService) CreateService(ctx context.Context, input domain.ServiceInput) (domain.ServiceView, error) {
	if fields := ValidateServiceInput(input, s.limits); len(fields) > 0 {
		return domain.ServiceView{}, domain.ValidationError{Fields: fields}
	}

	service, err := s.buildService(input)
	if err != nil {
		return domain.ServiceView{}, err
	}
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

// buildService makes the row to save from validated input.
func (s *ServiceService) buildService(in domain.ServiceInput) (domain.Service, error) {
	id, err := domain.NewID()
	if err != nil {
		return domain.Service{}, err
	}
	settings := effectiveSettings(in, s.limits)
	now := s.clock.Now().UTC()

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
	return service, nil
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

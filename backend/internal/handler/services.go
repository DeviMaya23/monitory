package handler

import (
	"context"

	"monitory/internal/api"
)

// CreateService adds a service (FR-6). The router has already checked size, content
// type and that a body exists.
func (s *Server) CreateService(ctx context.Context, request api.CreateServiceRequestObject) (api.CreateServiceResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toServiceInput(*request.Body)
	if err != nil {
		return nil, err
	}
	view, err := s.services.CreateService(ctx, input)
	if err != nil {
		return nil, err
	}
	service, err := toAPIService(view)
	if err != nil {
		return nil, err
	}
	s.log.Info("service added", "service_id", view.Service.ID, "service_name", view.Service.Name)
	return api.CreateService201JSONResponse(service), nil
}

// ListServices returns every service with its state, in the order the usecase gives
// (FR-9, FR-62).
func (s *Server) ListServices(ctx context.Context, _ api.ListServicesRequestObject) (api.ListServicesResponseObject, error) {
	views, err := s.services.ListServices(ctx)
	if err != nil {
		return nil, err
	}
	list := make(api.ServiceList, 0, len(views))
	for _, view := range views {
		service, err := toAPIService(view)
		if err != nil {
			return nil, err
		}
		list = append(list, service)
	}
	return api.ListServices200JSONResponse(list), nil
}

// GetService returns one service with its state, the same mapping as an item of the
// list (FR-39).
func (s *Server) GetService(ctx context.Context, request api.GetServiceRequestObject) (api.GetServiceResponseObject, error) {
	view, err := s.services.GetService(ctx, request.ServiceId)
	if err != nil {
		return nil, err
	}
	service, err := toAPIService(view)
	if err != nil {
		return nil, err
	}
	return api.GetService200JSONResponse(service), nil
}

// UpdateService replaces every editable setting of a service (FR-7). The router has
// already checked size, content type and that a body exists.
func (s *Server) UpdateService(ctx context.Context, request api.UpdateServiceRequestObject) (api.UpdateServiceResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toServiceInput(*request.Body)
	if err != nil {
		return nil, err
	}
	view, err := s.services.UpdateService(ctx, request.ServiceId, input)
	if err != nil {
		return nil, err
	}
	service, err := toAPIService(view)
	if err != nil {
		return nil, err
	}
	s.log.Info("service updated", "service_id", view.Service.ID, "service_name", view.Service.Name)
	return api.UpdateService200JSONResponse(service), nil
}

// DeleteService deletes a service (FR-8, FR-70).
func (s *Server) DeleteService(ctx context.Context, request api.DeleteServiceRequestObject) (api.DeleteServiceResponseObject, error) {
	if err := s.services.DeleteService(ctx, request.ServiceId); err != nil {
		return nil, err
	}
	s.log.Info("service deleted", "service_id", request.ServiceId)
	return api.DeleteService204Response{}, nil
}

// PauseService pauses a service; the answer is the service as saved (FR-75, FR-76).
func (s *Server) PauseService(ctx context.Context, request api.PauseServiceRequestObject) (api.PauseServiceResponseObject, error) {
	view, err := s.services.PauseService(ctx, request.ServiceId)
	if err != nil {
		return nil, err
	}
	service, err := toAPIService(view)
	if err != nil {
		return nil, err
	}
	s.log.Info("service paused", "service_id", view.Service.ID, "service_name", view.Service.Name)
	return api.PauseService200JSONResponse(service), nil
}

// ResumeService resumes a paused service; the answer is the service as saved (FR-75,
// FR-79).
func (s *Server) ResumeService(ctx context.Context, request api.ResumeServiceRequestObject) (api.ResumeServiceResponseObject, error) {
	view, err := s.services.ResumeService(ctx, request.ServiceId)
	if err != nil {
		return nil, err
	}
	service, err := toAPIService(view)
	if err != nil {
		return nil, err
	}
	s.log.Info("service resumed", "service_id", view.Service.ID, "service_name", view.Service.Name)
	return api.ResumeService200JSONResponse(service), nil
}

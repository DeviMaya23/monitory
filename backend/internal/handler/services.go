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

// DeleteService deletes a service (FR-8, FR-70).
func (s *Server) DeleteService(ctx context.Context, request api.DeleteServiceRequestObject) (api.DeleteServiceResponseObject, error) {
	if err := s.services.DeleteService(ctx, request.ServiceId); err != nil {
		return nil, err
	}
	s.log.Info("service deleted", "service_id", request.ServiceId)
	return api.DeleteService204Response{}, nil
}

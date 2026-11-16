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

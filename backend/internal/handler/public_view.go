package handler

import (
	"context"
	"errors"

	"monitory/internal/api"
	"monitory/internal/domain"
	"monitory/internal/handler/middleware"
)

// GetPublicDashboard returns the public status view (FR-28, FR-29, FR-32). The client
// address is the one the policy router resolved; nothing is logged here.
func (s *Server) GetPublicDashboard(ctx context.Context, _ api.GetPublicDashboardRequestObject) (api.GetPublicDashboardResponseObject, error) {
	services, err := s.public.PublicDashboard(ctx, middleware.RequestInfoFrom(ctx).ClientAddr)

	var limited domain.RateLimitedError
	switch {
	case errors.As(err, &limited):
		retryAfter := limited.RetryAfterSeconds
		return api.GetPublicDashboard429ApplicationProblemPlusJSONResponse{
			RateLimitedApplicationProblemPlusJSONResponse: api.RateLimitedApplicationProblemPlusJSONResponse{
				Body:    newProblem(429, api.ProblemCodeRateLimited, "Too many requests"),
				Headers: api.RateLimitedResponseHeaders{RetryAfter: &retryAfter},
			},
		}, nil
	case err != nil:
		return nil, err
	}

	out := make([]api.PublicService, len(services))
	for i, service := range services {
		out[i] = api.PublicService{
			Name:          service.Name,
			Status:        api.PublicServiceStatus(service.Status),
			LastCheckedAt: service.LastCheckedAt.UTC(),
		}
	}
	return api.GetPublicDashboard200JSONResponse{Services: out}, nil
}

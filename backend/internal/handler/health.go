package handler

import (
	"context"

	"monitory/internal/api"
)

// GetHealth says that the app is running and nothing else (FR-96). It checks no
// dependency and returns no service data.
func (s *Server) GetHealth(context.Context, api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	return api.GetHealth200JSONResponse{Status: api.Ok}, nil
}

package handler

import (
	"context"

	"monitory/internal/api"
)

// GetPublicViewSettings returns whether the public view is on (FR-26).
func (s *Server) GetPublicViewSettings(ctx context.Context, _ api.GetPublicViewSettingsRequestObject) (api.GetPublicViewSettingsResponseObject, error) {
	enabled, err := s.settings.PublicViewEnabled(ctx)
	if err != nil {
		return nil, err
	}
	return api.GetPublicViewSettings200JSONResponse{Enabled: enabled}, nil
}

// UpdatePublicViewSettings turns the public view on or off (FR-26).
func (s *Server) UpdatePublicViewSettings(ctx context.Context, request api.UpdatePublicViewSettingsRequestObject) (api.UpdatePublicViewSettingsResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	if err := s.settings.SetPublicViewEnabled(ctx, request.Body.Enabled); err != nil {
		return nil, err
	}
	return api.UpdatePublicViewSettings200JSONResponse{Enabled: request.Body.Enabled}, nil
}

package handler

import (
	"context"

	"monitory/internal/api"
)

// TestTarget sends a test alert to the target in the request and answers whether it was
// delivered (FR-107). A failed delivery is still a 200. Nothing is saved (FR-108).
func (s *Server) TestTarget(ctx context.Context, request api.TestTargetRequestObject) (api.TestTargetResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toTargetInput(*request.Body)
	if err != nil {
		return nil, err
	}
	result, err := s.tester.TestTarget(ctx, request.ServiceId, input)
	if err != nil {
		return nil, err
	}
	// Only ids, the type, the outcome and a fixed cause word: no address, URL, header
	// or reason.
	attrs := []any{"service_id", request.ServiceId, "type", input.Type, "delivered", result.Delivered}
	if !result.Delivered && result.FailureCause != "" {
		attrs = append(attrs, "cause", result.FailureCause)
	}
	s.log.Info("target test sent", attrs...)

	response := api.TestTarget200JSONResponse{Delivered: result.Delivered}
	if !result.Delivered {
		reason := result.FailureReason
		response.FailureReason = &reason
	}
	return response, nil
}

package handler

import (
	"context"

	"monitory/internal/api"
)

// TestServiceCheck runs one attempt of the check in the request and answers with the
// result (FR-104). A failed check is still a 200. Nothing is saved (FR-105), and no
// line is logged: the URL, headers and body must never reach the log.
func (s *Server) TestServiceCheck(ctx context.Context, request api.TestServiceCheckRequestObject) (api.TestServiceCheckResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toServiceTestInput(*request.Body)
	if err != nil {
		return nil, err
	}
	result, err := s.checks.TestServiceCheck(ctx, input)
	if err != nil {
		return nil, err
	}
	return api.TestServiceCheck200JSONResponse(toAPIServiceTestResult(result)), nil
}

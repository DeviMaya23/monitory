package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"

	"monitory/internal/api"
)

// targetResponse answers with one api.Target and a status. The generated
// CreateTarget201JSONResponse and UpdateTarget200JSONResponse are defined types of
// api.Target and do not carry its MarshalJSON, so they would drop the union (type,
// address, url, headers); this encodes the api.Target itself.
type targetResponse struct {
	status int
	target api.Target
}

func (r targetResponse) write(w http.ResponseWriter) error {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(r.target); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(r.status)
	_, err := buf.WriteTo(w)
	return err
}

// VisitCreateTargetResponse implements api.CreateTargetResponseObject.
func (r targetResponse) VisitCreateTargetResponse(w http.ResponseWriter) error { return r.write(w) }

// VisitUpdateTargetResponse implements api.UpdateTargetResponseObject.
func (r targetResponse) VisitUpdateTargetResponse(w http.ResponseWriter) error { return r.write(w) }

var (
	_ api.CreateTargetResponseObject = targetResponse{}
	_ api.UpdateTargetResponseObject = targetResponse{}
)

// ListTargets returns a service's alert list in the order the usecase gives (FR-17).
func (s *Server) ListTargets(ctx context.Context, request api.ListTargetsRequestObject) (api.ListTargetsResponseObject, error) {
	targets, err := s.targets.ListTargets(ctx, request.ServiceId)
	if err != nil {
		return nil, err
	}
	list := make(api.TargetList, 0, len(targets))
	for _, t := range targets {
		target, err := toAPITarget(t)
		if err != nil {
			return nil, err
		}
		list = append(list, target)
	}
	return api.ListTargets200JSONResponse(list), nil
}

// CreateTarget adds a target to a service's alert list (FR-14). The router has already
// checked size, content type and that a body exists.
func (s *Server) CreateTarget(ctx context.Context, request api.CreateTargetRequestObject) (api.CreateTargetResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toTargetInput(*request.Body)
	if err != nil {
		return nil, err
	}
	saved, err := s.targets.CreateTarget(ctx, request.ServiceId, input)
	if err != nil {
		return nil, err
	}
	target, err := toAPITarget(saved)
	if err != nil {
		return nil, err
	}
	s.log.Info("target added", "service_id", saved.ServiceID, "target_id", saved.ID)
	return targetResponse{status: http.StatusCreated, target: target}, nil
}

// UpdateTarget edits a target (FR-15).
func (s *Server) UpdateTarget(ctx context.Context, request api.UpdateTargetRequestObject) (api.UpdateTargetResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	input, err := toTargetInput(*request.Body)
	if err != nil {
		return nil, err
	}
	saved, err := s.targets.UpdateTarget(ctx, request.ServiceId, request.TargetId, input)
	if err != nil {
		return nil, err
	}
	target, err := toAPITarget(saved)
	if err != nil {
		return nil, err
	}
	s.log.Info("target updated", "service_id", saved.ServiceID, "target_id", saved.ID)
	return targetResponse{status: http.StatusOK, target: target}, nil
}

// DeleteTarget removes a target from a service's alert list (FR-16).
func (s *Server) DeleteTarget(ctx context.Context, request api.DeleteTargetRequestObject) (api.DeleteTargetResponseObject, error) {
	if err := s.targets.DeleteTarget(ctx, request.ServiceId, request.TargetId); err != nil {
		return nil, err
	}
	s.log.Info("target deleted", "service_id", request.ServiceId, "target_id", request.TargetId)
	return api.DeleteTarget204Response{}, nil
}

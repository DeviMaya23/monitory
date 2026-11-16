package handler

import (
	"context"
	"errors"
	"net/http"

	"monitory/internal/api"
	"monitory/internal/domain"
	"monitory/internal/handler/middleware"
)

// SignIn signs the admin in and sets the session cookie (FR-1, FR-5). The router has
// already checked size, content type and that a body exists.
func (s *Server) SignIn(ctx context.Context, request api.SignInRequestObject) (api.SignInResponseObject, error) {
	if request.Body == nil {
		return nil, errMalformedRequest
	}
	https := middleware.RequestInfoFrom(ctx).HTTPS
	session, err := s.auth.SignIn(ctx, request.Body.Username, request.Body.Password, https)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCredentials) {
			s.log.Warn("sign-in failed")
		}
		return nil, err
	}

	cookie := (&http.Cookie{
		Name:     middleware.SessionCookie,
		Value:    session.Token,
		Path:     "/",
		MaxAge:   int(domain.SessionLifetime.Seconds()),
		HttpOnly: true,
		Secure:   s.secureCookie,
		SameSite: http.SameSiteStrictMode,
	}).String()
	return api.SignIn200JSONResponse{
		Body:    sessionInfo(session),
		Headers: api.SignIn200ResponseHeaders{SetCookie: &cookie},
	}, nil
}

// GetSession returns the session the gate found (FR-4). It extends nothing (FR-5).
func (s *Server) GetSession(ctx context.Context, _ api.GetSessionRequestObject) (api.GetSessionResponseObject, error) {
	session, ok := middleware.SessionFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	return api.GetSession200JSONResponse(sessionInfo(session)), nil
}

// SignOut ends the request's own session (FR-3).
func (s *Server) SignOut(ctx context.Context, _ api.SignOutRequestObject) (api.SignOutResponseObject, error) {
	session, ok := middleware.SessionFrom(ctx)
	if !ok {
		return nil, domain.ErrUnauthenticated
	}
	if err := s.auth.SignOut(ctx, session.Token); err != nil {
		return nil, err
	}
	return api.SignOut204Response{}, nil
}

func sessionInfo(session domain.Session) api.SessionInfo {
	return api.SessionInfo{CsrfToken: session.CSRFToken, ExpiresAt: session.ExpiresAt.UTC()}
}

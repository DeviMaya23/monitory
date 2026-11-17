package usecase_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

var targetStart = time.Date(2026, 6, 7, 8, 9, 10, 0, time.UTC)

type targetSetup struct {
	svc   *usecase.TargetService
	repo  *fakeTargets
	clock *clock.Fake
}

func newTargetSetup() targetSetup {
	repo := newFakeTargets("s1", "s2")
	clk := clock.NewFake(targetStart)
	return targetSetup{usecase.NewTargetService(repo, clk, testTargetLimits), repo, clk}
}

func email(address string) domain.TargetInput {
	return domain.TargetInput{Type: "email", Address: address}
}

func webhook(url string) domain.TargetInput {
	return domain.TargetInput{Type: "webhook", URL: url}
}

func TestCreateTarget_SavesTheRow(t *testing.T) {
	s := newTargetSetup()

	mail, err := s.svc.CreateTarget(t.Context(), "s1", domain.TargetInput{
		Type: "email", Name: "  On call ", Address: "  Oncall@Example.COM ",
		Headers: []domain.NameValue{{Name: "ignored", Value: "x"}},
	})
	require.NoError(t, err)
	assert.Regexp(t, uuidV7, mail.ID)
	assert.Equal(t, "s1", mail.ServiceID)
	assert.Equal(t, "On call", mail.Name)
	assert.Equal(t, domain.TargetTypeEmail, mail.Type)
	assert.Equal(t, "Oncall@Example.COM", mail.Value)
	assert.Equal(t, "oncall@example.com", mail.ValueKey)
	assert.Equal(t, []domain.NameValue{}, mail.Headers)
	assert.False(t, mail.LastDeliveryFailed)
	assert.Equal(t, targetStart, mail.CreatedAt)
	assert.Equal(t, targetStart, mail.UpdatedAt)

	hook, err := s.svc.CreateTarget(t.Context(), "s1", domain.TargetInput{
		Type: "webhook", URL: " HTTPS://Example.com/Hook ", Address: "ignored@x.io",
		Headers: []domain.NameValue{{Name: " X-Key ", Value: " v "}, {Name: "A", Value: ""}},
	})
	require.NoError(t, err)
	assert.NotEqual(t, mail.ID, hook.ID)
	assert.Equal(t, "", hook.Name)
	assert.Equal(t, "HTTPS://Example.com/Hook", hook.Value)
	assert.Equal(t, "HTTPS://Example.com/Hook", hook.ValueKey, "a URL keeps its case in the key")
	assert.Equal(t, []domain.NameValue{{Name: "X-Key", Value: "v"}, {Name: "A", Value: ""}}, hook.Headers)

	assert.Equal(t, []domain.Target{mail, hook}, s.repo.targets, "what is returned is what is saved")
}

func TestCreateTarget_InvalidInputSavesNothing(t *testing.T) {
	s := newTargetSetup()
	_, err := s.svc.CreateTarget(t.Context(), "s1", email("not-an-address"))
	var verr domain.ValidationError
	require.ErrorAs(t, err, &verr)
	assert.Equal(t, []domain.FieldError{fe("address", domain.FieldErrorInvalidFormat, "Enter a valid email address.")}, verr.Fields)
	assert.Zero(t, s.repo.calls)

	// The baseline: the same setup saves a valid input.
	_, err = s.svc.CreateTarget(t.Context(), "s1", email("a@x.io"))
	require.NoError(t, err)
	assert.Equal(t, 1, s.repo.calls)
}

func TestCreateTarget_InvalidInputForUnknownServiceIsValidation(t *testing.T) {
	s := newTargetSetup()
	_, err := s.svc.CreateTarget(t.Context(), "nope", email("bad"))
	var verr domain.ValidationError
	require.ErrorAs(t, err, &verr)
}

func TestCreateTarget_Limit(t *testing.T) {
	s := newTargetSetup()
	var first domain.Target
	for i, a := range []string{"a@x.io", "b@x.io", "c@x.io"} {
		got, err := s.svc.CreateTarget(t.Context(), "s1", email(a))
		require.NoError(t, err)
		if i == 0 {
			first = got
		}
	}
	_, err := s.svc.CreateTarget(t.Context(), "s1", email("d@x.io"))
	require.ErrorIs(t, err, domain.ErrAlertListFull)
	_, err = s.svc.CreateTarget(t.Context(), "s1", email("A@x.io"))
	require.ErrorIs(t, err, domain.ErrAlertListFull, "a duplicate sent to a full list is a full list")

	require.NoError(t, s.svc.DeleteTarget(t.Context(), "s1", first.ID))
	_, err = s.svc.CreateTarget(t.Context(), "s1", email("d@x.io"))
	require.NoError(t, err)
}

func TestCreateTarget_Duplicates(t *testing.T) {
	s := newTargetSetup()
	_, err := s.svc.CreateTarget(t.Context(), "s1", email("a@x.io"))
	require.NoError(t, err)
	_, err = s.svc.CreateTarget(t.Context(), "s1", webhook("https://hook/Path"))
	require.NoError(t, err)

	_, err = s.svc.CreateTarget(t.Context(), "s1", email("A@X.io"))
	require.ErrorIs(t, err, domain.ErrTargetDuplicate)
	_, err = s.svc.CreateTarget(t.Context(), "s1", webhook("https://hook/path"))
	require.NoError(t, err, "the same URL in another case is another contact")
	_, err = s.svc.CreateTarget(t.Context(), "s2", email("a@x.io"))
	require.NoError(t, err, "the same address on another service")
}

func TestUpdateTarget_ReplacesFields(t *testing.T) {
	s := newTargetSetup()
	created, err := s.svc.CreateTarget(t.Context(), "s1", domain.TargetInput{Type: "email", Name: "Old", Address: "old@x.io"})
	require.NoError(t, err)
	s.repo.targets[0].LastDeliveryFailed = true
	s.clock.Advance(time.Hour)

	got, err := s.svc.UpdateTarget(t.Context(), "s1", created.ID, domain.TargetInput{
		Type: "webhook", Name: " New ", URL: " https://Hook ", Headers: []domain.NameValue{{Name: "K", Value: "v"}},
	})

	require.NoError(t, err)
	assert.Equal(t, created.ID, got.ID)
	assert.Equal(t, "s1", got.ServiceID)
	assert.Equal(t, "New", got.Name)
	assert.Equal(t, domain.TargetTypeWebhook, got.Type)
	assert.Equal(t, "https://Hook", got.Value)
	assert.Equal(t, "https://Hook", got.ValueKey)
	assert.Equal(t, []domain.NameValue{{Name: "K", Value: "v"}}, got.Headers)
	assert.True(t, got.LastDeliveryFailed, "an edit keeps the stored value")
	assert.Equal(t, targetStart, got.CreatedAt)
	assert.Equal(t, targetStart.Add(time.Hour), got.UpdatedAt)
	assert.Equal(t, []domain.Target{got}, s.repo.targets)
}

func TestUpdateTarget_DuplicateOwnContactFullListAndInvalid(t *testing.T) {
	s := newTargetSetup()
	var ids []string
	for _, a := range []string{"a@x.io", "b@x.io", "c@x.io"} {
		got, err := s.svc.CreateTarget(t.Context(), "s1", email(a))
		require.NoError(t, err)
		ids = append(ids, got.ID)
	}

	_, err := s.svc.UpdateTarget(t.Context(), "s1", ids[0], email("B@x.io"))
	require.ErrorIs(t, err, domain.ErrTargetDuplicate)
	assert.Equal(t, "a@x.io", s.repo.targets[0].Value, "the row is unchanged")

	_, err = s.svc.UpdateTarget(t.Context(), "s1", ids[0], email("a@x.io"))
	require.NoError(t, err, "its own contact, in a full list")
	got, err := s.svc.UpdateTarget(t.Context(), "s1", ids[0], email("A@x.io"))
	require.NoError(t, err, "another case of its own address")
	assert.Equal(t, "A@x.io", got.Value)

	calls := s.repo.calls
	_, err = s.svc.UpdateTarget(t.Context(), "s1", ids[0], email("bad"))
	var verr domain.ValidationError
	require.ErrorAs(t, err, &verr)
	assert.Equal(t, calls, s.repo.calls, "nothing is saved")
}

func TestTargets_NotFound(t *testing.T) {
	s := newTargetSetup()
	created, err := s.svc.CreateTarget(t.Context(), "s1", email("a@x.io"))
	require.NoError(t, err)

	_, err = s.svc.ListTargets(t.Context(), "nope")
	require.ErrorIs(t, err, domain.ErrNotFound)
	_, err = s.svc.CreateTarget(t.Context(), "nope", email("a@x.io"))
	require.ErrorIs(t, err, domain.ErrNotFound)

	for name, ids := range map[string][2]string{
		"unknown service":      {"nope", created.ID},
		"unknown target":       {"s1", "nope"},
		"another service's id": {"s2", created.ID},
	} {
		_, err = s.svc.UpdateTarget(t.Context(), ids[0], ids[1], email("z@x.io"))
		require.ErrorIs(t, err, domain.ErrNotFound, "update, "+name)
		require.ErrorIs(t, s.svc.DeleteTarget(t.Context(), ids[0], ids[1]), domain.ErrNotFound, "delete, "+name)
	}
	assert.Len(t, s.repo.targets, 1)
}

func TestListTargets(t *testing.T) {
	s := newTargetSetup()
	empty, err := s.svc.ListTargets(t.Context(), "s1")
	require.NoError(t, err)
	assert.NotNil(t, empty)
	assert.Empty(t, empty)

	a, _ := s.svc.CreateTarget(t.Context(), "s1", email("z@x.io"))
	b, _ := s.svc.CreateTarget(t.Context(), "s1", email("a@x.io"))
	got, err := s.svc.ListTargets(t.Context(), "s1")
	require.NoError(t, err)
	assert.Equal(t, []domain.Target{a, b}, got, "the repository's order, not sorted")
}

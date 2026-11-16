package domain_test

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
)

// Version 7 in the first hex digit of the third group; variant 10xx in the fourth.
var uuidV7 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func TestNewID_IsAVersion7UUIDAndUnique(t *testing.T) {
	first, err := domain.NewID()
	require.NoError(t, err)
	second, err := domain.NewID()
	require.NoError(t, err)

	assert.Len(t, first, 36)
	assert.Regexp(t, uuidV7, first)
	assert.Regexp(t, uuidV7, second)
	assert.NotEqual(t, first, second)
}

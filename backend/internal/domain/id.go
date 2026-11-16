package domain

import "github.com/google/uuid"

// NewID returns a new UUIDv7 as 36-character text. Every entity's ID is made here.
// The library reads the wall clock itself; the embedded time carries no rule.
func NewID() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}
	return id.String(), nil
}

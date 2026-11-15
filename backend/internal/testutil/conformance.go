package testutil

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/stretchr/testify/require"

	"monitory/internal/api"
)

var registerProblemDecoder sync.Once

// AssertConforms fails the test unless response is a response docs/openapi.yaml
// allows for the operation: a declared status, the declared content type, required
// headers, and a body that matches the schema. It reads the body and puts it back, so
// the test can still decode it.
func AssertConforms(t *testing.T, operationID string, response *http.Response) {
	t.Helper()

	registerProblemDecoder.Do(func() {
		openapi3filter.RegisterBodyDecoder("application/problem+json", openapi3filter.JSONBodyDecoder)
	})

	spec, err := api.GetSwagger()
	require.NoError(t, err)

	path, method, pathItem, operation := findOperation(spec, operationID)
	require.NotNil(t, operation, "operation %q is not in docs/openapi.yaml", operationID)

	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	response.Body = io.NopCloser(bytes.NewReader(body))

	request, err := http.NewRequestWithContext(t.Context(), method, path, nil)
	require.NoError(t, err)

	input := &openapi3filter.ResponseValidationInput{
		RequestValidationInput: &openapi3filter.RequestValidationInput{
			Request: request,
			Route: &routers.Route{
				Spec:      spec,
				Path:      path,
				PathItem:  pathItem,
				Method:    method,
				Operation: operation,
			},
		},
		Status: response.StatusCode,
		Header: response.Header,
		Options: &openapi3filter.Options{
			IncludeResponseStatus: true,
			MultiError:            true,
		},
	}
	input.SetBodyBytes(body)

	err = openapi3filter.ValidateResponse(t.Context(), input)
	require.NoError(t, err, "%s: the %d response does not conform to docs/openapi.yaml\nbody: %s",
		operationID, response.StatusCode, strings.TrimSpace(string(body)))
}

func findOperation(spec *openapi3.T, operationID string) (path, method string, item *openapi3.PathItem, op *openapi3.Operation) {
	for p, pathItem := range spec.Paths.Map() {
		for m, operation := range pathItem.Operations() {
			// The generator capitalises operation ids in the embedded contract.
			if strings.EqualFold(operation.OperationID, operationID) {
				return p, m, pathItem, operation
			}
		}
	}
	return "", "", nil, nil
}

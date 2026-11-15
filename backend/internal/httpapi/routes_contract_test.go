package httpapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type contractRoute struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

func TestAPIRoutesMatchSharedContract(t *testing.T) {
	contractPath := filepath.Join("..", "..", "..", "contracts", "api-routes.json")
	body, err := os.ReadFile(contractPath)
	if err != nil {
		t.Fatalf("read API contract: %v", err)
	}

	var expected []contractRoute
	if err := json.Unmarshal(body, &expected); err != nil {
		t.Fatalf("parse API contract: %v", err)
	}

	actualRoutes := APIRoutes()
	actual := make(map[contractRoute]bool, len(actualRoutes))
	for _, route := range actualRoutes {
		actual[contractRoute{Method: route.Method, Path: route.Path}] = true
	}

	for _, route := range expected {
		if !actual[route] {
			t.Fatalf("route from shared contract is missing in Go backend: %s %s", route.Method, route.Path)
		}
	}
	if len(actual) != len(expected) {
		t.Fatalf("Go backend registered %d API routes, shared contract has %d", len(actual), len(expected))
	}
}

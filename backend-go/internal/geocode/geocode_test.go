package geocode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchSendsUserAgentEmailAndParsesResult(t *testing.T) {
	var gotUserAgent string
	var gotEmail string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUserAgent = r.Header.Get("User-Agent")
		gotEmail = r.URL.Query().Get("email")
		_, _ = w.Write([]byte(`[{"name":"Reef","display_name":"Reef, Ocean","lat":"47.1","lon":"8.2","address":{"country":"Switzerland"}}]`))
	}))
	defer server.Close()

	result, found, err := (Client{BaseURL: server.URL, UserAgent: "DiveVault/Tests", Email: "ops@example.test"}).Search(context.Background(), "reef")
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if !found || result.Name != "Reef" || result.Country != "Switzerland" || result.Latitude == nil || result.Longitude == nil {
		t.Fatalf("unexpected result found=%v result=%+v", found, result)
	}
	if gotUserAgent != "DiveVault/Tests" || gotEmail != "ops@example.test" {
		t.Fatalf("headers/query userAgent=%q email=%q", gotUserAgent, gotEmail)
	}
}

func TestSearchRequiresQuery(t *testing.T) {
	_, _, err := (Client{}).Search(context.Background(), " ")
	if err == nil || err.Error() != "Missing search query" {
		t.Fatalf("expected missing query error, got %v", err)
	}
}

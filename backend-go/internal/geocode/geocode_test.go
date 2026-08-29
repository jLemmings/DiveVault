package geocode

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestSearchReturnsNotFoundForEmptyRows(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()

	result, found, err := (Client{BaseURL: server.URL}).Search(context.Background(), "reef")
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if found || result.Name != "" {
		t.Fatalf("expected no result, got found=%v result=%+v", found, result)
	}
}

func TestSearchReportsUpstreamErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusBadGateway)
	}))
	defer server.Close()

	_, _, err := (Client{BaseURL: server.URL}).Search(context.Background(), "reef")
	if err == nil || err.Error() != "geocode upstream returned 502" {
		t.Fatalf("expected upstream error, got %v", err)
	}
}

func TestSearchLeavesInvalidCoordinatesNil(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"name":"Reef","display_name":"Reef","lat":"bad","lon":"also-bad","address":{}}]`))
	}))
	defer server.Close()

	result, found, err := (Client{BaseURL: server.URL}).Search(context.Background(), "reef")
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if !found || result.Latitude != nil || result.Longitude != nil {
		t.Fatalf("unexpected coordinates found=%v result=%+v", found, result)
	}
}

func TestSearchUsesDefaults(t *testing.T) {
	transport := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://nominatim.openstreetmap.org/search?addressdetails=1&format=jsonv2&limit=1&q=reef" {
			t.Fatalf("unexpected URL %s", request.URL.String())
		}
		if request.Header.Get("User-Agent") != "DiveVault/1.0" {
			t.Fatalf("User-Agent = %q", request.Header.Get("User-Agent"))
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`[]`)),
			Header:     http.Header{},
			Request:    request,
		}, nil
	})
	_, _, err := (Client{HTTP: &http.Client{Transport: transport}}).Search(context.Background(), " reef ")
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

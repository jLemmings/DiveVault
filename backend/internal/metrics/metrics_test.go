package metrics

import (
	"strings"
	"testing"
)

func TestRenderIncludesExpectedPrometheusMetrics(t *testing.T) {
	recorder := NewRecorder()
	recorder.Observe("GET", "/api/health", 200)
	body := recorder.Render(true, 14)
	for _, expected := range []string{
		"divevault_up 1",
		"divevault_database_ready 1",
		"divevault_schema_version 14",
		`divevault_http_requests_total{method="GET",route="/api/health",status_class="2xx"} 1`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("metrics output missing %q:\n%s", expected, body)
		}
	}
}

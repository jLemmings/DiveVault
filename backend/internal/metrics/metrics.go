package metrics

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

type Recorder struct {
	mu        sync.Mutex
	startedAt time.Time
	requests  map[string]int64
}

func NewRecorder() *Recorder {
	return &Recorder{startedAt: time.Now(), requests: map[string]int64{}}
}

func (r *Recorder) Observe(method string, route string, status int) {
	if r == nil {
		return
	}
	statusClass := fmt.Sprintf("%dxx", status/100)
	key := method + "\x00" + route + "\x00" + statusClass
	r.mu.Lock()
	r.requests[key]++
	r.mu.Unlock()
}

func (r *Recorder) Render(databaseReady bool, schemaVersion int) string {
	if r == nil {
		r = NewRecorder()
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	lines := []string{
		"# HELP divevault_up Whether the DiveVault backend process is running.",
		"# TYPE divevault_up gauge",
		"divevault_up 1",
		"# HELP divevault_database_ready Whether the configured database is reachable.",
		"# TYPE divevault_database_ready gauge",
		fmt.Sprintf("divevault_database_ready %d", boolInt(databaseReady)),
		"# HELP divevault_schema_version Current database schema version.",
		"# TYPE divevault_schema_version gauge",
		fmt.Sprintf("divevault_schema_version %d", schemaVersion),
		"# HELP divevault_process_start_time_seconds Unix timestamp when the backend process started.",
		"# TYPE divevault_process_start_time_seconds gauge",
		fmt.Sprintf("divevault_process_start_time_seconds %d", r.startedAt.Unix()),
		"# HELP divevault_http_requests_total HTTP requests served by method, route, and status class.",
		"# TYPE divevault_http_requests_total counter",
	}
	keys := make([]string, 0, len(r.requests))
	for key := range r.requests {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts := strings.Split(key, "\x00")
		lines = append(lines, fmt.Sprintf(`divevault_http_requests_total{method="%s",route="%s",status_class="%s"} %d`, escape(parts[0]), escape(parts[1]), escape(parts[2]), r.requests[key]))
	}
	return strings.Join(lines, "\n") + "\n"
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func escape(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	return strings.ReplaceAll(value, `"`, `\"`)
}

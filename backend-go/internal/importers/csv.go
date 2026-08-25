package importers

import (
	"encoding/csv"
	"errors"
	"io"
	"strconv"
	"strings"
	"time"
)

func CSVPayloads(csvText string) ([]map[string]any, []map[string]any, error) {
	reader := csv.NewReader(strings.NewReader(csvText))
	reader.TrimLeadingSpace = true
	headers, err := reader.Read()
	if err != nil {
		return nil, nil, errors.New("CSV import is empty")
	}
	index := map[string]int{}
	for i, header := range headers {
		index[strings.TrimSpace(header)] = i
	}
	required := []string{"started_at", "max_depth_m"}
	for _, field := range required {
		if _, ok := index[field]; !ok {
			return nil, nil, errors.New("CSV import missing required column: " + field)
		}
	}
	payloads := []map[string]any{}
	rows := []map[string]any{}
	rowNumber := 1
	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		rowNumber++
		if err != nil {
			return nil, nil, err
		}
		payload, row := csvPayload(index, record, rowNumber)
		payloads = append(payloads, payload)
		rows = append(rows, row)
	}
	return payloads, rows, nil
}

func csvPayload(index map[string]int, record []string, rowNumber int) (map[string]any, map[string]any) {
	value := func(name string) string {
		i, ok := index[name]
		if !ok || i >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[i])
	}
	diveUID := value("dive_uid")
	if diveUID == "" {
		diveUID = "csv-" + value("started_at") + "-" + strconv.Itoa(rowNumber)
	}
	durationSeconds := parseFloat(value("duration_seconds"))
	if durationSeconds == nil {
		if minutes := parseFloat(value("duration_minutes")); minutes != nil {
			seconds := *minutes * 60
			durationSeconds = &seconds
		}
	}
	rawData := value("raw_data_b64")
	if rawData == "" {
		rawData = "e30="
	}
	payload := map[string]any{
		"vendor":           defaultString(value("vendor"), "CSV"),
		"product":          defaultString(value("product"), "Import"),
		"dive_uid":         diveUID,
		"started_at":       value("started_at"),
		"duration_seconds": durationSeconds,
		"max_depth_m":      parseFloat(value("max_depth_m")),
		"avg_depth_m":      parseFloat(value("avg_depth_m")),
		"raw_sha256":       defaultString(value("raw_sha256"), "csv-import"),
		"raw_data_b64":     rawData,
		"imported_at":      time.Now().UTC().Format(time.RFC3339Nano),
		"fields": map[string]any{"logbook": map[string]any{
			"site":   value("site"),
			"buddy":  value("buddy"),
			"guide":  value("guide"),
			"notes":  value("notes"),
			"status": "imported",
		}},
		"samples": []any{},
	}
	valid := value("started_at") != "" && payload["max_depth_m"] != nil && durationSeconds != nil
	errors := []string{}
	if !valid {
		errors = append(errors, "started_at, max_depth_m, and duration_seconds or duration_minutes are required")
	}
	row := map[string]any{"row_number": rowNumber, "dive_uid": diveUID, "valid": valid, "errors": errors, "status": "ready"}
	return payload, row
}

func parseFloat(value string) *float64 {
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

package importers

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

type Preview struct {
	Payloads []map[string]any
	Rows     []map[string]any
}

func CSVPayloads(csvText string) ([]map[string]any, []map[string]any, error) {
	preview, err := CSVPreview(csvText)
	if err != nil {
		return nil, nil, err
	}
	for _, row := range preview.Rows {
		if valid, _ := row["valid"].(bool); !valid {
			errors, _ := row["errors"].([]string)
			message := "Invalid row"
			if len(errors) > 0 {
				message = errors[0]
			}
			return nil, nil, fmt.Errorf("CSV row %v: %s", row["row_number"], message)
		}
	}
	if len(preview.Payloads) == 0 {
		return nil, nil, errors.New("CSV import does not contain any dive rows")
	}
	return preview.Payloads, preview.Rows, nil
}

func CSVPreview(csvText string) (Preview, error) {
	if strings.TrimSpace(csvText) == "" {
		return Preview{}, errors.New("CSV import file is empty")
	}
	reader := csv.NewReader(strings.NewReader(csvText))
	reader.TrimLeadingSpace = true
	headers, err := reader.Read()
	if err != nil {
		return Preview{}, errors.New("CSV import requires a header row")
	}
	index := map[string]int{}
	for i, header := range headers {
		index[strings.TrimSpace(header)] = i
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
			return Preview{}, err
		}
		if blankRecord(record) {
			continue
		}
		payload, row, err := csvPayload(index, record, rowNumber)
		if err != nil {
			rows = append(rows, invalidRow(rowNumber, err.Error()))
			continue
		}
		payloads = append(payloads, payload)
		rows = append(rows, row)
	}
	if len(payloads) == 0 && len(rows) == 0 {
		return Preview{}, errors.New("CSV import does not contain any dive rows")
	}
	return Preview{Payloads: payloads, Rows: rows}, nil
}

func csvPayload(index map[string]int, record []string, rowNumber int) (map[string]any, map[string]any, error) {
	value := func(name string) string {
		i, ok := index[name]
		if !ok || i >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[i])
	}
	startedAt := value("started_at")
	if startedAt == "" && value("date") != "" && value("time") != "" {
		timeValue := value("time")
		if len(timeValue) == 5 {
			timeValue += ":00"
		}
		startedAt = value("date") + "T" + timeValue
	}
	if startedAt == "" {
		return nil, nil, errors.New("started_at is required")
	}
	durationSeconds := parsePositiveSeconds(value("duration_seconds"), value("duration_minutes"))
	if durationSeconds == nil {
		return nil, nil, errors.New("duration_seconds or duration_minutes is required")
	}
	maxDepth := parseFloat(value("max_depth_m"))
	if maxDepth == nil {
		return nil, nil, errors.New("max_depth_m is required")
	}
	samples, err := parseSamples(value("samples_json"))
	if err != nil {
		return nil, nil, err
	}
	diveUID := value("dive_uid")
	rawSource, _ := json.Marshal(map[string]any{"source": "csv", "row_number": rowNumber, "row": recordMap(index, record)})
	rawHash := sha256.Sum256(rawSource)
	if diveUID == "" {
		diveUID = "csv-" + hex.EncodeToString(rawHash[:])[:24]
	}
	rawData := value("raw_data_b64")
	if rawData == "" {
		rawData = base64.StdEncoding.EncodeToString(rawSource)
	}
	payload := map[string]any{
		"vendor":           defaultString(value("vendor"), "CSV"),
		"product":          defaultString(value("product"), "Import"),
		"fingerprint_hex":  nilString(value("fingerprint_hex")),
		"dive_uid":         diveUID,
		"started_at":       startedAt,
		"duration_seconds": durationSeconds,
		"max_depth_m":      maxDepth,
		"avg_depth_m":      parseFloat(value("avg_depth_m")),
		"raw_sha256":       defaultString(value("raw_sha256"), hex.EncodeToString(rawHash[:])),
		"raw_data_b64":     rawData,
		"imported_at":      defaultString(value("imported_at"), time.Now().UTC().Format(time.RFC3339Nano)),
		"fields":           csvFields(value),
		"samples":          samples,
	}
	row := map[string]any{"row_number": rowNumber, "source_id": "", "dive_uid": diveUID, "started_at": startedAt, "site": value("site"), "duration_seconds": *durationSeconds, "max_depth_m": *maxDepth, "sample_count": len(samples), "valid": true, "duplicate": false, "errors": []string{}, "status": "ready"}
	return payload, row, nil
}

func csvFields(value func(string) string) map[string]any {
	logbook := map[string]any{
		"site":                value("site"),
		"buddy":               value("buddy"),
		"guide":               value("guide"),
		"weather_description": value("weather_description"),
		"visibility":          value("visibility"),
		"wetsuit_description": value("wetsuit_description"),
		"notes":               value("notes"),
		"status":              "imported",
	}
	if strings.TrimSpace(logbook["site"].(string)) != "" {
		logbook["status"] = "complete"
		logbook["completed_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	}
	fields := map[string]any{"source": "csv", "csv_import": true, "logbook": logbook}
	for _, key := range []string{"temperature_surface_c", "temperature_minimum_c", "temperature_maximum_c"} {
		if parsed := parseFloat(value(key)); parsed != nil {
			fields[key] = *parsed
		}
	}
	tank := map[string]any{}
	if parsed := parseFloat(value("tank_volume_l")); parsed != nil {
		tank["volume"] = *parsed
	}
	if parsed := parseFloat(value("begin_pressure_bar")); parsed != nil {
		tank["beginpressure_bar"] = int(*parsed + 0.5)
	}
	if parsed := parseFloat(value("end_pressure_bar")); parsed != nil {
		tank["endpressure_bar"] = int(*parsed + 0.5)
	}
	if parsed := parseFloat(value("gas_o2_percent")); parsed != nil {
		tank["o2_percent"] = *parsed
	}
	if parsed := parseFloat(value("gas_he_percent")); parsed != nil {
		tank["he_percent"] = *parsed
	}
	if len(tank) > 0 {
		fields["tanks"] = []any{tank}
	}
	return fields
}

func ParseFloat(value string) *float64 {
	if value == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseFloat(value string) *float64 {
	return ParseFloat(value)
}

func parsePositiveSeconds(secondsValue string, minutesValue string) *float64 {
	seconds := parseFloat(secondsValue)
	if seconds == nil {
		if minutes := parseFloat(minutesValue); minutes != nil {
			value := *minutes * 60
			seconds = &value
		}
	}
	if seconds == nil || *seconds <= 0 {
		return nil
	}
	rounded := float64(int(*seconds + 0.5))
	return &rounded
}

func parseSamples(value string) ([]any, error) {
	if strings.TrimSpace(value) == "" {
		return []any{}, nil
	}
	var samples []any
	if err := json.Unmarshal([]byte(value), &samples); err != nil {
		return nil, errors.New("samples_json must be valid JSON")
	}
	return samples, nil
}

func invalidRow(rowNumber int, message string) map[string]any {
	return map[string]any{"row_number": rowNumber, "source_id": "", "valid": false, "status": "invalid", "duplicate": false, "errors": []string{message}, "dive_uid": "", "started_at": "", "site": "", "duration_seconds": nil, "max_depth_m": nil, "sample_count": 0}
}

func blankRecord(record []string) bool {
	for _, value := range record {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func recordMap(index map[string]int, record []string) map[string]string {
	out := map[string]string{}
	for key, i := range index {
		if i < len(record) {
			out[key] = strings.TrimSpace(record[i])
		}
	}
	return out
}

func nilString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

package exports

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/store"
)

func TimestampSlug() string {
	return time.Now().UTC().Format("20060102-150405")
}

func AttachmentFilename(value string) string {
	re := regexp.MustCompile(`[^A-Za-z0-9._-]+`)
	sanitized := re.ReplaceAllString(value, "-")
	sanitized = regexp.MustCompile(`^[.-]+|[.-]+$`).ReplaceAllString(sanitized, "")
	if sanitized == "" {
		return "download"
	}
	return sanitized
}

func DivesCSV(dives []store.Dive) ([]byte, error) {
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)
	fields := []string{"dive_id", "dive_uid", "status", "site", "buddy", "guide", "weather_description", "visibility", "wetsuit_description", "weight_description", "notes", "vendor", "product", "started_at", "imported_at", "duration_seconds", "max_depth_m", "avg_depth_m", "raw_sha256", "sample_count", "sample_index", "sample_time_seconds", "sample_depth_m", "sample_temperature_c", "sample_tank_pressure_bar", "sample_payload_json"}
	if err := writer.Write(fields); err != nil {
		return nil, err
	}
	for _, dive := range dives {
		logbook, _ := dive.Fields["logbook"].(map[string]any)
		samples := dive.Samples
		if len(samples) == 0 {
			if err := writer.Write(csvRow(dive, logbook, nil, "")); err != nil {
				return nil, err
			}
			continue
		}
		for index, sample := range samples {
			if err := writer.Write(csvRow(dive, logbook, sample, fmt.Sprintf("%d", index))); err != nil {
				return nil, err
			}
		}
	}
	writer.Flush()
	return buffer.Bytes(), writer.Error()
}

func MinimalPDF(dives []store.Dive) []byte {
	return []byte(fmt.Sprintf("%%PDF-1.4\n%% DiveVault Go export placeholder\n%% %d dives\n", len(dives)))
}

func BackupArchive(payload any) ([]byte, error) {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	file, err := archive.Create("divevault-backup.json")
	if err != nil {
		return nil, err
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		return nil, err
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func csvRow(dive store.Dive, logbook map[string]any, sample any, sampleIndex string) []string {
	sampleMap, _ := sample.(map[string]any)
	sampleJSON, _ := json.Marshal(sampleMap)
	return []string{
		fmt.Sprint(dive.ID), dive.DiveUID, stringField(logbook, "status", "imported"), stringField(logbook, "site", ""), stringField(logbook, "buddy", ""), stringField(logbook, "guide", ""), stringField(logbook, "weather_description", ""), stringField(logbook, "visibility", ""), stringField(logbook, "wetsuit_description", ""), stringField(logbook, "weight_description", ""), stringField(logbook, "notes", ""),
		dive.Vendor, dive.Product, pointerString(dive.StartedAt), dive.ImportedAt, pointerInt(dive.DurationSeconds), pointerFloat(dive.MaxDepthM), pointerFloat(dive.AvgDepthM), dive.RawSHA256, fmt.Sprint(dive.SampleCount), sampleIndex,
		fmt.Sprint(sampleMap["time_seconds"]), fmt.Sprint(sampleMap["depth_m"]), fmt.Sprint(sampleMap["temperature_c"]), fmt.Sprint(sampleMap["tank_pressure_bar"]), string(sampleJSON),
	}
}

func stringField(m map[string]any, key string, fallback string) string {
	if value, ok := m[key].(string); ok && value != "" {
		return value
	}
	return fallback
}

func pointerString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func pointerInt(value *int64) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(*value)
}

func pointerFloat(value *float64) string {
	if value == nil {
		return ""
	}
	return fmt.Sprint(*value)
}

package exports

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
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
	lines := []string{"DiveVault Dive Export", fmt.Sprintf("%d dives", len(dives))}
	for _, dive := range dives {
		lines = append(lines, fmt.Sprintf("#%d %s %s %s", dive.ID, dive.DiveUID, pointerString(dive.StartedAt), pointerFloat(dive.MaxDepthM)))
		if len(lines) >= 35 {
			break
		}
	}
	content := "BT /F1 12 Tf 72 760 Td "
	for index, line := range lines {
		if index > 0 {
			content += "0 -18 Td "
		}
		content += "(" + escapePDFText(line) + ") Tj "
	}
	content += "ET"
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content),
	}
	var buffer bytes.Buffer
	buffer.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	for index, object := range objects {
		offsets = append(offsets, buffer.Len())
		buffer.WriteString(fmt.Sprintf("%d 0 obj\n%s\nendobj\n", index+1, object))
	}
	xref := buffer.Len()
	buffer.WriteString(fmt.Sprintf("xref\n0 %d\n0000000000 65535 f \n", len(offsets)))
	for _, offset := range offsets[1:] {
		buffer.WriteString(fmt.Sprintf("%010d 00000 n \n", offset))
	}
	buffer.WriteString(fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref))
	return buffer.Bytes()
}

func BackupArchive(payload any) ([]byte, error) {
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	file, err := archive.Create("backup.json")
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

func escapePDFText(value string) string {
	value = regexp.MustCompile(`[^\x20-\x7e]+`).ReplaceAllString(value, " ")
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `(`, `\(`)
	return strings.ReplaceAll(value, `)`, `\)`)
}

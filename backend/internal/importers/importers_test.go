package importers

import (
	"archive/zip"
	"bytes"
	"compress/gzip"
	"strings"
	"testing"
)

func TestCSVPreviewReportsInvalidRowsAndPayloads(t *testing.T) {
	preview, err := CSVPreview("started_at,duration_seconds,max_depth_m,site\n2026-01-01T10:00:00,40,18,Reef\n,0,,\n")
	if err != nil {
		t.Fatalf("CSVPreview returned error: %v", err)
	}
	if len(preview.Payloads) != 1 {
		t.Fatalf("payload count = %d, expected 1", len(preview.Payloads))
	}
	if len(preview.Rows) != 2 {
		t.Fatalf("row count = %d, expected 2", len(preview.Rows))
	}
	if valid, _ := preview.Rows[1]["valid"].(bool); valid {
		t.Fatalf("second row should be invalid")
	}
}

func TestCSVPayloadsRejectInvalidRows(t *testing.T) {
	_, _, err := CSVPayloads("started_at,duration_seconds,max_depth_m\n,40,18\n")
	if err == nil || !strings.Contains(err.Error(), "CSV row 2") {
		t.Fatalf("expected row-specific CSV error, got %v", err)
	}
}

func TestCSVPreviewBuildsStartedAtFromDateAndTime(t *testing.T) {
	preview, err := CSVPreview("date,time,duration_minutes,max_depth_m,site\n2026-01-01,09:05,45,21,Reef\n")
	if err != nil {
		t.Fatalf("CSVPreview returned error: %v", err)
	}
	payload := preview.Payloads[0]
	if payload["started_at"] != "2026-01-01T09:05:00" {
		t.Fatalf("started_at = %v", payload["started_at"])
	}
	if payload["vendor"] != "CSV" || payload["product"] != "Import" {
		t.Fatalf("vendor/product = %v/%v", payload["vendor"], payload["product"])
	}
}

func TestCSVPreviewReportsInvalidSamplesJSON(t *testing.T) {
	preview, err := CSVPreview("started_at,duration_seconds,max_depth_m,samples_json\n2026-01-01T10:00:00,40,18,not-json\n")
	if err != nil {
		t.Fatalf("CSVPreview returned error: %v", err)
	}
	if len(preview.Rows) != 1 {
		t.Fatalf("row count = %d", len(preview.Rows))
	}
	if valid, _ := preview.Rows[0]["valid"].(bool); valid {
		t.Fatalf("row should be invalid")
	}
}

func TestSubsurfacePreviewParsesDiveSamplesAndUnits(t *testing.T) {
	xml := `<divelog><divesites><site uuid="site-1" name="Blue Hole" gps="47.1 8.2"/></divesites><dive number="7" date="2026-01-02" time="10:30" duration="42 min" divesiteid="site-1"><divecomputer model="Perdix"><depth max="66 ft" mean="12 m"/><sample time="1:00" depth="10 m" temp="68 F" pressure="3000 psi"/></divecomputer></dive></divelog>`
	preview, err := SubsurfacePreview(xml)
	if err != nil {
		t.Fatalf("SubsurfacePreview returned error: %v", err)
	}
	if len(preview.Payloads) != 1 {
		t.Fatalf("payload count = %d, expected 1", len(preview.Payloads))
	}
	payload := preview.Payloads[0]
	if payload["vendor"] != "Subsurface" {
		t.Fatalf("vendor = %v", payload["vendor"])
	}
	if samples, _ := payload["samples"].([]any); len(samples) != 1 {
		t.Fatalf("sample count = %d, expected 1", len(samples))
	}
}

func TestDecodeSubsurfaceExportSupportsGzipAndZip(t *testing.T) {
	const body = `<divelog><dive date="2026-01-02" duration="40 min" maxdepth="20 m"/></divelog>`
	var gzipBuffer bytes.Buffer
	gzipWriter := gzip.NewWriter(&gzipBuffer)
	_, _ = gzipWriter.Write([]byte(body))
	_ = gzipWriter.Close()
	decoded, err := DecodeSubsurfaceExport(gzipBuffer.Bytes(), 1024)
	if err != nil || decoded != body {
		t.Fatalf("gzip decoded=%q err=%v", decoded, err)
	}

	var zipBuffer bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuffer)
	file, _ := zipWriter.Create("export.xml")
	_, _ = file.Write([]byte(body))
	_ = zipWriter.Close()
	decoded, err = DecodeSubsurfaceExport(zipBuffer.Bytes(), 1024)
	if err != nil || decoded != body {
		t.Fatalf("zip decoded=%q err=%v", decoded, err)
	}
}

func TestSubsurfacePreviewReturnsInvalidRowsForMissingFields(t *testing.T) {
	preview, err := SubsurfacePreview(`<divelog><dive number="1" duration="40 min" maxdepth="20 m"/></divelog>`)
	if err != nil {
		t.Fatalf("SubsurfacePreview returned error: %v", err)
	}
	if len(preview.Payloads) != 0 {
		t.Fatalf("payload count = %d, expected 0", len(preview.Payloads))
	}
	if len(preview.Rows) != 1 {
		t.Fatalf("row count = %d, expected 1", len(preview.Rows))
	}
	if valid, _ := preview.Rows[0]["valid"].(bool); valid {
		t.Fatalf("row should be invalid")
	}
}

func TestSubsurfacePayloadsRejectInvalidRows(t *testing.T) {
	_, _, err := SubsurfacePayloads(`<divelog><dive number="1" duration="40 min" maxdepth="20 m"/></divelog>`)
	if err == nil || !strings.Contains(err.Error(), "Subsurface dive 1") {
		t.Fatalf("expected row-specific Subsurface error, got %v", err)
	}
}

func TestDecodeSubsurfaceExportRejectsZIPWithoutXML(t *testing.T) {
	var zipBuffer bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuffer)
	file, _ := zipWriter.Create("notes.txt")
	_, _ = file.Write([]byte("not xml"))
	_ = zipWriter.Close()

	_, err := DecodeSubsurfaceExport(zipBuffer.Bytes(), 1024)
	if err == nil || err.Error() != "Subsurface archive does not contain an XML export" {
		t.Fatalf("expected missing XML error, got %v", err)
	}
}

func TestSubsurfaceParsesImperialPressureAndTemperature(t *testing.T) {
	depth := parseDepth("33 ft")
	if depth == nil || *depth < 10.05 || *depth > 10.06 {
		t.Fatalf("depth = %v", depth)
	}
	pressure := parsePressure("3000 psi")
	if pressure == nil || *pressure != 207 {
		t.Fatalf("pressure = %v", pressure)
	}
	temperature := parseTemperature("68 F")
	if temperature == nil || *temperature != 20 {
		t.Fatalf("temperature = %v", temperature)
	}
	duration := parseDuration("1:02:03")
	if duration == nil || *duration != 3723 {
		t.Fatalf("duration = %v", duration)
	}
}

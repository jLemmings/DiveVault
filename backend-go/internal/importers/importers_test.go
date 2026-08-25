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

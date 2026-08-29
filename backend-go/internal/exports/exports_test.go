package exports

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/jlemmings/divevault/backend-go/internal/store"
)

func TestMinimalPDFIsValidEnoughForReaders(t *testing.T) {
	body := MinimalPDF([]store.Dive{{ID: 1, DiveUID: "dive-1"}})
	text := string(body)
	if !strings.HasPrefix(text, "%PDF-1.4") || !strings.Contains(text, "xref") || !strings.Contains(text, "%%EOF") {
		t.Fatalf("generated PDF is missing core structure: %q", text)
	}
}

func TestBackupArchiveUsesPythonManifestName(t *testing.T) {
	body, err := BackupArchive(map[string]any{"version": 1})
	if err != nil {
		t.Fatalf("BackupArchive returned error: %v", err)
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("backup archive is not zip: %v", err)
	}
	for _, file := range reader.File {
		if file.Name == "backup.json" {
			return
		}
	}
	t.Fatalf("backup archive missing backup.json")
}

func TestBackupArchiveStoresLicenseDocumentsAsFiles(t *testing.T) {
	body, err := BackupArchive(map[string]any{
		"version": 1,
		"license_documents": []any{
			map[string]any{"license_id": "rescue/card", "filename": "../card.pdf", "content_type": "application/pdf", "data_b64": "JVBERi0xLjQK"},
			map[string]any{"license_id": "rescue/card", "filename": "../card.pdf", "content_type": "application/pdf", "data_b64": "JVBERi0xLjQK"},
		},
	})
	if err != nil {
		t.Fatalf("BackupArchive returned error: %v", err)
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("backup archive is not zip: %v", err)
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		entries[file.Name] = file
	}
	manifestFile := entries["backup.json"]
	if manifestFile == nil {
		t.Fatalf("backup archive missing backup.json")
	}
	rc, err := manifestFile.Open()
	if err != nil {
		t.Fatalf("open manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
		t.Fatalf("decode manifest: %v", err)
	}
	_ = rc.Close()
	documents, _ := manifest["license_documents"].([]any)
	if len(documents) != 2 {
		t.Fatalf("license document count = %d, expected 2", len(documents))
	}
	first, _ := documents[0].(map[string]any)
	second, _ := documents[1].(map[string]any)
	if first["data_b64"] != nil || second["data_b64"] != nil {
		t.Fatalf("manifest should reference license files instead of embedding data_b64")
	}
	if first["file_path"] != "licenses/rescue-card/card.pdf" {
		t.Fatalf("first file_path = %v", first["file_path"])
	}
	if second["file_path"] != "licenses/rescue-card/card-2.pdf" {
		t.Fatalf("second file_path = %v", second["file_path"])
	}
	for _, name := range []string{"licenses/rescue-card/card.pdf", "licenses/rescue-card/card-2.pdf"} {
		if entries[name] == nil {
			t.Fatalf("backup archive missing license file %s", name)
		}
	}
}

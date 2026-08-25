package exports

import (
	"archive/zip"
	"bytes"
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

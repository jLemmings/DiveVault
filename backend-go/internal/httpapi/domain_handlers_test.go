package httpapi

import (
	"archive/zip"
	"bytes"
	"testing"
	"time"
)

func TestSafeBackupPathRejectsTraversal(t *testing.T) {
	for _, path := range []string{"../backup.json", "/backup.json", `licenses\..\backup.json`} {
		if safeBackupPath(path) {
			t.Fatalf("expected unsafe path %q to be rejected", path)
		}
	}
	if !safeBackupPath("licenses/license-1/card.pdf") {
		t.Fatalf("expected normal relative path to be accepted")
	}
}

func TestFixedWindowLimiterRejectsAfterLimit(t *testing.T) {
	limiter := newFixedWindowLimiter()
	if ok, _ := limiter.Allow("key", 2, 60); !ok {
		t.Fatalf("first request rejected")
	}
	if ok, _ := limiter.Allow("key", 2, 60); !ok {
		t.Fatalf("second request rejected")
	}
	if ok, retryAfter := limiter.Allow("key", 2, 60); ok || retryAfter <= 0 {
		t.Fatalf("third request ok=%v retryAfter=%d", ok, retryAfter)
	}
}

func TestFixedWindowLimiterResets(t *testing.T) {
	limiter := newFixedWindowLimiter()
	if ok, _ := limiter.Allow("key", 1, 1); !ok {
		t.Fatalf("first request rejected")
	}
	time.Sleep(1100 * time.Millisecond)
	if ok, _ := limiter.Allow("key", 1, 1); !ok {
		t.Fatalf("request after reset rejected")
	}
}

func TestReadBackupZIPPayloadRejectsMissingManifest(t *testing.T) {
	body := zipBody(t, map[string]string{"other.json": `{}`})
	_, err := readBackupZIPPayload(body, 1024)
	if err == nil || err.Error() != "Backup archive is missing backup.json" {
		t.Fatalf("expected missing manifest error, got %v", err)
	}
}

func TestReadBackupZIPPayloadRejectsDuplicateMembers(t *testing.T) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	first, _ := writer.Create("backup.json")
	_, _ = first.Write([]byte(`{"version":1}`))
	second, _ := writer.Create("backup.json")
	_, _ = second.Write([]byte(`{"version":1}`))
	_ = writer.Close()

	_, err := readBackupZIPPayload(buffer.Bytes(), 1024)
	if err == nil || err.Error() != `Backup archive contains duplicate path "backup.json"` {
		t.Fatalf("expected duplicate member error, got %v", err)
	}
}

func TestReadBackupZIPPayloadHydratesLicenseDocumentFile(t *testing.T) {
	body := zipBody(t, map[string]string{
		"backup.json":            `{"version":1,"license_documents":[{"license_id":"license-1","filename":"card.pdf","content_type":"application/pdf","file_path":"licenses/license-1/card.pdf"}]}`,
		"licenses/license-1/card.pdf": "%PDF-1.4\n",
	})
	payload, err := readBackupZIPPayload(body, 1024)
	if err != nil {
		t.Fatalf("readBackupZIPPayload returned error: %v", err)
	}
	documents, _ := payload["license_documents"].([]any)
	if len(documents) != 1 {
		t.Fatalf("license document count = %d, expected 1", len(documents))
	}
	document, _ := documents[0].(map[string]any)
	if document["data_b64"] != "JVBERi0xLjQK" {
		t.Fatalf("data_b64 = %v", document["data_b64"])
	}
}

func TestReadBackupZIPPayloadRejectsUnexpectedMember(t *testing.T) {
	body := zipBody(t, map[string]string{
		"backup.json": `{"version":1}`,
		"tmp.txt":     "no",
	})
	_, err := readBackupZIPPayload(body, 1024)
	if err == nil || err.Error() != `Backup archive contains unexpected path "tmp.txt"` {
		t.Fatalf("expected unexpected path error, got %v", err)
	}
}

func TestValidateBackupPayloadRequiresDiveRawData(t *testing.T) {
	err := validateBackupPayload(map[string]any{
		"version": float64(1),
		"dives": []any{
			map[string]any{"vendor": "v", "product": "p", "dive_uid": "dive-1", "raw_sha256": "abc"},
		},
	})
	if err == nil || err.Error() != "Backup dive 1 is missing required fields: raw_data_b64" {
		t.Fatalf("expected raw_data_b64 validation error, got %v", err)
	}
}

func zipBody(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, body := range entries {
		file, err := writer.Create(name)
		if err != nil {
			t.Fatalf("create zip member: %v", err)
		}
		if _, err := file.Write([]byte(body)); err != nil {
			t.Fatalf("write zip member: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buffer.Bytes()
}

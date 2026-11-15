package static

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAssetPathServesIndexForRootAndSPAFallback(t *testing.T) {
	root := t.TempDir()
	indexPath := filepath.Join(root, "index.html")
	if err := os.WriteFile(indexPath, []byte("<!doctype html>"), 0o600); err != nil {
		t.Fatalf("write index: %v", err)
	}

	for _, requestPath := range []string{"/", "/dives/123", "/../outside.txt"} {
		resolved, ok := AssetPath(root, requestPath)
		if !ok {
			t.Fatalf("AssetPath(%q) was not found", requestPath)
		}
		if resolved != indexPath {
			t.Fatalf("AssetPath(%q) = %q, expected %q", requestPath, resolved, indexPath)
		}
	}
}

func TestAssetPathServesExistingAsset(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html>"), 0o600); err != nil {
		t.Fatalf("write index: %v", err)
	}
	assetsDir := filepath.Join(root, "assets")
	if err := os.Mkdir(assetsDir, 0o700); err != nil {
		t.Fatalf("mkdir assets: %v", err)
	}
	assetPath := filepath.Join(assetsDir, "app.js")
	if err := os.WriteFile(assetPath, []byte("console.log('ok')"), 0o600); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	resolved, ok := AssetPath(root, "/assets/app.js")
	if !ok {
		t.Fatalf("AssetPath did not find asset")
	}
	if resolved != assetPath {
		t.Fatalf("AssetPath resolved %q, expected %q", resolved, assetPath)
	}
}

func TestAssetPathMissingIndexReturnsFalse(t *testing.T) {
	resolved, ok := AssetPath(t.TempDir(), "/missing")
	if ok || resolved != "" {
		t.Fatalf("AssetPath resolved %q ok=%v", resolved, ok)
	}
}

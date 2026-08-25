package static

import (
	"os"
	"path/filepath"
	"strings"
)

func AssetPath(frontendDir string, requestPath string) (string, bool) {
	cleanRequestPath := "/" + strings.TrimPrefix(filepath.Clean("/"+requestPath), string(filepath.Separator))
	if cleanRequestPath == "/" {
		cleanRequestPath = "/index.html"
	}

	frontendRoot, err := filepath.Abs(frontendDir)
	if err != nil {
		return "", false
	}
	candidate := filepath.Join(frontendRoot, filepath.FromSlash(strings.TrimPrefix(cleanRequestPath, "/")))
	resolved, err := filepath.Abs(candidate)
	if err != nil {
		return "", false
	}
	if resolved != frontendRoot && !strings.HasPrefix(resolved, frontendRoot+string(filepath.Separator)) {
		return fallbackIndex(frontendRoot)
	}
	if info, err := os.Stat(resolved); err == nil && !info.IsDir() {
		return resolved, true
	}
	return fallbackIndex(frontendRoot)
}

func fallbackIndex(frontendRoot string) (string, bool) {
	indexPath := filepath.Join(frontendRoot, "index.html")
	if info, err := os.Stat(indexPath); err == nil && !info.IsDir() {
		return indexPath, true
	}
	return "", false
}

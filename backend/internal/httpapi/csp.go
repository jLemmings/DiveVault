package httpapi

import (
	"crypto/sha256"
	"encoding/base64"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// External origins the frontend loads resources from: satellite and
// topographic map tiles.
const mapTileOrigin = "https://server.arcgisonline.com"

var (
	inlineScriptPattern = regexp.MustCompile(`(?is)<script\b([^>]*)>(.*?)</script>`)
	scriptSrcPattern    = regexp.MustCompile(`(?i)\bsrc\s*=`)
	scriptTypePattern   = regexp.MustCompile(`(?i)\btype\s*=\s*["']?([^"'\s>]+)`)
)

// frontendCSP builds a Content-Security-Policy for generated HTML pages.
// Nuxt emits small inline bootstrap scripts, so their SHA-256 hashes are
// allowed explicitly instead of enabling 'unsafe-inline' for scripts.
type frontendCSP struct {
	mu    sync.Mutex
	cache map[string]cspCacheEntry
}

type cspCacheEntry struct {
	modTime time.Time
	size    int64
	policy  string
}

func newFrontendCSP() *frontendCSP {
	return &frontendCSP{cache: map[string]cspCacheEntry{}}
}

func (c *frontendCSP) policyFor(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return buildFrontendCSP(nil)
	}
	c.mu.Lock()
	entry, ok := c.cache[path]
	c.mu.Unlock()
	if ok && entry.modTime.Equal(info.ModTime()) && entry.size == info.Size() {
		return entry.policy
	}
	body, err := os.ReadFile(path)
	if err != nil {
		return buildFrontendCSP(nil)
	}
	policy := buildFrontendCSP(inlineScriptHashes(string(body)))
	c.mu.Lock()
	c.cache[path] = cspCacheEntry{modTime: info.ModTime(), size: info.Size(), policy: policy}
	c.mu.Unlock()
	return policy
}

func inlineScriptHashes(html string) []string {
	seen := map[string]bool{}
	for _, match := range inlineScriptPattern.FindAllStringSubmatch(html, -1) {
		attributes, content := match[1], match[2]
		if scriptSrcPattern.MatchString(attributes) || strings.TrimSpace(content) == "" {
			continue
		}
		if typeMatch := scriptTypePattern.FindStringSubmatch(attributes); typeMatch != nil {
			// Import maps are governed by script-src too; data blocks such
			// as application/json are never executed and need no hash.
			switch strings.ToLower(typeMatch[1]) {
			case "module", "text/javascript", "application/javascript", "importmap":
			default:
				continue
			}
		}
		digest := sha256.Sum256([]byte(content))
		seen["'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'"] = true
	}
	hashes := make([]string, 0, len(seen))
	for hash := range seen {
		hashes = append(hashes, hash)
	}
	sort.Strings(hashes)
	return hashes
}

func buildFrontendCSP(scriptHashes []string) string {
	scriptSrc := append([]string{"'self'"}, scriptHashes...)
	directives := []string{
		"default-src 'self'",
		"script-src " + strings.Join(scriptSrc, " "),
		// Vue and Leaflet set inline style attributes at runtime.
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: " + mapTileOrigin,
		"font-src 'self' data:",
		"connect-src 'self'",
		"worker-src 'self' blob:",
		"frame-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	}
	return strings.Join(directives, "; ")
}

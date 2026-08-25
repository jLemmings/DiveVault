package httpapi

import (
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

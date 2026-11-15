package httpapi

import (
	"sync"
	"time"
)

// maxRateLimitKeys bounds memory use under key-spraying (many source IPs).
const maxRateLimitKeys = 100_000

type fixedWindowLimiter struct {
	mu        sync.Mutex
	windows   map[string]rateWindow
	lastSweep time.Time
}

type rateWindow struct {
	ResetAt time.Time
	Count   int
}

func newFixedWindowLimiter() *fixedWindowLimiter {
	return &fixedWindowLimiter{windows: map[string]rateWindow{}}
}

func (l *fixedWindowLimiter) Allow(key string, limit int, windowSeconds int) (bool, int) {
	if l == nil || limit <= 0 {
		return true, 0
	}
	if windowSeconds <= 0 {
		windowSeconds = 60
	}
	window := time.Duration(windowSeconds) * time.Second
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweepLocked(now, window)
	entry := l.windows[key]
	if entry.ResetAt.IsZero() || !now.Before(entry.ResetAt) {
		entry = rateWindow{ResetAt: now.Add(window)}
	}
	entry.Count++
	l.windows[key] = entry
	if entry.Count <= limit {
		return true, 0
	}
	return false, max(1, int(entry.ResetAt.Sub(now).Seconds()))
}

// sweepLocked drops expired windows at most once per window, or immediately
// when the map grows past maxRateLimitKeys.
func (l *fixedWindowLimiter) sweepLocked(now time.Time, window time.Duration) {
	if len(l.windows) < maxRateLimitKeys && now.Sub(l.lastSweep) < window {
		return
	}
	l.lastSweep = now
	for key, entry := range l.windows {
		if !now.Before(entry.ResetAt) {
			delete(l.windows, key)
		}
	}
	if len(l.windows) >= maxRateLimitKeys {
		// Still full of live windows: reset rather than grow without bound.
		l.windows = map[string]rateWindow{}
	}
}

func (l *fixedWindowLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.windows)
}

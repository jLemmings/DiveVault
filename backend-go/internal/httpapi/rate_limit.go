package httpapi

import (
	"sync"
	"time"
)

type fixedWindowLimiter struct {
	mu      sync.Mutex
	windows map[string]rateWindow
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
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	window := l.windows[key]
	if window.ResetAt.IsZero() || !now.Before(window.ResetAt) {
		window = rateWindow{ResetAt: now.Add(time.Duration(windowSeconds) * time.Second)}
	}
	window.Count++
	l.windows[key] = window
	if window.Count <= limit {
		return true, 0
	}
	return false, max(1, int(time.Until(window.ResetAt).Seconds()))
}

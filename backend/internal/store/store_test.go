package store

import "testing"

func TestRedactDatabaseURL(t *testing.T) {
	cases := map[string]string{
		"postgresql://dive:secret@localhost:5432/dive": "postgresql://dive:***@localhost:5432/dive",
		"postgresql://localhost:5432/dive":            "postgresql://localhost:5432/dive",
		"":                                            "",
	}
	for input, expected := range cases {
		if got := RedactDatabaseURL(input); got != expected {
			t.Fatalf("RedactDatabaseURL(%q) = %q, expected %q", input, got, expected)
		}
	}
}

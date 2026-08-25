package auth

import "testing"

func TestNormalizeBearerToken(t *testing.T) {
	cases := map[string]string{
		"":                    "",
		" token ":             "token",
		"Bearer token":        "token",
		"bearer token":        "token",
		`"Bearer token"`:      "token",
		"'Bearer token'":      "token",
		"Bearer    spaced":    "spaced",
		"Bearer quoted token": "quoted token",
	}
	for input, expected := range cases {
		if actual := NormalizeBearerToken(input); actual != expected {
			t.Fatalf("NormalizeBearerToken(%q) = %q, expected %q", input, actual, expected)
		}
	}
}

func TestVerifyPasswordAcceptsScryptHash(t *testing.T) {
	salt := []byte{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15}
	hash, err := hashPasswordWithSalt("password123", salt)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	if !VerifyPassword("password123", hash) {
		t.Fatalf("expected scrypt hash to verify")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatalf("expected wrong password to fail")
	}
}

package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/jlemmings/divevault/backend/internal/auth"
	"github.com/jlemmings/divevault/backend/internal/store"
)

type fakeResetStore struct {
	users map[string]*store.AuthUser
}

func (f *fakeResetStore) GetAuthUserByEmail(_ context.Context, email string) (*store.AuthUser, error) {
	for _, user := range f.users {
		if user.Email == email {
			copy := *user
			return &copy, nil
		}
	}
	return nil, nil
}

func (f *fakeResetStore) UpdateAuthUser(_ context.Context, userID string, patch store.AuthUserPatch) (*store.AuthUser, error) {
	user := f.users[userID]
	if user == nil {
		return nil, nil
	}
	if patch.PasswordHash != nil {
		user.PasswordHash = *patch.PasswordHash
		user.TokenVersion++
	}
	if patch.IsActive != nil {
		user.IsActive = *patch.IsActive
	}
	copy := *user
	return &copy, nil
}

func TestResetPasswordStoresVerifiableHash(t *testing.T) {
	db := &fakeResetStore{users: map[string]*store.AuthUser{
		"user_1": {ID: "user_1", Email: "diver@example.test", PasswordHash: "scrypt$00$00", IsActive: false},
	}}
	updated, err := resetPassword(context.Background(), db, "diver@example.test", "new-password-1", true)
	if err != nil {
		t.Fatalf("resetPassword: %v", err)
	}
	if !auth.VerifyPassword("new-password-1", db.users["user_1"].PasswordHash) {
		t.Fatalf("stored hash does not verify the new password")
	}
	if updated.TokenVersion != 1 || !updated.IsActive {
		t.Fatalf("expected token version bump and reactivation, got %+v", updated)
	}
}

func TestResetPasswordUnknownEmail(t *testing.T) {
	db := &fakeResetStore{users: map[string]*store.AuthUser{}}
	if _, err := resetPassword(context.Background(), db, "missing@example.test", "new-password-1", false); err == nil {
		t.Fatalf("expected an error for an unknown email")
	}
}

func TestParseResetPasswordArgs(t *testing.T) {
	var stderr bytes.Buffer
	options, err := parseResetPasswordArgs([]string{"--email", " Diver@Example.TEST ", "--password-stdin"}, &stderr)
	if err != nil || options.email != "diver@example.test" || !options.passwordStdin {
		t.Fatalf("options=%+v err=%v", options, err)
	}
	if _, err := parseResetPasswordArgs([]string{}, &stderr); err == nil {
		t.Fatalf("expected --email to be required")
	}
	if _, err := parseResetPasswordArgs([]string{"--email", "a@b.c", "extra"}, &stderr); err == nil {
		t.Fatalf("expected positional arguments to be rejected")
	}
}

func TestReadPassword(t *testing.T) {
	password, generated, err := readPassword(resetPasswordOptions{}, nil)
	if err != nil || !generated || len(password) < 20 {
		t.Fatalf("generated password=%q generated=%v err=%v", password, generated, err)
	}
	password, generated, err = readPassword(resetPasswordOptions{passwordStdin: true}, strings.NewReader("from-stdin-123\r\nignored\n"))
	if err != nil || generated || password != "from-stdin-123" {
		t.Fatalf("stdin password=%q generated=%v err=%v", password, generated, err)
	}
	if _, _, err := readPassword(resetPasswordOptions{passwordStdin: true}, strings.NewReader("short\n")); err == nil {
		t.Fatalf("expected short password to be rejected")
	}
}

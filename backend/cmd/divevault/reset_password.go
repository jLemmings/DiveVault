package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend/internal/auth"
	"github.com/jlemmings/divevault/backend/internal/config"
	"github.com/jlemmings/divevault/backend/internal/migrations"
	"github.com/jlemmings/divevault/backend/internal/store"
)

const resetPasswordUsage = `Usage: divevault reset-password --email <email> [--password-stdin] [--activate] [--database-url <url>]

Sets a new password for an existing account. By default a strong random
password is generated and printed once. With --password-stdin the new
password is read from the first line of standard input instead, so it never
appears in the shell history or process list.

All existing sessions and desktop sync tokens of the account are revoked.
DATABASE_URL is read from the environment or the repository .env file.
`

const (
	minPasswordLength      = 8
	maxPasswordLength      = 1024
	generatedPasswordBytes = 18
)

// passwordResetStore is the subset of the store used by the reset command.
type passwordResetStore interface {
	GetAuthUserByEmail(ctx context.Context, email string) (*store.AuthUser, error)
	UpdateAuthUser(ctx context.Context, userID string, patch store.AuthUserPatch) (*store.AuthUser, error)
}

type resetPasswordOptions struct {
	email         string
	passwordStdin bool
	activate      bool
	databaseURL   string
}

func parseResetPasswordArgs(args []string, stderr io.Writer) (resetPasswordOptions, error) {
	var options resetPasswordOptions
	flags := flag.NewFlagSet("reset-password", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.Usage = func() { fmt.Fprint(stderr, resetPasswordUsage) }
	flags.StringVar(&options.email, "email", "", "Email address of the account")
	flags.BoolVar(&options.passwordStdin, "password-stdin", false, "Read the new password from standard input")
	flags.BoolVar(&options.activate, "activate", false, "Also reactivate the account if it was deactivated")
	flags.StringVar(&options.databaseURL, "database-url", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	if err := flags.Parse(args); err != nil {
		return options, err
	}
	if flags.NArg() > 0 {
		return options, fmt.Errorf("unexpected argument %q", flags.Arg(0))
	}
	options.email = strings.ToLower(strings.TrimSpace(options.email))
	if options.email == "" {
		return options, errors.New("--email is required")
	}
	return options, nil
}

// readPassword returns the new password: the first stdin line with
// --password-stdin, otherwise a freshly generated random password.
func readPassword(options resetPasswordOptions, stdin io.Reader) (password string, generated bool, err error) {
	if !options.passwordStdin {
		buffer := make([]byte, generatedPasswordBytes)
		if _, err := rand.Read(buffer); err != nil {
			return "", false, err
		}
		return base64.RawURLEncoding.EncodeToString(buffer), true, nil
	}
	line, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", false, err
	}
	password = strings.TrimRight(line, "\r\n")
	if len(password) < minPasswordLength {
		return "", false, fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}
	if len(password) > maxPasswordLength {
		return "", false, fmt.Errorf("password must be at most %d characters", maxPasswordLength)
	}
	return password, false, nil
}

// resetPassword stores a new password hash for the account. UpdateAuthUser
// bumps the token version, which revokes existing sessions and sync tokens.
func resetPassword(ctx context.Context, db passwordResetStore, email string, password string, activate bool) (*store.AuthUser, error) {
	user, err := db.GetAuthUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("no account with email %q", email)
	}
	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	patch := store.AuthUserPatch{PasswordHash: &passwordHash}
	if activate {
		active := true
		patch.IsActive = &active
	}
	updated, err := db.UpdateAuthUser(ctx, user.ID, patch)
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, fmt.Errorf("account %q disappeared during the update", email)
	}
	return updated, nil
}

func runResetPassword(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	options, err := parseResetPasswordArgs(args, stderr)
	if errors.Is(err, flag.ErrHelp) {
		return 0
	}
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: %v\n\n%s", err, resetPasswordUsage)
		return 2
	}
	cfg, err := config.Load(nil)
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: configuration failed: %v\n", err)
		return 2
	}
	if options.databaseURL != "" {
		cfg.DatabaseURL = options.databaseURL
	}
	if cfg.DatabaseURL == "" {
		fmt.Fprintln(stderr, "reset-password: DATABASE_URL is not configured (set it or pass --database-url)")
		return 2
	}
	password, generated, err := readPassword(options, stdin)
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: %v\n", err)
		return 2
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	db, err := store.OpenPool(ctx, cfg.DatabaseURL, 1)
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: cannot open database %s: %v\n", store.RedactDatabaseURL(cfg.DatabaseURL), err)
		return 1
	}
	defer db.Close()
	version, err := migrations.SchemaVersion(ctx, db)
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: cannot reach database %s: %v\n", store.RedactDatabaseURL(cfg.DatabaseURL), err)
		return 1
	}
	if version != migrations.CurrentSchemaVersion {
		fmt.Fprintf(stderr, "reset-password: database schema is v%d, expected v%d; run `divevault migrate` first\n", version, migrations.CurrentSchemaVersion)
		return 1
	}

	user, err := resetPassword(ctx, db, options.email, password, options.activate)
	if err != nil {
		fmt.Fprintf(stderr, "reset-password: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Password reset for %s. Existing sessions and desktop sync tokens were revoked.\n", user.Email)
	if !user.IsActive {
		fmt.Fprintln(stdout, "Note: this account is deactivated; rerun with --activate to allow sign-in.")
	}
	if generated {
		fmt.Fprintf(stdout, "New password: %s\n", password)
	}
	return 0
}

package store

import "errors"

// ValidationError marks an error caused by invalid client input. Its message
// is safe to return to API clients.
type ValidationError struct {
	Message string
}

func (e ValidationError) Error() string {
	return e.Message
}

// IsValidationError reports whether err is (or wraps) a ValidationError.
func IsValidationError(err error) bool {
	var target ValidationError
	return errors.As(err, &target)
}

// IsInvalidDataError reports whether err is a PostgreSQL data exception or
// integrity constraint violation (SQLSTATE classes 22 and 23), which are
// caused by request data rather than an unavailable database.
func IsInvalidDataError(err error) bool {
	var pgErr interface{ SQLState() string }
	if !errors.As(err, &pgErr) {
		return false
	}
	state := pgErr.SQLState()
	return len(state) == 5 && (state[:2] == "22" || state[:2] == "23")
}

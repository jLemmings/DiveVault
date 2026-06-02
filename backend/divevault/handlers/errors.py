from __future__ import annotations


class AppError(Exception):
    status = 500
    message = "Internal server error"

    def __init__(self, message: str | None = None, *, status: int | None = None, headers: dict[str, str] | None = None) -> None:
        super().__init__(message or self.message)
        if status is not None:
            self.status = status
        self.message = message or self.message
        self.headers = headers or {}


class BadRequest(AppError):
    status = 400
    message = "Bad request"


class Unauthorized(AppError):
    status = 401
    message = "Unauthorized"


class Forbidden(AppError):
    status = 403
    message = "Forbidden"


class NotFound(AppError):
    status = 404
    message = "Not found"


class MethodNotAllowed(AppError):
    status = 405
    message = "Method not allowed"


class PayloadTooLarge(AppError):
    status = 413
    message = "Request body is too large"


class UnsupportedMediaType(AppError):
    status = 415
    message = "Unsupported media type"


class TooManyRequests(AppError):
    status = 429
    message = "Rate limit exceeded. Please retry later."


class ServiceUnavailable(AppError):
    status = 503
    message = "Service unavailable"


def send_error(handler, error: AppError) -> None:
    handler._send_json(error.status, {"error": error.message}, extra_headers=error.headers)

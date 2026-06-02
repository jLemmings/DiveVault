from __future__ import annotations

from divevault.postgres_store import (
    approve_cli_sync_request,
    create_cli_sync_request,
    get_cli_sync_request_status,
    open_db,
    verify_cli_sync_token,
)


class CliSyncRepository:
    def __init__(self, database_url: str | None) -> None:
        self.database_url = database_url.strip() if database_url else None

    def open_connection(self):
        if not self.database_url:
            raise RuntimeError("CLI sync database persistence is not configured")
        return open_db(self.database_url)

    def create_request(self, conn, **kwargs) -> dict:
        return create_cli_sync_request(conn, **kwargs)

    def get_request_status(self, conn, code: str, **kwargs) -> dict | None:
        return get_cli_sync_request_status(conn, code, **kwargs)

    def approve_request(self, conn, code: str, claims: dict, **kwargs) -> dict | None:
        return approve_cli_sync_request(conn, code, claims, **kwargs)

    def verify_token(self, conn, token: str, **kwargs) -> dict | None:
        return verify_cli_sync_token(conn, token, **kwargs)


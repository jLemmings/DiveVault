from __future__ import annotations


class PooledConnectionProxy:
    def __init__(self, pool) -> None:
        self._pool = pool
        self._conn = pool.getconn()
        self._closed = False

    def __getattr__(self, name: str):
        return getattr(self._conn, name)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._pool.putconn(self._conn)

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        self.close()

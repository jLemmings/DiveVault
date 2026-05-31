from __future__ import annotations

import logging


LOGGER = logging.getLogger("dive_backend")


def handle_get(handler, path: str, query: dict[str, list[str]]) -> bool:
    if path != "/api/geocode/search":
        return False

    user_id = handler._require_principal_id()
    if user_id is None:
        return True

    query_value = handler._single_query_arg(query, "q")
    if not query_value or not query_value.strip():
        handler._send_json(400, {"error": "Missing q query parameter"})
        return True

    try:
        result = handler.server.nominatim_client.search(query_value)
    except ValueError as exc:
        handler._send_json(400, {"error": str(exc)})
        return True
    except RuntimeError as exc:
        handler._send_json(503, {"error": str(exc)})
        return True

    LOGGER.info("Completed geocode lookup user_id=%s query=%s found=%s", user_id, query_value, result.get("found"))
    handler._send_json(200, result)
    return True

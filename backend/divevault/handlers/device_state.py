from __future__ import annotations

import logging


LOGGER = logging.getLogger("dive_backend")


def handle_get(handler, _match, _parsed, query: dict[str, list[str]], *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    vendor = handler._single_query_arg(query, "vendor")
    product = handler._single_query_arg(query, "product")
    if not vendor or not product:
        handler._send_json(400, {"error": "vendor and product are required"})
        return

    with handler._db() as conn:
        state = deps.get_device_state(conn, user_id, vendor, product)

    LOGGER.info(
        "Returned device state user_id=%s vendor=%s product=%s fingerprint=%s",
        user_id,
        vendor,
        product,
        state.get("fingerprint_hex"),
    )
    handler._send_json(200, state)


def handle_put(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return

    payload = handler._read_json_body()
    if payload is None:
        return

    vendor = payload.get("vendor")
    product = payload.get("product")
    if not vendor or not product:
        LOGGER.warning("Rejected device-state update missing vendor/product")
        handler._send_json(400, {"error": "vendor and product are required"})
        return

    with handler._db() as conn:
        deps.save_device_state(conn, user_id, vendor, product, payload.get("fingerprint_hex"))
        state = deps.get_device_state(conn, user_id, vendor, product)

    LOGGER.info(
        "Processed device-state update user_id=%s vendor=%s product=%s fingerprint=%s",
        user_id,
        vendor,
        product,
        state.get("fingerprint_hex"),
    )
    handler._send_json(200, state)

from __future__ import annotations

import logging


LOGGER = logging.getLogger("dive_backend")


def handle_list(handler, _match, _parsed, query: dict[str, list[str]], *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    include_samples = handler._is_truthy(query.get("include_samples", ["0"])[0])
    include_raw_data = handler._is_truthy(query.get("include_raw_data", ["0"])[0])
    limit = handler._parse_int(
        query.get("limit", ["100"])[0],
        default=100,
        max_value=getattr(handler.server, "max_list_limit", 200),
    )
    offset = handler._parse_int(query.get("offset", ["0"])[0], default=0)

    with handler._db() as conn:
        dives, total = deps.list_dives(conn, user_id, include_samples, include_raw_data, limit, offset)

    LOGGER.info(
        "Returned dives user_id=%s count=%d total=%d include_samples=%s include_raw_data=%s limit=%d offset=%d",
        user_id,
        len(dives),
        total,
        include_samples,
        include_raw_data,
        limit,
        offset,
    )
    handler._send_json(
        200,
        {
            "dives": dives,
            "stats": deps.summarize_dives(
                [dive for dive in dives if deps.is_logbook_complete(dive.get("fields", {}).get("logbook"))],
                sum(1 for dive in dives if deps.is_logbook_complete(dive.get("fields", {}).get("logbook"))),
            ),
            "imported_count": sum(1 for dive in dives if not deps.is_logbook_complete(dive.get("fields", {}).get("logbook"))),
            "limit": limit,
            "offset": offset,
            "total": total,
        },
    )


def handle_get_one(handler, match, _parsed, query: dict[str, list[str]], *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    dive_id = int(match.group(1))
    include_raw_data = handler._is_truthy(query.get("include_raw_data", ["0"])[0])

    with handler._db() as conn:
        dive = deps.get_dive(conn, user_id, dive_id, include_raw_data)

    if not dive:
        LOGGER.warning("Dive not found id=%d", dive_id)
        handler._send_json(404, {"error": "Dive not found"})
        return

    LOGGER.info("Returned dive user_id=%s id=%d include_raw_data=%s", user_id, dive_id, include_raw_data)
    handler._send_json(200, dive)


def handle_create(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    if not handler._enforce_rate_limit("dive_upload"):
        return

    payload = handler._read_json_body()
    if payload is None:
        return

    missing = [
        key
        for key in ("vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64")
        if not payload.get(key)
    ]
    if missing:
        LOGGER.warning("Rejected dive upload missing=%s", ",".join(missing))
        handler._send_json(400, {"error": f"Missing required fields: {', '.join(missing)}"})
        return

    with handler._db() as conn:
        try:
            inserted = deps.insert_dive_record(conn, user_id, payload)
        except ValueError as exc:
            LOGGER.warning("Rejected dive upload invalid base64 uid=%s", payload.get("dive_uid"))
            handler._send_json(400, {"error": str(exc)})
            return
        dive_id = deps.get_dive_id_by_uid(conn, user_id, payload["dive_uid"])

    LOGGER.info(
        "Processed dive upload user_id=%s uid=%s inserted=%s id=%s",
        user_id,
        payload["dive_uid"],
        inserted,
        dive_id,
    )
    handler._send_json(201 if inserted else 200, {"inserted": inserted, "id": dive_id})


def handle_update_logbook(handler, match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    payload = handler._read_json_body()
    if payload is None:
        return

    dive_id = int(match.group(1))
    with handler._db() as conn:
        try:
            dive = deps.update_dive_logbook(conn, user_id, dive_id, payload)
        except ValueError as exc:
            handler._send_json(400, {"error": str(exc)})
            return

    if not dive:
        LOGGER.warning("Dive not found for logbook update id=%d", dive_id)
        handler._send_json(404, {"error": "Dive not found"})
        return

    LOGGER.info(
        "Updated dive logbook user_id=%s id=%d status=%s",
        user_id,
        dive_id,
        dive.get("fields", {}).get("logbook", {}).get("status"),
    )
    handler._send_json(200, dive)


def handle_delete(handler, match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return

    dive_id = int(match.group(1))
    with handler._db() as conn:
        deleted = deps.delete_dive(conn, user_id, dive_id)

    if not deleted:
        LOGGER.warning("Dive not found for delete id=%d", dive_id)
        handler._send_json(404, {"error": "Dive not found"})
        return

    LOGGER.info("Deleted dive user_id=%s id=%d", user_id, dive_id)
    handler._send_json(200, {"deleted": True, "id": dive_id})

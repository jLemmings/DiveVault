from __future__ import annotations


def handle_get(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    with handler._db() as conn:
        equipment = deps.list_user_equipment(conn, user_id)
    handler._send_json(200, {"equipment": equipment})


def handle_put(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    payload = handler._read_json_body()
    if payload is None:
        return
    equipment_entries = payload.get("equipment") if isinstance(payload, dict) else None
    with handler._db() as conn:
        equipment = deps.save_user_equipment(conn, user_id, equipment_entries)
    handler._send_json(200, {"equipment": equipment})


def handle_mark_serviced(handler, match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return
    equipment_id = match.group(1)
    with handler._db() as conn:
        equipment = deps.mark_equipment_serviced(conn, user_id, equipment_id)
    if equipment is None:
        handler._send_json(404, {"error": "Equipment item not found"})
        return
    handler._send_json(200, {"equipment": equipment})

from __future__ import annotations

import logging


LOGGER = logging.getLogger("dive_backend")


def handle_dives_csv(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return

    with handler._db() as conn:
        dives = deps.list_all_dives(conn, user_id, include_samples=True, include_raw_data=False)

    filename = deps.attachment_filename(f"divevault-dives-{deps.timestamp_slug()}.csv")
    LOGGER.info("Returned dive CSV export user_id=%s dives=%d filename=%s", user_id, len(dives), filename)
    handler._send_bytes(
        200,
        deps.build_dives_csv(dives),
        "text/csv; charset=utf-8",
        extra_headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def handle_dives_pdf(handler, _match, _parsed, _query, *, deps) -> None:
    user_id = handler._require_principal_id()
    if user_id is None:
        return

    with handler._db() as conn:
        dives = deps.list_all_dives(conn, user_id, include_samples=True, include_raw_data=False)

    filename = deps.attachment_filename(f"divevault-dives-{deps.timestamp_slug()}.pdf")
    LOGGER.info("Returned dive PDF export user_id=%s dives=%d filename=%s", user_id, len(dives), filename)
    handler._send_bytes(
        200,
        deps.build_pdf_document(dives),
        "application/pdf",
        extra_headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )

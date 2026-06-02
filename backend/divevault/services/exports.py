from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from io import StringIO


PDF_PAGE_WIDTH = 612
PDF_PAGE_HEIGHT = 792
PDF_MARGIN_LEFT = 48
PDF_MARGIN_TOP = 744
PDF_MARGIN_BOTTOM = 48
PDF_TEXT_RE = re.compile(r"[^\x20-\x7E]")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def timestamp_slug(value: datetime | None = None) -> str:
    moment = value or now_utc()
    return moment.strftime("%Y%m%d-%H%M%S")


def attachment_filename(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", value or "").strip("-.")
    return sanitized or "download"


def json_compact(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def format_export_datetime(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return "Unknown"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def format_duration_label(duration_seconds: object) -> str:
    if not isinstance(duration_seconds, (int, float)):
        return "Unknown"
    total_seconds = max(int(round(float(duration_seconds))), 0)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    if minutes:
        return f"{minutes}m {seconds:02d}s"
    return f"{seconds}s"


def format_depth_label(depth_m: object) -> str:
    if not isinstance(depth_m, (int, float)):
        return "Unknown"
    return f"{float(depth_m):.1f} m"


def pdf_text(value: object) -> str:
    text = str(value or "")
    text = PDF_TEXT_RE.sub("?", text)
    text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return text


def wrap_pdf_text(value: object, width: int = 88) -> list[str]:
    text = PDF_TEXT_RE.sub("?", str(value or "")).strip()
    if not text:
        return []
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
    if current:
        lines.append(current)
    return lines


def csv_export_rows(dives: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for dive in dives:
        logbook = dive.get("fields", {}).get("logbook") if isinstance(dive.get("fields"), dict) else {}
        logbook = logbook if isinstance(logbook, dict) else {}
        base_row = {
            "dive_id": dive.get("id"),
            "dive_uid": dive.get("dive_uid"),
            "status": logbook.get("status") or "imported",
            "site": logbook.get("site") or "",
            "buddy": logbook.get("buddy") or "",
            "guide": logbook.get("guide") or "",
            "weather_description": logbook.get("weather_description") or "",
            "visibility": logbook.get("visibility") or "",
            "wetsuit_description": logbook.get("wetsuit_description") or "",
            "weight_description": logbook.get("weight_description") or "",
            "notes": logbook.get("notes") or "",
            "vendor": dive.get("vendor") or "",
            "product": dive.get("product") or "",
            "started_at": dive.get("started_at") or "",
            "imported_at": dive.get("imported_at") or "",
            "duration_seconds": dive.get("duration_seconds") or "",
            "max_depth_m": dive.get("max_depth_m") or "",
            "avg_depth_m": dive.get("avg_depth_m") or "",
            "raw_sha256": dive.get("raw_sha256") or "",
            "sample_count": dive.get("sample_count") or 0,
        }
        samples = dive.get("samples") if isinstance(dive.get("samples"), list) else []
        if not samples:
            rows.append(
                {
                    **base_row,
                    "sample_index": "",
                    "sample_time_seconds": "",
                    "sample_depth_m": "",
                    "sample_temperature_c": "",
                    "sample_tank_pressure_bar": "",
                    "sample_payload_json": "",
                }
            )
            continue

        for index, sample in enumerate(samples):
            sample_dict = sample if isinstance(sample, dict) else {}
            tank_pressure = sample_dict.get("tank_pressure_bar")
            if isinstance(tank_pressure, dict):
                tank_pressure = tank_pressure.get("tank_0")
            rows.append(
                {
                    **base_row,
                    "sample_index": index,
                    "sample_time_seconds": sample_dict.get("time_seconds", ""),
                    "sample_depth_m": sample_dict.get("depth_m", ""),
                    "sample_temperature_c": sample_dict.get("temperature_c", ""),
                    "sample_tank_pressure_bar": tank_pressure if tank_pressure is not None else "",
                    "sample_payload_json": json_compact(sample_dict),
                }
            )
    return rows


def build_dives_csv(dives: list[dict]) -> bytes:
    fieldnames = [
        "dive_id",
        "dive_uid",
        "status",
        "site",
        "buddy",
        "guide",
        "weather_description",
        "visibility",
        "wetsuit_description",
        "weight_description",
        "notes",
        "vendor",
        "product",
        "started_at",
        "imported_at",
        "duration_seconds",
        "max_depth_m",
        "avg_depth_m",
        "raw_sha256",
        "sample_count",
        "sample_index",
        "sample_time_seconds",
        "sample_depth_m",
        "sample_temperature_c",
        "sample_tank_pressure_bar",
        "sample_payload_json",
    ]
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in csv_export_rows(dives):
        writer.writerow(row)
    return buffer.getvalue().encode("utf-8")


def build_pdf_lines(dives: list[dict], *, generated_at: datetime) -> list[dict]:
    lines = [
        {"text": "DiveVault Logbook Export", "font": "F2", "size": 20, "gap": 10},
        {"text": f"Generated {generated_at.strftime('%Y-%m-%d %H:%M UTC')}", "font": "F1", "size": 10, "gap": 4},
        {"text": f"{len(dives)} dives included", "font": "F1", "size": 10, "gap": 12},
    ]
    if not dives:
        lines.append({"text": "No dives available for export.", "font": "F1", "size": 12, "gap": 12})
        return lines

    for index, dive in enumerate(dives, start=1):
        logbook = dive.get("fields", {}).get("logbook") if isinstance(dive.get("fields"), dict) else {}
        logbook = logbook if isinstance(logbook, dict) else {}
        site = logbook.get("site") or "Unassigned site"
        title = f"{index}. {site}"
        started_at = format_export_datetime(dive.get("started_at"))
        status = (logbook.get("status") or "imported").upper()
        lines.append({"text": title, "font": "F2", "size": 12, "gap": 4})
        lines.append({"text": f"{started_at} | Status {status}", "font": "F1", "size": 10, "gap": 4})
        lines.append(
            {
                "text": (
                    f"{dive.get('vendor') or 'Unknown'} {dive.get('product') or ''} | "
                    f"Depth {format_depth_label(dive.get('max_depth_m'))} | "
                    f"Duration {format_duration_label(dive.get('duration_seconds'))} | "
                    f"Samples {dive.get('sample_count') or 0}"
                ),
                "font": "F1",
                "size": 10,
                "gap": 4,
            }
        )
        lines.append(
            {
                "text": f"Buddy {logbook.get('buddy') or '-'} | Guide {logbook.get('guide') or '-'}",
                "font": "F1",
                "size": 10,
                "gap": 4,
            }
        )
        optional_details = [
            ("Weather", logbook.get("weather_description")),
            ("Visibility", logbook.get("visibility")),
            ("Wetsuit", logbook.get("wetsuit_description")),
            ("Weights", logbook.get("weight_description")),
        ]
        detail_text = " | ".join(
            f"{label} {value.strip()}"
            for label, value in optional_details
            if isinstance(value, str) and value.strip()
        )
        if detail_text:
            for detail_line in wrap_pdf_text(detail_text, width=92)[:2]:
                lines.append({"text": detail_line, "font": "F1", "size": 10, "gap": 4})
        notes = logbook.get("notes")
        if isinstance(notes, str) and notes.strip():
            wrapped_notes = wrap_pdf_text(f"Notes: {notes.strip()}", width=92)[:3]
            for note_line in wrapped_notes:
                lines.append({"text": note_line, "font": "F1", "size": 10, "gap": 4})
        lines.append({"text": "", "font": "F1", "size": 8, "gap": 8})
    return lines


def paginate_pdf_lines(lines: list[dict]) -> list[list[dict]]:
    pages: list[list[dict]] = []
    current_page: list[dict] = []
    y_cursor = PDF_MARGIN_TOP

    for line in lines:
        required = int(line.get("size", 10)) + int(line.get("gap", 4))
        if current_page and y_cursor - required < PDF_MARGIN_BOTTOM:
            pages.append(current_page)
            current_page = []
            y_cursor = PDF_MARGIN_TOP
        current_page.append(line)
        y_cursor -= required

    if current_page:
        pages.append(current_page)
    return pages or [[{"text": "No dives available for export.", "font": "F1", "size": 12, "gap": 12}]]


def build_pdf_stream(page_lines: list[dict]) -> bytes:
    commands: list[str] = []
    y_cursor = PDF_MARGIN_TOP
    for line in page_lines:
        size = int(line.get("size", 10))
        gap = int(line.get("gap", 4))
        text = pdf_text(line.get("text") or " ")
        font = line.get("font") or "F1"
        commands.append(f"BT /{font} {size} Tf 1 0 0 1 {PDF_MARGIN_LEFT} {y_cursor} Tm ({text}) Tj ET")
        y_cursor -= size + gap
    return "\n".join(commands).encode("latin-1", errors="replace")


def build_pdf_document(dives: list[dict]) -> bytes:
    generated_at = now_utc()
    pages = paginate_pdf_lines(build_pdf_lines(dives, generated_at=generated_at))
    objects: list[bytes] = []

    def add_object(body: bytes | str) -> int:
        body_bytes = body.encode("latin-1") if isinstance(body, str) else body
        objects.append(body_bytes)
        return len(objects)

    add_object("<< /Type /Catalog /Pages 2 0 R >>")
    add_object("<< /Type /Pages /Kids [] /Count 0 >>")
    font_regular_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids: list[int] = []
    for page_lines in pages:
        stream = build_pdf_stream(page_lines)
        stream_id = add_object(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        page_id = add_object(
            (
                f"<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {PDF_PAGE_WIDTH} {PDF_PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
                f"/Contents {stream_id} 0 R >>"
            ).encode("latin-1")
        )
        page_ids.append(page_id)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("latin-1")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("latin-1"))
        output.extend(body)
        output.extend(b"\nendobj\n")

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("latin-1")
    )
    return bytes(output)


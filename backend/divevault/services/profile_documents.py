from __future__ import annotations

import base64
import binascii


MAX_PROFILE_LICENSE_BYTES = 10 * 1024 * 1024


def sanitize_profile_license_filename(value: object) -> str:
    if not isinstance(value, str):
        return "diving-licenses.pdf"
    filename = value.replace("\\", "/").split("/")[-1].strip()
    if not filename:
        return "diving-licenses.pdf"
    return filename if filename.lower().endswith(".pdf") else f"{filename}.pdf"


def decode_profile_license_payload(payload: dict | None) -> tuple[str, str, bytes]:
    source = payload if isinstance(payload, dict) else {}
    data_b64 = source.get("data_b64")
    if not isinstance(data_b64, str) or not data_b64.strip():
        raise ValueError("License PDF upload requires data_b64")

    try:
        pdf_bytes = base64.b64decode(data_b64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("License PDF must be valid base64") from exc

    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("License file must be a PDF")
    if len(pdf_bytes) > MAX_PROFILE_LICENSE_BYTES:
        raise ValueError(f"License PDF must be {MAX_PROFILE_LICENSE_BYTES // (1024 * 1024)} MB or smaller")

    content_type = (source.get("content_type") or "application/pdf").strip().lower()
    if content_type != "application/pdf":
        raise ValueError("License file must use content_type application/pdf")

    return sanitize_profile_license_filename(source.get("filename")), "application/pdf", pdf_bytes

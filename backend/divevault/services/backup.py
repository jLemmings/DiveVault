from __future__ import annotations

import base64
import binascii
import json
import re
import zipfile
from io import BytesIO
from pathlib import Path

from divevault.repositories.backup import DEFAULT_BACKUP_REPOSITORY
from divevault.services.exports import now_utc
from divevault.services.importers import read_zip_member_limited
from divevault.services.profile_documents import sanitize_profile_license_filename


BACKUP_EXPORT_VERSION = 1
BACKUP_MANIFEST_FILENAME = "backup.json"


def _backup_repository(repo=None):
    return repo or DEFAULT_BACKUP_REPOSITORY


def profile_license_documents(conn, user_id: str, profile: dict, *, repo=None) -> list[dict]:
    repository = _backup_repository(repo)
    documents: list[dict] = []
    for license_entry in profile.get("licenses") or []:
        if not isinstance(license_entry, dict) or not license_entry.get("pdf"):
            continue
        license_id = license_entry.get("id")
        if not isinstance(license_id, str) or not license_id:
            continue
        license_pdf = repository.get_user_profile_license_pdf(conn, user_id, license_id)
        if not license_pdf:
            continue
        documents.append(
            {
                "license_id": license_id,
                "filename": license_pdf["filename"],
                "content_type": license_pdf["content_type"],
                "uploaded_at": license_pdf.get("uploaded_at"),
                "data_b64": base64.b64encode(license_pdf["data"]).decode("ascii"),
            }
        )
    return documents


def build_backup_payload(conn, user_id: str, *, repo=None) -> dict:
    repository = _backup_repository(repo)
    profile = repository.get_user_profile(conn, user_id)
    return {
        "version": BACKUP_EXPORT_VERSION,
        "app": "DiveVault",
        "exported_at": now_utc().isoformat(),
        "source_user_id": user_id,
        "profile": profile,
        "equipment": repository.list_user_equipment(conn, user_id),
        "license_documents": profile_license_documents(conn, user_id, profile, repo=repository),
        "device_states": repository.list_device_states(conn, user_id),
        "dives": repository.list_all_dives(conn, user_id, include_samples=True, include_raw_data=True),
    }


def backup_archive_license_path(license_id: str, filename: str, used_paths: set[str]) -> str:
    safe_license_id = re.sub(r"[^A-Za-z0-9_-]+", "-", license_id).strip("-") or "license"
    safe_filename = sanitize_profile_license_filename(filename)
    base_path = f"licenses/{safe_license_id}/{safe_filename}"
    path = base_path
    suffix = 2
    while path in used_paths:
        stem = Path(safe_filename).stem or "license"
        extension = Path(safe_filename).suffix or ".pdf"
        path = f"licenses/{safe_license_id}/{stem}-{suffix}{extension}"
        suffix += 1
    used_paths.add(path)
    return path


def build_backup_archive(payload: dict) -> bytes:
    manifest = dict(payload)
    license_documents: list[dict] = []
    files: list[tuple[str, bytes]] = []
    used_paths: set[str] = set()

    for entry in payload.get("license_documents") or []:
        if not isinstance(entry, dict):
            continue
        data_b64 = entry.get("data_b64")
        if not isinstance(data_b64, str) or not data_b64:
            continue
        try:
            pdf_bytes = base64.b64decode(data_b64, validate=True)
        except (ValueError, binascii.Error):
            continue
        license_id = str(entry.get("license_id") or "").strip()
        if not license_id:
            continue
        file_path = backup_archive_license_path(license_id, entry.get("filename") or "license.pdf", used_paths)
        document = {key: value for key, value in entry.items() if key != "data_b64"}
        document["file_path"] = file_path
        license_documents.append(document)
        files.append((file_path, pdf_bytes))

    manifest["license_documents"] = license_documents

    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            BACKUP_MANIFEST_FILENAME,
            json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8"),
        )
        for file_path, pdf_bytes in files:
            archive.writestr(file_path, pdf_bytes)
    return output.getvalue()


def is_safe_backup_member_path(path: str) -> bool:
    if not isinstance(path, str) or not path or path.startswith(("/", "\\")):
        return False
    normalized = Path(path)
    return not normalized.is_absolute() and ".." not in normalized.parts


def parse_backup_archive(archive_bytes: bytes, *, max_uncompressed_bytes: int) -> dict:
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes), "r") as archive:
            infos = archive.infolist()
            if sum(info.file_size for info in infos) > max_uncompressed_bytes:
                raise ValueError(f"Backup archive exceeds {max_uncompressed_bytes} byte uncompressed limit")
            names = {info.filename for info in infos}
            if BACKUP_MANIFEST_FILENAME not in names:
                raise ValueError(f"Backup archive is missing {BACKUP_MANIFEST_FILENAME}")
            for name in names:
                if not is_safe_backup_member_path(name):
                    raise ValueError(f"Backup archive contains unsafe path {name!r}")
            try:
                remaining_uncompressed_bytes = max_uncompressed_bytes
                manifest_bytes = read_zip_member_limited(
                    archive,
                    BACKUP_MANIFEST_FILENAME,
                    max_bytes=remaining_uncompressed_bytes,
                    label=f"Backup archive {BACKUP_MANIFEST_FILENAME}",
                )
                remaining_uncompressed_bytes -= len(manifest_bytes)
                manifest = json.loads(manifest_bytes.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Backup archive {BACKUP_MANIFEST_FILENAME} is invalid JSON") from exc
            if not isinstance(manifest, dict):
                raise ValueError(f"Backup archive {BACKUP_MANIFEST_FILENAME} must contain a JSON object")

            license_documents: list[dict] = []
            for index, entry in enumerate(manifest.get("license_documents") or [], start=1):
                if not isinstance(entry, dict):
                    raise ValueError(f"Backup license document #{index} must be an object")
                if entry.get("data_b64"):
                    license_documents.append(entry)
                    continue
                file_path = entry.get("file_path")
                if not is_safe_backup_member_path(file_path) or file_path not in names:
                    raise ValueError(f"Backup license document #{index} references a missing file")
                document = {key: value for key, value in entry.items() if key != "file_path"}
                document_bytes = read_zip_member_limited(
                    archive,
                    file_path,
                    max_bytes=remaining_uncompressed_bytes,
                    label=f"Backup archive {file_path}",
                )
                remaining_uncompressed_bytes -= len(document_bytes)
                document["data_b64"] = base64.b64encode(document_bytes).decode("ascii")
                license_documents.append(document)
            manifest["license_documents"] = license_documents
            return manifest
    except zipfile.BadZipFile as exc:
        raise ValueError("Backup file must be a valid ZIP archive") from exc


def parse_backup_payload(payload: dict | None) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Backup import requires a JSON object")

    version = payload.get("version")
    if version != BACKUP_EXPORT_VERSION:
        raise ValueError(f"Unsupported backup version: {version!r}")

    profile = payload.get("profile") or {}
    if not isinstance(profile, dict):
        raise ValueError("Backup profile must be an object")

    device_states = payload.get("device_states") or []
    if not isinstance(device_states, list):
        raise ValueError("Backup device_states must be an array")

    equipment = payload.get("equipment") or []
    if not isinstance(equipment, list):
        raise ValueError("Backup equipment must be an array")

    normalized_device_states: list[dict] = []
    for index, entry in enumerate(device_states, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup device state #{index} must be an object")
        vendor = str(entry.get("vendor") or "").strip()
        product = str(entry.get("product") or "").strip()
        if not vendor or not product:
            raise ValueError(f"Backup device state #{index} is missing vendor or product")
        normalized_device_states.append(
            {
                "vendor": vendor,
                "product": product,
                "fingerprint_hex": entry.get("fingerprint_hex"),
            }
        )

    dives = payload.get("dives") or []
    if not isinstance(dives, list):
        raise ValueError("Backup dives must be an array")

    normalized_dives: list[dict] = []
    for index, entry in enumerate(dives, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup dive #{index} must be an object")
        missing = [key for key in ("vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64") if not entry.get(key)]
        if missing:
            raise ValueError(f"Backup dive #{index} is missing required fields: {', '.join(missing)}")
        try:
            base64.b64decode(entry["raw_data_b64"], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"Backup dive #{index} has invalid raw_data_b64") from exc
        samples = entry.get("samples") if isinstance(entry.get("samples"), list) else []
        fields = entry.get("fields") if isinstance(entry.get("fields"), dict) else {}
        normalized_dives.append(
            {
                "vendor": entry["vendor"],
                "product": entry["product"],
                "fingerprint_hex": entry.get("fingerprint_hex"),
                "dive_uid": entry["dive_uid"],
                "started_at": entry.get("started_at"),
                "duration_ms": entry.get("duration_ms"),
                "duration_seconds": entry.get("duration_seconds"),
                "max_depth_m": entry.get("max_depth_m"),
                "avg_depth_m": entry.get("avg_depth_m"),
                "fields": fields,
                "raw_sha256": entry["raw_sha256"],
                "raw_data_b64": entry["raw_data_b64"],
                "samples": samples,
                "imported_at": entry.get("imported_at"),
            }
        )

    license_documents = payload.get("license_documents") or []
    if not isinstance(license_documents, list):
        raise ValueError("Backup license_documents must be an array")

    allowed_license_ids = {
        str(license.get("id")).strip()
        for license in profile.get("licenses") or []
        if isinstance(license, dict) and str(license.get("id") or "").strip()
    }
    normalized_license_documents: list[dict] = []
    for index, entry in enumerate(license_documents, start=1):
        if not isinstance(entry, dict):
            raise ValueError(f"Backup license document #{index} must be an object")
        license_id = str(entry.get("license_id") or "").strip()
        if not license_id:
            raise ValueError(f"Backup license document #{index} is missing license_id")
        if allowed_license_ids and license_id not in allowed_license_ids:
            raise ValueError(f"Backup license document #{index} references unknown license_id {license_id}")
        data_b64 = entry.get("data_b64")
        if not isinstance(data_b64, str) or not data_b64.strip():
            raise ValueError(f"Backup license document #{index} is missing data_b64")
        try:
            pdf_bytes = base64.b64decode(data_b64, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"Backup license document #{index} has invalid data_b64") from exc
        normalized_license_documents.append(
            {
                "license_id": license_id,
                "filename": sanitize_profile_license_filename(entry.get("filename")),
                "content_type": (entry.get("content_type") or "application/pdf").strip().lower(),
                "pdf_bytes": pdf_bytes,
            }
        )

    return {
        "profile": {
            "name": profile.get("name"),
            "email": profile.get("email"),
            "licenses": profile.get("licenses"),
            "dive_sites": profile.get("dive_sites"),
            "buddies": profile.get("buddies"),
            "guides": profile.get("guides"),
        },
        "equipment": equipment,
        "device_states": normalized_device_states,
        "dives": normalized_dives,
        "license_documents": normalized_license_documents,
    }


def import_backup_payload(conn, user_id: str, payload: dict | None, *, repo=None) -> dict:
    repository = _backup_repository(repo)
    normalized = parse_backup_payload(payload)
    profile = repository.save_user_profile(conn, user_id, normalized["profile"])
    repository.save_user_equipment(conn, user_id, normalized["equipment"])

    licenses_imported = 0
    for license_document in normalized["license_documents"]:
        if license_document["content_type"] != "application/pdf":
            raise ValueError(f"License {license_document['license_id']} must use content_type application/pdf")
        updated_profile = repository.save_user_profile_license_pdf(
            conn,
            user_id,
            license_id=license_document["license_id"],
            filename=license_document["filename"],
            content_type=license_document["content_type"],
            pdf_bytes=license_document["pdf_bytes"],
        )
        if updated_profile is None:
            raise ValueError(f"License {license_document['license_id']} does not exist in the imported profile")
        profile = updated_profile
        licenses_imported += 1

    for device_state in normalized["device_states"]:
        repository.save_device_state(
            conn,
            user_id,
            device_state["vendor"],
            device_state["product"],
            device_state.get("fingerprint_hex"),
        )

    dives_inserted = 0
    for dive in normalized["dives"]:
        if repository.insert_dive_record(conn, user_id, dive):
            dives_inserted += 1

    return {
        "profile": profile,
        "summary": {
            "dives_in_backup": len(normalized["dives"]),
            "dives_inserted": dives_inserted,
            "device_states_imported": len(normalized["device_states"]),
            "license_documents_imported": licenses_imported,
        },
    }

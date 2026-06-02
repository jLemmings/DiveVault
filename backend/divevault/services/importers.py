from __future__ import annotations

import base64
import csv
import gzip
import hashlib
import json
import re
import zipfile
from io import BytesIO, StringIO
from xml.etree import ElementTree

from divevault.domain.logbook import normalize_required_logbook_fields
from divevault.postgres_store import now_iso


CSV_IMPORT_OPTIONAL_FIELDS = [
    "dive_uid",
    "vendor",
    "product",
    "fingerprint_hex",
    "started_at",
    "date",
    "time",
    "duration_seconds",
    "duration_minutes",
    "max_depth_m",
    "avg_depth_m",
    "site",
    "buddy",
    "guide",
    "weather_description",
    "visibility",
    "wetsuit_description",
    "notes",
    "temperature_surface_c",
    "temperature_minimum_c",
    "temperature_maximum_c",
    "tank_volume_l",
    "begin_pressure_bar",
    "end_pressure_bar",
    "gas_o2_percent",
    "gas_he_percent",
    "imported_at",
    "samples_json",
]
CSV_IMPORT_REQUIRED_FIELDS = ["started_at", "duration_seconds", "max_depth_m"]


def clean_csv_value(row: dict, key: str) -> str:
    value = row.get(key)
    return str(value).strip() if value is not None else ""


def parse_csv_float(row: dict, key: str) -> float | None:
    value = clean_csv_value(row, key)
    if value == "":
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{key} must be a number") from exc


def parse_csv_positive_seconds(row: dict) -> int:
    seconds = parse_csv_float(row, "duration_seconds")
    if seconds is None:
        minutes = parse_csv_float(row, "duration_minutes")
        if minutes is None:
            raise ValueError("duration_seconds or duration_minutes is required")
        seconds = minutes * 60
    if seconds <= 0:
        raise ValueError("duration must be greater than zero")
    return int(round(seconds))


def parse_csv_started_at(row: dict) -> str:
    started_at = clean_csv_value(row, "started_at")
    if started_at:
        return started_at
    date = clean_csv_value(row, "date")
    time_value = clean_csv_value(row, "time")
    if date and time_value:
        if re.match(r"^\d{2}:\d{2}$", time_value):
            time_value = f"{time_value}:00"
        return f"{date}T{time_value}"
    raise ValueError("started_at is required")


def parse_csv_samples(row: dict) -> list:
    samples_json = clean_csv_value(row, "samples_json")
    if not samples_json:
        return []
    try:
        samples = json.loads(samples_json)
    except json.JSONDecodeError as exc:
        raise ValueError("samples_json must be valid JSON") from exc
    if not isinstance(samples, list):
        raise ValueError("samples_json must be a JSON array")
    return samples


def complete_logbook_if_ready(logbook: dict, *, required_fields: object = None) -> dict:
    required = normalize_required_logbook_fields(required_fields)
    ready = all(isinstance(logbook.get(key), str) and logbook[key].strip() for key in required)
    if ready:
        logbook["status"] = "complete"
        logbook.setdefault("completed_at", now_iso())
    else:
        logbook["status"] = "imported"
        logbook.pop("completed_at", None)
    return logbook


def build_csv_import_fields(row: dict, *, required_fields: object = None) -> dict:
    logbook = {
        "site": clean_csv_value(row, "site"),
        "buddy": clean_csv_value(row, "buddy"),
        "guide": clean_csv_value(row, "guide"),
        "weather_description": clean_csv_value(row, "weather_description"),
        "visibility": clean_csv_value(row, "visibility"),
        "wetsuit_description": clean_csv_value(row, "wetsuit_description"),
        "notes": clean_csv_value(row, "notes"),
    }
    complete_logbook_if_ready(logbook, required_fields=required_fields)
    fields: dict = {"source": "csv", "csv_import": True, "logbook": logbook}

    for csv_key, field_key in (
        ("temperature_surface_c", "temperature_surface_c"),
        ("temperature_minimum_c", "temperature_minimum_c"),
        ("temperature_maximum_c", "temperature_maximum_c"),
    ):
        value = parse_csv_float(row, csv_key)
        if value is not None:
            fields[field_key] = value

    tank: dict = {}
    tank_volume = parse_csv_float(row, "tank_volume_l")
    begin_pressure = parse_csv_float(row, "begin_pressure_bar")
    end_pressure = parse_csv_float(row, "end_pressure_bar")
    gas_o2 = parse_csv_float(row, "gas_o2_percent")
    gas_he = parse_csv_float(row, "gas_he_percent")
    if tank_volume is not None:
        tank["volume"] = tank_volume
    if begin_pressure is not None:
        tank["beginpressure_bar"] = int(round(begin_pressure))
    if end_pressure is not None:
        tank["endpressure_bar"] = int(round(end_pressure))
    if gas_o2 is not None:
        tank["o2_percent"] = gas_o2
    if gas_he is not None:
        tank["he_percent"] = gas_he
    if tank:
        fields["tanks"] = [tank]

    return fields


def import_validation_row_from_payload(payload: dict, *, row_number: int | None = None, source_id: str = "") -> dict:
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    logbook = fields.get("logbook") if isinstance(fields.get("logbook"), dict) else {}
    return {
        "row_number": row_number,
        "source_id": source_id,
        "valid": True,
        "status": "ready",
        "duplicate": False,
        "errors": [],
        "dive_uid": payload.get("dive_uid"),
        "started_at": payload.get("started_at"),
        "site": logbook.get("site") or "",
        "duration_seconds": payload.get("duration_seconds"),
        "max_depth_m": payload.get("max_depth_m"),
        "sample_count": len(payload.get("samples") or []),
    }


def invalid_import_validation_row(*, row_number: int | None = None, source_id: str = "", error: object) -> dict:
    return {
        "row_number": row_number,
        "source_id": source_id,
        "valid": False,
        "status": "invalid",
        "duplicate": False,
        "errors": [str(error)],
        "dive_uid": "",
        "started_at": "",
        "site": "",
        "duration_seconds": None,
        "max_depth_m": None,
        "sample_count": 0,
    }


def csv_import_preview(csv_text: str, *, required_fields: object = None) -> dict:
    if not csv_text.strip():
        raise ValueError("CSV import file is empty")

    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV import requires a header row")

    payloads: list[dict] = []
    rows: list[dict] = []
    for row_number, row in enumerate(reader, start=2):
        if not any(str(value or "").strip() for value in row.values()):
            continue
        try:
            started_at = parse_csv_started_at(row)
            duration_seconds = parse_csv_positive_seconds(row)
            max_depth_m = parse_csv_float(row, "max_depth_m")
            if max_depth_m is None:
                raise ValueError("max_depth_m is required")
            avg_depth_m = parse_csv_float(row, "avg_depth_m")
            samples = parse_csv_samples(row)
            fields = build_csv_import_fields(row, required_fields=required_fields)
        except ValueError as exc:
            rows.append(invalid_import_validation_row(row_number=row_number, error=exc))
            continue

        archived_row = {key: clean_csv_value(row, key) for key in (reader.fieldnames or [])}
        raw_source = json.dumps(
            {"source": "csv", "row_number": row_number, "row": archived_row},
            sort_keys=True,
            separators=(",", ":"),
        )
        raw_data_b64 = base64.b64encode(raw_source.encode("utf-8")).decode("ascii")
        raw_sha256 = hashlib.sha256(raw_source.encode("utf-8")).hexdigest()
        dive_uid = clean_csv_value(row, "dive_uid") or f"csv-{raw_sha256[:24]}"

        payload = {
            "vendor": clean_csv_value(row, "vendor") or "CSV",
            "product": clean_csv_value(row, "product") or "Import",
            "fingerprint_hex": clean_csv_value(row, "fingerprint_hex") or None,
            "dive_uid": dive_uid,
            "started_at": started_at,
            "duration_seconds": duration_seconds,
            "max_depth_m": max_depth_m,
            "avg_depth_m": avg_depth_m,
            "fields": fields,
            "raw_sha256": raw_sha256,
            "raw_data_b64": raw_data_b64,
            "samples": samples,
            "imported_at": clean_csv_value(row, "imported_at") or now_iso(),
        }
        payloads.append(payload)
        rows.append(import_validation_row_from_payload(payload, row_number=row_number))

    if not payloads and not rows:
        raise ValueError("CSV import does not contain any dive rows")
    return {"payloads": payloads, "rows": rows}


def csv_import_payloads(csv_text: str, *, required_fields: object = None) -> list[dict]:
    preview = csv_import_preview(csv_text, required_fields=required_fields)
    invalid_row = next((row for row in preview["rows"] if not row.get("valid")), None)
    if invalid_row:
        row_number = invalid_row.get("row_number")
        error = (invalid_row.get("errors") or ["Invalid row"])[0]
        raise ValueError(f"CSV row {row_number}: {error}")
    payloads = preview["payloads"]
    if not payloads:
        raise ValueError("CSV import does not contain any dive rows")
    return payloads


def local_xml_name(element) -> str:
    tag = getattr(element, "tag", "")
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element, *names: str) -> str:
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_xml_name(child) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def first_child(element, *names: str):
    wanted = {name.lower() for name in names}
    for child in list(element):
        if local_xml_name(child) in wanted:
            return child
    return None


def parse_subsurface_number(value: object) -> float | None:
    if value is None:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_subsurface_depth_m(value: object) -> float | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "ft" in text or "feet" in text:
        return round(number * 0.3048, 3)
    return number


def parse_subsurface_pressure_bar(value: object) -> int | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "psi" in text:
        number = number * 0.0689476
    return int(round(number))


def parse_subsurface_temperature_c(value: object) -> float | None:
    number = parse_subsurface_number(value)
    if number is None:
        return None
    text = str(value).lower()
    if "f" in text and "c" not in text:
        number = (number - 32) * 5 / 9
    return round(number, 2)


def parse_subsurface_duration_seconds(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    match = re.search(r"(\d+):(\d+)(?::(\d+))?", text)
    if match:
        first = int(match.group(1))
        second = int(match.group(2))
        third = int(match.group(3) or 0)
        if match.group(3) is not None:
            return first * 3600 + second * 60 + third
        return first * 60 + second
    number = parse_subsurface_number(text)
    if number is None:
        return None
    if "hour" in text or re.search(r"\bh\b", text):
        return int(round(number * 3600))
    if "sec" in text:
        return int(round(number))
    return int(round(number * 60))


def parse_subsurface_started_at(dive_element) -> str:
    date_value = (dive_element.get("date") or child_text(dive_element, "date")).strip()
    time_value = (dive_element.get("time") or child_text(dive_element, "time")).strip()
    if not date_value:
        raise ValueError("missing dive date")
    if not time_value:
        return date_value
    time_value = time_value.replace("Z", "")
    if re.match(r"^\d{2}:\d{2}$", time_value):
        time_value = f"{time_value}:00"
    return f"{date_value}T{time_value}"


def parse_subsurface_gps(value: object) -> dict | None:
    text = str(value or "").strip()
    if not text:
        return None
    numbers = re.findall(r"-?\d+(?:\.\d+)?", text)
    if len(numbers) < 2:
        return None
    lat = float(numbers[0])
    lon = float(numbers[1])
    if -90 <= lat <= 90 and -180 <= lon <= 180:
        return {"lat": lat, "lon": lon}
    return None


def read_limited_stream(stream, *, max_bytes: int, label: str) -> bytes:
    output = BytesIO()
    remaining = max(max_bytes, 0)
    while True:
        chunk_size = min(1024 * 1024, remaining + 1)
        chunk = stream.read(chunk_size)
        if not chunk:
            break
        output.write(chunk)
        remaining -= len(chunk)
        if remaining < 0:
            raise ValueError(f"{label} exceeds {max_bytes} byte uncompressed limit")
    return output.getvalue()


def decompress_gzip_limited(source: bytes, *, max_bytes: int, label: str) -> bytes:
    try:
        with gzip.GzipFile(fileobj=BytesIO(source)) as stream:
            return read_limited_stream(stream, max_bytes=max_bytes, label=label)
    except (OSError, EOFError) as exc:
        raise ValueError(f"{label} must be a valid gzip file") from exc


def read_zip_member_limited(archive: zipfile.ZipFile, member: str, *, max_bytes: int, label: str) -> bytes:
    try:
        with archive.open(member, "r") as stream:
            return read_limited_stream(stream, max_bytes=max_bytes, label=label)
    except zipfile.BadZipFile as exc:
        raise ValueError(f"{label} must be a valid ZIP entry") from exc


def decode_subsurface_export(body: bytes, *, max_uncompressed_bytes: int) -> str:
    source = body or b""
    if source.startswith(b"\xef\xbb\xbf"):
        source = source[3:]
    if source.startswith(b"\x1f\x8b"):
        source = decompress_gzip_limited(source, max_bytes=max_uncompressed_bytes, label="Subsurface export")
    elif zipfile.is_zipfile(BytesIO(source)):
        with zipfile.ZipFile(BytesIO(source), "r") as archive:
            names = [name for name in archive.namelist() if name.lower().endswith((".xml", ".ssrf"))]
            if not names:
                raise ValueError("Subsurface archive does not contain an XML export")
            source = read_zip_member_limited(
                archive,
                names[0],
                max_bytes=max_uncompressed_bytes,
                label="Subsurface archive XML export",
            )
    elif len(source) > max_uncompressed_bytes:
        raise ValueError(f"Subsurface export exceeds {max_uncompressed_bytes} byte uncompressed limit")
    try:
        return source.decode("utf-8-sig")
    except UnicodeDecodeError:
        return source.decode("latin-1")


def parse_subsurface_sites(root) -> dict[str, dict]:
    sites: dict[str, dict] = {}
    for element in root.iter():
        if local_xml_name(element) not in {"site", "dive_site", "divesite"}:
            continue
        site_id = element.get("uuid") or element.get("id") or element.get("name") or ""
        name = element.get("name") or child_text(element, "name") or "".join(element.itertext()).strip()
        gps = parse_subsurface_gps(element.get("gps") or element.get("location"))
        if site_id:
            sites[site_id] = {"name": name, "gps": gps}
    return sites


def parse_subsurface_location(dive_element, site_lookup: dict[str, dict]) -> tuple[str, dict | None]:
    location_element = first_child(dive_element, "location", "site", "divesite")
    if location_element is not None:
        site_ref = location_element.get("uuid") or location_element.get("ref") or location_element.get("site") or ""
        matched_site = site_lookup.get(site_ref, {})
        name = "".join(location_element.itertext()).strip() or location_element.get("name") or matched_site.get("name") or ""
        gps = parse_subsurface_gps(location_element.get("gps") or location_element.get("location")) or matched_site.get("gps")
        return name, gps
    site_ref = dive_element.get("divesiteid") or dive_element.get("siteid") or dive_element.get("site") or ""
    matched_site = site_lookup.get(site_ref, {})
    return matched_site.get("name") or "", matched_site.get("gps")


def parse_subsurface_samples(divecomputer) -> list[dict]:
    samples: list[dict] = []
    for sample_element in list(divecomputer):
        if local_xml_name(sample_element) != "sample":
            continue
        sample: dict = {}
        time_seconds = parse_subsurface_duration_seconds(sample_element.get("time"))
        depth_m = parse_subsurface_depth_m(sample_element.get("depth"))
        temperature_c = parse_subsurface_temperature_c(sample_element.get("temp") or sample_element.get("temperature"))
        pressure_bar = parse_subsurface_pressure_bar(sample_element.get("pressure") or sample_element.get("tankpressure"))
        if time_seconds is not None:
            sample["time_seconds"] = time_seconds
        if depth_m is not None:
            sample["depth_m"] = depth_m
        if temperature_c is not None:
            sample["temperature_c"] = temperature_c
        if pressure_bar is not None:
            sample["tank_pressure_bar"] = pressure_bar
        if sample:
            samples.append(sample)
    return samples


def build_subsurface_fields(dive_element, divecomputer, *, site: str, gps: dict | None, required_fields: object = None) -> dict:
    logbook = {
        "site": site,
        "buddy": child_text(dive_element, "buddy"),
        "guide": child_text(dive_element, "divemaster", "guide"),
        "weather_description": child_text(dive_element, "weather"),
        "visibility": dive_element.get("visibility") or child_text(dive_element, "visibility"),
        "wetsuit_description": child_text(dive_element, "suit"),
        "notes": child_text(dive_element, "notes"),
    }
    complete_logbook_if_ready(logbook, required_fields=required_fields)
    fields: dict = {"source": "subsurface", "subsurface_import": True, "logbook": logbook}
    if gps:
        fields["location"] = gps
    temperature_element = first_child(divecomputer, "temperature") if divecomputer is not None else None
    if temperature_element is not None:
        water = parse_subsurface_temperature_c(temperature_element.get("water"))
        air = parse_subsurface_temperature_c(temperature_element.get("air"))
        if water is not None:
            fields["temperature_minimum_c"] = water
            fields["temperature_surface_c"] = air if air is not None else water
    cylinder = first_child(dive_element, "cylinder")
    if cylinder is not None:
        tank: dict = {}
        size = parse_subsurface_number(cylinder.get("size"))
        start = parse_subsurface_pressure_bar(cylinder.get("start"))
        end = parse_subsurface_pressure_bar(cylinder.get("end"))
        o2 = parse_subsurface_number(cylinder.get("o2") or cylinder.get("oxygen"))
        he = parse_subsurface_number(cylinder.get("he") or cylinder.get("helium"))
        if size is not None:
            tank["volume"] = size
        if start is not None:
            tank["beginpressure_bar"] = start
        if end is not None:
            tank["endpressure_bar"] = end
        if o2 is not None:
            tank["o2_percent"] = o2
            fields["gasmixes"] = [{"oxygen_fraction": o2 / 100 if o2 > 1 else o2}]
        if he is not None:
            tank["he_percent"] = he
        if tank:
            fields["tanks"] = [tank]
    return fields


def subsurface_import_preview(export_text: str, *, required_fields: object = None) -> dict:
    if not export_text.strip():
        raise ValueError("Subsurface import file is empty")
    try:
        root = ElementTree.fromstring(export_text)
    except ElementTree.ParseError as exc:
        raise ValueError("Subsurface import must be a valid XML export") from exc

    site_lookup = parse_subsurface_sites(root)
    dive_elements = [element for element in root.iter() if local_xml_name(element) == "dive"]
    payloads: list[dict] = []
    rows: list[dict] = []
    for index, dive_element in enumerate(dive_elements, start=1):
        dive_number = dive_element.get("number") or str(index)
        try:
            started_at = parse_subsurface_started_at(dive_element)
            divecomputer = first_child(dive_element, "divecomputer")
            depth_element = first_child(divecomputer, "depth") if divecomputer is not None else None
            max_depth_source = depth_element.get("max") if depth_element is not None else dive_element.get("maxdepth")
            max_depth_m = parse_subsurface_depth_m(max_depth_source)
            avg_depth_m = parse_subsurface_depth_m(depth_element.get("mean")) if depth_element is not None else None
            duration_seconds = parse_subsurface_duration_seconds(dive_element.get("duration") or child_text(dive_element, "duration"))
            if duration_seconds is None:
                raise ValueError("missing duration")
            if max_depth_m is None:
                sample_depths = [sample.get("depth_m") for sample in parse_subsurface_samples(divecomputer) if isinstance(sample.get("depth_m"), (int, float))] if divecomputer is not None else []
                max_depth_m = max(sample_depths) if sample_depths else None
            if max_depth_m is None:
                raise ValueError("missing max depth")
            site, gps = parse_subsurface_location(dive_element, site_lookup)
            samples = parse_subsurface_samples(divecomputer) if divecomputer is not None else []
            fields = build_subsurface_fields(dive_element, divecomputer, site=site, gps=gps, required_fields=required_fields)
        except ValueError as exc:
            rows.append(invalid_import_validation_row(row_number=index, source_id=dive_number, error=exc))
            continue

        source_payload = ElementTree.tostring(dive_element, encoding="unicode")
        raw_data_b64 = base64.b64encode(source_payload.encode("utf-8")).decode("ascii")
        raw_sha256 = hashlib.sha256(source_payload.encode("utf-8")).hexdigest()
        dive_uid = f"subsurface-{raw_sha256[:24]}"
        model = divecomputer.get("model") if divecomputer is not None else ""

        payload = {
            "vendor": "Subsurface",
            "product": model or "Export",
            "dive_uid": dive_uid,
            "started_at": started_at,
            "duration_seconds": duration_seconds,
            "max_depth_m": max_depth_m,
            "avg_depth_m": avg_depth_m,
            "fields": fields,
            "raw_sha256": raw_sha256,
            "raw_data_b64": raw_data_b64,
            "samples": samples,
            "imported_at": now_iso(),
            "subsurface_number": dive_number,
        }
        payloads.append(payload)
        rows.append(import_validation_row_from_payload(payload, row_number=index, source_id=dive_number))

    if not payloads and not rows:
        raise ValueError("Subsurface import does not contain any dives")
    return {"payloads": payloads, "rows": rows}


def subsurface_import_payloads(export_text: str, *, required_fields: object = None) -> list[dict]:
    preview = subsurface_import_preview(export_text, required_fields=required_fields)
    invalid_row = next((row for row in preview["rows"] if not row.get("valid")), None)
    if invalid_row:
        row_number = invalid_row.get("row_number")
        error = (invalid_row.get("errors") or ["Invalid dive"])[0]
        raise ValueError(f"Subsurface dive {row_number}: {error}")
    payloads = preview["payloads"]
    if not payloads:
        raise ValueError("Subsurface import does not contain any dives")
    return payloads


def mark_import_preview_duplicates(rows: list[dict], existing_dive_uids: set[str] | None = None) -> list[dict]:
    existing = existing_dive_uids or set()
    seen: set[str] = set()
    marked_rows: list[dict] = []
    for row in rows:
        next_row = dict(row)
        if next_row.get("valid"):
            dive_uid = str(next_row.get("dive_uid") or "")
            duplicate = bool(dive_uid and (dive_uid in existing or dive_uid in seen))
            next_row["duplicate"] = duplicate
            next_row["status"] = "duplicate" if duplicate else "ready"
            if dive_uid:
                seen.add(dive_uid)
        marked_rows.append(next_row)
    return marked_rows


def import_validation_summary(rows: list[dict], *, inserted: int | None = None, ids: list[int] | None = None) -> dict:
    invalid_rows = sum(1 for row in rows if not row.get("valid"))
    duplicate_rows = sum(1 for row in rows if row.get("duplicate") or row.get("status") == "duplicate")
    ready_rows = sum(1 for row in rows if row.get("status") == "ready")
    valid_rows = sum(1 for row in rows if row.get("valid"))
    summary = {
        "rows": len(rows),
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "ready_rows": ready_rows,
        "duplicates": duplicate_rows,
        "dives": rows,
    }
    if inserted is not None:
        summary["inserted"] = inserted
    if ids is not None:
        summary["ids"] = ids
    return summary


def import_payload_summary(payloads: list[dict]) -> dict:
    return {
        "rows": len(payloads),
        "dives": [
            {
                "dive_uid": payload.get("dive_uid"),
                "started_at": payload.get("started_at"),
                "site": ((payload.get("fields") or {}).get("logbook") or {}).get("site") or "",
                "duration_seconds": payload.get("duration_seconds"),
                "max_depth_m": payload.get("max_depth_m"),
                "sample_count": len(payload.get("samples") or []),
            }
            for payload in payloads[:25]
        ],
    }

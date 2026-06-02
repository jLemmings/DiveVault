from __future__ import annotations

import json


DEFAULT_LOGBOOK_REQUIRED_FIELDS = ("site",)
LOGBOOK_REQUIRED_FIELD_OPTIONS = (
    "site",
    "buddy",
    "guide",
    "weather_description",
    "visibility",
    "wetsuit_description",
    "weight_description",
    "notes",
)
LOGBOOK_OPTIONAL_FIELDS = ("weather_description", "visibility", "wetsuit_description", "weight_description")
LOGBOOK_DISPLAY_FIELD_OPTIONS = set(LOGBOOK_OPTIONAL_FIELDS)


def clean_logbook_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def normalize_logbook_display_fields(entries: object) -> list[str]:
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except json.JSONDecodeError:
            return []
    if not isinstance(entries, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        value = clean_logbook_text(entry)
        if value not in LOGBOOK_DISPLAY_FIELD_OPTIONS or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def normalize_required_logbook_fields(entries: object) -> list[str]:
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except json.JSONDecodeError:
            return list(DEFAULT_LOGBOOK_REQUIRED_FIELDS)
    if not isinstance(entries, list):
        return list(DEFAULT_LOGBOOK_REQUIRED_FIELDS)

    normalized: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        value = clean_logbook_text(entry)
        if value not in LOGBOOK_REQUIRED_FIELD_OPTIONS or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized or list(DEFAULT_LOGBOOK_REQUIRED_FIELDS)


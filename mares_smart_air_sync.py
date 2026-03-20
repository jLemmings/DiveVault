#!/usr/bin/env python3
"""
Download dives from a Mares Smart Air using libdivecomputer and store them in SQLite.

Tested logic-wise against the libdivecomputer v0.9.0 public headers/API layout,
but you should still expect to do a little hardware-specific debugging the first time.

Usage:
    python mares_smart_air_sync.py --port /dev/ttyUSB0 --db dives.db

Notes:
- This example uses SERIAL transport (clip/cable). The Mares Smart Air also supports BLE,
  but serial is simpler for a minimal first version.
- It stores a per-device fingerprint so subsequent runs only import newer dives.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import (
    POINTER,
    Structure,
    Union,
    byref,
    c_char_p,
    c_double,
    c_int,
    c_longlong,
    c_size_t,
    c_uint,
    c_ubyte,
    c_void_p,
    py_object,
    cast,
)
import ctypes.util
import hashlib
import json
import sqlite3
import sys
import os
from datetime import datetime, timezone


# ----------------------------
# Constants from public headers
# ----------------------------

DC_STATUS_SUCCESS = 0
DC_STATUS_DONE = 1  # iterator end / not-an-error in libdivecomputer docs

DC_FIELD_DIVETIME = 0
DC_FIELD_MAXDEPTH = 1
DC_FIELD_AVGDEPTH = 2

DC_SAMPLE_TIME = 0
DC_SAMPLE_DEPTH = 1
DC_SAMPLE_PRESSURE = 2
DC_SAMPLE_TEMPERATURE = 3
DC_SAMPLE_GASMIX = 12


# ----------------------------
# ctypes type declarations
# ----------------------------

dc_ticks_t = c_longlong


class dc_context_t(Structure):
    pass


class dc_descriptor_t(Structure):
    pass


class dc_iterator_t(Structure):
    pass


class dc_iostream_t(Structure):
    pass


class dc_device_t(Structure):
    pass


class dc_parser_t(Structure):
    pass


class dc_datetime_t(Structure):
    _fields_ = [
        ("year", c_int),
        ("month", c_int),
        ("day", c_int),
        ("hour", c_int),
        ("minute", c_int),
        ("second", c_int),
        ("timezone", c_int),
    ]


class PressureValue(Structure):
    _fields_ = [
        ("tank", c_uint),
        ("value", c_double),
    ]


class PPO2Value(Structure):
    _fields_ = [
        ("sensor", c_uint),
        ("value", c_double),
    ]


class DecoValue(Structure):
    _fields_ = [
        ("type", c_uint),
        ("time", c_uint),
        ("depth", c_double),
        ("tts", c_uint),
    ]


class VendorValue(Structure):
    _fields_ = [
        ("type", c_uint),
        ("size", c_uint),
        ("data", c_void_p),
    ]


class EventValue(Structure):
    _fields_ = [
        ("type", c_uint),
        ("time", c_uint),
        ("flags", c_uint),
        ("value", c_uint),
    ]


class dc_sample_value_t(Union):
    _fields_ = [
        ("time", c_uint),
        ("depth", c_double),
        ("pressure", PressureValue),
        ("temperature", c_double),
        ("event", EventValue),
        ("rbt", c_uint),
        ("heartbeat", c_uint),
        ("bearing", c_uint),
        ("vendor", VendorValue),
        ("setpoint", c_double),
        ("ppo2", PPO2Value),
        ("cns", c_double),
        ("deco", DecoValue),
        ("gasmix", c_uint),
    ]


# Callback types
DC_DIVE_CALLBACK = ctypes.CFUNCTYPE(
    c_int, POINTER(c_ubyte), c_uint, POINTER(c_ubyte), c_uint, c_void_p
)
DC_SAMPLE_CALLBACK = ctypes.CFUNCTYPE(
    None, c_int, POINTER(dc_sample_value_t), c_void_p
)


# ----------------------------
# Load library
# ----------------------------

def load_lib() -> ctypes.CDLL:
    # 1. Try loading from the same directory as this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dll_path = os.path.join(script_dir, "libdivecomputer.dll")

    if os.path.exists(dll_path):
        return ctypes.CDLL(dll_path)

    # 2. Try current working directory
    cwd_path = os.path.join(os.getcwd(), "libdivecomputer.dll")
    if os.path.exists(cwd_path):
        return ctypes.CDLL(cwd_path)

    # 3. Fallback: try system PATH
    try:
        return ctypes.CDLL("libdivecomputer.dll")
    except OSError as e:
        raise RuntimeError(
            "Could not load libdivecomputer.dll.\n"
            "Make sure the DLL is in the same folder as this script "
            "or added to PATH.\n"
            f"Tried:\n- {dll_path}\n- {cwd_path}"
        ) from e


LIB = load_lib()


# ----------------------------
# Function signatures
# ----------------------------

LIB.dc_context_new.argtypes = [POINTER(POINTER(dc_context_t))]
LIB.dc_context_new.restype = c_int

LIB.dc_context_free.argtypes = [POINTER(dc_context_t)]
LIB.dc_context_free.restype = c_int

LIB.dc_descriptor_iterator_new.argtypes = [POINTER(POINTER(dc_iterator_t)), POINTER(dc_context_t)]
LIB.dc_descriptor_iterator_new.restype = c_int

LIB.dc_iterator_next.argtypes = [POINTER(dc_iterator_t), c_void_p]
LIB.dc_iterator_next.restype = c_int

LIB.dc_iterator_free.argtypes = [POINTER(dc_iterator_t)]
LIB.dc_iterator_free.restype = c_int

LIB.dc_descriptor_get_vendor.argtypes = [POINTER(dc_descriptor_t)]
LIB.dc_descriptor_get_vendor.restype = c_char_p

LIB.dc_descriptor_get_product.argtypes = [POINTER(dc_descriptor_t)]
LIB.dc_descriptor_get_product.restype = c_char_p

LIB.dc_descriptor_free.argtypes = [POINTER(dc_descriptor_t)]
LIB.dc_descriptor_free.restype = None

LIB.dc_serial_open.argtypes = [POINTER(POINTER(dc_iostream_t)), POINTER(dc_context_t), c_char_p]
LIB.dc_serial_open.restype = c_int

LIB.dc_iostream_close.argtypes = [POINTER(dc_iostream_t)]
LIB.dc_iostream_close.restype = c_int

LIB.dc_device_open.argtypes = [
    POINTER(POINTER(dc_device_t)),
    POINTER(dc_context_t),
    POINTER(dc_descriptor_t),
    POINTER(dc_iostream_t),
]
LIB.dc_device_open.restype = c_int

LIB.dc_device_set_fingerprint.argtypes = [POINTER(dc_device_t), POINTER(c_ubyte), c_uint]
LIB.dc_device_set_fingerprint.restype = c_int

LIB.dc_device_foreach.argtypes = [POINTER(dc_device_t), DC_DIVE_CALLBACK, c_void_p]
LIB.dc_device_foreach.restype = c_int

LIB.dc_device_close.argtypes = [POINTER(dc_device_t)]
LIB.dc_device_close.restype = c_int

LIB.dc_parser_new.argtypes = [
    POINTER(POINTER(dc_parser_t)),
    POINTER(dc_device_t),
    POINTER(c_ubyte),
    c_size_t,
]
LIB.dc_parser_new.restype = c_int

LIB.dc_parser_destroy.argtypes = [POINTER(dc_parser_t)]
LIB.dc_parser_destroy.restype = c_int

LIB.dc_parser_get_datetime.argtypes = [POINTER(dc_parser_t), POINTER(dc_datetime_t)]
LIB.dc_parser_get_datetime.restype = c_int

LIB.dc_parser_get_field.argtypes = [POINTER(dc_parser_t), c_int, c_uint, c_void_p]
LIB.dc_parser_get_field.restype = c_int

LIB.dc_parser_samples_foreach.argtypes = [POINTER(dc_parser_t), DC_SAMPLE_CALLBACK, c_void_p]
LIB.dc_parser_samples_foreach.restype = c_int


# ----------------------------
# SQLite
# ----------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS device_state (
    vendor TEXT NOT NULL,
    product TEXT NOT NULL,
    fingerprint_hex TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (vendor, product)
);

CREATE TABLE IF NOT EXISTS dives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT NOT NULL,
    product TEXT NOT NULL,
    fingerprint_hex TEXT,
    dive_uid TEXT NOT NULL UNIQUE,
    started_at TEXT,
    duration_seconds INTEGER,
    max_depth_m REAL,
    avg_depth_m REAL,
    raw_sha256 TEXT NOT NULL,
    raw_data BLOB NOT NULL,
    samples_json TEXT NOT NULL,
    imported_at TEXT NOT NULL
);
"""


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def get_saved_fingerprint(conn: sqlite3.Connection, vendor: str, product: str) -> bytes | None:
    row = conn.execute(
        "SELECT fingerprint_hex FROM device_state WHERE vendor=? AND product=?",
        (vendor, product),
    ).fetchone()
    if not row or not row[0]:
        return None
    return bytes.fromhex(row[0])


def save_fingerprint(conn: sqlite3.Connection, vendor: str, product: str, fp: bytes | None) -> None:
    fp_hex = fp.hex() if fp else None
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO device_state(vendor, product, fingerprint_hex, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(vendor, product)
        DO UPDATE SET fingerprint_hex=excluded.fingerprint_hex, updated_at=excluded.updated_at
        """,
        (vendor, product, fp_hex, now),
    )
    conn.commit()


def insert_dive(
    conn: sqlite3.Connection,
    vendor: str,
    product: str,
    fingerprint: bytes | None,
    started_at: str | None,
    duration_seconds: int | None,
    max_depth_m: float | None,
    avg_depth_m: float | None,
    raw_data: bytes,
    samples: list[dict],
) -> bool:
    raw_sha256 = hashlib.sha256(raw_data).hexdigest()
    fingerprint_hex = fingerprint.hex() if fingerprint else None

    # Stable per-dive UID:
    # prefer fingerprint if present; otherwise fall back to raw hash.
    dive_uid = f"{vendor}:{product}:{fingerprint_hex or raw_sha256}"
    imported_at = datetime.now(timezone.utc).isoformat()

    try:
        conn.execute(
            """
            INSERT INTO dives(
                vendor, product, fingerprint_hex, dive_uid, started_at,
                duration_seconds, max_depth_m, avg_depth_m,
                raw_sha256, raw_data, samples_json, imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                vendor,
                product,
                fingerprint_hex,
                dive_uid,
                started_at,
                duration_seconds,
                max_depth_m,
                avg_depth_m,
                raw_sha256,
                raw_data,
                json.dumps(samples, separators=(",", ":")),
                imported_at,
            ),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


# ----------------------------
# Helpers
# ----------------------------

def check(status: int, what: str) -> None:
    if status != DC_STATUS_SUCCESS:
        raise RuntimeError(f"{what} failed with libdivecomputer status={status}")


def find_descriptor(context: POINTER(dc_context_t), vendor: str, product: str) -> POINTER(dc_descriptor_t):
    it = POINTER(dc_iterator_t)()
    check(LIB.dc_descriptor_iterator_new(byref(it), context), "dc_descriptor_iterator_new")

    try:
        while True:
            desc = POINTER(dc_descriptor_t)()
            rc = LIB.dc_iterator_next(it, byref(desc))
            if rc == DC_STATUS_DONE:
                break
            check(rc, "dc_iterator_next(descriptor)")

            v = LIB.dc_descriptor_get_vendor(desc)
            p = LIB.dc_descriptor_get_product(desc)
            v_str = v.decode("utf-8") if v else ""
            p_str = p.decode("utf-8") if p else ""

            if v_str == vendor and p_str == product:
                return desc  # caller owns this descriptor

            LIB.dc_descriptor_free(desc)

    finally:
        LIB.dc_iterator_free(it)

    raise RuntimeError(f"Could not find descriptor for {vendor} {product}")


def dt_to_iso(dt: dc_datetime_t) -> str:
    # timezone may be unknown / absent depending on device.
    # Store naive local-style timestamp string if timezone is unavailable.
    return f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}"


# ----------------------------
# Import state passed through callback
# ----------------------------

class ImportState:
    def __init__(
        self,
        conn: sqlite3.Connection,
        device: POINTER(dc_device_t),
        vendor: str,
        product: str,
    ) -> None:
        self.conn = conn
        self.device = device
        self.vendor = vendor
        self.product = product
        self.first_fingerprint: bytes | None = None
        self.imported = 0
        self.skipped = 0


# Keep callback objects alive
_SAMPLE_CBS: list = []
_DIVE_CBS: list = []


def make_sample_collector(samples: list[dict]) -> DC_SAMPLE_CALLBACK:
    current = {
        "time_ms": None,
        "depth_m": None,
        "temperature_c": None,
        "tank_pressure_bar": {},
        "gasmix_index": None,
    }

    def flush_current() -> None:
        if any(v is not None and v != {} for v in current.values()):
            row = {
                "time_ms": current["time_ms"],
                "depth_m": current["depth_m"],
                "temperature_c": current["temperature_c"],
                "tank_pressure_bar": current["tank_pressure_bar"] or None,
                "gasmix_index": current["gasmix_index"],
            }
            samples.append(row)

    def sample_cb(sample_type: int, value_ptr: POINTER(dc_sample_value_t), _userdata: c_void_p) -> None:
        nonlocal current
        val = value_ptr.contents

        if sample_type == DC_SAMPLE_TIME:
            # Start a new row when time advances.
            if current["time_ms"] is not None:
                flush_current()
                current = {
                    "time_ms": None,
                    "depth_m": None,
                    "temperature_c": None,
                    "tank_pressure_bar": {},
                    "gasmix_index": None,
                }
            current["time_ms"] = int(val.time)

        elif sample_type == DC_SAMPLE_DEPTH:
            current["depth_m"] = float(val.depth)

        elif sample_type == DC_SAMPLE_TEMPERATURE:
            current["temperature_c"] = float(val.temperature)

        elif sample_type == DC_SAMPLE_PRESSURE:
            current["tank_pressure_bar"][str(int(val.pressure.tank))] = float(val.pressure.value)

        elif sample_type == DC_SAMPLE_GASMIX:
            current["gasmix_index"] = int(val.gasmix)

    cb = DC_SAMPLE_CALLBACK(sample_cb)
    _SAMPLE_CBS.append(cb)
    return cb


def make_dive_callback() -> DC_DIVE_CALLBACK:
    def dive_cb(
        data_ptr: POINTER(c_ubyte),
        size: int,
        fingerprint_ptr: POINTER(c_ubyte),
        fsize: int,
        userdata: c_void_p,
    ) -> int:
        try:
            state = cast(userdata, POINTER(py_object)).contents.value

            raw_data = ctypes.string_at(data_ptr, size)
            fingerprint = ctypes.string_at(fingerprint_ptr, fsize) if fingerprint_ptr and fsize > 0 else None

            # Per libdivecomputer docs, save the fingerprint from the first (newest) downloaded dive.
            if state.first_fingerprint is None and fingerprint:
                state.first_fingerprint = fingerprint

            parser = POINTER(dc_parser_t)()
            raw_array = (c_ubyte * len(raw_data)).from_buffer_copy(raw_data)
            check(
                LIB.dc_parser_new(byref(parser), state.device, raw_array, len(raw_data)),
                "dc_parser_new",
            )

            try:
                dt = dc_datetime_t()
                started_at = None
                if LIB.dc_parser_get_datetime(parser, byref(dt)) == DC_STATUS_SUCCESS:
                    started_at = dt_to_iso(dt)

                duration_seconds = None
                max_depth_m = None
                avg_depth_m = None

                divetime = c_uint()
                if LIB.dc_parser_get_field(parser, DC_FIELD_DIVETIME, 0, byref(divetime)) == DC_STATUS_SUCCESS:
                    duration_seconds = int(divetime.value)

                maxdepth = c_double()
                if LIB.dc_parser_get_field(parser, DC_FIELD_MAXDEPTH, 0, byref(maxdepth)) == DC_STATUS_SUCCESS:
                    max_depth_m = float(maxdepth.value)

                avgdepth = c_double()
                if LIB.dc_parser_get_field(parser, DC_FIELD_AVGDEPTH, 0, byref(avgdepth)) == DC_STATUS_SUCCESS:
                    avg_depth_m = float(avgdepth.value)

                samples: list[dict] = []
                sample_cb = make_sample_collector(samples)
                LIB.dc_parser_samples_foreach(parser, sample_cb, None)

                inserted = insert_dive(
                    state.conn,
                    state.vendor,
                    state.product,
                    fingerprint,
                    started_at,
                    duration_seconds,
                    max_depth_m,
                    avg_depth_m,
                    raw_data,
                    samples,
                )
                if inserted:
                    state.imported += 1
                else:
                    state.skipped += 1

            finally:
                LIB.dc_parser_destroy(parser)

            return 1  # continue iteration

        except Exception as exc:
            print(f"ERROR in dive callback: {exc}", file=sys.stderr)
            return 0  # stop iteration

    cb = DC_DIVE_CALLBACK(dive_cb)
    _DIVE_CBS.append(cb)
    return cb


# ----------------------------
# Main sync routine
# ----------------------------

def sync_dives(port: str, db_path: str, vendor: str = "Mares", product: str = "Smart Air") -> None:
    conn = sqlite3.connect(db_path)
    init_db(conn)

    context = POINTER(dc_context_t)()
    check(LIB.dc_context_new(byref(context)), "dc_context_new")

    descriptor = None
    iostream = POINTER(dc_iostream_t)()
    device = POINTER(dc_device_t)()

    try:
        descriptor = find_descriptor(context, vendor, product)

        check(LIB.dc_serial_open(byref(iostream), context, port.encode("utf-8")), "dc_serial_open")
        check(LIB.dc_device_open(byref(device), context, descriptor, iostream), "dc_device_open")

        saved_fp = get_saved_fingerprint(conn, vendor, product)
        if saved_fp:
            fp_buf = (c_ubyte * len(saved_fp)).from_buffer_copy(saved_fp)
            check(
                LIB.dc_device_set_fingerprint(device, fp_buf, len(saved_fp)),
                "dc_device_set_fingerprint",
            )

        state = ImportState(conn, device, vendor, product)
        state_box = py_object(state)
        state_ptr = ctypes.pointer(state_box)

        dive_cb = make_dive_callback()
        check(LIB.dc_device_foreach(device, dive_cb, cast(state_ptr, c_void_p)), "dc_device_foreach")

        # Save newest fingerprint for next run.
        if state.first_fingerprint is not None:
            save_fingerprint(conn, vendor, product, state.first_fingerprint)

        print(f"Imported: {state.imported}")
        print(f"Skipped existing: {state.skipped}")
        if state.first_fingerprint:
            print(f"Saved fingerprint: {state.first_fingerprint.hex()}")

    finally:
        if device:
            LIB.dc_device_close(device)
        if iostream:
            LIB.dc_iostream_close(iostream)
        if descriptor:
            LIB.dc_descriptor_free(descriptor)
        if context:
            LIB.dc_context_free(context)
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, help="Serial port, e.g. /dev/ttyUSB0 or /dev/tty.SLAB_USBtoUART")
    parser.add_argument("--db", required=True, help="SQLite database path")
    parser.add_argument("--vendor", default="Mares")
    parser.add_argument("--product", default="Smart Air")
    args = parser.parse_args()

    sync_dives(args.port, args.db, args.vendor, args.product)


if __name__ == "__main__":
    main()
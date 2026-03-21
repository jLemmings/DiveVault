#!/usr/bin/env python3
"""
Download dives from a Mares Smart Air using libdivecomputer and store them in PostgreSQL
or send them to a backend API.

Tested logic-wise against the libdivecomputer v0.9.0 public headers/API layout,
but you should still expect to do a little hardware-specific debugging the first time.

Usage:
    python mares_smart_air_sync.py --port /dev/ttyUSB0 --database-url postgresql://dive:dive@localhost:5432/dive
    python mares_smart_air_sync.py --port COM3 --backend-url http://localhost:8000

Notes:
- This example uses SERIAL transport (clip/cable). The Mares Smart Air also supports BLE,
  but serial is simpler for a minimal first version.
- It stores a per-device fingerprint so subsequent runs only import newer dives.
"""

from __future__ import annotations

import argparse
import base64
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
import sys
import os
from datetime import datetime, timezone
from urllib import error, parse, request

from postgres_store import get_device_state, insert_dive_record, open_db, save_device_state


# ----------------------------
# Constants from public headers
# ----------------------------

DC_STATUS_SUCCESS = 0
DC_STATUS_DONE = 1  # iterator end / not-an-error in libdivecomputer docs

DC_FIELD_DIVETIME = 0
DC_FIELD_MAXDEPTH = 1
DC_FIELD_AVGDEPTH = 2
DC_FIELD_GASMIX_COUNT = 3
DC_FIELD_GASMIX = 4
DC_FIELD_SALINITY = 5
DC_FIELD_ATMOSPHERIC = 6
DC_FIELD_TEMPERATURE_SURFACE = 7
DC_FIELD_TEMPERATURE_MINIMUM = 8
DC_FIELD_TEMPERATURE_MAXIMUM = 9
DC_FIELD_TANK_COUNT = 10
DC_FIELD_TANK = 11
DC_FIELD_DIVEMODE = 12

DC_SAMPLE_TIME = 0
DC_SAMPLE_DEPTH = 1
DC_SAMPLE_PRESSURE = 2
DC_SAMPLE_TEMPERATURE = 3
DC_SAMPLE_EVENT = 4
DC_SAMPLE_RBT = 5
DC_SAMPLE_HEARTBEAT = 6
DC_SAMPLE_BEARING = 7
DC_SAMPLE_VENDOR = 8
DC_SAMPLE_SETPOINT = 9
DC_SAMPLE_PPO2 = 10
DC_SAMPLE_CNS = 11
DC_SAMPLE_DECO = 12
DC_SAMPLE_GASMIX = 13


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


class dc_gasmix_t(Structure):
    _fields_ = [
        ("oxygen", c_double),
        ("helium", c_double),
        ("nitrogen", c_double),
    ]


class dc_salinity_t(Structure):
    _fields_ = [
        ("type", c_uint),
        ("density", c_double),
    ]


class dc_tank_t(Structure):
    _fields_ = [
        ("gasmix", c_uint),
        ("type", c_uint),
        ("volume", c_double),
        ("workpressure", c_double),
        ("beginpressure", c_double),
        ("endpressure", c_double),
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


def build_dive_record(
    vendor: str,
    product: str,
    fingerprint: bytes | None,
    started_at: str | None,
    duration_seconds: int | None,
    max_depth_m: float | None,
    avg_depth_m: float | None,
    fields: dict,
    raw_data: bytes,
    samples: list[dict],
) -> dict:
    fingerprint_hex = fingerprint.hex() if fingerprint else None
    raw_sha256 = hashlib.sha256(raw_data).hexdigest()
    return {
        "vendor": vendor,
        "product": product,
        "fingerprint_hex": fingerprint_hex,
        "dive_uid": f"{vendor}:{product}:{fingerprint_hex or raw_sha256}",
        "started_at": started_at,
        "duration_seconds": duration_seconds,
        "max_depth_m": max_depth_m,
        "avg_depth_m": avg_depth_m,
        "fields": fields,
        "raw_sha256": raw_sha256,
        "raw_data_b64": base64.b64encode(raw_data).decode("ascii"),
        "samples": samples,
    }


class PostgresDiveStore:
    def __init__(self, database_url: str) -> None:
        self.conn = open_db(database_url)

    def get_saved_fingerprint(self, vendor: str, product: str) -> bytes | None:
        state = get_device_state(self.conn, vendor, product)
        fingerprint_hex = state.get("fingerprint_hex")
        return bytes.fromhex(fingerprint_hex) if fingerprint_hex else None

    def save_fingerprint(self, vendor: str, product: str, fp: bytes | None) -> None:
        save_device_state(self.conn, vendor, product, fp.hex() if fp else None)

    def insert_dive_record(self, record: dict) -> bool:
        return insert_dive_record(self.conn, record)

    def close(self) -> None:
        self.conn.close()


class BackendDiveStore:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def _request_json(self, method: str, path: str, payload: dict | None = None, query: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{parse.urlencode(query)}"

        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(url, data=data, method=method, headers=headers)
        try:
            with request.urlopen(req, timeout=30) as response:
                body = response.read()
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Backend request failed: {method} {url} -> {exc.code} {details}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Could not reach backend at {self.base_url}: {exc.reason}") from exc

        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    def get_saved_fingerprint(self, vendor: str, product: str) -> bytes | None:
        payload = self._request_json(
            "GET",
            "/api/device-state",
            query={"vendor": vendor, "product": product},
        )
        fingerprint_hex = payload.get("fingerprint_hex")
        return bytes.fromhex(fingerprint_hex) if fingerprint_hex else None

    def save_fingerprint(self, vendor: str, product: str, fp: bytes | None) -> None:
        self._request_json(
            "PUT",
            "/api/device-state",
            payload={
                "vendor": vendor,
                "product": product,
                "fingerprint_hex": fp.hex() if fp else None,
            },
        )

    def insert_dive_record(self, record: dict) -> bool:
        payload = self._request_json("POST", "/api/dives", payload=record)
        return bool(payload.get("inserted"))

    def close(self) -> None:
        return None


# ----------------------------
# Helpers
# ----------------------------

def check(status: int, what: str) -> None:
    if status != DC_STATUS_SUCCESS:
        raise RuntimeError(f"{what} failed with libdivecomputer status={status}")


def get_parser_field(parser: POINTER(dc_parser_t), field_type: int, value, flags: int = 0):
    status = LIB.dc_parser_get_field(parser, field_type, flags, byref(value))
    if status == DC_STATUS_SUCCESS:
        return value
    return None


def get_uint_parser_field(parser: POINTER(dc_parser_t), field_type: int, flags: int = 0) -> int | None:
    value = get_parser_field(parser, field_type, c_uint(), flags)
    return int(value.value) if value is not None else None


def get_double_parser_field(parser: POINTER(dc_parser_t), field_type: int, flags: int = 0) -> float | None:
    value = get_parser_field(parser, field_type, c_double(), flags)
    return float(value.value) if value is not None else None


def extract_dive_fields(parser: POINTER(dc_parser_t)) -> dict:
    fields = {
        "divetime_seconds": get_uint_parser_field(parser, DC_FIELD_DIVETIME),
        "max_depth_m": get_double_parser_field(parser, DC_FIELD_MAXDEPTH),
        "avg_depth_m": get_double_parser_field(parser, DC_FIELD_AVGDEPTH),
        "gasmix_count": get_uint_parser_field(parser, DC_FIELD_GASMIX_COUNT),
        "gasmixes": None,
        "salinity": None,
        "atmospheric_bar": get_double_parser_field(parser, DC_FIELD_ATMOSPHERIC),
        "temperature_surface_c": get_double_parser_field(parser, DC_FIELD_TEMPERATURE_SURFACE),
        "temperature_minimum_c": get_double_parser_field(parser, DC_FIELD_TEMPERATURE_MINIMUM),
        "temperature_maximum_c": get_double_parser_field(parser, DC_FIELD_TEMPERATURE_MAXIMUM),
        "tank_count": get_uint_parser_field(parser, DC_FIELD_TANK_COUNT),
        "tanks": None,
        "dive_mode_code": get_uint_parser_field(parser, DC_FIELD_DIVEMODE),
    }

    if fields["gasmix_count"] is not None:
        gasmixes = []
        for index in range(fields["gasmix_count"]):
            gasmix = get_parser_field(parser, DC_FIELD_GASMIX, dc_gasmix_t(), index)
            if gasmix is None:
                gasmixes.append(None)
                continue
            gasmixes.append(
                {
                    "index": index,
                    "oxygen_fraction": float(gasmix.oxygen),
                    "helium_fraction": float(gasmix.helium),
                    "nitrogen_fraction": float(gasmix.nitrogen),
                }
            )
        fields["gasmixes"] = gasmixes

    salinity = get_parser_field(parser, DC_FIELD_SALINITY, dc_salinity_t())
    if salinity is not None:
        fields["salinity"] = {
            "type_code": int(salinity.type),
            "density": float(salinity.density),
        }

    if fields["tank_count"] is not None:
        tanks = []
        for index in range(fields["tank_count"]):
            tank = get_parser_field(parser, DC_FIELD_TANK, dc_tank_t(), index)
            if tank is None:
                tanks.append(None)
                continue
            tanks.append(
                {
                    "index": index,
                    "gasmix_index": int(tank.gasmix),
                    "type_code": int(tank.type),
                    "volume": float(tank.volume),
                    "workpressure_bar": float(tank.workpressure),
                    "beginpressure_bar": float(tank.beginpressure),
                    "endpressure_bar": float(tank.endpressure),
                }
            )
        fields["tanks"] = tanks

    return fields


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
        store,
        device: POINTER(dc_device_t),
        vendor: str,
        product: str,
    ) -> None:
        self.store = store
        self.device = device
        self.vendor = vendor
        self.product = product
        self.first_fingerprint: bytes | None = None
        self.imported = 0
        self.skipped = 0


# Keep callback objects alive
_SAMPLE_CBS: list = []
_DIVE_CBS: list = []


def new_sample_row() -> dict:
    return {
        "time_seconds": None,
        "depth_m": None,
        "temperature_c": None,
        "tank_pressure_bar": {},
        "events": [],
        "rbt_seconds": None,
        "heartbeat_bpm": None,
        "bearing_degrees": None,
        "vendor_samples": [],
        "setpoint_bar": None,
        "ppo2_bar": {},
        "cns_fraction": None,
        "deco": None,
        "gasmix_index": None,
    }


def make_sample_collector(samples: list[dict]):
    current = new_sample_row()

    def flush_current() -> None:
        if any(v not in (None, {}, []) for v in current.values()):
            row = {
                "time_seconds": current["time_seconds"],
                "depth_m": current["depth_m"],
                "temperature_c": current["temperature_c"],
                "tank_pressure_bar": current["tank_pressure_bar"] or None,
                "events": current["events"] or None,
                "rbt_seconds": current["rbt_seconds"],
                "heartbeat_bpm": current["heartbeat_bpm"],
                "bearing_degrees": current["bearing_degrees"],
                "vendor_samples": current["vendor_samples"] or None,
                "setpoint_bar": current["setpoint_bar"],
                "ppo2_bar": current["ppo2_bar"] or None,
                "cns_fraction": current["cns_fraction"],
                "deco": current["deco"],
                "gasmix_index": current["gasmix_index"],
            }
            samples.append(row)

    def sample_cb(sample_type: int, value_ptr: POINTER(dc_sample_value_t), _userdata: c_void_p) -> None:
        nonlocal current
        val = value_ptr.contents

        if sample_type == DC_SAMPLE_TIME:
            # Start a new row when time advances.
            if current["time_seconds"] is not None:
                flush_current()
                current = new_sample_row()
            current["time_seconds"] = int(val.time)

        elif sample_type == DC_SAMPLE_DEPTH:
            current["depth_m"] = float(val.depth)

        elif sample_type == DC_SAMPLE_TEMPERATURE:
            current["temperature_c"] = float(val.temperature)

        elif sample_type == DC_SAMPLE_PRESSURE:
            current["tank_pressure_bar"][str(int(val.pressure.tank))] = float(val.pressure.value)

        elif sample_type == DC_SAMPLE_EVENT:
            current["events"].append(
                {
                    "type_code": int(val.event.type),
                    "time_seconds": int(val.event.time),
                    "flags": int(val.event.flags),
                    "value": int(val.event.value),
                }
            )

        elif sample_type == DC_SAMPLE_RBT:
            current["rbt_seconds"] = int(val.rbt)

        elif sample_type == DC_SAMPLE_HEARTBEAT:
            current["heartbeat_bpm"] = int(val.heartbeat)

        elif sample_type == DC_SAMPLE_BEARING:
            current["bearing_degrees"] = int(val.bearing)

        elif sample_type == DC_SAMPLE_VENDOR:
            size = int(val.vendor.size)
            data_hex = None
            if val.vendor.data and size > 0:
                data_hex = ctypes.string_at(val.vendor.data, size).hex()
            current["vendor_samples"].append(
                {
                    "type_code": int(val.vendor.type),
                    "size": size,
                    "data_hex": data_hex,
                }
            )

        elif sample_type == DC_SAMPLE_SETPOINT:
            current["setpoint_bar"] = float(val.setpoint)

        elif sample_type == DC_SAMPLE_PPO2:
            current["ppo2_bar"][str(int(val.ppo2.sensor))] = float(val.ppo2.value)

        elif sample_type == DC_SAMPLE_CNS:
            current["cns_fraction"] = float(val.cns)

        elif sample_type == DC_SAMPLE_DECO:
            current["deco"] = {
                "type_code": int(val.deco.type),
                "time_seconds": int(val.deco.time),
                "depth_m": float(val.deco.depth),
                "tts_seconds": int(val.deco.tts),
            }

        elif sample_type == DC_SAMPLE_GASMIX:
            current["gasmix_index"] = int(val.gasmix)

    cb = DC_SAMPLE_CALLBACK(sample_cb)
    _SAMPLE_CBS.append(cb)
    return cb, flush_current


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

                fields = extract_dive_fields(parser)
                duration_seconds = fields["divetime_seconds"]
                max_depth_m = fields["max_depth_m"]
                avg_depth_m = fields["avg_depth_m"]

                samples: list[dict] = []
                sample_cb, finalize_samples = make_sample_collector(samples)
                check(LIB.dc_parser_samples_foreach(parser, sample_cb, None), "dc_parser_samples_foreach")
                finalize_samples()

                record = build_dive_record(
                    state.vendor,
                    state.product,
                    fingerprint,
                    started_at,
                    duration_seconds,
                    max_depth_m,
                    avg_depth_m,
                    fields,
                    raw_data,
                    samples,
                )
                inserted = state.store.insert_dive_record(record)
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

def sync_dives(
    port: str,
    vendor: str = "Mares",
    product: str = "Smart Air",
    database_url: str | None = None,
    backend_url: str | None = None,
) -> None:
    if backend_url:
        store = BackendDiveStore(backend_url)
    elif database_url:
        store = PostgresDiveStore(database_url)
    else:
        raise ValueError("Provide either --database-url or --backend-url.")

    context = POINTER(dc_context_t)()
    check(LIB.dc_context_new(byref(context)), "dc_context_new")

    descriptor = None
    iostream = POINTER(dc_iostream_t)()
    device = POINTER(dc_device_t)()

    try:
        descriptor = find_descriptor(context, vendor, product)

        check(LIB.dc_serial_open(byref(iostream), context, port.encode("utf-8")), "dc_serial_open")
        check(LIB.dc_device_open(byref(device), context, descriptor, iostream), "dc_device_open")

        saved_fp = store.get_saved_fingerprint(vendor, product)
        if saved_fp:
            fp_buf = (c_ubyte * len(saved_fp)).from_buffer_copy(saved_fp)
            check(
                LIB.dc_device_set_fingerprint(device, fp_buf, len(saved_fp)),
                "dc_device_set_fingerprint",
            )

        state = ImportState(store, device, vendor, product)
        state_box = py_object(state)
        state_ptr = ctypes.pointer(state_box)

        dive_cb = make_dive_callback()
        check(LIB.dc_device_foreach(device, dive_cb, cast(state_ptr, c_void_p)), "dc_device_foreach")

        # Save newest fingerprint for next run.
        if state.first_fingerprint is not None:
            store.save_fingerprint(vendor, product, state.first_fingerprint)

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
        store.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, help="Serial port, e.g. /dev/ttyUSB0 or /dev/tty.SLAB_USBtoUART")
    parser.add_argument("--database-url", help="PostgreSQL connection string")
    parser.add_argument("--backend-url", help="Backend base URL, e.g. http://localhost:8000")
    parser.add_argument("--vendor", default="Mares")
    parser.add_argument("--product", default="Smart Air")
    args = parser.parse_args()

    if not args.database_url and not args.backend_url:
        parser.error("Provide either --database-url or --backend-url.")

    sync_dives(
        port=args.port,
        vendor=args.vendor,
        product=args.product,
        database_url=args.database_url,
        backend_url=args.backend_url,
    )


if __name__ == "__main__":
    main()

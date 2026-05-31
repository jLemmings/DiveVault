# DiveVault Migration And Import Guide

Use this guide when moving existing dive logs into DiveVault. Imports do not go
straight into the finished logbook. DiveVault places imported rows in the import
queue first, where you can review each dive, complete required logbook fields,
and then commit the dive.

## Before You Import

1. Start DiveVault and sign in.
2. Open `Settings` and review the required logbook fields for your instance.
3. Make a backup of the source system before exporting.
4. Import a small sample first when migrating a large logbook.

Duplicate imports are skipped using the stored raw import hash and generated
dive identity. Importing the same source file again should not create another
copy of the same dive.

## Import From CSV

CSV import is intended for spreadsheets and other logbook exports that can be
normalized into one row per dive.

In the web app:

1. Open `Settings`.
2. Go to `Data Management`.
3. Choose `Import Dives (CSV)`.
4. Select a `.csv` file.
5. Open the import queue and review the imported dives.

The CSV file must have a header row. These fields are recognized:

```text
dive_uid,vendor,product,fingerprint_hex,started_at,date,time,duration_seconds,duration_minutes,max_depth_m,avg_depth_m,site,buddy,guide,weather_description,visibility,wetsuit_description,notes,temperature_surface_c,temperature_minimum_c,temperature_maximum_c,tank_volume_l,begin_pressure_bar,end_pressure_bar,gas_o2_percent,gas_he_percent,imported_at,samples_json
```

Required dive data:

- `started_at`, or both `date` and `time`
- `duration_seconds`, or `duration_minutes`
- `max_depth_m`

Common optional fields:

- `site`, `buddy`, `guide`, `notes`
- `avg_depth_m`
- `temperature_surface_c`, `temperature_minimum_c`, `temperature_maximum_c`
- `tank_volume_l`, `begin_pressure_bar`, `end_pressure_bar`
- `gas_o2_percent`, `gas_he_percent`
- `samples_json`

`samples_json` must be a JSON array. Each sample can include values such as
`time_seconds`, `depth_m`, `temperature_c`, and `tank_pressure_bar`.

A complete example is available at
[`examples/csv/divevault-csv-import-all-fields.csv`](../examples/csv/divevault-csv-import-all-fields.csv).

## Import From Subsurface

Subsurface import is intended for native Subsurface exports. DiveVault can read
plain XML/SSRF exports, gzip-compressed exports, and ZIP archives containing an
`.xml` or `.ssrf` export.

In Subsurface:

1. Open the logbook you want to migrate.
2. Export the logbook as a Subsurface XML or SSRF file.
3. Keep the exported file unchanged if possible, especially when preserving
   dive computer samples.

In DiveVault:

1. Open `Settings`.
2. Go to `Data Management`.
3. Choose `Import Subsurface Export`.
4. Select the exported `.xml`, `.ssrf`, `.gz`, or `.zip` file.
5. Review the preview.
6. Confirm the import.
7. Open the import queue and review the imported dives.

The Subsurface importer reads the dive date/time, duration, maximum depth,
average depth, samples, site name, GPS location, buddy, guide/divemaster,
weather, visibility, suit, notes, temperature, cylinder pressure, cylinder size,
and gas mix when those values are present in the export.

## After Importing

Imported dives remain staged until they satisfy the required logbook fields.
Open each imported dive from the import queue, correct any migrated metadata,
add missing fields, and commit it to the logbook.

For large migrations, work in batches:

1. Import one exported file.
2. Review the summary and duplicate warning.
3. Commit or discard staged dives.
4. Repeat with the next file.

## Limits And Troubleshooting

Default upload limits are:

- CSV import: `5 MiB`
- Subsurface import: `15 MiB`

Self-hosted instances can adjust these with:

```text
MAX_CSV_IMPORT_BYTES
MAX_SUBSURFACE_IMPORT_BYTES
```

Common CSV errors:

- `CSV import requires a header row`: add the header line.
- `started_at is required`: provide `started_at` or both `date` and `time`.
- `duration_seconds or duration_minutes is required`: provide one duration field.
- `max_depth_m is required`: provide the maximum depth in meters.
- `samples_json must be valid JSON`: check quoting in the CSV cell.

Common Subsurface errors:

- `Subsurface import must be a valid XML export`: export again from Subsurface as
  XML/SSRF.
- `Subsurface archive does not contain an XML export`: check that the ZIP file
  contains an `.xml` or `.ssrf` file.
- `missing duration` or `missing max depth`: check the source dive in Subsurface
  and re-export after correcting it.

## Full DiveVault Backup Restore

Use `Settings` -> `Backup` -> `Import From Backup` only when restoring a
DiveVault backup archive. Backup restore is different from CSV and Subsurface
migration: it restores DiveVault account data, saved lists, PDFs, imported dive
state, and logbook records from a DiveVault backup file.

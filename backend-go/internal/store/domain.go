package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type DeviceState struct {
	UserID         string  `json:"user_id,omitempty"`
	Vendor         string  `json:"vendor"`
	Product        string  `json:"product"`
	FingerprintHex *string `json:"fingerprint_hex"`
	UpdatedAt      string  `json:"updated_at"`
}

type Dive struct {
	ID              int64          `json:"id"`
	UserID          string         `json:"user_id,omitempty"`
	Vendor          string         `json:"vendor"`
	Product         string         `json:"product"`
	FingerprintHex  *string        `json:"fingerprint_hex"`
	DiveUID         string         `json:"dive_uid"`
	StartedAt       *string        `json:"started_at"`
	DurationSeconds *int64         `json:"duration_seconds"`
	DurationMS      *int64         `json:"duration_ms,omitempty"`
	MaxDepthM       *float64       `json:"max_depth_m"`
	AvgDepthM       *float64       `json:"avg_depth_m"`
	ImportPayload   map[string]any `json:"import_payload"`
	Fields          map[string]any `json:"fields"`
	RawSHA256       string         `json:"raw_sha256"`
	RawDataB64      string         `json:"raw_data_b64,omitempty"`
	Samples         []any          `json:"samples,omitempty"`
	SampleCount     int            `json:"sample_count"`
	ImportedAt      string         `json:"imported_at"`
}

func (db *DB) GetDeviceState(ctx context.Context, userID string, vendor string, product string) (DeviceState, error) {
	state := DeviceState{UserID: cleanText(userID), Vendor: cleanText(vendor), Product: cleanText(product), UpdatedAt: ""}
	err := db.pool.QueryRow(ctx, `
        SELECT fingerprint_hex, updated_at FROM device_state
        WHERE user_id=$1 AND vendor=$2 AND product=$3
    `, state.UserID, state.Vendor, state.Product).Scan(&state.FingerprintHex, &state.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return state, nil
	}
	return state, err
}

func (db *DB) SaveDeviceState(ctx context.Context, userID string, vendor string, product string, fingerprintHex *string) error {
	_, err := db.pool.Exec(ctx, `
        INSERT INTO device_state(user_id, vendor, product, fingerprint_hex, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, vendor, product)
        DO UPDATE SET fingerprint_hex=excluded.fingerprint_hex, updated_at=excluded.updated_at
    `, cleanText(userID), cleanText(vendor), cleanText(product), fingerprintHex, nowISO())
	return err
}

func (db *DB) InsertDiveRecord(ctx context.Context, userID string, payload map[string]any) (bool, error) {
	rawB64, _ := payload["raw_data_b64"].(string)
	rawData, err := base64.StdEncoding.DecodeString(rawB64)
	if err != nil {
		return false, errors.New("raw_data_b64 must be valid base64")
	}
	fields := mapValue(payload["fields"])
	samples := sliceValue(payload["samples"])
	importPayload := cloneMap(payload)
	delete(importPayload, "raw_data_b64")
	if _, ok := importPayload["fields"]; !ok {
		importPayload["fields"] = fields
	}
	if _, ok := importPayload["samples"]; !ok {
		importPayload["samples"] = samples
	}
	fieldsJSON, _ := json.Marshal(fields)
	samplesJSON, _ := json.Marshal(samples)
	importJSON, _ := json.Marshal(importPayload)
	vendor := stringValue(payload["vendor"])
	product := stringValue(payload["product"])
	diveUID := stringValue(payload["dive_uid"])
	rawSHA256 := stringValue(payload["raw_sha256"])
	fingerprint := nullableString(payload["fingerprint_hex"])
	startedAt := nullableString(payload["started_at"])
	durationMS := nullableInt64(payload["duration_ms"])
	durationSeconds := nullableInt64(payload["duration_seconds"])
	if durationSeconds == nil && durationMS != nil {
		value := *durationMS / 1000
		durationSeconds = &value
	}
	maxDepth := nullableFloat64(payload["max_depth_m"])
	avgDepth := nullableFloat64(payload["avg_depth_m"])
	importedAt := stringValue(payload["imported_at"])
	if importedAt == "" {
		importedAt = nowISO()
	}
	tag, err := db.pool.Exec(ctx, `
        INSERT INTO dives(user_id, vendor, product, fingerprint_hex, dive_uid, started_at, duration_seconds, duration_ms, max_depth_m, avg_depth_m, import_payload_json, fields_json, raw_sha256, raw_data, samples_json, imported_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (user_id, dive_uid) DO NOTHING
    `, cleanText(userID), vendor, product, fingerprint, diveUID, startedAt, durationSeconds, durationMS, maxDepth, avgDepth, importJSON, fieldsJSON, rawSHA256, rawData, samplesJSON, importedAt)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (db *DB) GetDiveIDByUID(ctx context.Context, userID string, diveUID string) (*int64, error) {
	var id int64
	err := db.pool.QueryRow(ctx, "SELECT id FROM dives WHERE user_id=$1 AND dive_uid=$2", cleanText(userID), cleanText(diveUID)).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &id, err
}

func (db *DB) ListDives(ctx context.Context, userID string, includeSamples bool, includeRawData bool, limit int, offset int) ([]Dive, int, error) {
	if limit <= 0 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	var total int
	if err := db.pool.QueryRow(ctx, "SELECT COUNT(*) FROM dives WHERE user_id=$1", cleanText(userID)).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := db.pool.Query(ctx, `
        SELECT id, user_id, vendor, product, fingerprint_hex, dive_uid, started_at, duration_seconds, duration_ms,
               max_depth_m, avg_depth_m, import_payload_json, fields_json, raw_sha256, raw_data, samples_json, imported_at
        FROM dives WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST, id DESC LIMIT $2 OFFSET $3
    `, cleanText(userID), limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	dives, err := scanDives(rows, includeSamples, includeRawData)
	return dives, total, err
}

func (db *DB) ListAllDives(ctx context.Context, userID string, includeSamples bool, includeRawData bool) ([]Dive, error) {
	rows, err := db.pool.Query(ctx, `
        SELECT id, user_id, vendor, product, fingerprint_hex, dive_uid, started_at, duration_seconds, duration_ms,
               max_depth_m, avg_depth_m, import_payload_json, fields_json, raw_sha256, raw_data, samples_json, imported_at
        FROM dives WHERE user_id=$1 ORDER BY started_at DESC NULLS LAST, id DESC
    `, cleanText(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDives(rows, includeSamples, includeRawData)
}

func (db *DB) GetDive(ctx context.Context, userID string, diveID int64, includeRawData bool) (*Dive, error) {
	rows, err := db.pool.Query(ctx, `
        SELECT id, user_id, vendor, product, fingerprint_hex, dive_uid, started_at, duration_seconds, duration_ms,
               max_depth_m, avg_depth_m, import_payload_json, fields_json, raw_sha256, raw_data, samples_json, imported_at
        FROM dives WHERE user_id=$1 AND id=$2
    `, cleanText(userID), diveID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	dives, err := scanDives(rows, true, includeRawData)
	if err != nil || len(dives) == 0 {
		return nil, err
	}
	return &dives[0], nil
}

func (db *DB) UpdateDiveLogbook(ctx context.Context, userID string, diveID int64, payload map[string]any) (*Dive, error) {
	existing, err := db.GetDive(ctx, userID, diveID, false)
	if err != nil || existing == nil {
		return existing, err
	}
	fields := existing.Fields
	logbook := mapValue(payload["logbook"])
	if len(logbook) == 0 {
		logbook = cloneMap(payload)
	}
	logbook["updated_at"] = nowISO()
	if _, ok := logbook["status"]; !ok {
		logbook["status"] = "complete"
	}
	fields["logbook"] = logbook
	fieldsJSON, _ := json.Marshal(fields)
	_, err = db.pool.Exec(ctx, "UPDATE dives SET fields_json=$1 WHERE user_id=$2 AND id=$3", fieldsJSON, cleanText(userID), diveID)
	if err != nil {
		return nil, err
	}
	return db.GetDive(ctx, userID, diveID, false)
}

func (db *DB) DeleteDive(ctx context.Context, userID string, diveID int64) (bool, error) {
	tag, err := db.pool.Exec(ctx, "DELETE FROM dives WHERE user_id=$1 AND id=$2", cleanText(userID), diveID)
	return tag.RowsAffected() > 0, err
}

func scanDives(rows pgx.Rows, includeSamples bool, includeRawData bool) ([]Dive, error) {
	dives := []Dive{}
	for rows.Next() {
		var dive Dive
		var importJSON, fieldsJSON, samplesJSON []byte
		var rawData []byte
		if err := rows.Scan(&dive.ID, &dive.UserID, &dive.Vendor, &dive.Product, &dive.FingerprintHex, &dive.DiveUID, &dive.StartedAt, &dive.DurationSeconds, &dive.DurationMS, &dive.MaxDepthM, &dive.AvgDepthM, &importJSON, &fieldsJSON, &dive.RawSHA256, &rawData, &samplesJSON, &dive.ImportedAt); err != nil {
			return nil, err
		}
		dive.ImportPayload = decodeMap(importJSON)
		dive.Fields = decodeMap(fieldsJSON)
		samples := decodeSlice(samplesJSON)
		dive.SampleCount = len(samples)
		if includeSamples {
			dive.Samples = samples
		}
		if includeRawData {
			dive.RawDataB64 = base64.StdEncoding.EncodeToString(rawData)
		}
		if dive.DurationSeconds == nil && dive.DurationMS != nil {
			value := *dive.DurationMS / 1000
			dive.DurationSeconds = &value
		}
		dives = append(dives, dive)
	}
	return dives, rows.Err()
}

func (db *DB) GetUserProfile(ctx context.Context, userID string) (map[string]any, error) {
	profile := map[string]any{
		"user_id":                     cleanText(userID),
		"name":                        "",
		"email":                       "",
		"public_dives_enabled":        false,
		"public_slug":                 "",
		"logbook_display_fields":      []any{},
		"required_logbook_fields":     []any{"site"},
		"equipment_selection_enabled": true,
		"licenses":                    []any{},
		"dive_sites":                  []any{},
		"buddies":                     []any{},
		"guides":                      []any{},
	}
	var name, email, publicSlug string
	var publicEnabled, equipmentSelection bool
	var logbookDisplayJSON, requiredJSON []byte
	err := db.pool.QueryRow(ctx, `
        SELECT name, email, public_dives_enabled, public_slug, logbook_display_fields_json, required_logbook_fields_json, equipment_selection_enabled
        FROM user_profile WHERE user_id=$1
    `, cleanText(userID)).Scan(&name, &email, &publicEnabled, &publicSlug, &logbookDisplayJSON, &requiredJSON, &equipmentSelection)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile, nil
	}
	if err != nil {
		return nil, err
	}
	profile["name"] = name
	profile["email"] = email
	profile["public_dives_enabled"] = publicEnabled
	profile["public_slug"] = publicSlug
	profile["equipment_selection_enabled"] = equipmentSelection
	profile["logbook_display_fields"] = decodeSlice(logbookDisplayJSON)
	profile["required_logbook_fields"] = decodeSlice(requiredJSON)
	profile["licenses"], _ = db.listCollection(ctx, "user_profile_licenses", "license_id", userID)
	profile["dive_sites"], _ = db.listCollection(ctx, "user_profile_dive_sites", "site_id", userID)
	profile["buddies"], _ = db.listCollection(ctx, "user_profile_buddies", "buddy_id", userID)
	profile["guides"], _ = db.listCollection(ctx, "user_profile_guides", "guide_id", userID)
	return profile, nil
}

func (db *DB) SaveUserProfile(ctx context.Context, userID string, payload map[string]any) (map[string]any, error) {
	existing, _ := db.GetUserProfile(ctx, userID)
	name := stringOrExisting(payload["name"], existing["name"])
	email := stringOrExisting(payload["email"], existing["email"])
	publicSlug := stringOrExisting(payload["public_slug"], existing["public_slug"])
	publicEnabled := boolOrExisting(payload["public_dives_enabled"], existing["public_dives_enabled"])
	equipmentSelection := boolOrExisting(payload["equipment_selection_enabled"], existing["equipment_selection_enabled"])
	displayJSON, _ := json.Marshal(valueOr(payload["logbook_display_fields"], existing["logbook_display_fields"]))
	requiredJSON, _ := json.Marshal(valueOr(payload["required_logbook_fields"], existing["required_logbook_fields"]))
	_, err := db.pool.Exec(ctx, `
        INSERT INTO user_profile(user_id, name, email, public_dives_enabled, public_slug, logbook_display_fields_json, required_logbook_fields_json, equipment_selection_enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) DO UPDATE SET
            name=excluded.name, email=excluded.email, public_dives_enabled=excluded.public_dives_enabled,
            public_slug=excluded.public_slug, logbook_display_fields_json=excluded.logbook_display_fields_json,
            required_logbook_fields_json=excluded.required_logbook_fields_json,
            equipment_selection_enabled=excluded.equipment_selection_enabled, updated_at=excluded.updated_at
    `, cleanText(userID), name, email, publicEnabled, publicSlug, displayJSON, requiredJSON, equipmentSelection, nowISO())
	if err != nil {
		return nil, err
	}
	return db.GetUserProfile(ctx, userID)
}

func (db *DB) GetProfileLicensePDF(ctx context.Context, userID string, licenseID string) (string, string, []byte, error) {
	var filename, contentType string
	var data []byte
	err := db.pool.QueryRow(ctx, `
        SELECT filename, content_type, pdf_data FROM user_profile_license_documents
        WHERE user_id=$1 AND license_id=$2
    `, cleanText(userID), cleanText(licenseID)).Scan(&filename, &contentType, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, nil
	}
	return filename, contentType, data, err
}

func (db *DB) SaveProfileLicensePDF(ctx context.Context, userID string, licenseID string, filename string, contentType string, data []byte) (map[string]any, error) {
	var exists int
	err := db.pool.QueryRow(ctx, "SELECT 1 FROM user_profile_licenses WHERE user_id=$1 AND license_id=$2", cleanText(userID), cleanText(licenseID)).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = db.pool.Exec(ctx, `
        INSERT INTO user_profile_license_documents(user_id, license_id, filename, content_type, pdf_data, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, license_id)
        DO UPDATE SET filename=excluded.filename, content_type=excluded.content_type, pdf_data=excluded.pdf_data, uploaded_at=excluded.uploaded_at
    `, cleanText(userID), cleanText(licenseID), cleanText(filename), cleanText(contentType), data, nowISO())
	if err != nil {
		return nil, err
	}
	return db.GetUserProfile(ctx, userID)
}

func (db *DB) PublicProfile(ctx context.Context, slug string) (map[string]any, []Dive, error) {
	var userID string
	err := db.pool.QueryRow(ctx, `
        SELECT user_id FROM user_profile WHERE public_dives_enabled=TRUE AND public_slug=$1
    `, cleanText(slug)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	profile, err := db.GetUserProfile(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	delete(profile, "email")
	delete(profile, "licenses")
	dives, err := db.ListAllDives(ctx, userID, false, false)
	if err != nil {
		return nil, nil, err
	}
	return profile, dives, nil
}

func (db *DB) listCollection(ctx context.Context, table string, idColumn string, userID string) ([]any, error) {
	rows, err := db.pool.Query(ctx, "SELECT row_to_json(t) FROM (SELECT * FROM "+table+" WHERE user_id=$1 ORDER BY "+idColumn+") t", cleanText(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []any{}
	for rows.Next() {
		var body []byte
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		item := decodeMap(body)
		item["id"] = item[idColumn]
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) ListEquipment(ctx context.Context, userID string) ([]map[string]any, error) {
	rows, err := db.pool.Query(ctx, "SELECT row_to_json(t) FROM (SELECT * FROM user_equipment WHERE user_id=$1 ORDER BY name, equipment_id) t", cleanText(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var body []byte
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}
		item := decodeMap(body)
		item["id"] = item["equipment_id"]
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *DB) SaveEquipment(ctx context.Context, userID string, entries []any) ([]map[string]any, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "DELETE FROM user_equipment WHERE user_id=$1", cleanText(userID)); err != nil {
		return nil, err
	}
	for _, entry := range entries {
		item := mapValue(entry)
		id := stringValue(valueOr(item["id"], item["equipment_id"]))
		if id == "" {
			id = "equipment_" + time.Now().UTC().Format("20060102150405.000000000")
		}
		_, err := tx.Exec(ctx, `
            INSERT INTO user_equipment(user_id, equipment_id, name, category, icon, type, year_bought, vendor, brand, model, serial, warranty, next_service_due, service_interval_months, last_service_date, max_dives_before_service, track_service, service_tag, is_default, is_standard, last_serviced_at, last_service_dive_count, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        `, cleanText(userID), id, stringValue(item["name"]), stringValue(item["category"]), stringValue(item["icon"]), stringValue(item["type"]), nullableInt64(item["year_bought"]), stringValue(item["vendor"]), stringValue(item["brand"]), stringValue(item["model"]), stringValue(item["serial"]), stringValue(item["warranty"]), stringValue(item["next_service_due"]), nullableInt64(item["service_interval_months"]), stringValue(item["last_service_date"]), nullableInt64(item["max_dives_before_service"]), boolOrExisting(item["track_service"], true), stringValue(item["service_tag"]), boolOrExisting(item["is_default"], false), boolOrExisting(item["is_standard"], false), nullableString(item["last_serviced_at"]), intValue(item["last_service_dive_count"]), nowISO())
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return db.ListEquipment(ctx, userID)
}

func (db *DB) MarkEquipmentServiced(ctx context.Context, userID string, equipmentID string) (map[string]any, error) {
	tag, err := db.pool.Exec(ctx, `
        UPDATE user_equipment SET last_serviced_at=$1, last_service_dive_count=0, updated_at=$1
        WHERE user_id=$2 AND equipment_id=$3
    `, nowISO(), cleanText(userID), cleanText(equipmentID))
	if err != nil || tag.RowsAffected() == 0 {
		return nil, err
	}
	items, err := db.ListEquipment(ctx, userID)
	for _, item := range items {
		if stringValue(item["equipment_id"]) == equipmentID {
			return item, err
		}
	}
	return nil, err
}

func decodeMap(body []byte) map[string]any {
	value := map[string]any{}
	_ = json.Unmarshal(body, &value)
	return value
}

func decodeSlice(body []byte) []any {
	value := []any{}
	_ = json.Unmarshal(body, &value)
	return value
}

func mapValue(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return cloneMap(typed)
	}
	return map[string]any{}
}

func sliceValue(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return []any{}
}

func cloneMap(value map[string]any) map[string]any {
	next := map[string]any{}
	for key, item := range value {
		next[key] = item
	}
	return next
}

func stringValue(value any) string {
	if typed, ok := value.(string); ok {
		return cleanText(typed)
	}
	return ""
}

func nullableString(value any) *string {
	text := stringValue(value)
	if text == "" {
		return nil
	}
	return &text
}

func nullableInt64(value any) *int64 {
	switch typed := value.(type) {
	case int64:
		return &typed
	case int:
		next := int64(typed)
		return &next
	case float64:
		next := int64(typed)
		return &next
	default:
		return nil
	}
}

func nullableFloat64(value any) *float64 {
	switch typed := value.(type) {
	case float64:
		return &typed
	case int:
		next := float64(typed)
		return &next
	case int64:
		next := float64(typed)
		return &next
	default:
		return nil
	}
}

func boolOrExisting(value any, fallback any) bool {
	if typed, ok := value.(bool); ok {
		return typed
	}
	if typed, ok := fallback.(bool); ok {
		return typed
	}
	return false
}

func stringOrExisting(value any, fallback any) string {
	if text := stringValue(value); text != "" {
		return text
	}
	return stringValue(fallback)
}

func valueOr(value any, fallback any) any {
	if value == nil {
		return fallback
	}
	return value
}

func intValue(value any) int {
	if parsed := nullableInt64(value); parsed != nil {
		return int(*parsed)
	}
	return 0
}

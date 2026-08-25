package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/jlemmings/divevault/backend-go/internal/exports"
	"github.com/jlemmings/divevault/backend-go/internal/importers"
)

func handleDeviceStateGet(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	vendor := ctx.Request.URL.Query().Get("vendor")
	product := ctx.Request.URL.Query().Get("product")
	if vendor == "" || product == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "vendor and product are required"})
		return
	}
	state, err := db.GetDeviceState(ctx.Request.Context(), ctx.PrincipalID, vendor, product)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, state)
}

func handleDeviceStatePut(ctx *Context) {
	var payload struct {
		Vendor         string  `json:"vendor"`
		Product        string  `json:"product"`
		FingerprintHex *string `json:"fingerprint_hex"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if payload.Vendor == "" || payload.Product == "" {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "vendor and product are required"})
		return
	}
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if err := db.SaveDeviceState(ctx.Request.Context(), ctx.PrincipalID, payload.Vendor, payload.Product, payload.FingerprintHex); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	state, _ := db.GetDeviceState(ctx.Request.Context(), ctx.PrincipalID, payload.Vendor, payload.Product)
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, state)
}

func handleDivesGet(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	q := ctx.Request.URL.Query()
	limit := parseQueryInt(q.Get("limit"), 100, ctx.Server.cfg.MaxListLimit)
	offset := parseQueryInt(q.Get("offset"), 0, 0)
	dives, total, err := db.ListDives(ctx.Request.Context(), ctx.PrincipalID, isTruthy(q.Get("include_samples")), isTruthy(q.Get("include_raw_data")), limit, offset)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"dives": dives, "stats": summarizeDives(dives), "imported_count": 0, "limit": limit, "offset": offset, "total": total})
}

func handleDiveGet(ctx *Context) {
	diveID, ok := pathID(ctx.Request.URL.Path, "/api/dives/")
	if !ok {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	dive, err := ctx.Server.db.GetDive(ctx.Request.Context(), ctx.PrincipalID, diveID, isTruthy(ctx.Request.URL.Query().Get("include_raw_data")))
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if dive == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, dive)
}

func handleDivePost(ctx *Context) {
	var payload map[string]any
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	missing := []string{}
	for _, key := range []string{"vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64"} {
		if strings.TrimSpace(stringAny(payload[key])) == "" {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Missing required fields: " + strings.Join(missing, ", ")})
		return
	}
	inserted, err := ctx.Server.db.InsertDiveRecord(ctx.Request.Context(), ctx.PrincipalID, payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	id, _ := ctx.Server.db.GetDiveIDByUID(ctx.Request.Context(), ctx.PrincipalID, stringAny(payload["dive_uid"]))
	status := http.StatusOK
	if inserted {
		status = http.StatusCreated
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, status, map[string]any{"inserted": inserted, "id": id})
}

func handleDiveLogbookPut(ctx *Context) {
	diveID, ok := pathLogbookID(ctx.Request.URL.Path)
	if !ok {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	var payload map[string]any
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	dive, err := ctx.Server.db.UpdateDiveLogbook(ctx.Request.Context(), ctx.PrincipalID, diveID, payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if dive == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, dive)
}

func handleDiveDelete(ctx *Context) {
	diveID, ok := pathID(ctx.Request.URL.Path, "/api/dives/")
	if !ok {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	deleted, err := ctx.Server.db.DeleteDive(ctx.Request.Context(), ctx.PrincipalID, diveID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if !deleted {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Dive not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"deleted": true, "id": diveID})
}

func handleProfileGet(ctx *Context) {
	profile, err := ctx.Server.db.GetUserProfile(ctx.Request.Context(), ctx.PrincipalID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, profile)
}

func handleProfilePut(ctx *Context) {
	var payload map[string]any
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	profile, err := ctx.Server.db.SaveUserProfile(ctx.Request.Context(), ctx.PrincipalID, payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, profile)
}

func handlePublicProfileGet(ctx *Context) {
	slug := strings.TrimPrefix(ctx.Request.URL.Path, "/api/public/divers/")
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	profile, dives, err := db.PublicProfile(ctx.Request.Context(), slug)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if profile == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Public dive profile not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"diver": profile, "dives": dives, "stats": summarizeDives(dives)})
}

func handleProfileLicenseGet(ctx *Context) {
	licenseID := strings.TrimSuffix(strings.TrimPrefix(ctx.Request.URL.Path, "/api/profile/licenses/"), "/pdf")
	filename, contentType, data, err := ctx.Server.db.GetProfileLicensePDF(ctx.Request.Context(), ctx.PrincipalID, licenseID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if data == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "License PDF not found"})
		return
	}
	writeBytes(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, data, contentType, map[string]string{"Content-Disposition": `inline; filename="` + filename + `"`, "Cache-Control": "no-store"})
}

func handleProfileLicensePut(ctx *Context) {
	licenseID := strings.TrimSuffix(strings.TrimPrefix(ctx.Request.URL.Path, "/api/profile/licenses/"), "/pdf")
	var payload struct {
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
		DataB64     string `json:"data_b64"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	filename, contentType, data, err := decodePDFPayload(payload.Filename, payload.ContentType, payload.DataB64)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	profile, err := ctx.Server.db.SaveProfileLicensePDF(ctx.Request.Context(), ctx.PrincipalID, licenseID, filename, contentType, data)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if profile == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "License entry not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, profile)
}

func handleEquipmentGet(ctx *Context) {
	equipment, err := ctx.Server.db.ListEquipment(ctx.Request.Context(), ctx.PrincipalID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"equipment": equipment})
}

func handleEquipmentPut(ctx *Context) {
	var payload struct {
		Equipment []any `json:"equipment"`
	}
	if err := readJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	equipment, err := ctx.Server.db.SaveEquipment(ctx.Request.Context(), ctx.PrincipalID, payload.Equipment)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"equipment": equipment})
}

func handleEquipmentServicePost(ctx *Context) {
	equipmentID := strings.TrimSuffix(strings.TrimPrefix(ctx.Request.URL.Path, "/api/equipment/"), "/service")
	equipment, err := ctx.Server.db.MarkEquipmentServiced(ctx.Request.Context(), ctx.PrincipalID, equipmentID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	if equipment == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotFound, map[string]string{"error": "Equipment item not found"})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"equipment": equipment})
}

func handleDivesCSVExport(ctx *Context) {
	dives, err := ctx.Server.db.ListAllDives(ctx.Request.Context(), ctx.PrincipalID, true, false)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	body, err := exports.DivesCSV(dives)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "CSV export failed"})
		return
	}
	filename := exports.AttachmentFilename("divevault-dives-" + exports.TimestampSlug() + ".csv")
	writeBytes(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, body, "text/csv; charset=utf-8", map[string]string{"Content-Disposition": `attachment; filename="` + filename + `"`, "Cache-Control": "no-store"})
}

func handleDivesPDFExport(ctx *Context) {
	dives, err := ctx.Server.db.ListAllDives(ctx.Request.Context(), ctx.PrincipalID, true, false)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	filename := exports.AttachmentFilename("divevault-dives-" + exports.TimestampSlug() + ".pdf")
	writeBytes(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, exports.MinimalPDF(dives), "application/pdf", map[string]string{"Content-Disposition": `attachment; filename="` + filename + `"`, "Cache-Control": "no-store"})
}

func handleCSVImportPost(ctx *Context) {
	body, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid CSV import request body"})
		return
	}
	csvText := string(body)
	if strings.HasPrefix(ctx.Request.Header.Get("Content-Type"), "application/json") {
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid CSV import request body"})
			return
		}
		csvText = stringAny(payload["csv"])
	}
	payloads, rows, err := importers.CSVPayloads(csvText)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	summary := map[string]any{"rows": len(rows), "dives": rows}
	if isTruthy(ctx.Request.URL.Query().Get("dry_run")) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"dry_run": true, "summary": summary})
		return
	}
	inserted := 0
	ids := []int64{}
	for _, payload := range payloads {
		ok, err := ctx.Server.db.InsertDiveRecord(ctx.Request.Context(), ctx.PrincipalID, payload)
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error(), "summary": ""})
			return
		}
		if ok {
			inserted++
		}
		if id, _ := ctx.Server.db.GetDiveIDByUID(ctx.Request.Context(), ctx.PrincipalID, stringAny(payload["dive_uid"])); id != nil {
			ids = append(ids, *id)
		}
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"rows": len(payloads), "inserted": inserted, "duplicates": len(payloads) - inserted, "ids": ids, "summary": summary})
}

func handleSubsurfaceImportPost(ctx *Context) {
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusNotImplemented, map[string]string{"error": "Subsurface import is not implemented in Go backend yet"})
}

func handleBackupExport(ctx *Context) {
	db := ctx.Server.db
	profile, _ := db.GetUserProfile(ctx.Request.Context(), ctx.PrincipalID)
	dives, _ := db.ListAllDives(ctx.Request.Context(), ctx.PrincipalID, true, true)
	deviceStates := []any{}
	equipment, _ := db.ListEquipment(ctx.Request.Context(), ctx.PrincipalID)
	payload := map[string]any{"version": 1, "exported_at": time.Now().UTC().Format(time.RFC3339Nano), "profile": profile, "dives": dives, "device_states": deviceStates, "equipment": equipment, "license_documents": []any{}}
	body, err := exports.BackupArchive(payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Backup export failed"})
		return
	}
	filename := exports.AttachmentFilename("divevault-backup-" + exports.TimestampSlug() + ".zip")
	writeBytes(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, body, "application/zip", map[string]string{"Content-Disposition": `attachment; filename="` + filename + `"`, "Cache-Control": "no-store"})
}

func handleBackupImport(ctx *Context) {
	body, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid backup body"})
		return
	}
	var payload map[string]any
	if strings.Contains(ctx.Request.Header.Get("Content-Type"), "zip") {
		reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		for _, file := range reader.File {
			if file.Name != "divevault-backup.json" {
				continue
			}
			rc, _ := file.Open()
			data, _ := io.ReadAll(rc)
			_ = rc.Close()
			_ = json.Unmarshal(data, &payload)
		}
	} else if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if payload == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Backup archive is missing divevault-backup.json"})
		return
	}
	inserted := 0
	if dives, ok := payload["dives"].([]any); ok {
		for _, dive := range dives {
			itemBytes, _ := json.Marshal(dive)
			var item map[string]any
			_ = json.Unmarshal(itemBytes, &item)
			if item["raw_data_b64"] == nil {
				item["raw_data_b64"] = base64.StdEncoding.EncodeToString([]byte("{}"))
			}
			ok, _ := ctx.Server.db.InsertDiveRecord(ctx.Request.Context(), ctx.PrincipalID, item)
			if ok {
				inserted++
			}
		}
	}
	result := map[string]any{"summary": map[string]any{"dives_inserted": inserted, "device_states_imported": 0, "license_documents_imported": 0}}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, result)
}

func writeBytes(w http.ResponseWriter, corsOrigin string, status int, body []byte, contentType string, headers map[string]string) {
	applyCORS(w.Header(), corsOrigin)
	applySecurityHeaders(w.Header())
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	for key, value := range headers {
		w.Header().Set(key, value)
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func decodePDFPayload(filename string, contentType string, dataB64 string) (string, string, []byte, error) {
	if strings.TrimSpace(dataB64) == "" {
		return "", "", nil, errors.New("License PDF upload requires data_b64")
	}
	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return "", "", nil, errors.New("License PDF must be valid base64")
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return "", "", nil, errors.New("License file must be a PDF")
	}
	if len(data) > 10*1024*1024 {
		return "", "", nil, errors.New("License PDF must be 10 MB or smaller")
	}
	if strings.TrimSpace(contentType) == "" {
		contentType = "application/pdf"
	}
	if strings.ToLower(strings.TrimSpace(contentType)) != "application/pdf" {
		return "", "", nil, errors.New("License file must use content_type application/pdf")
	}
	filename = strings.ReplaceAll(filename, "\\", "/")
	parts := strings.Split(filename, "/")
	filename = strings.TrimSpace(parts[len(parts)-1])
	if filename == "" {
		filename = "diving-licenses.pdf"
	}
	if !strings.HasSuffix(strings.ToLower(filename), ".pdf") {
		filename += ".pdf"
	}
	return filename, "application/pdf", data, nil
}

func parseQueryInt(value string, fallback int, maxValue int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		parsed = fallback
	}
	if maxValue > 0 && parsed > maxValue {
		return maxValue
	}
	return parsed
}

func isTruthy(value string) bool {
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func pathID(path string, prefix string) (int64, bool) {
	parsed, err := strconv.ParseInt(strings.TrimPrefix(path, prefix), 10, 64)
	return parsed, err == nil
}

func pathLogbookID(path string) (int64, bool) {
	value := strings.TrimSuffix(strings.TrimPrefix(path, "/api/dives/"), "/logbook")
	parsed, err := strconv.ParseInt(value, 10, 64)
	return parsed, err == nil
}

func stringAny(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func summarizeDives(dives any) map[string]any {
	value := reflect.ValueOf(dives)
	if value.IsValid() && value.Kind() == reflect.Slice {
		return map[string]any{"totalDives": value.Len()}
	}
	return map[string]any{"totalDives": 0}
}

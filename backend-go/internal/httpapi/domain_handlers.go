package httpapi

import (
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
	"github.com/jlemmings/divevault/backend-go/internal/geocode"
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
	var payload deviceStatePutRequest
	if err := readValidatedJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": badRequestMessage(err)})
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
	diveID, ok := pathInt64(ctx.Params["id"])
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
	diveID, ok := pathInt64(ctx.Params["id"])
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
	diveID, ok := pathInt64(ctx.Params["id"])
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
	slug := ctx.Params["slug"]
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
	licenseID := ctx.Params["id"]
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
	licenseID := ctx.Params["id"]
	var payload profileLicensePDFPutRequest
	if err := readValidatedJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": badRequestMessage(err)})
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
	var payload equipmentPutRequest
	if err := readValidatedJSON(ctx.Request, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": badRequestMessage(err)})
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
	equipmentID := ctx.Params["id"]
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
	preview, err := importers.CSVPreview(csvText)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	markDuplicateRows(ctx, preview.Rows)
	summary := importSummary(preview.Rows, nil, nil)
	if isTruthy(ctx.Request.URL.Query().Get("dry_run")) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"dry_run": true, "summary": summary})
		return
	}
	payloads, rows, err := importers.CSVPayloads(csvText)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	markDuplicateRows(ctx, rows)
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
	summary = importSummary(rows, &inserted, ids)
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"rows": len(rows), "inserted": inserted, "duplicates": summary["duplicates"], "ids": ids, "summary": summary})
}

func handleSubsurfaceImportPost(ctx *Context) {
	body, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid Subsurface import request body"})
		return
	}
	exportText, err := importers.DecodeSubsurfaceExport(body, ctx.Server.cfg.MaxSubsurfaceImportBytes)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	preview, err := importers.SubsurfacePreview(exportText)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	markDuplicateRows(ctx, preview.Rows)
	summary := importSummary(preview.Rows, nil, nil)
	if isTruthy(ctx.Request.URL.Query().Get("dry_run")) {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"dry_run": true, "summary": summary})
		return
	}
	payloads, rows, err := importers.SubsurfacePayloads(exportText)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	markDuplicateRows(ctx, rows)
	inserted := 0
	ids := []int64{}
	for _, payload := range payloads {
		ok, err := ctx.Server.db.InsertDiveRecord(ctx.Request.Context(), ctx.PrincipalID, payload)
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if ok {
			inserted++
		}
		if id, _ := ctx.Server.db.GetDiveIDByUID(ctx.Request.Context(), ctx.PrincipalID, stringAny(payload["dive_uid"])); id != nil {
			ids = append(ids, *id)
		}
	}
	summary = importSummary(rows, &inserted, ids)
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"rows": len(rows), "inserted": inserted, "duplicates": summary["duplicates"], "ids": ids, "summary": summary})
}

func handleGeocodeSearch(ctx *Context) {
	client := geocode.Client{
		BaseURL:   ctx.Server.cfg.NominatimBaseURL,
		UserAgent: ctx.Server.cfg.NominatimUserAgent,
		Email:     ctx.Server.cfg.NominatimEmail,
	}
	result, found, err := client.Search(ctx.Request.Context(), ctx.Request.URL.Query().Get("q"))
	if err != nil {
		if err.Error() == "Missing search query" {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	if !found {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"found": false, "result": nil})
		return
	}
	writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, map[string]any{"found": true, "result": result})
}

func handleBackupExport(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	profile, err := db.GetUserProfile(ctx.Request.Context(), ctx.PrincipalID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	dives, err := db.ListAllDives(ctx.Request.Context(), ctx.PrincipalID, true, true)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	deviceStates, err := db.ListDeviceStates(ctx.Request.Context(), ctx.PrincipalID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	equipment, err := db.ListEquipment(ctx.Request.Context(), ctx.PrincipalID)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	licenseDocuments := []map[string]any{}
	for _, license := range sliceValue(profile["licenses"]) {
		item := mapValue(license)
		licenseID := stringAny(valueOr(item["id"], item["license_id"]))
		if licenseID == "" {
			continue
		}
		filename, contentType, data, err := db.GetProfileLicensePDF(ctx.Request.Context(), ctx.PrincipalID, licenseID)
		if err == nil && data != nil {
			licenseDocuments = append(licenseDocuments, map[string]any{"license_id": licenseID, "filename": filename, "content_type": contentType, "data_b64": base64.StdEncoding.EncodeToString(data)})
		}
	}
	payload := map[string]any{"version": 1, "app": "DiveVault", "exported_at": time.Now().UTC().Format(time.RFC3339Nano), "source_user_id": ctx.PrincipalID, "profile": profile, "dives": dives, "device_states": deviceStates, "equipment": equipment, "license_documents": licenseDocuments}
	body, err := exports.BackupArchive(payload)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusInternalServerError, map[string]string{"error": "Backup export failed"})
		return
	}
	filename := exports.AttachmentFilename("divevault-backup-" + exports.TimestampSlug() + ".zip")
	writeBytes(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusOK, body, "application/zip", map[string]string{"Content-Disposition": `attachment; filename="` + filename + `"`, "Cache-Control": "no-store"})
}

func handleBackupImport(ctx *Context) {
	db, err := ctx.Server.requireDB()
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
		return
	}
	body, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid backup body"})
		return
	}
	var payload map[string]any
	if strings.Contains(ctx.Request.Header.Get("Content-Type"), "zip") {
		payload, err = readBackupZIPPayload(body, ctx.Server.cfg.MaxBackupImportBytes)
		if err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	} else if err := json.Unmarshal(body, &payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}
	if payload == nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Backup archive is missing backup.json"})
		return
	}
	if version, _ := payload["version"].(float64); int(version) != 1 {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Unsupported backup version"})
		return
	}
	if err := validateBackupPayload(payload); err != nil {
		writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	profile := mapValue(payload["profile"])
	if len(profile) > 0 {
		if _, err := db.SaveUserProfile(ctx.Request.Context(), ctx.PrincipalID, profile); err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
	}
	equipmentImported := 0
	if equipment, ok := payload["equipment"].([]any); ok {
		if _, err := db.SaveEquipment(ctx.Request.Context(), ctx.PrincipalID, equipment); err != nil {
			writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
			return
		}
		equipmentImported = len(equipment)
	}
	deviceStatesImported := 0
	if states, ok := payload["device_states"].([]any); ok {
		for _, state := range states {
			item := mapValue(state)
			vendor := stringAny(item["vendor"])
			product := stringAny(item["product"])
			if vendor == "" || product == "" {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Backup device state is missing vendor or product"})
				return
			}
			fingerprint := nullableStringAny(item["fingerprint_hex"])
			if err := db.SaveDeviceState(ctx.Request.Context(), ctx.PrincipalID, vendor, product, fingerprint); err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
				return
			}
			deviceStatesImported++
		}
	}
	inserted := 0
	if dives, ok := payload["dives"].([]any); ok {
		for _, dive := range dives {
			itemBytes, err := json.Marshal(dive)
			if err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Backup dive must be a JSON object"})
				return
			}
			var item map[string]any
			if err := json.Unmarshal(itemBytes, &item); err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "Backup dive must be a JSON object"})
				return
			}
			ok, err := db.InsertDiveRecord(ctx.Request.Context(), ctx.PrincipalID, item)
			if err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			if ok {
				inserted++
			}
		}
	}
	licenseDocumentsImported := 0
	if documents, ok := payload["license_documents"].([]any); ok {
		for _, document := range documents {
			item := mapValue(document)
			licenseID := stringAny(item["license_id"])
			dataB64 := stringAny(item["data_b64"])
			if licenseID == "" || dataB64 == "" {
				continue
			}
			filename, contentType, data, err := decodePDFPayload(stringAny(item["filename"]), defaultString(stringAny(item["content_type"]), "application/pdf"), dataB64)
			if err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			profile, err := db.SaveProfileLicensePDF(ctx.Request.Context(), ctx.PrincipalID, licenseID, filename, contentType, data)
			if err != nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusServiceUnavailable, map[string]string{"error": "Database unavailable: " + err.Error()})
				return
			}
			if profile == nil {
				writeJSON(ctx.ResponseWriter, ctx.Server.cfg.CORSOrigin, http.StatusBadRequest, map[string]string{"error": "License " + licenseID + " does not exist in the imported profile"})
				return
			}
			licenseDocumentsImported++
		}
	}
	result := map[string]any{"summary": map[string]any{"dives_in_backup": len(sliceValue(payload["dives"])), "dives_inserted": inserted, "device_states_imported": deviceStatesImported, "equipment_imported": equipmentImported, "license_documents_imported": licenseDocumentsImported}}
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

func pathInt64(value string) (int64, bool) {
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

func markDuplicateRows(ctx *Context, rows []map[string]any) {
	seen := map[string]bool{}
	for _, row := range rows {
		valid, _ := row["valid"].(bool)
		if !valid {
			continue
		}
		uid := stringAny(row["dive_uid"])
		duplicate := seen[uid]
		if uid != "" {
			if id, _ := ctx.Server.db.GetDiveIDByUID(ctx.Request.Context(), ctx.PrincipalID, uid); id != nil {
				duplicate = true
			}
			seen[uid] = true
		}
		row["duplicate"] = duplicate
		if duplicate {
			row["status"] = "duplicate"
		} else {
			row["status"] = "ready"
		}
	}
}

func importSummary(rows []map[string]any, inserted *int, ids []int64) map[string]any {
	validRows := 0
	invalidRows := 0
	readyRows := 0
	duplicates := 0
	for _, row := range rows {
		if valid, _ := row["valid"].(bool); valid {
			validRows++
		} else {
			invalidRows++
		}
		if row["status"] == "ready" {
			readyRows++
		}
		if dup, _ := row["duplicate"].(bool); dup || row["status"] == "duplicate" {
			duplicates++
		}
	}
	summary := map[string]any{"rows": len(rows), "valid_rows": validRows, "invalid_rows": invalidRows, "ready_rows": readyRows, "duplicates": duplicates, "dives": rows}
	if inserted != nil {
		summary["inserted"] = *inserted
	}
	if ids != nil {
		summary["ids"] = ids
	}
	return summary
}

func mapValue(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func sliceValue(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return []any{}
}

func valueOr(value any, fallback any) any {
	if value == nil {
		return fallback
	}
	return value
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func nullableStringAny(value any) *string {
	text := stringAny(value)
	if text == "" {
		return nil
	}
	return &text
}

func safeBackupPath(path string) bool {
	if path == "" || strings.HasPrefix(path, "/") || strings.HasPrefix(path, "\\") {
		return false
	}
	parts := strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == '\\' })
	for _, part := range parts {
		if part == ".." {
			return false
		}
	}
	return true
}

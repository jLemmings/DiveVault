package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
)

func readBackupZIPPayload(body []byte, maxBytes int64) (map[string]any, error) {
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return nil, err
	}
	names := map[string]*zip.File{}
	total := int64(0)
	for _, file := range reader.File {
		total += int64(file.UncompressedSize64)
		if _, exists := names[file.Name]; exists {
			return nil, errors.New("Backup archive contains duplicate path " + strconv.Quote(file.Name))
		}
		if !safeBackupPath(file.Name) {
			return nil, errors.New("Backup archive contains unsafe path " + strconv.Quote(file.Name))
		}
		if file.Name != "backup.json" && file.Name != "divevault-backup.json" && !strings.HasPrefix(file.Name, "licenses/") {
			return nil, errors.New("Backup archive contains unexpected path " + strconv.Quote(file.Name))
		}
		names[file.Name] = file
	}
	if total > maxBytes {
		return nil, errors.New("Backup archive exceeds size limit")
	}
	manifestName := "backup.json"
	if names[manifestName] == nil {
		manifestName = "divevault-backup.json"
	}
	manifestFile := names[manifestName]
	if manifestFile == nil {
		return nil, errors.New("Backup archive is missing backup.json")
	}
	manifestBytes, err := readBackupZipMember(manifestFile, maxBytes, "Backup archive backup.json exceeds size limit")
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(manifestBytes, &payload); err != nil {
		return nil, errors.New("Backup archive backup.json is invalid JSON")
	}
	documents, _ := payload["license_documents"].([]any)
	remainingBytes := maxBytes - int64(len(manifestBytes))
	for index, document := range documents {
		item := mapValue(document)
		if stringAny(item["data_b64"]) != "" {
			continue
		}
		filePath := stringAny(item["file_path"])
		file := names[filePath]
		if filePath == "" || file == nil || !safeBackupPath(filePath) {
			return nil, errors.New("Backup license document " + strconv.Itoa(index+1) + " references a missing file")
		}
		data, err := readBackupZipMember(file, remainingBytes, "Backup archive exceeds size limit")
		if err != nil {
			return nil, err
		}
		remainingBytes -= int64(len(data))
		item["data_b64"] = base64.StdEncoding.EncodeToString(data)
		documents[index] = item
	}
	payload["license_documents"] = documents
	return payload, nil
}

func readBackupZipMember(file *zip.File, maxBytes int64, sizeError string) ([]byte, error) {
	if maxBytes < 0 {
		return nil, errors.New(sizeError)
	}
	rc, err := file.Open()
	if err != nil {
		return nil, errors.New("Backup archive contains unreadable file")
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, maxBytes+1))
	if err != nil {
		return nil, errors.New("Backup archive contains unreadable file")
	}
	if int64(len(data)) > maxBytes {
		return nil, errors.New(sizeError)
	}
	return data, nil
}

func validateBackupPayload(payload map[string]any) error {
	if _, ok := payload["profile"].(map[string]any); payload["profile"] != nil && !ok {
		return errors.New("Backup profile must be an object")
	}
	for _, field := range []string{"equipment", "device_states", "dives", "license_documents"} {
		if _, ok := payload[field].([]any); payload[field] != nil && !ok {
			return errors.New("Backup " + field + " must be an array")
		}
	}
	for index, state := range sliceValue(payload["device_states"]) {
		item := mapValue(state)
		if stringAny(item["vendor"]) == "" || stringAny(item["product"]) == "" {
			return errors.New("Backup device state " + strconv.Itoa(index+1) + " is missing vendor or product")
		}
	}
	for index, dive := range sliceValue(payload["dives"]) {
		item := mapValue(dive)
		missing := []string{}
		for _, key := range []string{"vendor", "product", "dive_uid", "raw_sha256", "raw_data_b64"} {
			if stringAny(item[key]) == "" {
				missing = append(missing, key)
			}
		}
		if len(missing) > 0 {
			return errors.New("Backup dive " + strconv.Itoa(index+1) + " is missing required fields: " + strings.Join(missing, ", "))
		}
	}
	for index, document := range sliceValue(payload["license_documents"]) {
		item := mapValue(document)
		if stringAny(item["license_id"]) == "" {
			return errors.New("Backup license document " + strconv.Itoa(index+1) + " is missing license_id")
		}
		if stringAny(item["data_b64"]) == "" {
			return errors.New("Backup license document " + strconv.Itoa(index+1) + " is missing data_b64")
		}
	}
	return nil
}

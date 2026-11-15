package importers

import (
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
)

type xmlNode struct {
	XMLName xml.Name
	Attrs   []xml.Attr `xml:",any,attr"`
	Text    string     `xml:",chardata"`
	Nodes   []xmlNode  `xml:",any"`
}

func DecodeSubsurfaceExport(body []byte, maxUncompressedBytes int64) (string, error) {
	source := bytes.TrimPrefix(body, []byte{0xef, 0xbb, 0xbf})
	if len(source) >= 2 && source[0] == 0x1f && source[1] == 0x8b {
		reader, err := gzip.NewReader(bytes.NewReader(source))
		if err != nil {
			return "", errors.New("Subsurface export must be a valid gzip file")
		}
		defer reader.Close()
		data, err := readLimited(reader, maxUncompressedBytes, "Subsurface export")
		if err != nil {
			return "", err
		}
		return string(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})), nil
	}
	if zipReader, err := zip.NewReader(bytes.NewReader(source), int64(len(source))); err == nil {
		for _, file := range zipReader.File {
			lower := strings.ToLower(file.Name)
			if !strings.HasSuffix(lower, ".xml") && !strings.HasSuffix(lower, ".ssrf") {
				continue
			}
			rc, err := file.Open()
			if err != nil {
				return "", errors.New("Subsurface archive must be a valid ZIP entry")
			}
			data, readErr := readLimited(rc, maxUncompressedBytes, "Subsurface archive XML export")
			_ = rc.Close()
			if readErr != nil {
				return "", readErr
			}
			return string(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})), nil
		}
		return "", errors.New("Subsurface archive does not contain an XML export")
	}
	if int64(len(source)) > maxUncompressedBytes {
		return "", fmt.Errorf("Subsurface export exceeds %d byte uncompressed limit", maxUncompressedBytes)
	}
	return string(source), nil
}

func SubsurfacePayloads(exportText string) ([]map[string]any, []map[string]any, error) {
	preview, err := SubsurfacePreview(exportText)
	if err != nil {
		return nil, nil, err
	}
	for _, row := range preview.Rows {
		if valid, _ := row["valid"].(bool); !valid {
			errors, _ := row["errors"].([]string)
			message := "Invalid dive"
			if len(errors) > 0 {
				message = errors[0]
			}
			return nil, nil, fmt.Errorf("Subsurface dive %v: %s", row["row_number"], message)
		}
	}
	if len(preview.Payloads) == 0 {
		return nil, nil, errors.New("Subsurface import does not contain any dives")
	}
	return preview.Payloads, preview.Rows, nil
}

func SubsurfacePreview(exportText string) (Preview, error) {
	if strings.TrimSpace(exportText) == "" {
		return Preview{}, errors.New("Subsurface import file is empty")
	}
	var root xmlNode
	if err := xml.Unmarshal([]byte(exportText), &root); err != nil {
		return Preview{}, errors.New("Subsurface import must be a valid XML export")
	}
	sites := map[string]map[string]any{}
	walkXML(root, func(node xmlNode) {
		switch localXMLName(node) {
		case "site", "dive_site", "divesite":
			id := attr(node, "uuid", "id", "name")
			if id != "" {
				sites[id] = map[string]any{"name": firstNonEmpty(attr(node, "name"), childText(node, "name"), strings.TrimSpace(node.Text)), "gps": parseGPS(firstNonEmpty(attr(node, "gps"), attr(node, "location")))}
			}
		}
	})
	payloads := []map[string]any{}
	rows := []map[string]any{}
	index := 0
	walkXML(root, func(dive xmlNode) {
		if localXMLName(dive) != "dive" {
			return
		}
		index++
		payload, row, err := subsurfacePayload(dive, sites, index)
		if err != nil {
			rows = append(rows, map[string]any{"row_number": index, "source_id": attr(dive, "number"), "valid": false, "status": "invalid", "duplicate": false, "errors": []string{err.Error()}, "dive_uid": "", "started_at": "", "site": "", "duration_seconds": nil, "max_depth_m": nil, "sample_count": 0})
			return
		}
		payloads = append(payloads, payload)
		rows = append(rows, row)
	})
	if len(payloads) == 0 && len(rows) == 0 {
		return Preview{}, errors.New("Subsurface import does not contain any dives")
	}
	return Preview{Payloads: payloads, Rows: rows}, nil
}

func subsurfacePayload(dive xmlNode, sites map[string]map[string]any, index int) (map[string]any, map[string]any, error) {
	startedAt, err := subsurfaceStartedAt(dive)
	if err != nil {
		return nil, nil, err
	}
	computer := firstChild(dive, "divecomputer")
	depthNode := firstChild(computer, "depth")
	maxDepth := parseDepth(firstNonEmpty(attr(depthNode, "max"), attr(dive, "maxdepth")))
	avgDepth := parseDepth(attr(depthNode, "mean"))
	duration := parseDuration(firstNonEmpty(attr(dive, "duration"), childText(dive, "duration")))
	if duration == nil {
		return nil, nil, errors.New("missing duration")
	}
	samples := subsurfaceSamples(computer)
	if maxDepth == nil {
		for _, sample := range samples {
			sampleMap, _ := sample.(map[string]any)
			if depth, ok := sampleMap["depth_m"].(float64); ok && (maxDepth == nil || depth > *maxDepth) {
				next := depth
				maxDepth = &next
			}
		}
	}
	if maxDepth == nil {
		return nil, nil, errors.New("missing max depth")
	}
	site, gps := subsurfaceLocation(dive, sites)
	fields := map[string]any{"source": "subsurface", "subsurface_import": true, "logbook": map[string]any{"site": site, "buddy": childText(dive, "buddy"), "guide": firstNonEmpty(childText(dive, "divemaster"), childText(dive, "guide")), "weather_description": childText(dive, "weather"), "visibility": firstNonEmpty(attr(dive, "visibility"), childText(dive, "visibility")), "wetsuit_description": childText(dive, "suit"), "notes": childText(dive, "notes"), "status": "imported"}}
	if site != "" {
		fields["logbook"].(map[string]any)["status"] = "complete"
		fields["logbook"].(map[string]any)["completed_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if gps != nil {
		fields["location"] = gps
	}
	source, _ := xml.Marshal(dive)
	hash := sha256.Sum256(source)
	diveUID := "subsurface-" + hex.EncodeToString(hash[:])[:24]
	model := attr(computer, "model")
	payload := map[string]any{"vendor": "Subsurface", "product": defaultString(model, "Export"), "dive_uid": diveUID, "started_at": startedAt, "duration_seconds": *duration, "max_depth_m": *maxDepth, "avg_depth_m": avgDepth, "fields": fields, "raw_sha256": hex.EncodeToString(hash[:]), "raw_data_b64": base64.StdEncoding.EncodeToString(source), "samples": samples, "imported_at": time.Now().UTC().Format(time.RFC3339Nano), "subsurface_number": firstNonEmpty(attr(dive, "number"), fmt.Sprint(index))}
	row := map[string]any{"row_number": index, "source_id": payload["subsurface_number"], "valid": true, "status": "ready", "duplicate": false, "errors": []string{}, "dive_uid": diveUID, "started_at": startedAt, "site": site, "duration_seconds": *duration, "max_depth_m": *maxDepth, "sample_count": len(samples)}
	return payload, row, nil
}

func readLimited(reader io.Reader, maxBytes int64, label string) ([]byte, error) {
	var buffer bytes.Buffer
	limit := maxBytes
	if limit <= 0 {
		limit = 1
	}
	_, err := io.Copy(&buffer, io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(buffer.Len()) > limit {
		return nil, fmt.Errorf("%s exceeds %d byte uncompressed limit", label, maxBytes)
	}
	return buffer.Bytes(), nil
}

func walkXML(node xmlNode, visit func(xmlNode)) {
	visit(node)
	for _, child := range node.Nodes {
		walkXML(child, visit)
	}
}

func localXMLName(node xmlNode) string { return strings.ToLower(node.XMLName.Local) }

func attr(node xmlNode, names ...string) string {
	wanted := map[string]bool{}
	for _, name := range names {
		wanted[strings.ToLower(name)] = true
	}
	for _, attr := range node.Attrs {
		if wanted[strings.ToLower(attr.Name.Local)] {
			return strings.TrimSpace(attr.Value)
		}
	}
	return ""
}

func firstChild(node xmlNode, names ...string) xmlNode {
	wanted := map[string]bool{}
	for _, name := range names {
		wanted[strings.ToLower(name)] = true
	}
	for _, child := range node.Nodes {
		if wanted[localXMLName(child)] {
			return child
		}
	}
	return xmlNode{}
}

func childText(node xmlNode, names ...string) string {
	child := firstChild(node, names...)
	return strings.TrimSpace(textContent(child))
}

func textContent(node xmlNode) string {
	out := node.Text
	for _, child := range node.Nodes {
		out += textContent(child)
	}
	return out
}

func parseNumber(value string) *float64 {
	match := regexp.MustCompile(`-?\d+(?:\.\d+)?`).FindString(value)
	if match == "" {
		return nil
	}
	return ParseFloat(match)
}

func parseDepth(value string) *float64 {
	number := parseNumber(value)
	if number == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(value), "ft") {
		next := *number * 0.3048
		return &next
	}
	return number
}

func parsePressure(value string) *int {
	number := parseNumber(value)
	if number == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(value), "psi") {
		*number *= 0.0689476
	}
	next := int(*number + 0.5)
	return &next
}

func parseTemperature(value string) *float64 {
	number := parseNumber(value)
	if number == nil {
		return nil
	}
	if strings.Contains(strings.ToLower(value), "f") && !strings.Contains(strings.ToLower(value), "c") {
		next := (*number - 32) * 5 / 9
		return &next
	}
	return number
}

func parseDuration(value string) *int {
	text := strings.ToLower(strings.TrimSpace(value))
	matches := regexp.MustCompile(`(\d+):(\d+)(?::(\d+))?`).FindStringSubmatch(text)
	if len(matches) > 0 {
		first, _ := strconvAtoi(matches[1])
		second, _ := strconvAtoi(matches[2])
		third := 0
		if matches[3] != "" {
			third, _ = strconvAtoi(matches[3])
			next := first*3600 + second*60 + third
			return &next
		}
		next := first*60 + second
		return &next
	}
	number := parseNumber(text)
	if number == nil {
		return nil
	}
	next := int(*number*60 + 0.5)
	if strings.Contains(text, "hour") || regexp.MustCompile(`\bh\b`).MatchString(text) {
		next = int(*number*3600 + 0.5)
	} else if strings.Contains(text, "sec") {
		next = int(*number + 0.5)
	}
	return &next
}

func subsurfaceStartedAt(dive xmlNode) (string, error) {
	date := firstNonEmpty(attr(dive, "date"), childText(dive, "date"))
	timeValue := firstNonEmpty(attr(dive, "time"), childText(dive, "time"))
	if date == "" {
		return "", errors.New("missing dive date")
	}
	if timeValue == "" {
		return date, nil
	}
	timeValue = strings.TrimSuffix(timeValue, "Z")
	if len(timeValue) == 5 {
		timeValue += ":00"
	}
	return date + "T" + timeValue, nil
}

func parseGPS(value string) map[string]any {
	numbers := regexp.MustCompile(`-?\d+(?:\.\d+)?`).FindAllString(value, -1)
	if len(numbers) < 2 {
		return nil
	}
	lat := ParseFloat(numbers[0])
	lon := ParseFloat(numbers[1])
	if lat == nil || lon == nil || *lat < -90 || *lat > 90 || *lon < -180 || *lon > 180 {
		return nil
	}
	return map[string]any{"lat": *lat, "lon": *lon}
}

func subsurfaceLocation(dive xmlNode, sites map[string]map[string]any) (string, map[string]any) {
	location := firstChild(dive, "location", "site", "divesite")
	if location.XMLName.Local != "" {
		ref := firstNonEmpty(attr(location, "uuid"), attr(location, "ref"), attr(location, "site"))
		matched := sites[ref]
		name := firstNonEmpty(strings.TrimSpace(textContent(location)), attr(location, "name"), stringMapValue(matched, "name"))
		gps := parseGPS(firstNonEmpty(attr(location, "gps"), attr(location, "location")))
		if gps == nil && matched != nil {
			gps, _ = matched["gps"].(map[string]any)
		}
		return name, gps
	}
	matched := sites[firstNonEmpty(attr(dive, "divesiteid"), attr(dive, "siteid"), attr(dive, "site"))]
	gps, _ := matched["gps"].(map[string]any)
	return stringMapValue(matched, "name"), gps
}

func subsurfaceSamples(computer xmlNode) []any {
	samples := []any{}
	for _, child := range computer.Nodes {
		if localXMLName(child) != "sample" {
			continue
		}
		sample := map[string]any{}
		if value := parseDuration(attr(child, "time")); value != nil {
			sample["time_seconds"] = *value
		}
		if value := parseDepth(attr(child, "depth")); value != nil {
			sample["depth_m"] = *value
		}
		if value := parseTemperature(firstNonEmpty(attr(child, "temp"), attr(child, "temperature"))); value != nil {
			sample["temperature_c"] = *value
		}
		if value := parsePressure(firstNonEmpty(attr(child, "pressure"), attr(child, "tankpressure"))); value != nil {
			sample["tank_pressure_bar"] = *value
		}
		if len(sample) > 0 {
			samples = append(samples, sample)
		}
	}
	return samples
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func stringMapValue(value map[string]any, key string) string {
	if value == nil {
		return ""
	}
	text, _ := value[key].(string)
	return text
}

func strconvAtoi(value string) (int, error) {
	next := 0
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return 0, fmt.Errorf("invalid integer")
		}
		next = next*10 + int(ch-'0')
	}
	return next, nil
}

package httpapi

import (
	"errors"
	"net/http"
	"strings"
)

type deviceStatePutRequest struct {
	Vendor         string  `json:"vendor"`
	Product        string  `json:"product"`
	FingerprintHex *string `json:"fingerprint_hex"`
}

func (r *deviceStatePutRequest) Validate() error {
	r.Vendor = strings.TrimSpace(r.Vendor)
	r.Product = strings.TrimSpace(r.Product)
	if r.FingerprintHex != nil {
		value := strings.TrimSpace(*r.FingerprintHex)
		r.FingerprintHex = &value
	}
	if r.Vendor == "" || r.Product == "" {
		return errors.New("vendor and product are required")
	}
	return nil
}

type profileLicensePDFPutRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	DataB64     string `json:"data_b64"`
}

func (r *profileLicensePDFPutRequest) Validate() error {
	r.Filename = strings.TrimSpace(r.Filename)
	r.ContentType = strings.TrimSpace(r.ContentType)
	r.DataB64 = strings.TrimSpace(r.DataB64)
	if r.DataB64 == "" {
		return errors.New("License PDF upload requires data_b64")
	}
	return nil
}

type equipmentPutRequest struct {
	Equipment []any `json:"equipment"`
}

func (r *equipmentPutRequest) Validate() error {
	if r.Equipment == nil {
		return errors.New("equipment is required")
	}
	return nil
}

type validator interface {
	Validate() error
}

func readValidatedJSON(r *http.Request, dst validator) error {
	if err := readJSON(r, dst); err != nil {
		return err
	}
	return dst.Validate()
}

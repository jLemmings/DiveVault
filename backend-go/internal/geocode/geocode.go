package geocode

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	BaseURL   string
	UserAgent string
	Email     string
	HTTP      *http.Client
}

type Result struct {
	Name      string   `json:"name"`
	Display   string   `json:"display_name"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	Country   string   `json:"country"`
}

func (c Client) Search(ctx context.Context, query string) (Result, bool, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return Result{}, false, errors.New("Missing search query")
	}
	baseURL := strings.TrimRight(c.BaseURL, "/")
	if baseURL == "" {
		baseURL = "https://nominatim.openstreetmap.org"
	}
	values := url.Values{}
	values.Set("q", query)
	values.Set("format", "jsonv2")
	values.Set("limit", "1")
	values.Set("addressdetails", "1")
	if c.Email != "" {
		values.Set("email", c.Email)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/search?"+values.Encode(), nil)
	if err != nil {
		return Result{}, false, err
	}
	userAgent := c.UserAgent
	if userAgent == "" {
		userAgent = "DiveVault/1.0"
	}
	request.Header.Set("User-Agent", userAgent)
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	response, err := client.Do(request)
	if err != nil {
		return Result{}, false, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Result{}, false, fmt.Errorf("geocode upstream returned %d", response.StatusCode)
	}
	var rows []struct {
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
		Address     struct {
			Country string `json:"country"`
		} `json:"address"`
	}
	if err := json.NewDecoder(response.Body).Decode(&rows); err != nil {
		return Result{}, false, err
	}
	if len(rows) == 0 {
		return Result{}, false, nil
	}
	lat := parseFloat(rows[0].Lat)
	lon := parseFloat(rows[0].Lon)
	return Result{Name: rows[0].Name, Display: rows[0].DisplayName, Latitude: lat, Longitude: lon, Country: rows[0].Address.Country}, true, nil
}

func parseFloat(value string) *float64 {
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

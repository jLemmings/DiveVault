// Package exports renders downloadable DiveVault artifacts.
//
// The PDF export intentionally uses a small internal generator for the current
// text-only report. If the export grows to tables, pagination controls, images,
// or branded layout, replace MinimalPDF with a maintained PDF library and keep
// the package-level API stable.
package exports

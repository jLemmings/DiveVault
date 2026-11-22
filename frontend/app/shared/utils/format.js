import { i18n } from "~/i18n/index.js";
import { parseDate } from "~/shared/utils/core.js";

// English uses British forms so dates read "24 Oct" and times stay on the 24-hour clock, as on a chart.
const INTL_LOCALES = { en: "en-GB", de: "de-DE", fr: "fr-FR" };
const EMPTY = "–";

export function intlLocale() {
  return INTL_LOCALES[i18n.locale] || INTL_LOCALES.en;
}

export function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatNumber(value, digits = 0) {
  if (!isNumber(value)) return EMPTY;
  return new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function metres(value) {
  return isNumber(value) ? `${formatNumber(value, 1)} m` : EMPTY;
}

export function bar(value) {
  return isNumber(value) ? `${formatNumber(value)} bar` : EMPTY;
}

export function degrees(value) {
  return isNumber(value) ? `${formatNumber(value)} °C` : EMPTY;
}

export function minutes(seconds) {
  return isNumber(seconds) && seconds > 0 ? `${formatNumber(Math.round(seconds / 60))} min` : EMPTY;
}

// Date-only values are calendar days, so they must not shift with the viewer's time zone.
export function localDate(value) {
  return parseDate(/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? `${value}T00:00:00` : value);
}

function formatDateWith(value, options) {
  const date = localDate(value);
  if (!date) return EMPTY;
  // en-GB abbreviates September to four letters, which breaks the column of three-letter months.
  return new Intl.DateTimeFormat(intlLocale(), options).format(date).replace(/\bSept\b/, "Sep");
}

export function dayMonth(value) {
  const date = localDate(value);
  if (!date) return EMPTY;
  const options = { day: "numeric", month: "short" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return formatDateWith(value, options);
}

export function shortDate(value) {
  return formatDateWith(value, { day: "numeric", month: "short", year: "numeric" });
}

export function longDate(value) {
  return formatDateWith(value, { day: "numeric", month: "long", year: "numeric" });
}

export function dayMonthLong(value) {
  const date = localDate(value);
  if (!date) return EMPTY;
  const options = { day: "numeric", month: "long" };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = "numeric";
  return formatDateWith(value, options);
}

export function weekdayDate(value, { year = false } = {}) {
  const options = { weekday: "long", day: "numeric", month: "long" };
  if (year) options.year = "numeric";
  // The sketch sets "Sunday 15 November" without the comma Intl adds in some locales.
  return formatDateWith(value, options).replace(",", "");
}

export function clockTime(value) {
  return formatDateWith(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function dayMonthTime(value) {
  return parseDate(value) ? `${dayMonth(value)}, ${clockTime(value)}` : EMPTY;
}

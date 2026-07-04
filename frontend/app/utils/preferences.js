export const LOCALE_STORAGE_KEY = "divevault.preferredLocale";
export const THEME_STORAGE_KEY = "divevault.preferredTheme";
const SUPPORTED_THEMES = new Set(["system", "light", "dark"]);

export function normalizeLocale(locale, supportedLocales) {
  const normalized = typeof locale === "string" ? locale.trim().slice(0, 2).toLowerCase() : "";
  return supportedLocales.has(normalized) ? normalized : "en";
}

export function getStoredLocale(supportedLocales) {
  if (typeof window === "undefined") return "";
  try {
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY) || "";
    return supportedLocales.has(storedLocale) ? storedLocale : "";
  } catch (_error) {
    return "";
  }
}

export function getBrowserLocale(supportedLocales) {
  if (typeof navigator === "undefined") return "en";
  return normalizeLocale(navigator.language, supportedLocales);
}

export function normalizeThemePreference(theme) {
  const normalized = typeof theme === "string" ? theme.trim().toLowerCase() : "";
  return SUPPORTED_THEMES.has(normalized) ? normalized : "system";
}

export function getStoredThemePreference() {
  if (typeof window === "undefined") return "system";
  try {
    return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY) || "system");
  } catch (_error) {
    return "system";
  }
}

export function systemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveThemePreference(themePreference) {
  return normalizeThemePreference(themePreference) === "system" ? systemTheme() : normalizeThemePreference(themePreference);
}

export function applyDocumentTheme(themePreference) {
  if (typeof document === "undefined") return resolveThemePreference(themePreference);
  const normalizedPreference = normalizeThemePreference(themePreference);
  const resolvedTheme = resolveThemePreference(normalizedPreference);
  document.documentElement.dataset.themePreference = normalizedPreference;
  document.documentElement.dataset.theme = resolvedTheme;
  return resolvedTheme;
}



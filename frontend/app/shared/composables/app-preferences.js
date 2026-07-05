import { i18n } from "~/i18n/index.js";
import { SUPPORTED_LOCALE_CODES } from "~/i18n/locales.js";
import {
  applyDocumentTheme,
  getBrowserLocale,
  getStoredLocale,
  getStoredThemePreference,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  normalizeThemePreference,
  THEME_STORAGE_KEY
} from "~/shared/utils/preferences.js";

const SUPPORTED_LOCALES = new Set(SUPPORTED_LOCALE_CODES);

function createPreferenceState() {
  return {
    i18nLocale: getStoredLocale(SUPPORTED_LOCALES) || "en",
    themePreference: getStoredThemePreference(),
    resolvedTheme: applyDocumentTheme(getStoredThemePreference()),
    themeMediaQuery: null
  };
}

function translate(key, fallback = key, params = {}) {
  return i18n.t(key, fallback, params);
}

async function setLocale(app, locale) {
  const normalizedLocale = normalizeLocale(locale, SUPPORTED_LOCALES);
  await i18n.setLocale(normalizedLocale);
  app.i18nLocale = i18n.locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, app.i18nLocale);
    } catch (_error) {
      // Keep the active locale in memory if localStorage is unavailable.
    }
  }
}

function setThemePreference(app, themePreference) {
  const normalizedTheme = normalizeThemePreference(themePreference);
  app.themePreference = normalizedTheme;
  app.resolvedTheme = applyDocumentTheme(normalizedTheme);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    } catch (_error) {
      // Keep the active theme in memory if localStorage is unavailable.
    }
  }
}

function syncSystemTheme(app) {
  if (app.themePreference !== "system") return;
  app.resolvedTheme = applyDocumentTheme(app.themePreference);
}

function attachSystemThemeListener(app) {
  if (typeof window.matchMedia !== "function") return;

  app.themeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  if (typeof app.themeMediaQuery.addEventListener === "function") {
    app.themeMediaQuery.addEventListener("change", app.syncSystemTheme);
  } else {
    app.themeMediaQuery.addListener?.(app.syncSystemTheme);
  }
}

function detachSystemThemeListener(app) {
  if (typeof app.themeMediaQuery?.removeEventListener === "function") {
    app.themeMediaQuery.removeEventListener("change", app.syncSystemTheme);
  } else {
    app.themeMediaQuery?.removeListener?.(app.syncSystemTheme);
  }
}

async function initializePreferences(app) {
  await app.setLocale(getStoredLocale(SUPPORTED_LOCALES) || getBrowserLocale(SUPPORTED_LOCALES));
  app.setThemePreference(getStoredThemePreference());
  attachSystemThemeListener(app);
}

export {
  createPreferenceState,
  detachSystemThemeListener,
  initializePreferences,
  setLocale,
  setThemePreference,
  syncSystemTheme,
  translate
};

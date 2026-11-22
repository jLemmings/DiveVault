import { DEFAULT_LOCALE, LOCALES, SUPPORTED_LOCALE_SET, getTranslationCredits } from "./locales.js";

export { DEFAULT_LOCALE, LOCALES, getTranslationCredits };

let activeComposer = null;

function normalizeLookupKey(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function interpolate(message, params = {}) {
  return String(message).replace(/\{(\w+)\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

function composerLocaleValue(composer = activeComposer) {
  const locale = composer?.locale;
  return typeof locale === "object" && "value" in locale ? locale.value : locale;
}

function setComposerLocale(composer, locale) {
  if (!composer) return;
  if (typeof composer.setLocale === "function") {
    return composer.setLocale(locale);
  }
  if (typeof composer.locale === "object" && "value" in composer.locale) {
    composer.locale.value = locale;
    return;
  }
  composer.locale = locale;
}

function composerHasMessage(composer, key, locale = composerLocaleValue(composer)) {
  if (!composer || typeof composer.te !== "function") return false;
  return composer.te(key, locale) || composer.te(key, DEFAULT_LOCALE);
}

function translateMessage(key, fallback = key, params = {}) {
  const normalizedKey = normalizeLookupKey(key);
  const candidates = [key, normalizedKey].filter(Boolean);
  const messageKey = candidates.find((candidate) => composerHasMessage(activeComposer, candidate));
  if (messageKey && typeof activeComposer?.t === "function") {
    return activeComposer.t(messageKey, params);
  }
  return interpolate(fallback || normalizedKey, params);
}

// The English sentence is the key.
export function tx(text, params = {}) {
  return text ? translateMessage(text, text, params) : "";
}

export function txCount(count, one, many, params = {}) {
  return tx(count === 1 ? one : many, { count, ...params });
}

export const i18n = {
  get locale() {
    return composerLocaleValue() || DEFAULT_LOCALE;
  },
  async setLocale(nextLocale) {
    const normalizedLocale = SUPPORTED_LOCALE_SET.has(nextLocale) ? nextLocale : DEFAULT_LOCALE;
    await setComposerLocale(activeComposer, normalizedLocale);
    if (typeof document !== "undefined") document.documentElement.lang = this.locale;
    return this.locale;
  },
  t: translateMessage
};

export function installI18n(nuxtApp) {
  activeComposer = nuxtApp.$i18n;
  // Every string is translated where it is rendered, so Vue keeps ownership of the text it draws.
  const globals = nuxtApp.vueApp.config.globalProperties;
  globals.$tx = tx;
  globals.$tn = txCount;
}

import { nextTick, watch } from "vue";
import { DEFAULT_LOCALE, LOCALES, SUPPORTED_LOCALE_SET, getTranslationCredits } from "./locales.js";

export { DEFAULT_LOCALE, LOCALES, getTranslationCredits };

const ORIGINAL_TEXT_NODES = new WeakMap();
const ORIGINAL_ATTRIBUTES = new WeakMap();
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
  const normalizedFallback = normalizeLookupKey(fallback);
  const candidates = [key, normalizedKey].filter(Boolean);
  const messageKey = candidates.find((candidate) => composerHasMessage(activeComposer, candidate));
  if (messageKey && typeof activeComposer?.t === "function") {
    return activeComposer.t(messageKey, params);
  }
  return interpolate(fallback || normalizedFallback, params);
}

function translateTextValue(value, translate) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const normalizedText = normalizeLookupKey(trimmed);
  const translated = translate(normalizedText, normalizedText);
  if (translated === normalizedText) return value;
  const leadingWhitespace = value.match(/^\s*/)?.[0] || "";
  const trailingWhitespace = value.match(/\s*$/)?.[0] || "";
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

function translateRenderedElement(root, translate) {
  if (!root || typeof root !== "object") return;
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (current.nodeType === 3) {
      const originalText = ORIGINAL_TEXT_NODES.get(current) ?? current.textContent;
      ORIGINAL_TEXT_NODES.set(current, originalText);
      const nextText = translateTextValue(originalText, translate);
      if (nextText !== current.textContent) {
        current.textContent = nextText;
      }
      continue;
    }
    if (current.nodeType !== 1) continue;
    const element = current;
    if (element.hasAttribute("data-i18n-skip")) continue;
    const storedAttributes = ORIGINAL_ATTRIBUTES.get(element) || {};
    ["placeholder", "title", "aria-label"].forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) return;
      const originalValue = storedAttributes[attributeName] ?? element.getAttribute(attributeName);
      storedAttributes[attributeName] = originalValue;
      const currentValue = element.getAttribute(attributeName);
      const nextValue = translateTextValue(originalValue, translate);
      if (nextValue !== currentValue) {
        element.setAttribute(attributeName, nextValue);
      }
    });
    ORIGINAL_ATTRIBUTES.set(element, storedAttributes);
    queue.push(...element.childNodes);
  }
}

export const i18n = {
  get locale() {
    return composerLocaleValue() || DEFAULT_LOCALE;
  },
  async setLocale(nextLocale) {
    const normalizedLocale = SUPPORTED_LOCALE_SET.has(nextLocale) ? nextLocale : DEFAULT_LOCALE;
    await setComposerLocale(activeComposer, normalizedLocale);
    return this.locale;
  },
  t: translateMessage
};

export function installI18n(nuxtApp) {
  activeComposer = nuxtApp.$i18n;
  // Temporary bridge while hardcoded UI strings are converted to explicit useI18n/$t bindings.
  nuxtApp.vueApp.config.globalProperties.$t = (key, fallback = key, params = {}) => i18n.t(key, fallback, params);
  watch(
    () => i18n.locale,
    async () => {
      await nextTick();
      if (typeof document !== "undefined") {
        translateRenderedElement(document.body, nuxtApp.vueApp.config.globalProperties.$t);
      }
    }
  );
  nuxtApp.vueApp.mixin({
    mounted() {
      translateRenderedElement(this.$el, nuxtApp.vueApp.config.globalProperties.$t);
    },
    updated() {
      translateRenderedElement(this.$el, nuxtApp.vueApp.config.globalProperties.$t);
    }
  });
}

import { watch } from "vue";
import { createI18n } from "vue-i18n";
import en from "./en.json";
import de from "./de.json";
import fr from "./fr.json";

export const MESSAGES = { en, de, fr };

const DEFAULT_LOCALE = "en";
const ORIGINAL_TEXT_NODES = new WeakMap();
const ORIGINAL_ATTRIBUTES = new WeakMap();
const TRANSLATION_CREDITS = {
  en: "DiveVault core team (English source)",
  de: "AI-assisted translation, reviewed by DiveVault contributors",
  fr: "AI-assisted translation, reviewed by DiveVault contributors"
};

function normalizeLocale(locale) {
  return MESSAGES[locale] ? locale : DEFAULT_LOCALE;
}

function normalizeLookupKey(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function interpolate(message, params = {}) {
  return String(message).replace(/\{(\w+)\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

function hasMessage(key, locale = vueI18n.global.locale.value) {
  return vueI18n.global.te(key, locale) || vueI18n.global.te(key, DEFAULT_LOCALE);
}

function translateMessage(key, fallback = key, params = {}) {
  const normalizedKey = normalizeLookupKey(key);
  const normalizedFallback = normalizeLookupKey(fallback);
  const candidates = [key, normalizedKey].filter(Boolean);
  const messageKey = candidates.find((candidate) => hasMessage(candidate));
  if (messageKey) {
    return vueI18n.global.t(messageKey, params);
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

export const vueI18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  missingWarn: false,
  fallbackWarn: false,
  messages: MESSAGES
});

export const i18n = {
  get locale() {
    return vueI18n.global.locale.value;
  },
  setLocale(nextLocale) {
    vueI18n.global.locale.value = normalizeLocale(nextLocale);
  },
  t: translateMessage
};

export function installI18n(app) {
  app.use(vueI18n);
  app.config.globalProperties.$t = (key, fallback = key, params = {}) => i18n.t(key, fallback, params);
  watch(
    () => i18n.locale,
    () => {
      if (typeof document !== "undefined") {
        translateRenderedElement(document.body, app.config.globalProperties.$t);
      }
    }
  );
  app.mixin({
    mounted() {
      translateRenderedElement(this.$el, app.config.globalProperties.$t);
    },
    updated() {
      translateRenderedElement(this.$el, app.config.globalProperties.$t);
    }
  });
}

export function getTranslationCredits() {
  return { ...TRANSLATION_CREDITS };
}

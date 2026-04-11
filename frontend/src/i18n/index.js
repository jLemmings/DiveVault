import en from "./en.js";
import de from "./de.js";
import fr from "./fr.js";

const MESSAGES = { en, de, fr };

export function createTranslator(defaultLocale = "en") {
  return {
    locale: defaultLocale,
    setLocale(nextLocale) {
      this.locale = MESSAGES[nextLocale] ? nextLocale : "en";
    },
    t(key, fallback = key) {
      return MESSAGES[this.locale]?.[key] || MESSAGES.en?.[key] || fallback;
    }
  };
}

export { MESSAGES };

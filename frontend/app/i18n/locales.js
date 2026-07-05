export const DEFAULT_LOCALE = "en";

export const LOCALES = [
  {
    code: "en",
    language: "en-US",
    name: "English",
    file: "en.json",
    credits: "DiveVault core team (English source)"
  },
  {
    code: "de",
    language: "de-DE",
    name: "Deutsch",
    file: "de.json",
    credits: "AI-assisted translation, reviewed by DiveVault contributors"
  },
  {
    code: "fr",
    language: "fr-FR",
    name: "Fran\u00e7ais",
    file: "fr.json",
    credits: "AI-assisted translation, reviewed by DiveVault contributors"
  }
];

export const SUPPORTED_LOCALE_CODES = LOCALES.map((locale) => locale.code);
export const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_LOCALE_CODES);

export const NUXT_LOCALES = LOCALES.map(({ code, language, name, file }) => ({
  code,
  language,
  name,
  file
}));

export function getTranslationCredits() {
  return Object.fromEntries(LOCALES.map((locale) => [locale.code, locale.credits]));
}

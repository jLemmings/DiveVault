import { initializeAuth } from "~/shared/composables/auth.js";
import { installI18n } from "~/i18n/index.js";

async function loadAppConfig() {
  if (window.__APP_CONFIG__) return;
  await new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "/config.js";
    script.async = false;
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  window.__APP_CONFIG__ = window.__APP_CONFIG__ || { authEnabled: true, demoMode: false };
}

export default defineNuxtPlugin(async (nuxtApp) => {
  await loadAppConfig();
  await initializeAuth();
  installI18n(nuxtApp);
});



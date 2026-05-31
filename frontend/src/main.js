import { createApp } from "vue";

import App from "./app/App.vue";
import { initializeAuth } from "./app/composables/auth.js";
import { installI18n } from "./app/i18n/index.js";
import "./app/assets/styles.css";

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

async function bootstrap() {
  await loadAppConfig();
  await initializeAuth();
  const app = createApp(App);
  installI18n(app);
  app.mount("#app");
}

bootstrap();

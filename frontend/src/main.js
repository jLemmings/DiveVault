import { createApp } from "vue";
import "leaflet/dist/leaflet.css";

import App from "./app.js";
import { hasTestAuthState, installAuthPlugin } from "./auth.js";
import "./styles.css";

async function loadRuntimeConfig() {
  if (window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/config.js";
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load /config.js from the backend."));
    document.head.append(script);
  });

  return window.__APP_CONFIG__;
}

async function bootstrap() {
  const publishableKey = (await loadRuntimeConfig())?.clerkPublishableKey;

  if (!publishableKey && !hasTestAuthState()) {
    throw new Error("Add VITE_CLERK_PUBLISHABLE_KEY to the backend environment before starting the app.");
  }

  const app = createApp(App);

  installAuthPlugin(app, {
    publishableKey,
    afterSignOutUrl: "/",
    signInFallbackRedirectUrl: "/",
    signUpFallbackRedirectUrl: "/"
  });

  app.mount("#app");
}

bootstrap();

import { createApp } from "vue";
import { clerkPlugin } from "@clerk/vue";
import "leaflet/dist/leaflet.css";

import App from "./app.js";
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

  if (!publishableKey) {
    throw new Error("Add VITE_CLERK_PUBLISHABLE_KEY to the backend environment before starting the app.");
  }

  const app = createApp(App);

  app.use(clerkPlugin, {
    publishableKey,
    afterSignOutUrl: "/",
    signInFallbackRedirectUrl: "/",
    signUpFallbackRedirectUrl: "/"
  });

  app.mount("#app");
}

bootstrap();

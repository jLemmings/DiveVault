import { createApp } from "vue";
import "leaflet/dist/leaflet.css";

import App from "./app.js";
import { initializeAuth } from "./auth.js";
import { installI18n } from "./i18n/index.js";
import "./styles.css";

async function bootstrap() {
  await initializeAuth();
  const app = createApp(App);
  installI18n(app);
  app.mount("#app");
}

bootstrap();

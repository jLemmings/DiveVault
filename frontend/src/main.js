import { createApp } from "vue";
import "leaflet/dist/leaflet.css";

import App from "./app.js";
import { initializeAuth } from "./auth.js";
import "./styles.css";

async function bootstrap() {
  await initializeAuth();
  createApp(App).mount("#app");
}

bootstrap();

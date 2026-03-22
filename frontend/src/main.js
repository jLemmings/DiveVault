import { createApp } from "vue";
import { clerkPlugin } from "@clerk/vue";

import App from "./app.js";
import "./styles.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

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

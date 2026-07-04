import path from "node:path";
import { defineNuxtConfig } from "nuxt/config";

const repoRoot = path.resolve(__dirname, "..");
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineNuxtConfig({
  compatibilityDate: "2026-07-02",
  ssr: false,
  app: {
    rootId: "app",
    head: {
      title: "DiveVault",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" }
      ],
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&family=Space+Grotesk:wght@500;600;700&display=swap" }
      ]
    }
  },
  css: ["~/assets/styles.css"],
  modules: ["@nuxt/ui"],
  ui: {
    fonts: false
  },
  postcss: {
    plugins: {
      "@tailwindcss/postcss": {},
      autoprefixer: {}
    }
  },
  devtools: { enabled: false },
  typescript: { shim: false },
  vite: {
    envDir: repoRoot,
    server: {
      proxy: {
        "/config.js": { target: apiTarget, changeOrigin: true },
        "/api": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true }
      }
    }
  },
  nitro: {
    output: {
      publicDir: path.resolve(__dirname, "dist")
    }
  }
});

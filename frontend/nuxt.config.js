import path from "node:path";
import { defineNuxtConfig } from "nuxt/config";
import { DEFAULT_LOCALE, NUXT_LOCALES } from "./app/i18n/locales.js";
import { PRERENDER_ROUTES } from "./app/routing/routes.js";

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
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "referrer", content: "strict-origin-when-cross-origin" }
      ]
    }
  },
  // Fonts are bundled and self-hosted: no third-party requests (privacy) and
  // compatible with the backend's strict Content-Security-Policy.
  css: [
    "@fontsource-variable/manrope",
    "@fontsource/space-grotesk/500.css",
    "@fontsource/space-grotesk/600.css",
    "@fontsource/space-grotesk/700.css",
    "material-symbols/outlined.css",
    "~/assets/styles.css"
  ],
  alias: {
    "#features": path.resolve(__dirname, "app/features"),
    "#i18n": path.resolve(__dirname, "app/i18n"),
    "#routing": path.resolve(__dirname, "app/routing"),
    "#shared": path.resolve(__dirname, "app/shared")
  },
  modules: ["@nuxt/ui", "@nuxtjs/i18n"],
  ui: {
    fonts: false
  },
  // Bundle the icons Nuxt UI uses instead of fetching them from the public
  // Iconify API at runtime (privacy, offline use and a strict CSP).
  icon: {
    provider: "none",
    fallbackToApi: false,
    clientBundle: {
      scan: true,
      icons: [
        "lucide:arrow-down",
        "lucide:arrow-left",
        "lucide:arrow-right",
        "lucide:arrow-up",
        "lucide:arrow-up-right",
        "lucide:check",
        "lucide:chevron-down",
        "lucide:chevron-left",
        "lucide:chevron-right",
        "lucide:chevron-up",
        "lucide:chevrons-left",
        "lucide:chevrons-right",
        "lucide:circle-alert",
        "lucide:circle-check",
        "lucide:circle-x",
        "lucide:copy",
        "lucide:copy-check",
        "lucide:ellipsis",
        "lucide:eye",
        "lucide:eye-off",
        "lucide:file",
        "lucide:folder",
        "lucide:folder-open",
        "lucide:grip-vertical",
        "lucide:hash",
        "lucide:info",
        "lucide:lightbulb",
        "lucide:loader-circle",
        "lucide:menu",
        "lucide:minus",
        "lucide:monitor",
        "lucide:moon",
        "lucide:panel-left-close",
        "lucide:panel-left-open",
        "lucide:plus",
        "lucide:rotate-ccw",
        "lucide:search",
        "lucide:square",
        "lucide:star",
        "lucide:sun",
        "lucide:terminal",
        "lucide:triangle-alert",
        "lucide:upload",
        "lucide:x"
      ]
    }
  },
  appConfig: {
    ui: {
      button: {
        defaultVariants: {
          color: "neutral",
          variant: "ghost",
          size: "md"
        }
      }
    }
  },
  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    strategy: "no_prefix",
    detectBrowserLanguage: false,
    langDir: "locales",
    locales: NUXT_LOCALES,
    experimental: {
      prerenderMessages: true
    }
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
    prerender: {
      routes: PRERENDER_ROUTES
    },
    output: {
      publicDir: path.resolve(__dirname, "dist")
    }
  }
});

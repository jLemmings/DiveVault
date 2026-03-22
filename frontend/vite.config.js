import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

const repoRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    envDir: repoRoot,
    plugins: [vue()],
    resolve: {
      alias: {
        vue: "vue/dist/vue.esm-bundler.js"
      }
    },
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        },
        "/health": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});

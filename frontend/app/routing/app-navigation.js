import { legacyHashToPath } from "./routes.js";

async function navigateToAppRoute(app, path, { replace = false } = {}) {
  if (!path || app.nuxtRoute.path === path) return;
  await app.nuxtRouter[replace ? "replace" : "push"](path);
}

async function initializeLegacyHashRoute(app) {
  const legacyPath = legacyHashToPath(window.location.hash);
  if (legacyPath) await app.nuxtRouter.replace(legacyPath);
}

export { initializeLegacyHashRoute, navigateToAppRoute };

import { legacyHashToPath, routeToState } from "./routes.js";

function currentRouteState(app) {
  return routeToState({ path: app.routePathOverride || app.nuxtRoute.path });
}

function syncRouteMode(app) {
  app.publicRouteSlug = currentRouteState(app).publicRouteSlug || "";
}

function handleRouteNavigation(app) {
  if (app.routePathOverride && app.nuxtRoute.path === app.routePathOverride) {
    app.routePathOverride = null;
  }
  syncRouteMode(app);
  if (!app.isPublicRoute) {
    app.syncViewFromRoute();
  }
}

function currentBrowserPath() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

async function navigateToAppRoute(app, path, options = {}) {
  if (!path) {
    return;
  }
  if (app.nuxtRoute.path === path && currentBrowserPath() === path) {
    return;
  }
  if (app.routePathOverride && app.routePathOverride !== path) {
    app.routePathOverride = null;
  }
  const method = options.replace ? "replace" : "push";
  await app.nuxtRouter[method](path);
}

async function initializeLegacyHashRoute(app) {
  const legacyPath = legacyHashToPath(window.location.hash);
  if (!legacyPath) return;

  app.routePathOverride = legacyPath;
  await app.nuxtRouter.replace(legacyPath);
}

export { currentRouteState, handleRouteNavigation, initializeLegacyHashRoute, navigateToAppRoute, syncRouteMode };

import { SETTINGS_SECTIONS } from "../config/settings-sections.js";

export const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0]?.id || "diver-details";
export const SETTINGS_SECTION_IDS = new Set(SETTINGS_SECTIONS.map((section) => section.id));

export const MAIN_ROUTE_BY_VIEW = {
  dashboard: "/",
  logs: "/logs",
  map: "/map",
  equipment: "/equipment",
  settings: "/settings"
};

export const APP_ROUTES = [
  { name: "dashboard", path: "/" },
  { name: "logs", path: "/logs" },
  { name: "logs-create", path: "/logs/create" },
  { name: "logs-dive", path: "/logs/:diveId" },
  { name: "logs-dive-edit", path: "/logs/:diveId/edit" },
  { name: "imports", path: "/imports" },
  { name: "imports-dive", path: "/imports/:importId" },
  { name: "map", path: "/map" },
  { name: "equipment", path: "/equipment" },
  { name: "settings", path: "/settings" },
  { name: "settings-section", path: "/settings/:section" },
  { name: "settings-cli-auth", path: "/settings/cli-auth/:code" },
  { name: "public-profile", path: "/public/:slug" }
];

export const PRERENDER_ROUTES = ["/", "/logs", "/logs/create", "/imports", "/map", "/equipment", "/settings"];

export function singleRouteParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ""));
}

export function legacyHashToPath(hash) {
  const normalizedHash = String(hash || "").replace(/^#/, "");
  const [view, segment, value] = normalizedHash.split("/");
  if (view === "imports") return segment ? `/imports/${encodePathSegment(segment)}` : "/imports";
  if (view === "edit") return segment ? `/logs/${encodePathSegment(segment)}/edit` : "/logs";
  if (view === "create") return "/logs/create";
  if (view === "settings") {
    if (segment === "cli-auth") {
      return `/settings/cli-auth/${encodePathSegment(value || "")}`;
    }
    return segment ? `/settings/${encodePathSegment(segment)}` : "/settings";
  }
  if (view === "logs") return segment ? `/logs/${encodePathSegment(segment)}` : "/logs";
  if (MAIN_ROUTE_BY_VIEW[view]) return MAIN_ROUTE_BY_VIEW[view];
  return null;
}

export function routeToState(route) {
  const path = String(route?.path || "/").replace(/\/+$/, "") || "/";
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  if (segments[0] === "public") {
    return { publicRouteSlug: segments[1] || "" };
  }
  if (segments[0] === "imports" && segments[1]) {
    return { activeView: "imports", selectedImportId: segments[1] };
  }
  if (segments[0] === "imports") {
    return { activeView: "imports" };
  }
  if (segments[0] === "logs" && segments[2] === "edit") {
    return { activeView: "edit", selectedEditDiveId: segments[1] || null };
  }
  if (segments[0] === "logs" && segments[1] === "create") {
    return { activeView: "create" };
  }
  if (segments[0] === "logs" && segments[1]) {
    return { activeView: "logs", selectedDiveId: segments[1] };
  }
  if (segments[0] === "logs") {
    return { activeView: "logs" };
  }
  if (segments[0] === "settings" && segments[1] === "cli-auth") {
    return {
      activeView: "settings",
      activeSettingsSection: "data-management",
      cliAuthCode: segments[2] || ""
    };
  }
  if (segments[0] === "settings" && segments[1]) {
    return { activeView: "settings", activeSettingsSection: segments[1] };
  }
  if (segments[0] === "settings") {
    return { activeView: "settings" };
  }
  if (segments[0] === "map") return { activeView: "map" };
  if (segments[0] === "equipment") return { activeView: "equipment" };
  return { activeView: "dashboard" };
}

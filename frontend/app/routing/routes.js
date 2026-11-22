export const PATHS = {
  logbook: "/",
  create: "/logs/create",
  imports: "/imports",
  importFile: "/imports/file",
  sites: "/map",
  gear: "/equipment",
  diver: "/settings",
  application: "/settings/application"
};

export const APP_ROUTES = [
  { name: "logbook", path: "/" },
  { name: "logs", path: "/logs" },
  { name: "logs-create", path: "/logs/create" },
  { name: "logs-dive", path: "/logs/:diveId" },
  { name: "logs-dive-edit", path: "/logs/:diveId/edit" },
  { name: "imports", path: "/imports" },
  { name: "imports-file", path: "/imports/file" },
  { name: "imports-dive", path: "/imports/:importId" },
  { name: "map", path: "/map" },
  { name: "equipment", path: "/equipment" },
  { name: "settings", path: "/settings" },
  { name: "settings-section", path: "/settings/:section" },
  // The Windows Dive Sync app opens this address, so it must keep working.
  { name: "settings-cli-auth", path: "/settings/cli-auth/:code" },
  { name: "public-profile", path: "/public/:slug" }
];

export const PRERENDER_ROUTES = ["/", "/logs", "/logs/create", "/imports", "/imports/file", "/map", "/equipment", "/settings"];

// Section addresses from before settings became two pages. Bookmarks to them still land in the right place.
const VIEW_BY_SETTINGS_SECTION = {
  application: "application",
  "application-settings": "application",
  "data-management": "application",
  "manage-users": "application",
  backup: "application",
  "dive-sites": "sites"
};

export function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ""));
}

export function divePath(diveId) {
  return `/logs/${encodePathSegment(diveId)}`;
}

export function diveEditPath(diveId) {
  return `${divePath(diveId)}/edit`;
}

export function importPath(diveId) {
  return diveId === null || diveId === undefined ? PATHS.imports : `${PATHS.imports}/${encodePathSegment(diveId)}`;
}

export function legacyHashToPath(hash) {
  const normalizedHash = String(hash || "").replace(/^#/, "");
  const [view, segment, value] = normalizedHash.split("/");
  if (view === "imports") return segment ? importPath(segment) : PATHS.imports;
  if (view === "edit") return segment ? diveEditPath(segment) : PATHS.logbook;
  if (view === "create") return PATHS.create;
  if (view === "settings") {
    if (segment === "cli-auth") {
      return `/settings/cli-auth/${encodePathSegment(value || "")}`;
    }
    return segment ? `/settings/${encodePathSegment(segment)}` : PATHS.diver;
  }
  if (view === "logs") return segment ? divePath(segment) : "/logs";
  if (view === "dashboard") return PATHS.logbook;
  if (view === "map") return PATHS.sites;
  if (view === "equipment") return PATHS.gear;
  return null;
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function routeToState(route) {
  const path = String(route?.path || "/").replace(/\/+$/, "") || "/";
  const [area, first, second] = path.split("/").filter(Boolean).map(decodeSegment);
  if (area === "public") return { view: "public", slug: first || "" };
  if (area === "imports") {
    if (first === "file") return { view: "importFile" };
    return { view: "imports", id: first || "" };
  }
  if (area === "logs" && first) {
    if (first === "create") return { view: "create" };
    return { view: second === "edit" ? "edit" : "dive", id: first };
  }
  if (area === "settings") {
    if (first === "cli-auth") return { view: "importFile", code: second || "" };
    return { view: VIEW_BY_SETTINGS_SECTION[first] || "diver" };
  }
  if (area === "map") return { view: "sites" };
  if (area === "equipment") return { view: "gear" };
  return { view: "logbook" };
}

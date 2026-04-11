import { expect } from "@playwright/test";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseUser() {
  return {
    id: "user_avery",
    firstName: "Avery",
    lastName: "Marlow",
    role: "admin",
    isOwner: false,
    primaryEmailAddress: {
      emailAddress: "avery@example.com"
    },
    emailAddresses: [
      {
        emailAddress: "avery@example.com"
      }
    ]
  };
}

function baseAuthStatus(overrides = {}) {
  return {
    initialized: true,
    bootstrap_registration_open: false,
    public_registration_enabled: false,
    public_registration_open: false,
    invite: null,
    user_count: 1,
    ...overrides
  };
}

function authMePayload(user = baseUser(), overrides = {}) {
  const email = user?.primaryEmailAddress?.emailAddress
    || user?.emailAddresses?.[0]?.emailAddress
    || "";
  return {
    user_id: user?.id || "user_avery",
    session_id: "session_playwright",
    email,
    first_name: user?.firstName || "",
    last_name: user?.lastName || "",
    role: user?.role || "user",
    is_owner: Boolean(user?.isOwner),
    ...overrides
  };
}

function buildDive(overrides = {}) {
  const startedAt = overrides.started_at || "2026-03-15T08:30:00Z";
  return {
    id: overrides.id ?? 101,
    vendor: "Shearwater",
    product: "Perdix 2",
    started_at: startedAt,
    imported_at: overrides.imported_at || startedAt,
    duration_seconds: overrides.duration_seconds ?? 3180,
    max_depth_m: overrides.max_depth_m ?? 24.8,
    avg_depth_m: overrides.avg_depth_m ?? 16.4,
    raw_sha256: overrides.raw_sha256 || `sha-${overrides.id ?? 101}`,
    raw_data_size: overrides.raw_data_size ?? 524288,
    sample_count: overrides.sample_count ?? 6,
    samples: overrides.samples || [
      { time_seconds: 0, depth_m: 0, temperature_c: 27, tank_pressure_bar: { primary: 200 } },
      { time_seconds: 600, depth_m: 10, temperature_c: 26, tank_pressure_bar: { primary: 180 } },
      { time_seconds: 1200, depth_m: 20, temperature_c: 25, tank_pressure_bar: { primary: 150 } },
      { time_seconds: 1800, depth_m: 24.8, temperature_c: 24, tank_pressure_bar: { primary: 130 } },
      { time_seconds: 2400, depth_m: 12, temperature_c: 25, tank_pressure_bar: { primary: 110 } },
      { time_seconds: 3180, depth_m: 0, temperature_c: 27, tank_pressure_bar: { primary: 90 } }
    ],
    fields: {
      location: overrides.location || { lat: 26.508, lon: -77.089 },
      gasmixes: [{ oxygen_fraction: 0.32 }],
      tanks: [{
        volume: overrides.tank_volume_l ? Number(overrides.tank_volume_l) : 12,
        workpressure_bar: 200,
        beginpressure_bar: 200,
        endpressure_bar: 90
      }],
      logbook: {
        site: overrides.site || "Blue Hole",
        buddy: overrides.buddy || "Kai",
        guide: overrides.guide || "Mina",
        notes: overrides.notes || "Calm drift dive with strong visibility.",
        status: overrides.status || "complete",
        completed_at: overrides.completed_at || "2026-03-15T12:00:00Z"
      }
    }
  };
}

function baseData() {
  const committedDive = buildDive({
    id: 101,
    site: "Blue Hole",
    buddy: "Kai",
    guide: "Mina",
    status: "complete",
    started_at: "2026-03-15T08:30:00Z",
    imported_at: "2026-03-15T10:00:00Z"
  });
  const importedDive = buildDive({
    id: 202,
    site: "",
    buddy: "",
    guide: "",
    notes: "",
    status: "imported",
    started_at: "2026-03-20T09:10:00Z",
    imported_at: "2026-03-20T10:20:00Z",
    raw_sha256: "sha-202",
    location: { lat: 21.123, lon: -86.742 }
  });

  return {
    health: true,
    dives: [committedDive, importedDive],
    stats: {
      totalDives: 2,
      totalSeconds: committedDive.duration_seconds + importedDive.duration_seconds,
      totalHours: 1.8,
      maxDepth: 24.8,
      totalBarConsumed: 220,
      averageDurationSeconds: 3240,
      averageMaxDepth: 22.5,
      bottomTimeProgress: 72
    },
    profile: {
      name: "Avery Marlow",
      email: "avery@example.com",
      public_dives_enabled: false,
      public_slug: "avery-marlow",
      licenses: [],
      dive_sites: [
        {
          id: "site-1",
          name: "Blue Hole",
          location: "Andros",
          country: "Bahamas",
          latitude: 26.508,
          longitude: -77.089
        }
      ],
      buddies: [
        { id: "buddy-1", name: "Kai" }
      ],
      guides: [
        { id: "guide-1", name: "Mina" }
      ]
    }
  };
}

function getLogbookState(dive) {
  return dive?.fields?.logbook && typeof dive.fields.logbook === "object"
    ? dive.fields.logbook
    : {};
}

function isCommittedDive(dive) {
  return getLogbookState(dive).status === "complete";
}

function refreshStats(data) {
  const committed = data.dives.filter(isCommittedDive);
  data.stats = {
    totalDives: data.dives.length,
    totalSeconds: data.dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0),
    totalHours: Number((data.dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0) / 3600).toFixed(1)),
    maxDepth: Math.max(...data.dives.map((dive) => dive.max_depth_m || 0), 0),
    totalBarConsumed: committed.length * 110,
    averageDurationSeconds: data.dives.length
      ? Math.round(data.dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0) / data.dives.length)
      : 0,
    averageMaxDepth: committed.length
      ? Number((committed.reduce((sum, dive) => sum + (dive.max_depth_m || 0), 0) / committed.length).toFixed(1))
      : 0,
    bottomTimeProgress: committed.length ? 80 : 0
  };
}

function updateDiveLogbook(data, diveId, payload) {
  const dive = data.dives.find((entry) => String(entry.id) === String(diveId));
  if (!dive) {
    return null;
  }

  const nextLogbook = {
    ...getLogbookState(dive),
    ...(payload.logbook || {})
  };

  if (payload.commit) {
    nextLogbook.status = "complete";
    nextLogbook.completed_at = "2026-04-07T12:00:00Z";
  }

  dive.fields = {
    ...dive.fields,
    logbook: nextLogbook,
    tanks: Array.isArray(dive.fields?.tanks) && dive.fields.tanks.length
      ? dive.fields.tanks.map((tank, index) => (index === 0
        ? {
          ...tank,
          volume: payload.tank_volume_l ? Number(payload.tank_volume_l) : tank.volume
        }
        : tank))
      : dive.fields?.tanks
  };

  refreshStats(data);
  return clone(dive);
}

function createDiveFromPayload(data, payload) {
  const nextId = data.dives.reduce((max, dive) => Math.max(max, Number(dive.id) || 0), 0) + 1;
  const logbook = payload?.fields?.logbook && typeof payload.fields.logbook === "object"
    ? payload.fields.logbook
    : {};
  const temperature = payload?.fields?.temperature_surface_c;
  const tankVolume = payload?.fields?.tanks?.[0]?.volume;
  const dive = {
    id: nextId,
    vendor: payload.vendor || "Manual",
    product: payload.product || "Logbook Entry",
    started_at: payload.started_at || "2026-04-07T09:00:00Z",
    imported_at: "2026-04-07T12:00:00Z",
    duration_seconds: payload.duration_seconds || 0,
    max_depth_m: payload.max_depth_m ?? 0,
    avg_depth_m: payload.avg_depth_m ?? null,
    raw_sha256: payload.raw_sha256 || `sha-${nextId}`,
    raw_data_size: payload.raw_data_b64 ? payload.raw_data_b64.length : 0,
    sample_count: Array.isArray(payload.samples) ? payload.samples.length : 0,
    samples: Array.isArray(payload.samples) ? payload.samples : [],
    fields: {
      ...(payload.fields || {}),
      location: payload?.fields?.location || { lat: 26.508, lon: -77.089 },
      tanks: Number.isFinite(Number(tankVolume)) ? [{ volume: Number(tankVolume) }] : (payload?.fields?.tanks || []),
      logbook: {
        site: logbook.site || "",
        buddy: logbook.buddy || "",
        guide: logbook.guide || "",
        notes: logbook.notes || "",
        status: logbook.status || "imported",
        completed_at: logbook.completed_at || undefined
      }
    }
  };

  if (typeof temperature === "number") {
    dive.fields.temperature_surface_c = temperature;
    dive.fields.temperature_minimum_c = temperature;
    dive.fields.temperature_maximum_c = temperature;
  }

  data.dives.push(dive);
  refreshStats(data);
  return clone(dive);
}

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload)
  });
}

async function setupTestState(page, { signedIn = true, user = baseUser() } = {}) {
  await page.addInitScript((state) => {
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
    const storageKey = "divevault_auth_token";
    if (state.signedIn && state.token) {
      window.localStorage.setItem(storageKey, state.token);
    } else {
      window.localStorage.removeItem(storageKey);
    }
    const clipboardState = { value: "" };
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          clipboardState.value = value;
        },
        async readText() {
          return clipboardState.value;
        }
      }
    });
  }, {
    signedIn,
    sessionId: signedIn ? "playwright-session" : null,
    token: "playwright-token",
    user
  });
}

async function installAppMocks(page, options = {}) {
  const data = {
    ...baseData(),
    ...(options.data ? clone(options.data) : {})
  };
  const signedIn = options.signedIn ?? true;
  const user = options.user || baseUser();
  const authStatus = baseAuthStatus(options.authStatus);
  const authUsers = clone(options.authUsers || [
    {
      id: user.id || "user_avery",
      email: user.primaryEmailAddress?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "avery@example.com",
      first_name: user.firstName || "",
      last_name: user.lastName || "",
      role: user.role || "user",
      is_active: true,
      created_at: "2026-04-01T09:00:00Z",
      updated_at: "2026-04-01T09:00:00Z",
      last_login_at: "2026-04-07T10:00:00Z"
    }
  ]);
  const session = {
    signedIn,
    token: options.token || "playwright-token",
    user
  };
  data.dives = clone(options.data?.dives || data.dives);
  data.profile = clone(options.data?.profile || data.profile);
  data.stats = clone(options.data?.stats || data.stats);
  refreshStats(data);

  await setupTestState(page, {
    signedIn,
    user,
    token: session.token
  });

  await page.route("**/config.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.__APP_CONFIG__ = { authEnabled: true };"
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname === "/api/health") {
      await fulfillJson(route, { ok: data.health }, data.health ? 200 : 503);
      return;
    }

    if (pathname === "/api/auth/status" && request.method() === "GET") {
      await fulfillJson(route, clone(authStatus));
      return;
    }

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      if (!payload?.email || !payload?.password) {
        await fulfillJson(route, { error: "Email and password are required." }, 400);
        return;
      }
      await fulfillJson(route, { token: session.token });
      return;
    }

    if (pathname === "/api/auth/register" && request.method() === "POST") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      if (!payload?.email || !payload?.password) {
        await fulfillJson(route, { error: "Email and password are required." }, 400);
        return;
      }
      await fulfillJson(route, {
        created: true,
        email: payload.email,
        first_name: payload.first_name || "",
        last_name: payload.last_name || ""
      }, 201);
      return;
    }

    if (pathname === "/api/auth/me" && request.method() === "GET") {
      const authorization = request.headers()["authorization"] || "";
      const token = authorization.toLowerCase().startsWith("bearer ")
        ? authorization.split(" ", 2)[1]
        : "";
      if (!signedIn && token !== session.token) {
        await fulfillJson(route, { error: "Session expired" }, 401);
        return;
      }
      if (token !== session.token) {
        await fulfillJson(route, { error: "Session expired" }, 401);
        return;
      }
      await fulfillJson(route, authMePayload(user));
      return;
    }

    if (pathname === "/api/auth/password" && request.method() === "PUT") {
      await fulfillJson(route, { updated: true });
      return;
    }

    if (pathname === "/api/users" && request.method() === "GET") {
      await fulfillJson(route, {
        settings: {
          initialized: authStatus.initialized,
          public_registration_enabled: authStatus.public_registration_enabled,
          owner_user_id: authUsers[0]?.id || "",
          user_count: authUsers.length
        },
        users: clone(authUsers)
      });
      return;
    }

    if (pathname === "/api/auth/invitations" && request.method() === "POST") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      await fulfillJson(route, {
        invite_url: `http://localhost:4173/?invite_token=test-invite-token&email=${encodeURIComponent(payload?.email || "")}`,
        token: "test-invite-token"
      }, 201);
      return;
    }

    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && request.method() === "PUT") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      const index = authUsers.findIndex((entry) => entry.id === userMatch[1]);
      if (index === -1) {
        await fulfillJson(route, { error: "User not found" }, 404);
        return;
      }
      authUsers[index] = { ...authUsers[index], ...payload };
      await fulfillJson(route, clone(authUsers[index]));
      return;
    }

    if (userMatch && request.method() === "DELETE") {
      const index = authUsers.findIndex((entry) => entry.id === userMatch[1]);
      if (index === -1) {
        await fulfillJson(route, { error: "User not found" }, 404);
        return;
      }
      authUsers.splice(index, 1);
      await fulfillJson(route, { deleted: true, user_id: userMatch[1] });
      return;
    }

    if (pathname === "/api/dives" && request.method() === "GET") {
      await fulfillJson(route, { dives: clone(data.dives), stats: clone(data.stats) });
      return;
    }

    if (pathname === "/api/dives" && request.method() === "POST") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      const createdDive = createDiveFromPayload(data, payload);
      await fulfillJson(route, { inserted: true, id: createdDive.id }, 201);
      return;
    }

    if (pathname === "/api/profile" && request.method() === "GET") {
      await fulfillJson(route, clone(data.profile));
      return;
    }

    if (pathname === "/api/geocode/search" && request.method() === "GET") {
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) {
        await fulfillJson(route, { error: "Query is required." }, 400);
        return;
      }
      await fulfillJson(route, {
        found: true,
        result: {
          country: "Egypt",
          latitude: 25.3104,
          longitude: 34.8818
        }
      });
      return;
    }

    if (pathname === "/api/profile" && request.method() === "PUT") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      data.profile = {
        ...data.profile,
        ...payload,
        licenses: payload.licenses ?? data.profile.licenses,
        dive_sites: payload.dive_sites ?? data.profile.dive_sites,
        buddies: payload.buddies ?? data.profile.buddies,
        guides: payload.guides ?? data.profile.guides
      };
      await fulfillJson(route, clone(data.profile));
      return;
    }

    const logbookMatch = pathname.match(/^\/api\/dives\/([^/]+)\/logbook$/);
    if (logbookMatch && request.method() === "PUT") {
      const payload = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}");
      const updatedDive = updateDiveLogbook(data, logbookMatch[1], payload);
      if (!updatedDive) {
        await fulfillJson(route, { error: "Dive not found." }, 404);
        return;
      }
      await fulfillJson(route, updatedDive);
      return;
    }

    const publicProfileMatch = pathname.match(/^\/api\/public\/divers\/([^/]+)$/);
    if (publicProfileMatch) {
      await fulfillJson(route, {
        diver: {
          name: data.profile.name,
          public_slug: publicProfileMatch[1]
        },
        dives: clone(data.dives.filter(isCommittedDive)),
        stats: clone(data.stats)
      });
      return;
    }

    await fulfillJson(route, { error: `Unhandled mock route: ${pathname}` }, 404);
  });

  return data;
}

async function gotoAndWait(page, url = "/") {
  await page.goto(url);
  await expect(page.locator("#app")).toBeVisible();
}

export {
  baseData,
  buildDive,
  clone,
  gotoAndWait,
  installAppMocks
};

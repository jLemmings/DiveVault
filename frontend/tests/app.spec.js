import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { baseData, buildDive, gotoAndWait, installAppMocks } from "./helpers/app-fixtures.js";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = {
  id: "owner_avery",
  firstName: "Avery",
  lastName: "Marlow",
  role: "admin",
  isOwner: true,
  primaryEmailAddress: { emailAddress: "avery@example.com" },
  emailAddresses: [{ emailAddress: "avery@example.com" }]
};
const USERS = [
  {
    id: "owner_avery",
    email: "avery.longname@example.com",
    first_name: "Avery",
    last_name: "Marlow",
    role: "admin",
    is_active: true,
    last_login_at: "2026-04-07T10:00:00Z"
  },
  {
    id: "user_kai",
    email: "kai.with-a-long-email-address@example.com",
    first_name: "Kai",
    last_name: "Reef",
    role: "user",
    is_active: true,
    last_login_at: "2026-04-07T11:00:00Z"
  }
];

function mainNav(page) {
  return page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
}

function requestBody(page, method, pathname) {
  return page
    .waitForRequest((request) => request.method() === method && new URL(request.url()).pathname === pathname)
    .then((request) => request.postDataJSON());
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.beforeEach(async ({ page }) => {
  // The chart must not depend on the tile service while testing.
  await page.route("https://server.arcgisonline.com/**", (route) => route.abort());
});

test("renders sign-in and registration, and signs in", async ({ page }) => {
  await installAppMocks(page, {
    signedIn: false,
    authStatus: { initialized: false, bootstrap_registration_open: true, public_registration_open: true }
  });
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Language").locator("option")).toHaveText(["English", "Deutsch", "Français"]);

  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByText("The first account becomes the owner of this DiveVault.")).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByLabel("Last name")).toBeVisible();

  await page.getByRole("button", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill("avery@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: /1 dive, 53 minutes underwater/ })).toBeVisible();
});

test("registers a new account", async ({ page }) => {
  await installAppMocks(page, { signedIn: false, authStatus: { public_registration_open: true } });
  await gotoAndWait(page);

  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Lea");
  await page.getByLabel("Email").fill("lea@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Password123!");
  const sent = requestBody(page, "POST", "/api/auth/register");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect(await sent).toMatchObject({ email: "lea@example.com", first_name: "Lea" });
  await expect(page.getByText("Account created. Sign in with your new credentials.")).toBeVisible();
});

test("hides registration when it is closed", async ({ page }) => {
  await installAppMocks(page, { signedIn: false });
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an account" })).toHaveCount(0);
});

test("moves between the four places and the diver's pages", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page);
  const nav = mainNav(page);

  await expect(nav.getByRole("link")).toHaveText([/Logbook/, /Imports\s*1/, /Sites/, /Gear/]);
  await nav.getByRole("link", { name: /Imports/ }).click();
  await expect(page).toHaveURL(/\/imports$/);
  await expect(page.getByRole("heading", { name: "1 dive waiting to surface" })).toBeVisible();

  await nav.getByRole("link", { name: "Sites" }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByRole("heading", { name: "Sites", exact: true })).toBeVisible();

  await nav.getByRole("link", { name: "Gear" }).click();
  await expect(page).toHaveURL(/\/equipment$/);
  await expect(page.getByRole("heading", { name: "Kit list" })).toBeVisible();

  await page.getByRole("banner").getByRole("link", { name: "Avery Marlow" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("link", { name: "Application, data and access" }).click();
  await expect(page).toHaveURL(/\/settings\/application$/);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Certification cards" })).toBeVisible();
});

for (const [address, heading] of [
  ["/logs", "Every dive"],
  ["/#logs", "Every dive"],
  ["/#imports", "1 dive waiting to surface"],
  ["/settings/diver-details", "Certification cards"],
  ["/settings/buddies", "Buddies"],
  ["/settings/data-management", "Take your dives with you"],
  ["/settings/backup", "Back up"],
  ["/settings/dive-sites", "Sites"]
]) {
  test(`keeps the earlier address ${address} working`, async ({ page }) => {
    await installAppMocks(page);
    await gotoAndWait(page, address);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  });
}

test("covers the logbook, dive detail, and logbook editing", async ({ page }) => {
  const data = baseData();
  data.profile.logbook_display_fields = ["wetsuit_description", "weight_description"];
  await installAppMocks(page, { data });
  await gotoAndWait(page);

  await expect(page.getByRole("button", { name: /Blue Hole, .*24\.8 m, 53 min/ })).toBeVisible();
  await page.getByLabel("Search").fill("Blue Hole");
  const row = page.getByRole("row").filter({ hasText: "Blue Hole" });
  await expect(row).toContainText("5mm full suit");
  await expect(row).toContainText("8 kg integrated");
  await expect(row).toContainText("110 bar");

  await row.getByRole("link", { name: "Blue Hole" }).press("Enter");
  await expect(page).toHaveURL(/\/logs\/101$/);
  await expect(page.getByRole("heading", { name: "Blue Hole" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Recorded depth profile" })).toBeVisible();
  for (const text of ["18 m / excellent", "Light current with scattered clouds.", "Nitrox 32", "200 to 90 bar"]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: "Edit logbook" }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Updated from Playwright coverage.");
  const sent = requestBody(page, "PUT", "/api/dives/101/logbook");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await sent).logbook).toMatchObject({
    notes: "Updated from Playwright coverage.",
    site: "Blue Hole",
    status: "complete",
    completed_at: "2026-03-15T12:00:00Z"
  });
  await expect(page.getByText("Logbook updated.")).toBeVisible();
});

test("sorts, filters, and pages the logbook", async ({ page }) => {
  const data = baseData();
  data.dives = Array.from({ length: 12 }, (_, index) =>
    buildDive({
      id: 300 + index,
      site: index % 2 ? "House Reef" : "Blue Hole",
      max_depth_m: 10 + index,
      started_at: `2026-03-${String(index + 1).padStart(2, "0")}T09:00:00Z`
    })
  );
  await installAppMocks(page, { data });
  await gotoAndWait(page);
  const rows = page.locator("tbody tr");

  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("21.0 m");
  await page.getByRole("button", { name: "Older dives" }).click();
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "Max depth" }).click();
  await expect(rows.first()).toContainText("21.0 m");
  await page.getByRole("button", { name: "Max depth" }).click();
  await expect(rows.first()).toContainText("10.0 m");

  await page.locator("summary", { hasText: "All sites" }).click();
  await page.getByRole("checkbox", { name: "House Reef" }).check();
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText("House Reef");
});

test("shows a waiting import's fields and completes it", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/imports");

  await page.getByLabel("Buddy").fill("Sage");
  const draft = requestBody(page, "PUT", "/api/dives/202/logbook");
  await page.getByRole("button", { name: "Save draft" }).click();
  expect(await draft).toMatchObject({ commit: false, logbook: { buddy: "Sage", status: "imported" } });
  await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();

  await page.getByLabel("Where was it? Required").fill("House Reef");
  const committed = requestBody(page, "PUT", "/api/dives/202/logbook");
  await page.getByRole("button", { name: "Add to logbook", exact: true }).click();
  expect(await committed).toMatchObject({ commit: true, logbook: { site: "House Reef", buddy: "Sage", status: "complete" } });
  await expect(page.getByText("House Reef is in your logbook.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every dive has surfaced" })).toBeVisible();
});

test("applies one buddy to every waiting dive and opens the next after saving", async ({ page }) => {
  const data = baseData();
  data.dives.push(buildDive({ id: 203, site: "", buddy: "", status: "imported", started_at: "2026-03-19T09:00:00Z" }));
  await installAppMocks(page, { data });
  await gotoAndWait(page, "/imports");

  const queue = page.getByRole("complementary");
  await queue.getByLabel("Buddy").fill("Jonah");
  await queue.getByRole("button", { name: "Use for all 2 dives" }).click();
  await expect(page.getByText("Saved on 2 dives. Sites were left as they were.")).toBeVisible();

  await page.getByRole("button", { name: "Blue Hole", exact: true }).click();
  await page.getByRole("button", { name: "Add to logbook, open next" }).click();
  await expect(page).toHaveURL(/\/imports\/203$/);
  await expect(page.locator(".import-dive").getByLabel("Buddy")).toHaveValue("Jonah");
});

test("creates a manual dive entry and a site along the way", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page);

  await page.getByRole("link", { name: "Log a dive" }).click();
  await page.getByLabel("Date", { exact: true }).fill("2026-04-06");
  await page.getByLabel("Start time").fill("09:15");
  await page.getByLabel("Time underwater, minutes").fill("52");
  await page.getByLabel("Max depth, metres").fill("21.4");
  await page.getByLabel("Water, °C").fill("26");
  await page.getByLabel("Tank size, litres").selectOption("12");
  await page.getByLabel("Pressure in, bar").fill("200");
  await page.getByLabel("Pressure out, bar").fill("70");
  await page.getByLabel("Dive site, required").fill("Cathedral");
  await page.getByRole("button", { name: "Save as a new site" }).click();

  const dialog = page.getByRole("dialog", { name: "Add a site" });
  await dialog.getByLabel("Location").fill("Dahab, Egypt");
  await dialog.getByRole("button", { name: "Find by location" }).click();
  await expect(dialog.getByLabel("Latitude")).toHaveValue("25.3104");
  await expect(dialog.getByLabel("Country")).toHaveValue("Egypt");
  await dialog.getByRole("button", { name: "Save site" }).click();
  await expect(page.getByText("Cathedral added to your sites.")).toBeVisible();

  await page.getByLabel("Weights").fill("6 kg belt");
  const sent = requestBody(page, "POST", "/api/dives");
  await page.getByRole("button", { name: "Add to logbook" }).click();
  expect(await sent).toMatchObject({
    max_depth_m: 21.4,
    duration_seconds: 3120,
    samples: [],
    fields: {
      manual_entry: true,
      temperature_surface_c: 26,
      tanks: [{ volume: 12, beginpressure_bar: 200, endpressure_bar: 70 }],
      logbook: { site: "Cathedral", status: "complete", weight_description: "6 kg belt", equipment_ids: ["equipment-1"] }
    }
  });

  await expect(page.getByRole("heading", { name: "Cathedral" })).toBeVisible();
  // Nothing recorded means a plumb line, never an invented curve.
  await expect(page.getByRole("img", { name: "Plumb line to the deepest point" })).toBeVisible();
  await expect(page.getByRole("slider")).toHaveCount(0);
  await expect(page.getByText("6 kg belt")).toBeVisible();
});

test("logs a dive in two steps on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAppMocks(page);
  await gotoAndWait(page, "/logs/create");

  await page.getByRole("button", { name: "Next: people and notes" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter the max depth.");
  await expect(page.getByRole("alert")).toContainText("Dive site is required.");

  await page.getByLabel("Dive site, required").fill("House Reef");
  await page.getByLabel("Max depth, m", { exact: true }).fill("12.5");
  await page.getByRole("button", { name: "Next: people and notes" }).click();
  await page.getByLabel("Buddy").fill("Sage");
  await page.getByRole("button", { name: "Add to logbook" }).click();
  await expect(page.getByRole("heading", { name: "House Reef" })).toBeVisible();
});

test("edits sites on the chart page", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/map");

  await expect(page.locator(".site-chart-sea.leaflet-container")).toBeVisible();
  await expect(page.locator(".sounding").filter({ hasText: "Blue Hole" })).toContainText("248");
  await page.getByLabel("Location", { exact: true }).fill("South Andros");
  const sent = requestBody(page, "PUT", "/api/profile");
  await page.getByRole("button", { name: "Save site" }).click();
  expect(await sent).toEqual({
    dive_sites: [{ id: "site-1", name: "Blue Hole", location: "South Andros", country: "Bahamas", latitude: 26.508, longitude: -77.089 }]
  });
  await expect(page.getByText("Site saved.")).toBeVisible();

  await page.getByRole("button", { name: "Show them" }).click();
  await expect(page.getByLabel("Search")).toHaveValue("Blue Hole");
});

test("manages gear and marks it serviced", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/equipment");

  await expect(page.getByRole("heading", { name: "Your regulator is due for service" })).toBeVisible();
  await page.getByRole("button", { name: "Add gear" }).click();
  const dialog = page.getByRole("dialog", { name: "Add gear" });
  await dialog.getByRole("textbox", { name: "Kind" }).fill("BCD");
  await dialog.getByLabel("Year bought").fill("2025");
  await dialog.getByLabel("Bought from").fill("Reef Shop");
  await dialog.getByLabel("Brand").fill("Scubapro");
  await dialog.getByLabel("Every, dives").fill("50");
  await dialog.getByLabel("On every dive, as part of my usual kit").check();
  await dialog.getByRole("button", { name: "Save gear" }).click();
  await expect(page.getByText("Gear saved.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Scubapro Reef Shop BCD" })).toContainText("12 months or 50 dives");

  const regulator = page.getByRole("row").filter({ hasText: "Aqualung" });
  await regulator.getByRole("button", { name: "Mark serviced" }).click();
  await expect(page.getByText("Marked as serviced.")).toBeVisible();
  // A service stamped later than the booked date clears it.
  await expect(page.getByRole("heading", { name: "Your regulator is due for service" })).toHaveCount(0);

  // Saving the list afterwards must not lose that stamp.
  await regulator.getByRole("button", { name: "Edit" }).click();
  const sent = requestBody(page, "PUT", "/api/equipment");
  await page.getByRole("dialog").getByRole("button", { name: "Save gear" }).click();
  const saved = (await sent).equipment.find((item) => item.id === "equipment-1");
  expect(saved.last_serviced_at).toBe("2026-04-07T12:00:00Z");
});

test("edits the diver's lists and shares the logbook", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/settings");

  await page.getByRole("button", { name: "Edit Kai" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Kai Reef");
  const list = requestBody(page, "PUT", "/api/profile");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await list).toEqual({ buddies: [{ id: "buddy-1", name: "Kai Reef" }] });
  await expect(page.getByText("List saved.")).toBeVisible();

  await page.getByRole("button", { name: "Add a guide" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Noor");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Noor", { exact: true })).toBeVisible();

  await page.getByLabel("Anyone with the link can see my dives").check();
  await page.getByLabel("Link name").fill("Avery Dives");
  const sharing = requestBody(page, "PUT", "/api/profile");
  await page.getByRole("button", { name: "Save sharing" }).click();
  expect(await sharing).toEqual({ public_dives_enabled: true, public_slug: "avery-dives" });
  await expect(page.getByText("Your logbook is public.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See it" })).toHaveAttribute("href", /\/public\/avery-dives$/);
});

test("adds a certification card", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/settings");

  await page.getByRole("button", { name: "Add a card" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a card" });
  await dialog.getByLabel("Certification").fill("Rescue Diver");
  await dialog.getByLabel("Agency").fill("PADI");
  await dialog.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("Card saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach PDF" })).toBeVisible();
});

test("saves application choices as they change", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/settings/application");

  await expect(page.getByText(/^DiveVault v\d+\.\d+\.\d+/)).toBeVisible();
  const sent = requestBody(page, "PUT", "/api/profile");
  await page.getByRole("group", { name: "Required to log a dive" }).getByLabel("Buddy").check();
  expect(await sent).toEqual({ required_logbook_fields: ["site", "buddy"] });
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  for (const name of ["Download CSV", "Download PDF", "Download backup", "Choose a backup"]) {
    await expect(page.getByRole("button", { name })).toBeEnabled();
  }
  await expect(page.getByRole("heading", { name: "Who can sign in" })).toHaveCount(0);

  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("covers the owner's user management", async ({ page }) => {
  await installAppMocks(page, { user: OWNER, authUsers: USERS });
  await gotoAndWait(page, "/settings/manage-users");

  await page.getByLabel("Anyone can register").check();
  await expect(page.getByText("Anyone can register now.")).toBeVisible();

  await page.getByRole("button", { name: "Invite someone" }).click();
  const invite = page.getByRole("dialog", { name: "Invite someone" });
  await invite.getByLabel("Email").fill("buddy@example.com");
  await invite.getByRole("button", { name: "Make invitation" }).click();
  await expect(invite.getByText("Invitation made for buddy@example.com. Send them this link.")).toBeVisible();
  await expect(invite.getByLabel("Invitation link")).toHaveValue(/invite_token=test-invite-token/);
  await invite.getByRole("button", { name: "Close" }).click();

  const kai = page.getByRole("row").filter({ hasText: "Kai Reef" });
  await kai.getByRole("button", { name: "Deactivate" }).click();
  await expect(kai).toContainText("deactivated");
});

test("approves Dive Sync from the address the Windows app opens", async ({ page }) => {
  await installAppMocks(page);
  let approval;
  await page.route("**/api/cli-auth/approve", async (route) => {
    approval = { body: route.request().postDataJSON(), authorization: route.request().headers().authorization };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "approved", email: "avery@example.com" }) });
  });
  await gotoAndWait(page, "/settings/cli-auth/ABC123");

  await expect(page.getByRole("button", { name: "Allow Dive Sync" })).toBeVisible();
  expect(approval).toBeUndefined();
  await page.getByRole("button", { name: "Allow Dive Sync" }).click();
  await expect(page.getByText(/Dive Sync is allowed/)).toBeVisible();
  expect(approval).toEqual({ body: { code: "ABC123" }, authorization: "Bearer playwright-token" });
});

test("previews a Subsurface file before importing it", async ({ page }) => {
  await installAppMocks(page);
  const sent = [];
  await page.route("**/api/imports/subsurface**", async (route) => {
    const dryRun = new URL(route.request().url()).searchParams.has("dry_run");
    sent.push({ dryRun, type: route.request().headers()["content-type"] });
    const dives = [
      { row_number: 1, site: "Dunraven", started_at: "2026-03-01T09:00:00", valid: true, duplicate: false },
      { row_number: 2, site: "", started_at: "2026-03-02T09:00:00", valid: true, duplicate: false },
      { row_number: 3, site: "Blue Hole", started_at: "2026-03-15T08:30:00", valid: true, duplicate: true }
    ];
    const summary = { rows: 3, ready_rows: 2, duplicates: 1, invalid_rows: 0, inserted: 2, dives };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(dryRun ? { dry_run: true, summary } : summary) });
  });
  await gotoAndWait(page, "/imports/file");

  await page.locator("input[type=file]").setInputFiles({ name: "trip.ssrf", mimeType: "", buffer: Buffer.from("<divelog/>") });
  await expect(page.getByRole("heading", { name: "2 dives ready, 1 already in your logbook" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Dunraven" })).toContainText("Goes into the logbook");
  await expect(page.getByRole("row").filter({ hasText: "No site" })).toContainText("Waits in Imports");
  expect(sent).toEqual([{ dryRun: true, type: "application/xml" }]);

  await page.getByRole("button", { name: "Import 2 dives" }).click();
  await expect(page.getByText("2 dives imported.")).toBeVisible();
  expect(sent[1]).toEqual({ dryRun: false, type: "application/xml" });
});

test("blocks a file with a broken row", async ({ page }) => {
  await installAppMocks(page);
  await page.route("**/api/imports/csv**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        summary: { ready_rows: 1, dives: [{ row_number: 4, valid: false, errors: ["max_depth_m is required"] }] }
      })
    })
  );
  await gotoAndWait(page, "/imports/file");

  await page.locator("input[type=file]").setInputFiles({ name: "trip.csv", mimeType: "text/csv", buffer: Buffer.from("site\nReef") });
  await expect(page.getByRole("alert")).toContainText("Row 4 of trip.csv can't be read (max_depth_m is required)");
  await expect(page.getByRole("button", { name: "Import 1 dive" })).toBeDisabled();
});

test("never saves lists or gear that failed to load", async ({ page }) => {
  await installAppMocks(page);
  await page.route(/\/api\/(profile|equipment)$/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Database unavailable" }) })
  );
  await gotoAndWait(page, "/settings");

  await expect(page.getByRole("alert")).toContainText("Database unavailable");
  await expect(page.getByRole("button", { name: "Add a buddy" })).toBeDisabled();
  await mainNav(page).getByRole("link", { name: "Gear" }).click();
  await expect(page.getByRole("button", { name: "Add gear" })).toBeDisabled();
});

test("covers the public profile without drawing unfinished imports", async ({ page }) => {
  await installAppMocks(page);
  await page.route("**/api/public/divers/**", (route) => {
    const { dives, profile } = baseData();
    dives[1].fields.logbook.site = "Secret draft";
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ diver: { name: profile.name }, dives }) });
  });
  await gotoAndWait(page, "/public/avery-marlow");

  await expect(page.getByRole("heading", { name: "Avery Marlow's dives" })).toBeVisible();
  await expect(page.getByText("Secret draft")).toHaveCount(0);
  await page.getByRole("row").getByRole("button", { name: "Blue Hole" }).click();
  await expect(page.getByRole("heading", { name: "Blue Hole" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit logbook" })).toHaveCount(0);
});

for (const width of [320, 390]) {
  test(`keeps every page inside a ${width}px screen`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 844 });
    await installAppMocks(page, { user: OWNER, authUsers: USERS });
    for (const address of [
      "/",
      "/logs/101",
      "/logs/101/edit",
      "/logs/create",
      "/imports",
      "/imports/202",
      "/imports/file",
      "/map",
      "/equipment",
      "/settings",
      "/settings/application",
      "/public/avery-marlow"
    ]) {
      await gotoAndWait(page, address);
      await expect(page.locator("h1:visible, h2:visible, form:visible").first()).toBeVisible();
      expect(await overflow(page), address).toBeLessThanOrEqual(1);
    }
  });
}

for (const [locale, navigation, heading] of [
  ["de", ["Logbuch", "Importe", "Plätze", "Material"], "Alle Tauchgänge"],
  ["fr", ["Carnet", "Imports", "Sites", "Matériel"], "Toutes les plongées"]
]) {
  test(`draws the logbook in ${locale}`, async ({ page }) => {
    await installAppMocks(page);
    await page.addInitScript((code) => window.localStorage.setItem("divevault.preferredLocale", code), locale);
    await gotoAndWait(page);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    for (const label of navigation) await expect(page.getByRole("banner").getByRole("link", { name: label })).toBeVisible();
    await expect(page.getByRole("cell", { name: "24,8 m" })).toBeVisible();
  });
}

test("has German and French for every literal string on screen", () => {
  const read = (file) => readFileSync(path.join(frontendRoot, file), "utf8");
  const files = readdirSync(path.join(frontendRoot, "app"), { recursive: true })
    .map(String)
    .filter((file) => /\.(vue|js)$/.test(file));
  const used = new Set();
  for (const file of files) {
    const source = read(path.join("app", file));
    for (const match of source.matchAll(/\$tx\(\s*(["'])((?:(?!\1).)+)\1\s*[,)]/g)) used.add(match[2]);
    for (const match of source.matchAll(/\$tn\([^"']*?(["'])((?:(?!\1).)+)\1,\s*(["'])((?:(?!\3).)+)\3/g)) used.add(match[2]).add(match[4]);
  }
  expect(used.size).toBeGreaterThan(300);
  for (const locale of ["en", "de", "fr"]) {
    const messages = JSON.parse(read(`i18n/locales/${locale}.json`));
    expect(
      [...used].filter((key) => !(key in messages)),
      locale
    ).toEqual([]);
  }
});

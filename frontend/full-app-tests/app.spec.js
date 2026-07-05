import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.FULL_APP_TEST_EMAIL || `full-app-diver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const TEST_PASSWORD = process.env.FULL_APP_TEST_PASSWORD || "FullAppPass123!";
const TEST_SITE = "Full Stack Reef";

async function chooseComboboxOption(page, name, optionName) {
  await page.getByRole("combobox", { name }).first().click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

async function waitForDashboardOrAuthError(page) {
  const dashboard = page.getByRole("heading", { name: "Dashboard" });
  const authError = page.getByText(/Invalid email or password|Unable to sign in|Login failed|User account is inactive/i);

  await Promise.race([
    dashboard.waitFor({ state: "visible", timeout: 30000 }),
    authError.waitFor({ state: "visible", timeout: 30000 }).then(async () => {
      throw new Error(`Sign-in failed for ${TEST_EMAIL} before reaching the dashboard: ${await authError.textContent()}`);
    })
  ]);
}

test("runs auth, frontend, and backend against a deployed app stack", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  let expectedCreatedAccount = null;
  const statusResponse = await request.get("/api/auth/status");
  await expect(statusResponse).toBeOK();
  const statusPayload = await statusResponse.json();
  const hasExplicitCredentials = Boolean(process.env.FULL_APP_TEST_EMAIL && process.env.FULL_APP_TEST_PASSWORD);
  if (statusPayload.public_registration_open && !hasExplicitCredentials) {
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByRole("heading", { name: "Create your DiveVault account" })).toBeVisible();

    await page.getByPlaceholder("Email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByPlaceholder("First name").fill("Full");
    await page.getByPlaceholder("Last name").fill("Stack");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Account created. Sign in with your new credentials.")).toBeVisible();
    expectedCreatedAccount = {
      email: TEST_EMAIL,
      first_name: "Full",
      last_name: "Stack",
      role: statusPayload.bootstrap_registration_open ? "admin" : "user",
      is_owner: Boolean(statusPayload.bootstrap_registration_open)
    };
  } else if (!process.env.FULL_APP_TEST_EMAIL || !process.env.FULL_APP_TEST_PASSWORD) {
    throw new Error(
      "Full-app auth bootstrap is closed. Set FULL_APP_TEST_EMAIL and FULL_APP_TEST_PASSWORD for an existing account, or run against a fresh test database."
    );
  }

  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await waitForDashboardOrAuthError(page);

  const token = await page.evaluate(() => window.localStorage.getItem("divevault_auth_token"));
  expect(token).toBeTruthy();

  const authResponse = await request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(authResponse.status()).toBe(200);
  await expect(authResponse).toBeOK();
  const authPayload = await authResponse.json();
  expect(authPayload.email).toBe(TEST_EMAIL);
  if (expectedCreatedAccount) {
    expect(authPayload).toMatchObject(expectedCreatedAccount);
  }

  await page.goto("/logs");
  await expect(page.getByRole("heading", { name: "Dive Logs", exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "New Entry" }).click();
  await expect(page.getByRole("heading", { name: "Manual Dive Entry" })).toBeVisible();

  await page.locator("input[type='date']:visible").fill("2026-06-02");
  await page.locator("input[type='time']:visible").fill("10:30");
  await page.getByPlaceholder("45").fill("37");
  await page.getByPlaceholder("18.0").fill("14.2");
  await chooseComboboxOption(page, "Tank Volume", "12L");
  await page.getByPlaceholder("House Reef").fill(TEST_SITE);
  await page
    .getByPlaceholder("Conditions, wildlife, route, entry, navigation, visibility...")
    .fill("Created by the full application CI pipeline.");
  await page.getByRole("button", { name: "Create Dive Log" }).click();

  await expect(page.getByRole("heading", { name: TEST_SITE })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "Back To Logs" })).toBeVisible();

  const divesResponse = await request.get("/api/dives?limit=25&include_samples=1", {
    headers: { Authorization: `Bearer ${token}` }
  });
  await expect(divesResponse).toBeOK();
  const divesPayload = await divesResponse.json();
  const createdDive = divesPayload.dives.find((dive) => dive?.fields?.logbook?.site === TEST_SITE);
  expect(createdDive).toBeTruthy();
  expect(createdDive.fields.logbook).toMatchObject({
    site: TEST_SITE,
    status: "complete",
    notes: "Created by the full application CI pipeline."
  });
  expect(createdDive).toMatchObject({
    vendor: "Manual",
    product: "Entry",
    duration_seconds: 2220,
    max_depth_m: 14.2
  });
});

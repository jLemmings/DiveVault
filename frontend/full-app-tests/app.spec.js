import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.FULL_APP_TEST_EMAIL || "full-app-diver@example.com";
const TEST_PASSWORD = process.env.FULL_APP_TEST_PASSWORD || "FullAppPass123!";
const TEST_SITE = "Full Stack Reef";

test("runs auth, frontend, and backend against a deployed app stack", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  const statusResponse = await request.get("/api/auth/status");
  await expect(statusResponse).toBeOK();
  const statusPayload = await statusResponse.json();
  if (statusPayload.public_registration_open) {
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByRole("heading", { name: "Create your DiveVault account" })).toBeVisible();

    await page.getByPlaceholder("Email").fill(TEST_EMAIL);
    await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
    await page.getByPlaceholder("First name").fill("Full");
    await page.getByPlaceholder("Last name").fill("Stack");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Account created. Sign in with your new credentials.")).toBeVisible();
  }

  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 30000 });

  const token = await page.evaluate(() => window.localStorage.getItem("divevault_auth_token"));
  expect(token).toBeTruthy();

  const authResponse = await request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(authResponse.status()).toBe(200);
  await expect(authResponse).toBeOK();
  const authPayload = await authResponse.json();
  expect(authPayload).toMatchObject({
    email: TEST_EMAIL,
    first_name: "Full",
    last_name: "Stack",
    role: "admin",
    is_owner: true
  });

  await page.goto("/#logs");
  await expect(page.getByRole("heading", { name: "Dive Logs", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New Entry" }).click();
  await expect(page.getByRole("heading", { name: "Manual Dive Entry" })).toBeVisible();

  await page.locator("input[type='date']:visible").fill("2026-06-02");
  await page.locator("input[type='time']:visible").fill("10:30");
  await page.getByPlaceholder("45").fill("37");
  await page.getByPlaceholder("18.0").fill("14.2");
  await page.getByLabel("Tank Volume").selectOption("12");
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

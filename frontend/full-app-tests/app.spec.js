import { expect, test } from "@playwright/test";

const TEST_EMAIL = process.env.FULL_APP_TEST_EMAIL || `full-app-diver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const TEST_PASSWORD = process.env.FULL_APP_TEST_PASSWORD || "FullAppPass123!";
const TEST_SITE = "Full Stack Reef";

async function waitForLogbookOrAuthError(page) {
  const logbook = page.getByRole("banner").getByRole("link", { name: "Log a dive" });
  const authError = page.getByText(/Invalid email or password|Unable to sign in|User account is inactive/i);

  await Promise.race([
    logbook.waitFor({ state: "visible", timeout: 30000 }),
    authError.waitFor({ state: "visible", timeout: 30000 }).then(async () => {
      throw new Error(`Sign-in failed for ${TEST_EMAIL} before reaching the logbook: ${await authError.textContent()}`);
    })
  ]);
}

test("runs auth, frontend, and backend against a deployed app stack", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  let expectedCreatedAccount = null;
  const statusResponse = await request.get("/api/auth/status");
  await expect(statusResponse).toBeOK();
  const statusPayload = await statusResponse.json();
  const hasExplicitCredentials = Boolean(process.env.FULL_APP_TEST_EMAIL && process.env.FULL_APP_TEST_PASSWORD);
  if (statusPayload.public_registration_open && !hasExplicitCredentials) {
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.getByLabel("Email").fill(TEST_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("First name").fill("Full");
    await page.getByLabel("Last name").fill("Stack");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
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

  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await waitForLogbookOrAuthError(page);

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
  await page.getByRole("banner").getByRole("link", { name: "Log a dive" }).click({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: "Log a dive" })).toBeVisible();

  await page.getByLabel("Date", { exact: true }).fill("2026-06-02");
  await page.getByLabel("Start time").fill("10:30");
  await page.getByLabel("Time underwater, minutes").fill("37");
  await page.getByLabel("Max depth, metres").fill("14.2");
  await page.getByLabel("Tank size, litres").selectOption("12");
  await page.getByLabel("Dive site, required").fill(TEST_SITE);
  await page.getByLabel("Notes", { exact: true }).fill("Created by the full application CI pipeline.");
  await page.getByRole("button", { name: "Add to logbook" }).click();

  await expect(page.getByRole("heading", { name: TEST_SITE })).toBeVisible({ timeout: 30000 });

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

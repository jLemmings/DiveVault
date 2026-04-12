import { expect, test } from "@playwright/test";

import { gotoAndWait, installAppMocks } from "./helpers/app-fixtures.js";

test("renders login flows with the local auth screen", async ({ page }) => {
  await installAppMocks(page, {
    signedIn: false,
    authStatus: {
      initialized: false,
      bootstrap_registration_open: true,
      public_registration_enabled: false,
      public_registration_open: true
    }
  });
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("DiveVault").first()).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

  await page.getByRole("button", { name: "Create Account" }).last().click();
  await expect(page.getByRole("heading", { name: "Create your DiveVault account" })).toBeVisible();
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await expect(page.getByPlaceholder("Last name")).toBeVisible();

  await page.getByRole("button", { name: "Sign In" }).last().click();
  await page.getByPlaceholder("Email").fill("avery@example.com");
  await page.getByPlaceholder("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Dive Overview")).toBeVisible();
});

test("covers dashboard, logs, dive detail, and logbook editing", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page);

  await expect(page.getByText("Dive Overview")).toBeVisible();
  await expect(page.getByRole("banner").getByText("Avery Marlow")).toBeVisible();

  await page.getByRole("button", { name: "Dive Logs" }).click();
  await expect(page.getByRole("heading", { name: "Dive Log Database" })).toBeVisible();
  await page.getByPlaceholder("Search dive logs...").fill("Blue Hole");
  const visibleLogRow = page.locator("article[role='button']:visible").filter({ hasText: "Blue Hole" }).first();
  await expect(visibleLogRow).toBeVisible();

  await visibleLogRow.click();
  await expect(page.getByText("Back To Logs")).toBeVisible();

  await page.getByRole("button", { name: "edit", exact: true }).click();
  await expect(page.getByText("Logbook Entry")).toBeVisible();
  await page.locator("textarea[placeholder='Conditions, wildlife, route, incidents, visibility, buoyancy notes...']:visible").fill("Updated from Playwright coverage.");
  await page.getByRole("button", { name: "Save Logbook Changes" }).click();
  await expect(page.getByText("metadata updated.")).toBeVisible();
});

test("covers the import queue and import completion flow", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#imports");

  await expect(page.getByRole("heading", { name: "Imported Dives" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Imported Dive" }).first().click();

  await page.locator("input[placeholder='Blue Hole / House Reef']:visible").fill("House Reef");
  await page.locator("input[placeholder='Diver name']:visible").fill("Sage");
  await page.locator("input[placeholder='Guide or instructor']:visible").fill("Noor");
  await page.locator("select:visible").selectOption("15");
  await page.getByRole("button", { name: "Complete Record" }).click();

  await expect(page.locator("div:visible").filter({ hasText: "committed to the registry." }).first()).toBeVisible();
});

test("creates a manual dive entry outside the importer workflow", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#logs");

  await page.getByRole("button", { name: "New Entry" }).click();
  await expect(page.getByRole("heading", { name: "Manual Dive Entry" })).toBeVisible();

  await page.locator("input[type='date']:visible").fill("2026-04-06");
  await page.locator("input[type='time']:visible").fill("09:15");
  await page.getByPlaceholder("45").fill("52");
  await page.getByPlaceholder("18.0").fill("21.4");
  await page.getByPlaceholder("27").fill("26");
  await page.getByLabel("Tank Volume").selectOption("12");
  await page.getByPlaceholder("House Reef").fill("Cathedral");
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Save As Reusable Dive Site" }).click();
  await expect(page.getByRole("heading", { name: "Add Dive Site" })).toBeVisible();
  await page.getByPlaceholder("Blue Hole, Dahab, Egypt").fill("Blue Hole, Dahab, Egypt");
  await page.getByRole("button", { name: "Search GPS From Location" }).click();
  await page.getByRole("textbox", { name: "Country" }).fill("Egypt");
  await page.getByRole("button", { name: "Save Dive Site" }).click();
  await expect(page.getByText("Cathedral added to your saved dive sites.")).toBeVisible();
  await page.getByPlaceholder("Diver name").fill("Sage");
  await page.getByPlaceholder("Guide or instructor").fill("Noor");
  await page.getByPlaceholder("Conditions, wildlife, route, entry, navigation, visibility...").fill("Manual shore dive logged without dive computer telemetry.");
  await page.getByRole("button", { name: "Create Dive Log" }).click();

  await expect(page.getByRole("heading", { name: "Cathedral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back To Logs" })).toBeVisible();

  await page.goto("/#imports");
  await expect(page.getByRole("heading", { name: "Imported Dives" })).toBeVisible();
  await expect(page.locator("body")).toContainText("1 Imported");
});

test("covers settings profile loading and public sharing updates", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#settings/diver-details");

  await expect(page.getByText("System Configuration")).toBeVisible();
  await expect(page.getByText("Public Dive Profile")).toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save Sharing" }).click();
  await expect(page.getByText("Public dive profile enabled.")).toBeVisible();

  await page.getByRole("button", { name: "Dive Sites" }).click();
  await expect(page.getByRole("heading", { name: "Reusable Site Directory" })).toBeVisible();
  await page.getByRole("button", { name: "Data Management" }).click();
  await expect(page.getByRole("heading", { name: "Exports And Desktop Sync" })).toBeVisible();
  await page.getByRole("button", { name: "Backup" }).click();
  await expect(page.getByRole("heading", { name: "Backup And Restore" })).toBeVisible();
});

test("covers the public profile route", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/public/avery-marlow");

  await expect(page.getByText("Public Dive Log")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avery Marlow" })).toBeVisible();
  await expect(page.getByText("Blue Hole")).toBeVisible();
});

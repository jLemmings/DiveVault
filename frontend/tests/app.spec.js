import { expect, test } from "@playwright/test";

import { gotoAndWait, installAppMocks } from "./helpers/app-fixtures.js";

test("renders login flows with the local Clerk test stub", async ({ page }) => {
  await installAppMocks(page, { signedIn: false });
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In Test Diver" })).toBeVisible();

  await page.getByRole("button", { name: "Recover Access" }).click();
  await expect(page.getByRole("heading", { name: "Recover Access" })).toBeVisible();
  await page.getByPlaceholder("diver@example.com").fill("diver@example.com");
  await page.getByRole("button", { name: "Send Recovery Code" }).click();
  await expect(page.getByText("Recovery code sent to diver@example.com.")).toBeVisible();

  await page.getByPlaceholder("Enter The Clerk Code").fill("123456");
  await page.getByPlaceholder("Create A New Password").fill("DiverPass123!");
  await page.getByPlaceholder("Repeat The New Password").fill("DiverPass123!");
  await page.getByRole("button", { name: "Reset Password" }).click();

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

import { expect, test } from "@playwright/test";

import { gotoAndWait, installAppMocks } from "./helpers/app-fixtures.js";

async function chooseComboboxOption(page, name, optionName) {
  await page.getByRole("combobox", { name }).first().click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

test("renders login flows with the local auth screen", async ({ page }, testInfo) => {
  testInfo.setTimeout(60000);
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

  const authPanel = page.locator(".auth-panel");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(authPanel.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(authPanel.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel("Language")).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).click();
  await expect(page.getByRole("option")).toHaveText(["English", "Deutsch", "Français"]);
  await page.keyboard.press("Escape");

  await authPanel.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your DiveVault account" })).toBeVisible();
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await expect(page.getByPlaceholder("Last name")).toBeVisible();

  await authPanel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByPlaceholder("Email").fill("avery@example.com");
  await page.getByPlaceholder("Password").fill("Password123!");
  await authPanel.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("hides the public account prompt when registration is closed", async ({ page }) => {
  await installAppMocks(page, {
    signedIn: false,
    authStatus: {
      initialized: true,
      bootstrap_registration_open: false,
      public_registration_enabled: false,
      public_registration_open: false
    }
  });
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Need an account?")).toBeHidden();
  await expect(page.getByRole("button", { name: "Create account" })).toBeHidden();
});

test("covers dashboard, logs, dive detail, and logbook editing", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("Avery Marlow")).toBeVisible();

  await page.getByRole("button", { name: "Dive logs" }).click();
  await expect(page.getByRole("heading", { name: "Dive logs", exact: true })).toBeVisible();
  await page.getByPlaceholder("Search dive logs...").fill("Blue Hole");
  const visibleLogRow = page.locator("article[role='button']:visible").filter({ hasText: "Blue Hole" }).first();
  await expect(visibleLogRow).toBeVisible();
  await expect(visibleLogRow).toContainText("#0001");
  await expect(visibleLogRow).not.toContainText("##0001");
  await expect(visibleLogRow.locator(".material-symbols-outlined", { hasText: "checkroom" }).first()).toBeVisible();
  await expect(visibleLogRow).toContainText("5mm full suit");
  await expect(visibleLogRow.locator(".material-symbols-outlined", { hasText: "fitness_center" }).first()).toBeVisible();
  await expect(visibleLogRow).toContainText("8 kg integrated");

  await visibleLogRow.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Back to logs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logbook details" })).toBeVisible();
  await expect(page.locator("article:visible", { hasText: "Suit" }).filter({ hasText: "5mm full suit" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "18 m / excellent" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "5mm full suit" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "8 kg integrated" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "Light current with scattered clouds." }).first()).toBeVisible();
  await expect(page.getByText("Samples", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Edit dive" }).click();
  await expect(page.getByText("Logbook entry")).toBeVisible();
  await page
    .locator("textarea[placeholder='Conditions, wildlife, route, incidents, visibility, buoyancy notes...']:visible")
    .fill("Updated from Playwright coverage.");
  await page.getByRole("button", { name: "Save logbook changes" }).click();
  await expect(page.getByText("metadata updated.")).toBeVisible();
});

test("navigates between desktop sidebar sections from logs", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/logs");

  await expect(page.getByRole("heading", { name: "Dive logs", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent dives" })).toBeVisible();
  const sidebarBox = await page.locator("aside").first().boundingBox();
  const dashboardRailBox = await page.locator(".dashboard-side-rail").boundingBox();
  expect(dashboardRailBox?.x).toBeGreaterThanOrEqual((sidebarBox?.x || 0) + (sidebarBox?.width || 0) - 1);

  await page.getByRole("button", { name: "Dive logs" }).click();
  await expect(page).toHaveURL(/\/logs$/);
  await expect(page.getByPlaceholder("Search dive logs...")).toBeVisible();
  const logsBox = await page.locator(".dashboard-command-center").boundingBox();
  expect(logsBox?.x).toBeGreaterThanOrEqual((sidebarBox?.x || 0) + (sidebarBox?.width || 0) - 1);

  await page.getByRole("button", { name: "Equipment" }).click();
  await expect(page).toHaveURL(/\/equipment$/);
  await expect(page.getByRole("heading", { name: "Equipment", exact: true })).toBeVisible();
  const equipmentBox = await page.locator(".dashboard-command-center").boundingBox();
  expect(equipmentBox?.x).toBeGreaterThanOrEqual((sidebarBox?.x || 0) + (sidebarBox?.width || 0) - 1);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const settingsBox = await page.locator(".dashboard-command-center").boundingBox();
  expect(settingsBox?.x).toBeGreaterThanOrEqual((sidebarBox?.x || 0) + (sidebarBox?.width || 0) - 1);
});

test("covers the import queue and import completion flow", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#imports");

  await expect(page.getByRole("heading", { name: "Imported dives" })).toBeVisible();
  await page.getByRole("button", { name: "Edit imported dive" }).first().click();

  await page.locator("input[placeholder='Blue Hole / House Reef']:visible").fill("House Reef");
  await chooseComboboxOption(page, "Tank volume", "15L");
  await page.getByRole("button", { name: "Complete record" }).click();

  await expect(page.locator("div:visible").filter({ hasText: "committed to the registry." }).first()).toBeVisible();
});

test("creates a manual dive entry outside the importer workflow", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#logs");

  await page.getByRole("button", { name: "New entry" }).click();
  await expect(page.getByRole("heading", { name: "Manual dive entry" })).toBeVisible();

  await page.locator("input[type='date']:visible").fill("2026-04-06");
  await page.locator("input[type='time']:visible").fill("09:15");
  await page.getByPlaceholder("45").fill("52");
  await page.getByPlaceholder("18.0").fill("21.4");
  await page.getByPlaceholder("27").fill("26");
  await chooseComboboxOption(page, "Tank volume", "12L");
  await page.getByPlaceholder("House Reef").fill("Cathedral");
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Save as reusable dive site" }).click();
  await expect(page.getByRole("heading", { name: "Add dive site" })).toBeVisible();
  await page.getByPlaceholder("Blue Hole, Dahab, Egypt").fill("Blue Hole, Dahab, Egypt");
  await page.getByRole("button", { name: "Search GPS from location" }).click();
  await page.getByRole("textbox", { name: "Country" }).fill("Egypt");
  await page.getByRole("button", { name: "Save dive site" }).click();
  await expect(page.getByText("Cathedral added to your saved dive sites.")).toBeVisible();
  await page.locator("input[placeholder='8 kg integrated + 1 kg trim']:visible").fill("6 kg belt");
  await page
    .getByPlaceholder("Conditions, wildlife, route, entry, navigation, visibility...")
    .fill("Manual shore dive logged without dive computer telemetry.");
  await page.getByRole("button", { name: "Create dive log" }).click();

  await expect(page.getByRole("heading", { name: "Cathedral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to logs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dive profile" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Profile points" })).toBeHidden();
  await expect(page.getByText("Avg depth", { exact: true })).toBeHidden();
  await expect(page.getByText("Samples", { exact: true })).toBeHidden();
  await expect(page.getByText("0 telemetry points")).toBeHidden();
  await expect(page.locator("p:visible", { hasText: "6 kg belt" }).first()).toBeVisible();

  await page.goto("/#imports");
  await expect(page.getByRole("heading", { name: "Imported dives" })).toBeVisible();
  await expect(page.locator("body")).toContainText("1 Imported");
});

test("covers settings profile loading and public sharing updates", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#settings/diver-details");

  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diver details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certifications and PDFs" })).toBeVisible();
  await expect(page.getByText("Public dive profile")).toBeHidden();

  const settingsRail = page.locator(".settings-section-nav");
  await settingsRail.getByRole("button", { name: /Application/ }).click();
  await expect(page.getByRole("heading", { name: "Application version" })).toBeVisible();
  await expect(page.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText("Public dive profile")).toBeVisible();

  await page.getByRole("checkbox", { name: "Make my completed dives public" }).check();
  await page.getByRole("button", { name: "Save sharing" }).click();
  await expect(page.getByText("Public dive profile enabled.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Dive sites/ }).click();
  await expect(page.getByRole("heading", { name: "Saved dive sites" })).toBeVisible();
  await expect(page.locator(".dive-theme-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.locator(".dive-theme-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".dive-theme-map.leaflet-container")).toBeVisible();
  await settingsRail.getByRole("button", { name: /Data management/ }).click();
  await expect(page.getByRole("heading", { name: "Exports and desktop sync" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Import dives \(CSV\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Import Subsurface export/ })).toBeVisible();
  await settingsRail.getByRole("button", { name: /Backup/ }).click();
  await expect(page.getByRole("heading", { name: "Backup and restore" })).toBeVisible();
});

test("covers extracted settings lists and user management", async ({ page }) => {
  const ownerUser = {
    id: "owner_avery",
    firstName: "Avery",
    lastName: "Marlow",
    role: "admin",
    isOwner: true,
    primaryEmailAddress: {
      emailAddress: "avery@example.com"
    },
    emailAddresses: [
      {
        emailAddress: "avery@example.com"
      }
    ]
  };
  await installAppMocks(page, {
    user: ownerUser,
    authUsers: [
      {
        id: "owner_avery",
        email: "avery@example.com",
        first_name: "Avery",
        last_name: "Marlow",
        role: "admin",
        is_active: true,
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:00:00Z",
        last_login_at: "2026-04-07T10:00:00Z"
      },
      {
        id: "user_kai",
        email: "kai@example.com",
        first_name: "Kai",
        last_name: "Reef",
        role: "user",
        is_active: true,
        created_at: "2026-04-02T09:00:00Z",
        updated_at: "2026-04-02T09:00:00Z",
        last_login_at: "2026-04-07T11:00:00Z"
      }
    ]
  });
  await gotoAndWait(page, "/#settings/buddies");

  const settingsRail = page.locator(".settings-section-nav");
  await expect(page.getByRole("heading", { name: "Saved dive buddy list" })).toBeVisible();
  await page.getByPlaceholder("Filter buddies").fill("Kai");
  await expect(page.getByRole("heading", { name: "Kai" })).toBeVisible();
  await page.getByRole("button", { name: "Edit buddy" }).click();
  await page.getByRole("textbox", { name: "Buddy name" }).fill("Kai Reef");
  await page.getByRole("button", { name: "Save buddy" }).click();
  await expect(page.getByText("Buddies updated.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Dive guide/ }).click();
  await expect(page.getByRole("heading", { name: "Saved guide list" })).toBeVisible();
  await page.getByPlaceholder("Filter guides").fill("Mina");
  await page.getByRole("button", { name: "Edit guide" }).click();
  await page.getByRole("textbox", { name: "Guide name" }).fill("Mina Reef");
  await page.getByRole("button", { name: "Save guide" }).click();
  await expect(page.getByText("Guides updated.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Manage users/ }).click();
  await expect(page.getByRole("heading", { name: "Invites and access control" })).toBeVisible();
  await page.getByLabel("Allow direct account creation").check();
  await page.getByRole("button", { name: "Save access policy" }).click();
  await expect(page.getByText("Public registration enabled.")).toBeVisible();
  await page.getByPlaceholder("second-user@example.com").fill("buddy@example.com");
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Invitation created for buddy@example.com.")).toBeVisible();
  await expect(page.getByText("kai@example.com")).toBeVisible();
});

test("keeps user management settings inside narrow mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAppMocks(page, {
    user: {
      id: "owner_avery",
      firstName: "Avery",
      lastName: "Marlow",
      role: "admin",
      isOwner: true,
      primaryEmailAddress: {
        emailAddress: "avery@example.com"
      },
      emailAddresses: [
        {
          emailAddress: "avery@example.com"
        }
      ]
    },
    authUsers: [
      {
        id: "owner_avery",
        email: "avery.longname@example.com",
        first_name: "Avery",
        last_name: "Marlow",
        role: "admin",
        is_active: true,
        created_at: "2026-04-01T09:00:00Z",
        updated_at: "2026-04-01T09:00:00Z",
        last_login_at: "2026-04-07T10:00:00Z"
      },
      {
        id: "user_kai",
        email: "kai.with-a-long-email-address@example.com",
        first_name: "Kai",
        last_name: "Reef",
        role: "user",
        is_active: true,
        created_at: "2026-04-02T09:00:00Z",
        updated_at: "2026-04-02T09:00:00Z",
        last_login_at: "2026-04-07T11:00:00Z"
      }
    ]
  });
  await gotoAndWait(page, "/#settings/manage-users");

  await expect(page.getByRole("heading", { name: "Invites and access control" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.documentWidth + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.documentWidth + 1);

  for (const selector of [".settings-panel", ".settings-action-card", ".settings-item-card"]) {
    const boxes = await page.locator(selector).evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((box) => box.width > 0 && box.height > 0)
    );
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(overflow.documentWidth + 1);
      expect(box.width).toBeGreaterThan(0);
    }
  }
});

test("manages equipment inventory and service schedule", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#equipment");

  await expect(page.getByRole("heading", { name: "Equipment", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aqualung Blue Shop Regulator" }).first()).toBeVisible();
  await expect(page.getByPlaceholder("Search equipment...")).toBeVisible();

  await page.getByRole("button", { name: "New entry" }).click();
  await expect(page.getByRole("heading", { name: "New equipment" })).toBeVisible();
  await page.getByRole("textbox", { name: "Category" }).fill("BCD");
  await page.getByRole("textbox", { name: "Year bought" }).fill("2025");
  await page.getByRole("textbox", { name: "Vendor" }).fill("Reef Shop");
  await page.getByRole("textbox", { name: "Brand" }).fill("Scubapro");
  await page.getByRole("textbox", { name: "Warranty" }).fill("3 years");
  await page.getByPlaceholder("100").fill("50");
  await page.getByLabel("Use by default on each dive").check();
  await page.getByRole("button", { name: "Save gear" }).click();
  await expect(page.getByText("Equipment inventory saved.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Due for service" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scubapro Reef Shop BCD" }).first()).toBeVisible();
  const savedEquipmentCard = page.locator("article").filter({ hasText: "Scubapro Reef Shop BCD" });
  await expect(savedEquipmentCard.getByText("Next service")).toBeVisible();
  await expect(savedEquipmentCard.getByText(/dives left|Dive interval not set/)).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Aqualung Blue Shop Regulator" }).getByRole("button", { name: "Mark serviced" })
  ).toBeHidden();
});

test("covers the public profile route", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/public/avery-marlow");

  await expect(page.getByText("Public dive log")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avery Marlow" })).toBeVisible();
  await expect(page.getByText("Blue Hole")).toBeVisible();
});

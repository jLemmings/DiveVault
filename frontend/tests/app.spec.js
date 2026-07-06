import { expect, test } from "@playwright/test";

import { gotoAndWait, installAppMocks } from "./helpers/app-fixtures.js";

async function chooseComboboxOption(page, name, optionName) {
  await page.getByRole("combobox", { name }).first().click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

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
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  await expect(page.getByLabel("Language")).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).click();
  await expect(page.getByRole("option")).toHaveText(["English", "Deutsch", "Français"]);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Create Account" }).last().click();
  await expect(page.getByRole("heading", { name: "Create your DiveVault account" })).toBeVisible();
  await expect(page.getByPlaceholder("First name")).toBeVisible();
  await expect(page.getByPlaceholder("Last name")).toBeVisible();

  await page.getByRole("button", { name: "Sign In" }).last().click();
  await page.getByPlaceholder("Email").fill("avery@example.com");
  await page.getByPlaceholder("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign In" }).click();
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
  await expect(page.getByRole("button", { name: "Create Account" })).toBeHidden();
});

test("covers dashboard, logs, dive detail, and logbook editing", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("Avery Marlow")).toBeVisible();

  await page.getByRole("button", { name: "Dive Logs" }).click();
  await expect(page.getByRole("heading", { name: "Dive Logs", exact: true })).toBeVisible();
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
  await expect(page.getByText("Back To Logs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logbook Details" })).toBeVisible();
  await expect(page.locator("article:visible", { hasText: "Suit" }).filter({ hasText: "5mm full suit" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "18 m / excellent" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "5mm full suit" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "8 kg integrated" }).first()).toBeVisible();
  await expect(page.locator("p:visible", { hasText: "Light current with scattered clouds." }).first()).toBeVisible();
  await expect(page.getByText("Samples", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Edit dive" }).click();
  await expect(page.getByText("Logbook Entry")).toBeVisible();
  await page
    .locator("textarea[placeholder='Conditions, wildlife, route, incidents, visibility, buoyancy notes...']:visible")
    .fill("Updated from Playwright coverage.");
  await page.getByRole("button", { name: "Save Logbook Changes" }).click();
  await expect(page.getByText("metadata updated.")).toBeVisible();
});

test("covers the import queue and import completion flow", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#imports");

  await expect(page.getByRole("heading", { name: "Imported Dives" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Imported Dive" }).first().click();

  await page.locator("input[placeholder='Blue Hole / House Reef']:visible").fill("House Reef");
  await chooseComboboxOption(page, "Tank Volume", "15L");
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
  await chooseComboboxOption(page, "Tank Volume", "12L");
  await page.getByPlaceholder("House Reef").fill("Cathedral");
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Save As Reusable Dive Site" }).click();
  await expect(page.getByRole("heading", { name: "Add Dive Site" })).toBeVisible();
  await page.getByPlaceholder("Blue Hole, Dahab, Egypt").fill("Blue Hole, Dahab, Egypt");
  await page.getByRole("button", { name: "Search GPS From Location" }).click();
  await page.getByRole("textbox", { name: "Country" }).fill("Egypt");
  await page.getByRole("button", { name: "Save Dive Site" }).click();
  await expect(page.getByText("Cathedral added to your saved dive sites.")).toBeVisible();
  await page.locator("input[placeholder='8 kg integrated + 1 kg trim']:visible").fill("6 kg belt");
  await page
    .getByPlaceholder("Conditions, wildlife, route, entry, navigation, visibility...")
    .fill("Manual shore dive logged without dive computer telemetry.");
  await page.getByRole("button", { name: "Create Dive Log" }).click();

  await expect(page.getByRole("heading", { name: "Cathedral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back To Logs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dive Profile" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Dive Checkpoints" })).toBeHidden();
  await expect(page.getByText("Avg Depth", { exact: true })).toBeHidden();
  await expect(page.getByText("Samples", { exact: true })).toBeHidden();
  await expect(page.getByText("0 telemetry points")).toBeHidden();
  await expect(page.locator("p:visible", { hasText: "6 kg belt" }).first()).toBeVisible();

  await page.goto("/#imports");
  await expect(page.getByRole("heading", { name: "Imported Dives" })).toBeVisible();
  await expect(page.locator("body")).toContainText("1 Imported");
});

test("covers settings profile loading and public sharing updates", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/#settings/diver-details");

  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diver Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certifications And PDFs" })).toBeVisible();
  await expect(page.getByText("Public Dive Profile")).toBeHidden();

  const settingsRail = page.locator(".settings-section-nav");
  await settingsRail.getByRole("button", { name: /Application/ }).click();
  await expect(page.getByRole("heading", { name: "Application Version" })).toBeVisible();
  await expect(page.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText("Public Dive Profile")).toBeVisible();

  await page.getByRole("checkbox", { name: "Make My Completed Dives Public" }).check();
  await page.getByRole("button", { name: "Save Sharing" }).click();
  await expect(page.getByText("Public dive profile enabled.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Dive Sites/ }).click();
  await expect(page.getByRole("heading", { name: "Reusable Site Directory" })).toBeVisible();
  await expect(page.locator(".dive-theme-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Site" }).click();
  await expect(page.locator(".dive-theme-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".dive-theme-map.leaflet-container")).toBeVisible();
  await settingsRail.getByRole("button", { name: /Data Management/ }).click();
  await expect(page.getByRole("heading", { name: "Exports And Desktop Sync" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Import Dives \(CSV\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Import Subsurface Export/ })).toBeVisible();
  await settingsRail.getByRole("button", { name: /Backup/ }).click();
  await expect(page.getByRole("heading", { name: "Backup And Restore" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Saved Dive Buddy List" })).toBeVisible();
  await page.getByPlaceholder("Filter buddies").fill("Kai");
  await expect(page.getByRole("heading", { name: "Kai" })).toBeVisible();
  await page.getByRole("button", { name: "Edit Buddy" }).click();
  await page.getByRole("textbox", { name: "Buddy Name" }).fill("Kai Reef");
  await page.getByRole("button", { name: "Save Buddy" }).click();
  await expect(page.getByText("Buddies updated.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Dive Guide/ }).click();
  await expect(page.getByRole("heading", { name: "Saved Guide List" })).toBeVisible();
  await page.getByPlaceholder("Filter guides").fill("Mina");
  await page.getByRole("button", { name: "Edit Guide" }).click();
  await page.getByRole("textbox", { name: "Guide Name" }).fill("Mina Reef");
  await page.getByRole("button", { name: "Save Guide" }).click();
  await expect(page.getByText("Guides updated.")).toBeVisible();

  await settingsRail.getByRole("button", { name: /Manage Users/ }).click();
  await expect(page.getByRole("heading", { name: "Invites And Access Control" })).toBeVisible();
  await page.getByLabel("Allow direct account creation").check();
  await page.getByRole("button", { name: "Save Access Policy" }).click();
  await expect(page.getByText("Public registration enabled.")).toBeVisible();
  await page.getByPlaceholder("second-user@example.com").fill("buddy@example.com");
  await page.getByRole("button", { name: "Create Invite" }).click();
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

  await expect(page.getByRole("heading", { name: "Invites And Access Control" })).toBeVisible();

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

  await page.getByRole("button", { name: "New Entry" }).click();
  await expect(page.getByRole("heading", { name: "New Equipment" })).toBeVisible();
  await page.getByRole("textbox", { name: "Category" }).fill("BCD");
  await page.getByRole("textbox", { name: "Year Bought" }).fill("2025");
  await page.getByRole("textbox", { name: "Vendor" }).fill("Reef Shop");
  await page.getByRole("textbox", { name: "Brand" }).fill("Scubapro");
  await page.getByRole("textbox", { name: "Warranty" }).fill("3 years");
  await page.getByPlaceholder("100").fill("50");
  await page.getByLabel("Use by default on each dive").check();
  await page.getByRole("button", { name: "Save Gear" }).click();
  await expect(page.getByText("Equipment inventory saved.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Next Equipment Due" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scubapro Reef Shop BCD" }).first()).toBeVisible();
  const savedEquipmentCard = page.locator("article").filter({ hasText: "Scubapro Reef Shop BCD" });
  await expect(savedEquipmentCard.getByText("Service Countdown")).toBeVisible();
  await expect(savedEquipmentCard.getByText(/dives left|Dive interval not set/)).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Aqualung Blue Shop Regulator" }).getByRole("button", { name: "Mark Serviced" })
  ).toBeHidden();
});

test("covers the public profile route", async ({ page }) => {
  await installAppMocks(page);
  await gotoAndWait(page, "/public/avery-marlow");

  await expect(page.getByText("Public Dive Log")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avery Marlow" })).toBeVisible();
  await expect(page.getByText("Blue Hole")).toBeVisible();
});

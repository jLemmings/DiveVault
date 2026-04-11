import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

import { baseData, buildDive, installAppMocks, gotoAndWait } from "../tests/helpers/app-fixtures.js";

const baseUrl = "http://127.0.0.1:4173";
const outputDir = path.resolve(process.cwd(), "../docs/readme");

const egyptSites = [
  { name: "Blue Hole", location: "Dahab", country: "Egypt", latitude: 28.5729, longitude: 34.5367 },
  { name: "El Bells", location: "Dahab", country: "Egypt", latitude: 28.5805, longitude: 34.5378 },
  { name: "Ras Mohammed", location: "Sharm El Sheikh", country: "Egypt", latitude: 27.7247, longitude: 34.2496 },
  { name: "Thistlegorm", location: "Sha'ab Ali", country: "Egypt", latitude: 27.8104, longitude: 33.9215 },
  { name: "Abu Nuhas", location: "Red Sea", country: "Egypt", latitude: 27.7608, longitude: 33.8408 },
  { name: "Salem Express", location: "Safaga", country: "Egypt", latitude: 26.6243, longitude: 34.0628 },
  { name: "Elphinstone", location: "Marsa Alam", country: "Egypt", latitude: 25.3117, longitude: 34.8619 },
  { name: "Daedalus Reef", location: "Red Sea", country: "Egypt", latitude: 24.9227, longitude: 35.8622 }
];

const maldivesSites = [
  { name: "Maaya Thila", location: "North Ari Atoll", country: "Maldives", latitude: 4.1878, longitude: 72.8776 },
  { name: "Fish Head", location: "North Ari Atoll", country: "Maldives", latitude: 4.3024, longitude: 72.9152 },
  { name: "Manta Point", location: "South Male Atoll", country: "Maldives", latitude: 3.9235, longitude: 73.4672 },
  { name: "Banana Reef", location: "North Male Atoll", country: "Maldives", latitude: 4.2872, longitude: 73.5461 },
  { name: "Kandooma Thila", location: "South Male Atoll", country: "Maldives", latitude: 3.7717, longitude: 73.4654 },
  { name: "Fotteyo Kandu", location: "Vaavu Atoll", country: "Maldives", latitude: 3.4839, longitude: 73.6861 },
  { name: "Miyaru Kandu", location: "Felidhoo Atoll", country: "Maldives", latitude: 3.5072, longitude: 73.7053 }
];

function buildStartedAt(index) {
  const day = (index % 28) + 1;
  const hour = 6 + (index % 10);
  const minute = (index * 7) % 60;
  return `2026-03-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;
}

function createMockData() {
  const data = baseData();
  const dives = [];
  const allSites = [...egyptSites, ...maldivesSites];
  const buddies = ["Kai", "Mina", "Sage", "Noor", "Lea", "Jonah"];
  const guides = ["Mina", "Noor", "Ibrahim", "Aisha", "Zayan"];

  for (let index = 0; index < 40; index += 1) {
    const site = allSites[index % allSites.length];
    dives.push(buildDive({
      id: 1000 + index,
      site: site.name,
      buddy: buddies[index % buddies.length],
      guide: guides[index % guides.length],
      status: "complete",
      started_at: buildStartedAt(index),
      imported_at: buildStartedAt(index),
      duration_seconds: 2400 + (index * 120),
      max_depth_m: 18 + ((index * 3) % 16),
      location: { lat: site.latitude, lon: site.longitude },
      raw_sha256: `sha-committed-${index}`
    }));
  }

  for (let index = 0; index < 15; index += 1) {
    const site = allSites[index % allSites.length];
    dives.push(buildDive({
      id: 2000 + index,
      site: "",
      buddy: "",
      guide: "",
      notes: "",
      status: "imported",
      started_at: buildStartedAt(index + 15),
      imported_at: buildStartedAt(index + 15),
      duration_seconds: 2100 + (index * 45),
      max_depth_m: 12 + ((index * 5) % 20),
      location: { lat: site.latitude, lon: site.longitude },
      raw_sha256: `sha-imported-${index}`
    }));
  }

  data.dives = dives.sort((left, right) => right.started_at.localeCompare(left.started_at));
  data.profile = {
    ...data.profile,
    name: "Avery Marlow",
    email: "avery@example.com",
    dive_sites: allSites.map((site, index) => ({
      id: `site-${index + 1}`,
      name: site.name,
      location: site.location,
      country: site.country,
      latitude: site.latitude,
      longitude: site.longitude
    })),
    buddies: buddies.map((name, index) => ({ id: `buddy-${index + 1}`, name })),
    guides: guides.map((name, index) => ({ id: `guide-${index + 1}`, name }))
  };
  data.stats = {
    totalDives: dives.length,
    totalSeconds: dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0),
    totalHours: Number((dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0) / 3600).toFixed(1)),
    maxDepth: Math.max(...dives.map((dive) => dive.max_depth_m || 0)),
    totalBarConsumed: 1680,
    averageDurationSeconds: Math.round(dives.reduce((sum, dive) => sum + (dive.duration_seconds || 0), 0) / dives.length),
    averageMaxDepth: Number((dives.reduce((sum, dive) => sum + (dive.max_depth_m || 0), 0) / dives.length).toFixed(1)),
    bottomTimeProgress: 78
  };
  return data;
}

const mockedData = createMockData();

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForDashboardMap(page) {
  await page.waitForSelector(".dive-theme-map", { state: "visible", timeout: 15000 });
  await page.waitForFunction(() => {
    const tiles = Array.from(document.querySelectorAll(".leaflet-tile"));
    if (!tiles.length) return false;
    return tiles.some((tile) => tile.classList.contains("leaflet-tile-loaded"));
  }, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function captureDashboard(page) {
  await installAppMocks(page, { data: mockedData });
  await gotoAndWait(page, `${baseUrl}/`);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await waitForDashboardMap(page);
  await page.screenshot({
    path: path.join(outputDir, "dashboard.png"),
    fullPage: false
  });
}

async function captureImports(page) {
  await installAppMocks(page, { data: mockedData });
  await gotoAndWait(page, `${baseUrl}/#imports`);
  await page.screenshot({
    path: path.join(outputDir, "imports.png"),
    fullPage: false
  });
}

async function captureSettings(page) {
  await installAppMocks(page, { data: mockedData });
  await gotoAndWait(page, `${baseUrl}/#settings/diver-details`);
  await page.screenshot({
    path: path.join(outputDir, "settings.png"),
    fullPage: false
  });
}

async function main() {
  await ensureDir(outputDir);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1100 }
  });

  try {
    await captureDashboard(page);
    await captureImports(page);
    await captureSettings(page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(frontendRoot, "..");
const appRoot = path.join(frontendRoot, "app");

const generatedTrackedPaths = [
  "frontend/debug.log",
  "frontend/dist",
  "frontend/.nuxt",
  "frontend/.output",
  "frontend/playwright-report",
  "frontend/test-results"
];

const legacyReferences = [
  "frontend/src",
  "src/app",
  "~/utils/",
  "~/composables/",
  "~/components/LicensePdfPreview.vue",
  "~/components/MetadataAutocomplete.vue",
  "~/components/NuxtRouteShell.vue",
  "components/views",
  "components/settings"
];

const ignoredDirs = new Set([".git", ".nuxt", ".output", "dist", "node_modules", "playwright-report", "test-results"]);

function toRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return ignoredDirs.has(entry) ? [] : listFiles(fullPath);
    }
    return stats.isFile() ? [fullPath] : [];
  });
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
}

function findLegacyReferences(files) {
  return files.flatMap((filePath) => {
    const text = readFileSync(filePath, "utf8");
    const matches = legacyReferences.filter((needle) => text.includes(needle));
    return matches.map((needle) => `${toRepoPath(filePath)} references ${needle}`);
  });
}

function findTrackedGeneratedFiles(files) {
  return files
    .filter((filePath) => {
      if (!existsSync(path.join(repoRoot, filePath))) return false;
      return generatedTrackedPaths.some((generatedPath) => {
        return filePath === generatedPath || filePath.startsWith(`${generatedPath}/`);
      });
    })
    .map((filePath) => `${filePath} is generated/runtime output and should not be tracked`);
}

function findFeatureInternalImports(files) {
  const featureImportPattern = /from\s+["']~\/features\/([^/"']+)\/([^"']+)["']/g;
  return files.flatMap((filePath) => {
    const repoPath = toRepoPath(filePath);
    const normalized = repoPath.replace(/\\/g, "/");
    const currentFeature = normalized.match(/^frontend\/app\/features\/([^/]+)\//)?.[1] || "";
    const text = readFileSync(filePath, "utf8");
    const violations = [];
    let match;

    while ((match = featureImportPattern.exec(text)) !== null) {
      const importedFeature = match[1];
      const importedPath = match[2];
      if (currentFeature && importedFeature !== currentFeature && !importedPath.startsWith("index.")) {
        violations.push(`${repoPath} imports internal ${importedFeature}/${importedPath}`);
      }
    }

    return violations;
  });
}

const sourceFiles = listFiles(appRoot).filter((filePath) => /\.(js|mjs|vue|json)$/.test(filePath));
const tracked = trackedFiles();
const failures = [...findTrackedGeneratedFiles(tracked), ...findLegacyReferences(sourceFiles), ...findFeatureInternalImports(sourceFiles)];

if (failures.length > 0) {
  console.error("Structure check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Structure check passed.");

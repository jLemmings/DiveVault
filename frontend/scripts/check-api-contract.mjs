import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_ENDPOINTS } from "../app/shared/api/endpoints.js";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(frontendRoot, "..");
const contractPath = path.join(repoRoot, "contracts", "api-routes.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));

const endpointValues = new Set(Object.values(API_ENDPOINTS));
const literalContractPaths = contract.map((entry) => entry.path).filter((routePath) => !routePath.includes("{"));

const missing = literalContractPaths.filter((routePath) => !endpointValues.has(routePath));

if (missing.length > 0) {
  console.error("Frontend API endpoint constants are missing contract routes:");
  missing.forEach((routePath) => console.error(`- ${routePath}`));
  process.exit(1);
}

console.log("API contract check passed.");

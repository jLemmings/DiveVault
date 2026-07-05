import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(frontendDir, "..");
const defaultBaseURL = "http://127.0.0.1:8000";
const baseURL = process.env.FULL_APP_BASE_URL || defaultBaseURL;
const parsedBaseURL = new URL(baseURL);
const isWindows = process.platform === "win32";
const localDemoEmail = "admin";
const localDemoPassword = "admin";
let backendProcess = null;
let backendExitError = null;

function commandName(name) {
  return isWindows ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childCommand = isWindows ? "cmd.exe" : command;
    const childArgs = isWindows ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(childCommand, childArgs, {
      cwd: options.cwd || frontendDir,
      env: options.env || process.env,
      shell: false,
      stdio: options.stdio || "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${signal || `code ${code}`}.`));
    });
  });
}

async function fetchText(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function isReady() {
  try {
    const health = await fetchText(new URL("/health", baseURL));
    if (!health.ok) return false;

    const app = await fetchText(new URL("/", baseURL));
    return app.ok && app.text.includes("<!DOCTYPE html") && !app.text.includes("Frontend asset not found");
  } catch {
    return false;
  }
}

async function waitForReady(timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (backendExitError) throw backendExitError;
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${baseURL} to serve /health and the built frontend.`);
}

function pythonCommand() {
  if (process.env.PYTHON) return process.env.PYTHON;

  const virtualenvPython = isWindows
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python");
  if (existsSync(virtualenvPython)) return virtualenvPython;

  return "python";
}

function startBackend() {
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH || "backend",
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://dive:dive@127.0.0.1:5432/dive",
    AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || "full-application-test-secret",
    AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER || "divevault.full-application-test",
    AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE || "divevault.full-application-test",
    STARTUP_MIGRATIONS: process.env.STARTUP_MIGRATIONS || "enabled",
    FRONTEND_DIR: process.env.FRONTEND_DIR || "frontend/dist",
    HOST: parsedBaseURL.hostname,
    PORT: parsedBaseURL.port || "8000",
    CORS_ORIGIN: process.env.CORS_ORIGIN || baseURL,
    DB_POOL_SIZE: process.env.DB_POOL_SIZE || "0",
    METRICS_ENABLED: process.env.METRICS_ENABLED || "disabled",
    DEMO_MODE: process.env.DEMO_MODE || "true"
  };

  const python = pythonCommand();
  console.log(`Starting backend with ${python}.`);

  backendProcess = spawn(python, ["-m", "divevault.app"], {
    cwd: repoRoot,
    env,
    shell: false,
    stdio: "inherit"
  });

  backendProcess.on("exit", (code, signal) => {
    if (backendProcess && code !== 0) {
      backendExitError = new Error(`Backend exited with ${signal || `code ${code}`}.`);
      console.error(backendExitError.message);
    }
  });
}

function fullAppTestEnv(overrides = {}) {
  return {
    ...process.env,
    ...overrides
  };
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  backendProcess.kill("SIGTERM");
}

async function main() {
  const ready = await isReady();
  if ((process.env.CI || process.env.FULL_APP_BASE_URL) && ready) {
    console.log(`Using running full application stack at ${baseURL}.`);
    await run(commandName("npx"), ["playwright", "test", "-c", "playwright.full-app.config.js"]);
    return;
  }

  if (!process.env.CI && !process.env.FULL_APP_BASE_URL && ready) {
    throw new Error(
      [
        `A full application stack is already running at ${baseURL}.`,
        "Stop it before running npm run test:full-app so the local test runner can start a deterministic demo backend.",
        "To intentionally test the running stack instead, set FULL_APP_BASE_URL and, if registration is closed, FULL_APP_TEST_EMAIL/FULL_APP_TEST_PASSWORD."
      ].join("\n")
    );
  }

  if (process.env.CI || process.env.FULL_APP_BASE_URL) {
    await run(commandName("npx"), ["playwright", "test", "-c", "playwright.full-app.config.js"]);
    return;
  }

  console.log(`No deployed app stack detected at ${baseURL}; starting a local full-app test backend.`);
  console.log("This requires PostgreSQL at postgresql://dive:dive@127.0.0.1:5432/dive unless DATABASE_URL is set.");

  try {
    await run(commandName("npm"), ["run", "build:app"]);
    startBackend();
    await waitForReady();
    await run(commandName("npx"), ["playwright", "test", "-c", "playwright.full-app.config.js"], {
      env: fullAppTestEnv({
        FULL_APP_TEST_EMAIL: localDemoEmail,
        FULL_APP_TEST_PASSWORD: localDemoPassword
      })
    });
  } finally {
    stopBackend();
  }
}

main().catch((error) => {
  stopBackend();
  console.error(error?.message || error);
  process.exit(1);
});

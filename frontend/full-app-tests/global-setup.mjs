const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function globalSetup() {
  const baseURL = process.env.FULL_APP_BASE_URL || DEFAULT_BASE_URL;
  const healthURL = new URL("/health", baseURL).toString();
  const appURL = new URL("/", baseURL).toString();

  try {
    const healthResponse = await fetchWithTimeout(healthURL, 5000);
    if (!healthResponse.ok) {
      throw new Error(`Health check returned HTTP ${healthResponse.status}.`);
    }

    const appResponse = await fetchWithTimeout(appURL, 5000);
    const appBody = await appResponse.text();
    if (!appResponse.ok || appBody.includes("Frontend asset not found") || !appBody.includes("<!DOCTYPE html")) {
      throw new Error(`Frontend entrypoint ${appURL} is not serving the built app. Response: ${appBody.slice(0, 160)}`);
    }
  } catch (error) {
    throw new Error(
      [
        `Full application tests require a running deployed app stack at ${baseURL}.`,
        `The health check ${healthURL} and frontend entrypoint ${appURL} must both be reachable.`,
        "",
        "For CI, the workflow starts the backend before this command.",
        "For local runs, build frontend/dist, start the backend with FRONTEND_DIR pointing at that dist directory and a PostgreSQL database, or set FULL_APP_BASE_URL to an existing deployed app.",
        "",
        `Original error: ${error?.message || error}`
      ].join("\n"),
      { cause: error }
    );
  }
}

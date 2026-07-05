import { DEFAULT_REQUEST_TIMEOUT_MS } from "~/config/runtime.js";

export function withTimeout(promise, timeoutMs, errorMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export function apiError(payload, response) {
  return new Error(payload?.error || `API returned ${response.status}`);
}

export async function parseJson(response, fallback = null) {
  return response.json().catch(() => fallback);
}

export async function requireJson(response, fallback = null) {
  const payload = await parseJson(response, fallback);
  if (!response.ok) {
    throw apiError(payload, response);
  }
  return payload;
}

export function createApiClient({ getToken = null, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  async function request(resource, options = {}, requestOptions = {}) {
    const effectiveTimeoutMs = requestOptions.timeoutMs || timeoutMs;
    const headers = new Headers(options.headers || {});
    const requireAuth = requestOptions.requireAuth !== false;

    let token = null;
    if (requireAuth && typeof getToken === "function") {
      token = await withTimeout(getToken(), effectiveTimeoutMs, "Timed out while waiting for the Authentication session token.");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      return await fetch(resource, {
        ...options,
        credentials: "include",
        headers,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Request to ${resource} timed out after ${Math.round(effectiveTimeoutMs / 1000)}s.`, { cause: error });
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function json(resource, options = {}, requestOptions = {}) {
    const response = await request(resource, options, requestOptions);
    return requireJson(response);
  }

  return {
    json,
    request
  };
}

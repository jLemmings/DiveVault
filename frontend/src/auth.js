import { computed, reactive } from "vue";

const TOKEN_STORAGE_KEY = "divevault_auth_token";
const state = reactive({
  loaded: false,
  token: null,
  user: null,
  sessionId: null
});

function applySession(token, mePayload) {
  state.token = token || null;
  state.user = mePayload
    ? {
      id: mePayload.user_id,
      firstName: mePayload.first_name || "",
      lastName: mePayload.last_name || "",
      role: mePayload.role || "user",
      primaryEmailAddress: { emailAddress: mePayload.email || "" },
      emailAddresses: [{ emailAddress: mePayload.email || "" }]
    }
    : null;
  state.sessionId = mePayload?.session_id || null;
}

async function loadUserFromToken(token) {
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error("Session expired");
  }
  return response.json();
}

async function initializeAuth() {
  if (state.loaded) return;
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) {
    state.loaded = true;
    return;
  }
  try {
    const mePayload = await loadUserFromToken(token);
    applySession(token, mePayload);
  } catch {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    applySession(null, null);
  } finally {
    state.loaded = true;
  }
}

async function loginWithPassword(email, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to sign in");
  }
  const token = payload?.token;
  const mePayload = await loadUserFromToken(token);
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  applySession(token, mePayload);
  return mePayload;
}

async function registerUser(input) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Unable to register account");
  }
  return payload;
}

function useAuth() {
  return {
    getToken: async () => state.token,
    isLoaded: computed(() => state.loaded),
    isSignedIn: computed(() => Boolean(state.token && state.user)),
    sessionId: computed(() => state.sessionId),
    signOut: async () => {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      applySession(null, null);
      window.location.hash = "";
    }
  };
}

function useUser() {
  return {
    user: computed(() => state.user)
  };
}

export { initializeAuth, loginWithPassword, registerUser, useAuth, useUser };

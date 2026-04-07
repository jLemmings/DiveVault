import {
  SignIn as ClerkSignIn,
  Waitlist as ClerkWaitlist,
  clerkPlugin,
  useAuth as useClerkAuth,
  useSignIn as useClerkSignIn,
  useUser as useClerkUser
} from "@clerk/vue";
import { computed, reactive } from "vue";

const TEST_AUTH_KEY = "__DIVEVAULT_TEST_STATE__";

function defaultTestUser() {
  return {
    firstName: "Test",
    lastName: "Diver",
    primaryEmailAddress: {
      emailAddress: "diver@example.com"
    },
    emailAddresses: [
      {
        emailAddress: "diver@example.com"
      }
    ]
  };
}

function normalizeTestUser(user) {
  const base = defaultTestUser();
  const normalized = {
    ...base,
    ...(user || {})
  };
  const primaryEmail = normalized?.primaryEmailAddress?.emailAddress
    || normalized?.emailAddresses?.[0]?.emailAddress
    || base.primaryEmailAddress.emailAddress;

  normalized.primaryEmailAddress = {
    emailAddress: primaryEmail
  };
  normalized.emailAddresses = Array.isArray(normalized.emailAddresses) && normalized.emailAddresses.length
    ? normalized.emailAddresses.map((entry) => ({
      emailAddress: entry?.emailAddress || primaryEmail
    }))
    : [{ emailAddress: primaryEmail }];

  return normalized;
}

function rawTestAuthState() {
  if (typeof window === "undefined") return null;
  const state = window[TEST_AUTH_KEY];
  return state && typeof state === "object" ? state : null;
}

function hasTestAuthState() {
  return Boolean(rawTestAuthState());
}

function ensureTestAuthState() {
  const providedState = rawTestAuthState();
  if (!providedState) return null;

  if (!providedState.__authState) {
    const signedIn = providedState.signedIn !== false;
    providedState.__authState = reactive({
      signedIn,
      sessionId: providedState.sessionId || (signedIn ? "playwright-session" : null),
      token: providedState.token || "playwright-token",
      user: normalizeTestUser(providedState.user),
      waitlistJoined: false,
      recoveryEmail: ""
    });
  }

  return providedState.__authState;
}

function installAuthPlugin(app, options) {
  if (hasTestAuthState()) {
    return app;
  }
  return app.use(clerkPlugin, options);
}

async function signOutTestUser(redirectUrl = "/") {
  const state = ensureTestAuthState();
  if (!state) return;
  state.signedIn = false;
  state.sessionId = null;
  if (typeof window !== "undefined") {
    window.location.hash = "";
    if (redirectUrl && window.location.pathname !== redirectUrl) {
      window.history.replaceState(null, "", redirectUrl);
    }
  }
}

function useAuth() {
  const state = ensureTestAuthState();
  if (!state) {
    return useClerkAuth();
  }

  return {
    getToken: async () => state.token,
    isLoaded: computed(() => true),
    isSignedIn: computed(() => state.signedIn),
    sessionId: computed(() => state.sessionId),
    signOut: async (options = {}) => signOutTestUser(options.redirectUrl)
  };
}

function useUser() {
  const state = ensureTestAuthState();
  if (!state) {
    return useClerkUser();
  }

  return {
    user: computed(() => (state.signedIn ? state.user : null))
  };
}

function testSignInApi(state) {
  return {
    async create(options = {}) {
      state.recoveryEmail = options.identifier || state.user.primaryEmailAddress.emailAddress;
      return { status: "needs_first_factor" };
    },
    async attemptFirstFactor() {
      state.signedIn = true;
      state.sessionId = state.sessionId || "playwright-session";
      return {
        status: "complete",
        createdSessionId: state.sessionId
      };
    },
    async resetPassword() {
      state.signedIn = true;
      state.sessionId = state.sessionId || "playwright-session";
      return {
        status: "complete",
        createdSessionId: state.sessionId
      };
    }
  };
}

function useSignIn() {
  const state = ensureTestAuthState();
  if (!state) {
    return useClerkSignIn();
  }

  return {
    isLoaded: computed(() => true),
    signIn: testSignInApi(state),
    setActive: async ({ session } = {}) => {
      state.signedIn = true;
      state.sessionId = session || state.sessionId || "playwright-session";
      return { sessionId: state.sessionId };
    }
  };
}

const TestSignIn = {
  name: "TestSignInStub",
  methods: {
    async signIn() {
      const state = ensureTestAuthState();
      if (!state) return;
      state.signedIn = true;
      state.sessionId = state.sessionId || "playwright-session";
      window.location.hash = "";
    }
  },
  template: `
    <div class="space-y-4 rounded-[1.1rem] border border-primary/10 bg-surface-container-high/35 p-5 text-left shadow-panel">
      <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Clerk Test Mode</p>
      <p class="text-sm leading-6 text-on-surface-variant">Browser tests run against a local auth stub instead of the hosted Clerk widget.</p>
      <button
        type="button"
        @click="signIn"
        class="w-full rounded-[1.1rem] bg-[linear-gradient(135deg,#71c8ff_0%,#5faeff_45%,#5997ef_100%)] px-4 py-4 font-label text-[0.95rem] font-black tracking-[0.08em] text-[#031726] shadow-[0_14px_28px_rgba(43,116,181,0.22)]"
      >
        Sign In Test Diver
      </button>
    </div>
  `
};

const TestWaitlist = {
  name: "TestWaitlistStub",
  data() {
    return {
      waitlistJoined: false
    };
  },
  methods: {
    joinWaitlist() {
      const state = ensureTestAuthState();
      if (!state) return;
      state.waitlistJoined = true;
      this.waitlistJoined = true;
    }
  },
  template: `
    <div class="space-y-4 rounded-[1.1rem] border border-primary/10 bg-surface-container-high/35 p-5 text-left shadow-panel">
      <p class="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Waitlist Test Mode</p>
      <p class="text-sm leading-6 text-on-surface-variant">The production waitlist is replaced with a local stub while Playwright is running.</p>
      <button
        type="button"
        @click="joinWaitlist"
        class="w-full rounded-[1.1rem] border border-primary/15 px-4 py-4 font-label text-[0.95rem] font-black tracking-[0.08em] text-primary"
      >
        Join Local Waitlist
      </button>
      <p v-if="waitlistJoined" class="text-sm text-primary">
        Waitlist request recorded locally.
      </p>
    </div>
  `
};

const SignIn = hasTestAuthState() ? TestSignIn : ClerkSignIn;
const Waitlist = hasTestAuthState() ? TestWaitlist : ClerkWaitlist;

export {
  SignIn,
  Waitlist,
  hasTestAuthState,
  installAuthPlugin,
  useAuth,
  useSignIn,
  useUser
};

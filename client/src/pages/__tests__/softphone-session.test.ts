import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  SoftphoneRequestError,
  cacheVerifiedSoftphoneUser,
  clearLegacySoftphoneCache,
  isMatchingVoipSession,
  requestSoftphoneLogin,
  requestTemporaryPasswordChange,
  requestVoipSession,
  scopedSoftphoneKey,
  softphoneApiUrl,
  softphoneScope,
  type VoipSession,
} from "../../lib/softphone-session";

const session: VoipSession = {
  product: "chiamo",
  callingAllowed: true,
  user: {
    id: "user-1",
    username: "agent",
    name: "Agent One",
    role: "agent",
    tenantId: "tenant-1",
    voipAccess: true,
    product: "chiamo",
    restrictedServices: [],
  },
};

test("softphone login sends the agency product contract with credentials", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  globalThis.fetch = async (input, init) => {
    request = { input, init };
    return new Response(JSON.stringify({ token: "token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await requestSoftphoneLogin("agent", "secret", "chiamo");
    assert.equal(request?.input, softphoneApiUrl("/api/agency/login"));
    assert.equal(request?.init?.credentials, "include");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      username: "agent",
      password: "secret",
      product: "chiamo",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session validation uses bearer auth and rejects non-JSON authentication errors", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") || "";
    return new Response("<html>expired</html>", { status: 401, statusText: "Unauthorized" });
  };
  try {
    await assert.rejects(
      requestVoipSession("expired"),
      (error: unknown) => error instanceof SoftphoneRequestError &&
        error.status === 401 &&
        error.message === "Session validation was rejected by the server.",
    );
    assert.equal(authorization, "Bearer expired");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login distinguishes invalid credentials, missing routes, gateways, and malformed success", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const cases = [
      {
        response: () => new Response(JSON.stringify({ message: "Invalid username or password" }), {
          status: 401, headers: { "content-type": "application/json" },
        }),
        status: 401,
        message: "Invalid username or password",
      },
      {
        response: () => new Response("<html>unauthorized</html>", { status: 401 }),
        status: 401,
        message: "Sign-in was rejected, but the server did not return a valid JSON error.",
      },
      {
        response: () => new Response("<html>missing</html>", { status: 404 }),
        status: 404,
        message: "Sign-in endpoint was not found. Check the configured API URL.",
      },
      {
        response: () => new Response("Bad gateway", { status: 502 }),
        status: 502,
        message: "Sign-in service is temporarily unavailable. Please try again.",
      },
      {
        response: () => new Response("<html>wrong origin</html>", { status: 200 }),
        status: 200,
        message: "Sign-in returned an invalid response without a session token.",
      },
      {
        response: () => new Response("{broken", {
          status: 200, headers: { "content-type": "application/json" },
        }),
        status: 200,
        message: "Sign-in returned an invalid response without a session token.",
      },
      {
        response: () => new Response(JSON.stringify({ user: {} }), {
          status: 200, headers: { "content-type": "application/json" },
        }),
        status: 200,
        message: "Sign-in returned an invalid response without a session token.",
      },
    ];
    for (const entry of cases) {
      globalThis.fetch = async () => entry.response();
      await assert.rejects(requestSoftphoneLogin("agent", "secret", "chiamo"), (error: unknown) =>
        error instanceof SoftphoneRequestError &&
        error.status === entry.status &&
        error.message === entry.message);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login reports network failures separately and accepts a restricted temporary token", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(requestSoftphoneLogin("agent", "secret", "chiamo"), (error: unknown) =>
      error instanceof SoftphoneRequestError &&
      error.status === 0 &&
      error.message === "Network error during sign-in. Check your connection and try again.");

    globalThis.fetch = async () => new Response(JSON.stringify({
      token: "restricted-token",
      requiresPasswordChange: true,
    }), { status: 200, headers: { "content-type": "application/json" } });
    const result = await requestSoftphoneLogin("agent", "temporary", "chiamo");
    assert.equal(result.token, "restricted-token");
    assert.equal(result.requiresPasswordChange, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session and password-change helpers reject malformed successful responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ callingAllowed: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
    await assert.rejects(requestVoipSession("token"), /Session validation returned an invalid response/);

    globalThis.fetch = async () => new Response("ok", { status: 200 });
    await assert.rejects(
      requestTemporaryPasswordChange("restricted", "old", "new"),
      /Password change returned an invalid response/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("temporary password change uses the configured helper contract without persisting the restricted token", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  try {
    globalThis.fetch = async (input, init) => {
      request = { input, init };
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { "content-type": "application/problem+json" },
      });
    };
    await requestTemporaryPasswordChange("restricted", "temporary", "Replacement1!");
    assert.equal(request?.input, softphoneApiUrl("/api/chiamo/change-password"));
    assert.equal(request?.init?.credentials, "include");
    assert.equal(new Headers(request?.init?.headers).get("authorization"), "Bearer restricted");
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      currentPassword: "temporary",
      newPassword: "Replacement1!",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product, restrictions, and scoped cache prevent cross-account restore", () => {
  assert.equal(isMatchingVoipSession(session, "chiamo"), true);
  assert.equal(isMatchingVoipSession({ ...session, product: "chain" }, "chiamo"), false);
  assert.equal(isMatchingVoipSession({ ...session, user: { ...session.user, product: "chain" } }, "chiamo"), false);
  assert.equal({ ...session, callingAllowed: false }.callingAllowed, false);

  const values = new Map<string, string>([
    ["softphone_token", "legacy"],
    ["softphone_user", "{}"],
  ]);
  const storage = {
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  clearLegacySoftphoneCache(storage);
  cacheVerifiedSoftphoneUser(storage, session);
  assert.equal(values.has("softphone_token"), false);
  assert.equal(values.has("softphone_user"), false);
  const scope = softphoneScope("chiamo", session.user);
  assert.equal(scope, "chiamo:tenant-1:user-1");
  assert.equal(values.has(scopedSoftphoneKey(scope, "user")), true);
});

test("browser source keeps temporary recovery and provider registration failures explicit", async () => {
  const [softphoneSource, appSource, loginSource] = await Promise.all([
    readFile(new URL("../softphone.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../chiamo/chiamo-login.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /path="\/softphone"[^]*ChiamoLogin returnTo="\/softphone"/);
  assert.match(loginSource, /returnTo === "\/softphone"/);
  assert.match(loginSource, /Global Admin can generate a temporary password/);
  assert.match(loginSource, /requestTemporaryPasswordChange/);
  assert.match(loginSource, /requestVoipSession\(result\.token\)/);
  assert.match(softphoneSource, /device\.register\(\)\.catch/);
  assert.match(softphoneSource, /requestVoipSession\(token\)/);
  assert.match(softphoneSource, /isChiamoConnectPhoneShell/);
  assert.match(softphoneSource, /const product = detectBrand\(\)/);
  assert.doesNotMatch(softphoneSource, /chain-admin-production\.up\.railway\.app/);
});
import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { authenticateUser } from "./authMiddleware";
import { storage } from "./storage";
import { db } from "./db";

type Result = { status?: number; body?: any; next: boolean };

async function authenticate(path: string, claims: Record<string, unknown>, credential: Record<string, unknown>, mountedPath = path, serviceState: Record<string, unknown> = {}): Promise<Result> {
  const secret = "restricted-session-test-secret";
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  const originalTenant = storage.getTenant;
  const originalCredential = storage.getAgencyCredentialsById;
  const originalSelect = db.select;
  (storage as any).getTenant = async () => ({
    id: "tenant",
    isActive: true,
    chiamoConnectEnabled: true,
    chainCoreEnabled: false,
  });
  (storage as any).getAgencyCredentialsById = async () => credential;
  (db as any).select = () => {
    const query: any = {
      from: () => query,
      where: () => query,
      limit: () => query,
      then: (resolve: any) => resolve([{ accountActive: true, explicitLoginDisabled: false, ...serviceState }]),
    };
    return query;
  };
  const result: Result = { next: false };
  const req: any = {
    path: mountedPath,
    originalUrl: path,
    headers: { authorization: `Bearer ${jwt.sign(claims, secret, { expiresIn: "5m" })}` },
    isAuthenticated: () => false,
  };
  const res: any = {
    status(code: number) { result.status = code; return this; },
    json(body: any) { result.body = body; return this; },
  };
  try {
    await authenticateUser(req, res, () => { result.next = true; });
  } finally {
    (storage as any).getTenant = originalTenant;
    (storage as any).getAgencyCredentialsById = originalCredential;
    (db as any).select = originalSelect;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
  return result;
}

const baseClaims = {
  userId: "credential",
  tenantId: "tenant",
  product: "chiamo",
  credentialVersion: 4,
};
const baseCredential = {
  id: "credential",
  tenantId: "tenant",
  isActive: true,
  role: "owner",
  credentialVersion: 4,
  mustChangePassword: true,
  temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
};

test("restricted session can only reach user info and password change", async () => {
  assert.equal((await authenticate("/api/auth/user", { ...baseClaims, passwordChangeOnly: true }, baseCredential)).next, true);
  assert.equal((await authenticate("/api/chiamo/change-password", { ...baseClaims, passwordChangeOnly: true }, baseCredential)).next, true);
  const blocked = await authenticate("/api/chiamo/dashboard", { ...baseClaims, passwordChangeOnly: true }, baseCredential);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");
});

test("expired, wrong-version, and unrestricted temporary sessions are rejected", async () => {
  const expired = await authenticate("/api/chiamo/change-password", {
    ...baseClaims,
    passwordChangeOnly: true,
  }, { ...baseCredential, temporaryPasswordExpiresAt: new Date(Date.now() - 1) });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.code, "TEMPORARY_PASSWORD_EXPIRED");

  const wrongVersion = await authenticate("/api/chiamo/change-password", {
    ...baseClaims,
    credentialVersion: 3,
    passwordChangeOnly: true,
  }, baseCredential);
  assert.equal(wrongVersion.status, 401);

  const unrestricted = await authenticate("/api/chiamo/change-password", baseClaims, baseCredential);
  assert.equal(unrestricted.status, 401);
});

test("credential version increment invalidates an already-issued normal token", async () => {
  const oldToken = { ...baseClaims, passwordChangeOnly: undefined };
  const result = await authenticate("/api/chiamo/dashboard", oldToken, {
    ...baseCredential,
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    credentialVersion: 5,
  });
  assert.equal(result.status, 401);
  assert.equal(result.next, false);
});

test("originalUrl preserves Chiamo product classification through mounted routers", async () => {
  const normalCredential = {
    ...baseCredential,
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
  };
  assert.equal((await authenticate("/api/voip/status", baseClaims, normalCredential, "/status")).next, true);
  assert.equal((await authenticate("/api/voip/token", baseClaims, normalCredential, "/token")).next, true);
  const restricted = await authenticate(
    "/api/voip/token",
    { ...baseClaims, passwordChangeOnly: true },
    baseCredential,
    "/token",
  );
  assert.equal(restricted.status, 403);
});

test("migrated deliberate and ambiguous login disables block existing sessions while provider-only failure does not", async () => {
  const credential = { ...baseCredential, mustChangePassword: false, temporaryPasswordExpiresAt: null };
  for (const postmarkStatus of ["READY", "FAILED"]) {
    const blocked = await authenticate("/api/voip/token", baseClaims, credential, "/token", {
      customerLoginEnabled: false, explicitLoginDisabled: true, postmarkStatus,
    });
    assert.equal(blocked.next, false);
    assert.equal(blocked.status, 401);
  }
  const providerOnly = await authenticate("/api/voip/token", baseClaims, credential, "/token", {
    customerLoginEnabled: true, explicitLoginDisabled: false, postmarkStatus: "FAILED",
  });
  assert.equal(providerOnly.next, true);
});
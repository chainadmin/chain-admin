import assert from "node:assert/strict";
import test from "node:test";
import { registerSoftphoneSessionRoutes } from "./softphoneSessionRoutes";

const member = {
  id: "member", tenantId: "company", username: "phone-user",
  firstName: null, lastName: null, email: null, role: "agent",
  isActive: true, voipAccess: true, product: "chiamo", credentialVersion: 3,
  mustChangePassword: false, passwordHash: "never-return-this", restrictedServices: ["billing"],
};

async function session(overrides: Record<string, unknown> = {}, actorOverrides: Record<string, unknown> = {}) {
  let handler: any;
  let authorization: any;
  const authenticate: any = (_req: any, _res: any, next: any) => next();
  registerSoftphoneSessionRoutes({
    get(path: string, middleware: any, route: any) {
      assert.equal(path, "/api/voip/session");
      authorization = middleware;
      handler = route;
    },
  } as any, {
    authenticate,
    getCredential: async () => ({ ...member, ...overrides }) as any,
  });
  assert.equal(authorization, authenticate);
  const output: any = { status: 200, headers: {} };
  const res: any = {
    setHeader: (name: string, value: string) => { output.headers[name] = value; },
    status: (status: number) => { output.status = status; return res; },
    json: (body: unknown) => { output.body = body; return res; },
  };
  await handler({ user: { ...member, ...actorOverrides } }, res);
  return output;
}

test("session exposes only current safe fields for a no-email phone user", async () => {
  const result = await session();
  assert.equal(result.status, 200);
  assert.equal(result.body.product, "chiamo");
  assert.equal(result.body.callingAllowed, true);
  assert.equal(result.body.user.name, "phone-user");
  assert.equal(result.body.user.tenantId, "company");
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal("passwordHash" in result.body.user, false);
  assert.equal("credentialVersion" in result.body.user, false);
});

test("owner and manager permission agrees with the Voice token route", async () => {
  for (const role of ["owner", "manager"]) {
    const result = await session({ role, voipAccess: false });
    assert.equal(result.body.callingAllowed, true);
    assert.equal(result.body.user.voipAccess, false);
  }
});

test("current disabled calling access cannot be overridden by a stale cached user", async () => {
  const result = await session({ voipAccess: false }, { voipAccess: true, role: "owner" });
  assert.equal(result.status, 200);
  assert.equal(result.body.callingAllowed, false);
  assert.equal(result.body.user.role, "agent");
});

test("cross-tenant, disabled, and revoked credential sessions fail closed", async () => {
  assert.equal((await session({ tenantId: "other-company" })).status, 401);
  assert.equal((await session({ isActive: false })).status, 401);
  assert.equal((await session({ credentialVersion: 4 })).status, 401);
  assert.equal((await session({}, { product: "unknown" })).status, 401);
});

test("temporary password and change-only sessions cannot open the phone", async () => {
  for (const result of [
    await session({ mustChangePassword: true }),
    await session({}, { passwordChangeOnly: true }),
  ]) {
    assert.equal(result.status, 403);
    assert.equal(result.body.code, "PASSWORD_CHANGE_REQUIRED");
    assert.equal(result.body.user, undefined);
  }
});
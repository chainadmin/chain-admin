import test, { mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.POSTMARK_ACCOUNT_TOKEN ??= "test-token";
process.env.POSTMARK_SERVER_TOKEN ??= "server-token";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key";
process.env.JWT_SECRET ??= "test-secret";

const [{ DatabaseStorage, storage }, { db }, { registerRoutes }] = await Promise.all([
  import("../../storage"),
  import("../../db"),
  import("../../routes"),
]);

type ArrangementOptionRecord = {
  id: string;
  tenantId: string;
  name: string;
  updatedAt?: Date;
  [key: string]: unknown;
};

type WhereParams = {
  id?: string;
  tenantId?: string;
};

type FakeDbState = {
  data: ArrangementOptionRecord[];
  lastSet?: Record<string, unknown>;
  lastUpdateParams?: WhereParams;
  lastDeleteParams?: WhereParams;
};

function extractWhereParams(condition: unknown): WhereParams {
  const params: WhereParams = {};
  const visited = new Set<object>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object" || visited.has(node)) {
      return;
    }

    visited.add(node);

    if (
      node.constructor?.name === "Param" &&
      typeof (node as any).encoder?.name === "string"
    ) {
      const columnName = (node as any).encoder.name as string;
      const value = (node as any).value as string | undefined;

      if (columnName === "id") {
        params.id = value;
        return;
      }

      if (columnName === "tenant_id") {
        params.tenantId = value;
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "encoder" || key === "table" || key === "columns") {
        continue;
      }

      visit((node as any)[key]);
    }
  };

  visit(condition);
  return params;
}

function createFakeArrangementDb(initialData: ArrangementOptionRecord[]): {
  update: typeof db.update;
  delete: typeof db.delete;
  state: FakeDbState;
} {
  const state: FakeDbState = {
    data: initialData.map((option) => ({ ...option })),
  };

  const update = (() => ({
    set: (updates: Record<string, unknown>) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          state.lastSet = { ...updates };
          const params = extractWhereParams(condition);
          state.lastUpdateParams = params;

          const matchIndex = state.data.findIndex(
            (option) => option.id === params.id && option.tenantId === params.tenantId,
          );

          if (matchIndex === -1) {
            return [];
          }

          const updatedOption: ArrangementOptionRecord = {
            ...state.data[matchIndex],
            ...updates,
            tenantId: state.data[matchIndex].tenantId,
          };

          state.data[matchIndex] = updatedOption;
          return [updatedOption];
        },
      }),
    }),
  })) as typeof db.update;

  const remove = (() => ({
    where: (condition: unknown) => ({
      returning: async () => {
        const params = extractWhereParams(condition);
        state.lastDeleteParams = params;

        const matchIndex = state.data.findIndex(
          (option) => option.id === params.id && option.tenantId === params.tenantId,
        );

        if (matchIndex === -1) {
          return [];
        }

        const [removed] = state.data.splice(matchIndex, 1);
        return [removed];
      },
    }),
  })) as typeof db.delete;

  return { update, delete: remove, state };
}

const baseArrangementPayload = {
  name: "Updated Range Plan",
  description: "Updated description",
  minBalance: 10000,
  maxBalance: 20000,
  monthlyPaymentMin: 1000,
  monthlyPaymentMax: 2000,
  planType: "range",
} as const;

const arrangementOptionId = "11111111-1111-1111-1111-111111111111";
const deleteArrangementOptionId = "22222222-2222-2222-2222-222222222222";
const tenantIdForTests = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function createArrangementRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    ...baseArrangementPayload,
    ...overrides,
  };
}

async function startArrangementServer({
  updateHandler,
  deleteHandler,
}: {
  updateHandler?: (id: string, tenant: string, payload: any) => Promise<any>;
  deleteHandler?: (id: string, tenant: string) => Promise<boolean>;
}) {
  const updateMock = mock.method(storage, "updateArrangementOption", async (id: string, tenant: string, payload: any) => {
    if (!updateHandler) {
      throw new Error("updateArrangementOption called unexpectedly");
    }
    return updateHandler(id, tenant, payload);
  });

  const deleteMock = mock.method(storage, "deleteArrangementOption", async (id: string, tenant: string) => {
    if (!deleteHandler) {
      throw new Error("deleteArrangementOption called unexpectedly");
    }
    return deleteHandler(id, tenant);
  });

  const app = express();
  const server = await registerRoutes(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to obtain server address");
  }

  return { server, port: (address as AddressInfo).port, updateMock, deleteMock };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createAuthHeader(tenantId: string = tenantIdForTests) {
  const token = jwt.sign(
    {
      userId: "user-1",
      tenantId,
      tenantSlug: "tenant-slug",
    },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" },
  );

  return `Bearer ${token}`;
}

test("updateArrangementOption updates matching tenant and ignores tenantId", async () => {
  const initial = [
    {
      id: "option-1",
      tenantId: "tenant-1",
      name: "Option 1",
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    },
  ];
  const { update, delete: remove, state } = createFakeArrangementDb(initial);
  mock.method(db, "update", update);
  mock.method(db, "delete", remove);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.updateArrangementOption("option-1", "tenant-1", {
      name: "Updated Option",
      tenantId: "tenant-2",
    });

    assert.ok(result);
    assert.strictEqual(result.name, "Updated Option");
    assert.strictEqual(result.tenantId, "tenant-1");
    assert.ok(state.lastSet);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(state.lastSet, "tenantId"), false);
    assert.ok(state.lastSet?.updatedAt instanceof Date);
    assert.deepStrictEqual(state.lastUpdateParams, { id: "option-1", tenantId: "tenant-1" });
  } finally {
    mock.restoreAll();
  }
});

test("updateArrangementOption returns undefined for mismatched tenant", async () => {
  const initial = [
    { id: "option-1", tenantId: "tenant-1", name: "Option 1" },
    { id: "option-2", tenantId: "tenant-2", name: "Option 2" },
  ];
  const { update, delete: remove, state } = createFakeArrangementDb(initial);
  mock.method(db, "update", update);
  mock.method(db, "delete", remove);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.updateArrangementOption("option-1", "tenant-2", {
      name: "Should Not Update",
    });

    assert.strictEqual(result, undefined);
    assert.strictEqual(state.data.find((option) => option.id === "option-1")?.name, "Option 1");
  } finally {
    mock.restoreAll();
  }
});

test("deleteArrangementOption removes records for matching tenant", async () => {
  const initial = [
    { id: "option-1", tenantId: "tenant-1", name: "Option 1" },
    { id: "option-2", tenantId: "tenant-2", name: "Option 2" },
  ];
  const { update, delete: remove, state } = createFakeArrangementDb(initial);
  mock.method(db, "update", update);
  mock.method(db, "delete", remove);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.deleteArrangementOption("option-2", "tenant-2");

    assert.strictEqual(result, true);
    assert.strictEqual(state.data.some((option) => option.id === "option-2"), false);
    assert.deepStrictEqual(state.lastDeleteParams, { id: "option-2", tenantId: "tenant-2" });
  } finally {
    mock.restoreAll();
  }
});

test("deleteArrangementOption returns false when tenant does not match", async () => {
  const initial = [
    { id: "option-1", tenantId: "tenant-1", name: "Option 1" },
    { id: "option-2", tenantId: "tenant-2", name: "Option 2" },
  ];
  const { update, delete: remove, state } = createFakeArrangementDb(initial);
  mock.method(db, "update", update);
  mock.method(db, "delete", remove);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.deleteArrangementOption("option-1", "tenant-2");

    assert.strictEqual(result, false);
    assert.strictEqual(state.data.length, 2);
    assert.strictEqual(state.data.find((option) => option.id === "option-1")?.tenantId, "tenant-1");
  } finally {
    mock.restoreAll();
  }
});

test("PUT /api/arrangement-options/:id succeeds for the authenticated tenant", async () => {
  let server: Server | undefined;

  try {
    const started = await startArrangementServer({
      updateHandler: async (_id, tenant, payload) => {
        return { ...payload, id: arrangementOptionId, tenantId: tenant, updatedAt: new Date(), createdAt: new Date() };
      },
      deleteHandler: async () => {
        throw new Error("deleteArrangementOption should not be called");
      },
    });

    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/api/arrangement-options/${arrangementOptionId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        Authorization: createAuthHeader(),
      },
      body: JSON.stringify(createArrangementRequestBody({ tenantId: "tenant-evil" })),
    });

    const responseText = await response.text();
    assert.strictEqual(response.status, 200);
    const body = JSON.parse(responseText);
    assert.strictEqual(body.id, arrangementOptionId);
    assert.strictEqual(body.tenantId, tenantIdForTests);
    assert.strictEqual(body.name, baseArrangementPayload.name);

    assert.strictEqual(started.updateMock.mock.callCount(), 1);
    const callInfo = started.updateMock.mock.calls[0];
    assert.ok(callInfo);
    assert.strictEqual(callInfo.arguments[0], arrangementOptionId);
    assert.strictEqual(callInfo.arguments[1], tenantIdForTests);
    assert.strictEqual(callInfo.arguments[2]?.tenantId, tenantIdForTests);
  } finally {
    if (server) {
      await closeServer(server);
    }
    mock.restoreAll();
  }
});

test("PUT /api/arrangement-options/:id returns 404 when storage finds no tenant match", async () => {
  let server: Server | undefined;

  try {
    const started = await startArrangementServer({
      updateHandler: async () => {
        return undefined;
      },
      deleteHandler: async () => {
        throw new Error("deleteArrangementOption should not be called");
      },
    });

    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/api/arrangement-options/${arrangementOptionId}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        Authorization: createAuthHeader(),
      },
      body: JSON.stringify(createArrangementRequestBody()),
    });

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.strictEqual(body.message, "Arrangement option not found");
    assert.strictEqual(started.updateMock.mock.callCount(), 1);
    const callInfo = started.updateMock.mock.calls[0];
    assert.ok(callInfo);
    assert.strictEqual(callInfo.arguments[0], arrangementOptionId);
    assert.strictEqual(callInfo.arguments[1], tenantIdForTests);
  } finally {
    if (server) {
      await closeServer(server);
    }
    mock.restoreAll();
  }
});

test("DELETE /api/arrangement-options/:id removes data for the authenticated tenant", async () => {
  let server: Server | undefined;

  try {
    const started = await startArrangementServer({
      updateHandler: async () => {
        throw new Error("updateArrangementOption should not be called");
      },
      deleteHandler: async () => {
        return true;
      },
    });

    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/api/arrangement-options/${deleteArrangementOptionId}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(),
      },
    });

    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.message, "Arrangement option deleted successfully");
    assert.strictEqual(started.deleteMock.mock.callCount(), 1);
    const callInfo = started.deleteMock.mock.calls[0];
    assert.ok(callInfo);
    assert.strictEqual(callInfo.arguments[0], deleteArrangementOptionId);
    assert.strictEqual(callInfo.arguments[1], tenantIdForTests);
  } finally {
    if (server) {
      await closeServer(server);
    }
    mock.restoreAll();
  }
});

test("DELETE /api/arrangement-options/:id returns 404 when tenant does not match", async () => {
  let server: Server | undefined;

  try {
    const started = await startArrangementServer({
      updateHandler: async () => {
        throw new Error("updateArrangementOption should not be called");
      },
      deleteHandler: async () => {
        return false;
      },
    });

    server = started.server;

    const response = await fetch(`http://127.0.0.1:${started.port}/api/arrangement-options/${deleteArrangementOptionId}`, {
      method: "DELETE",
      headers: {
        Authorization: createAuthHeader(),
      },
    });

    assert.strictEqual(response.status, 404);
    const body = await response.json();
    assert.strictEqual(body.message, "Arrangement option not found");
    assert.strictEqual(started.deleteMock.mock.callCount(), 1);
    const callInfo = started.deleteMock.mock.calls[0];
    assert.ok(callInfo);
    assert.strictEqual(callInfo.arguments[0], deleteArrangementOptionId);
    assert.strictEqual(callInfo.arguments[1], tenantIdForTests);
  } finally {
    if (server) {
      await closeServer(server);
    }
    mock.restoreAll();
  }
});

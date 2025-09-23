import test, { mock } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const [{ DatabaseStorage }, { db }] = await Promise.all([
  import("../../storage"),
  import("../../db"),
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
  lastSelectParams?: WhereParams;
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
  select: typeof db.select;
  update: typeof db.update;
  delete: typeof db.delete;
  state: FakeDbState;
} {
  const state: FakeDbState = {
    data: initialData.map((option) => ({ ...option })),
  };

  const select = (() => ({
    from: (..._args: any[]) => ({
      where: async (condition: unknown) => {
        const params = extractWhereParams(condition);
        state.lastSelectParams = params;

        const match = state.data.find(
          (option) => option.id === params.id && option.tenantId === params.tenantId,
        );

        return match ? [match] : [];
      },
    }),
  })) as typeof db.select;

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

  return { select, update, delete: remove, state };
}

test("getArrangementOptionById returns matching option for tenant", async () => {
  const initial = [
    { id: "option-1", tenantId: "tenant-1", name: "Option 1" },
    { id: "option-2", tenantId: "tenant-2", name: "Option 2" },
  ];
  const { select, state } = createFakeArrangementDb(initial);
  mock.method(db, "select", select);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.getArrangementOptionById("option-1", "tenant-1");

    assert.ok(result);
    assert.strictEqual(result.id, "option-1");
    assert.strictEqual(result.tenantId, "tenant-1");
    assert.deepStrictEqual(state.lastSelectParams, { id: "option-1", tenantId: "tenant-1" });
  } finally {
    mock.restoreAll();
  }
});

test("getArrangementOptionById returns undefined when tenant does not match", async () => {
  const initial = [
    { id: "option-1", tenantId: "tenant-1", name: "Option 1" },
    { id: "option-2", tenantId: "tenant-2", name: "Option 2" },
  ];
  const { select } = createFakeArrangementDb(initial);
  mock.method(db, "select", select);

  const storage = new DatabaseStorage();

  try {
    const result = await storage.getArrangementOptionById("option-1", "tenant-2");

    assert.strictEqual(result, undefined);
  } finally {
    mock.restoreAll();
  }
});

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

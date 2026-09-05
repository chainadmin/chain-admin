import { sql } from "drizzle-orm";

type RemovalQueryExecutor = {
  execute: (query: unknown) => Promise<unknown>;
};

const firstRow = (result: unknown): Record<string, unknown> =>
  ((result as { rows?: Record<string, unknown>[] } | null)?.rows?.[0] ?? {});

export async function countOptionalPaymentApprovals(
  tx: RemovalQueryExecutor,
  tenantId: string,
): Promise<number> {
  const table = await tx.execute(
    sql`SELECT to_regclass('public.payment_approvals') AS relation`,
  );
  if (!firstRow(table).relation) return 0;

  const result = await tx.execute(
    sql`SELECT count(*)::int AS count FROM payment_approvals WHERE tenant_id=${tenantId}`,
  );
  return Number(firstRow(result).count || 0);
}
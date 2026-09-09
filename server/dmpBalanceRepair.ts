import crypto from 'crypto';

type BalanceRepairPlanStorage = {
  getAccountsByTenant(tenantId: string): Promise<any[]>;
};

type BalanceRepairApplyStorage = {
  applyDmpBalanceRepair(tenantId: string, changes: DmpBalanceRepairChange[]): Promise<number>;
};

export const DMP_BALANCE_REPAIR_CONFIRMATION = 'APPLY DMP BALANCE REPAIR';

export interface DmpBalanceRepairResult {
  matched: number;
  changed: number;
  unchanged: number;
  skipped: number;
  applied: number;
}

export interface DmpBalanceRepairChange {
  accountId: string;
  filenumber: string;
  expectedBalanceCents: number;
  expectedOriginalBalanceCents: number | null;
  balanceCents: number;
  originalBalanceCents: number | null;
}

export interface DmpBalanceRepairPlan extends DmpBalanceRepairResult {
  changes: DmpBalanceRepairChange[];
  digest: string;
}

function isDmpImportedAccount(account: any): boolean {
  const data = account?.additionalData;
  return Boolean(
    data
    && typeof data === 'object'
    && (
      data.dmpSource === 'dmp'
      || Object.prototype.hasOwnProperty.call(data, 'dmpClientName')
    )
  );
}

export function hashDmpBalanceRepairChanges(changes: DmpBalanceRepairChange[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(changes)).digest('hex');
}

export async function planDmpBalanceRepair(
  storage: BalanceRepairPlanStorage,
  tenantId: string,
  providerAccounts: any[],
): Promise<DmpBalanceRepairPlan> {
  const existingAccounts = await storage.getAccountsByTenant(tenantId);
  const accountGroups = new Map<string, any[]>();
  for (const account of existingAccounts) {
    if (!account.filenumber || !isDmpImportedAccount(account)) continue;
    const filenumber = String(account.filenumber).trim();
    accountGroups.set(filenumber, [...(accountGroups.get(filenumber) || []), account]);
  }
  const providerGroups = new Map<string, any[]>();
  for (const providerAccount of providerAccounts) {
    const filenumber = providerAccount?.filenumber == null ? '' : String(providerAccount.filenumber).trim();
    if (!filenumber) continue;
    providerGroups.set(filenumber, [...(providerGroups.get(filenumber) || []), providerAccount]);
  }
  const result: DmpBalanceRepairPlan = {
    matched: 0,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    applied: 0,
    changes: [],
    digest: '',
  };

  for (const [filenumber, providerMatches] of Array.from(providerGroups.entries())) {
    if (providerMatches.length !== 1) {
      result.skipped += providerMatches.length;
      continue;
    }
    const providerAccount = providerMatches[0];
    const existingMatches = accountGroups.get(filenumber) || [];
    if (!filenumber || existingMatches.length !== 1) {
      result.skipped++;
      continue;
    }
    const existing = existingMatches[0];
    result.matched++;
    const balanceCents = Number.isFinite(providerAccount.balance)
      ? Math.max(0, Math.round(providerAccount.balance))
      : existing.balanceCents;
    const originalBalanceCents = Number.isFinite(providerAccount.originalBalance)
      ? Math.max(0, Math.round(providerAccount.originalBalance))
      : existing.originalBalanceCents ?? balanceCents;
    if (
      existing.balanceCents === balanceCents
      && existing.originalBalanceCents === originalBalanceCents
    ) {
      result.unchanged++;
      continue;
    }
    result.changed++;
    result.changes.push({
      accountId: existing.id,
      filenumber,
      expectedBalanceCents: existing.balanceCents,
      expectedOriginalBalanceCents: existing.originalBalanceCents ?? null,
      balanceCents,
      originalBalanceCents,
    });
  }

  result.changes.sort((a, b) => a.filenumber.localeCompare(b.filenumber));
  result.digest = hashDmpBalanceRepairChanges(result.changes);
  return result;
}

export async function applyDmpBalanceRepair(
  storage: BalanceRepairApplyStorage,
  tenantId: string,
  plan: DmpBalanceRepairPlan,
): Promise<DmpBalanceRepairResult> {
  const applied = await storage.applyDmpBalanceRepair(tenantId, plan.changes);
  return {
    matched: plan.matched,
    changed: plan.changed,
    unchanged: plan.unchanged,
    skipped: plan.skipped,
    applied,
  };
}
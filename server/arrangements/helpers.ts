import type { ArrangementOption, ConsumerArrangement } from "@shared/schema";

type AccountWithArrangement = {
  id: string;
  tenantId?: string | null;
  balanceCents?: number | null;
  creditor?: string | null;
  accountNumber?: string | null;
  arrangement?: (ConsumerArrangement & { option?: ArrangementOption | null }) | null;
};

export const ACTIVE_ARRANGEMENT_STATUSES = new Set(["active", "pending", "paused"]);

export function ensureTenantAccountOwnership(accountTenantId: string, tenantId: string) {
  if (accountTenantId !== tenantId) {
    throw new Error("Account does not belong to tenant");
  }
}

export function buildConsumerArrangementVisibility(
  accounts: AccountWithArrangement[],
  options: ArrangementOption[],
) {
  const assignedAccount = accounts.find((account) => {
    const arrangement = account.arrangement;
    if (!arrangement) {
      return false;
    }

    const status = arrangement.status || "active";
    return ACTIVE_ARRANGEMENT_STATUSES.has(status);
  });

  const assigned = assignedAccount?.arrangement
    ? {
        ...assignedAccount.arrangement,
        account: {
          id: assignedAccount.id,
          creditor: assignedAccount.creditor ?? null,
          balanceCents: assignedAccount.balanceCents ?? null,
          accountNumber: assignedAccount.accountNumber ?? null,
        },
        option: assignedAccount.arrangement.option ?? null,
      }
    : null;

  const available = options.filter((option) => {
    if (!assignedAccount?.arrangement?.arrangementOptionId) {
      return true;
    }
    return option.id !== assignedAccount.arrangement.arrangementOptionId;
  });

  return { assigned, available };
}

export type { AccountWithArrangement };

import type { Account, Consumer } from "@shared/schema";

export type CampaignTargetGroup = "all" | "with-balance" | "decline" | "recent-upload";
export type CampaignTargetType = "all" | "folder" | "custom";

export type CampaignCustomFilters = {
  balanceMin?: string;
  balanceMax?: string;
  status?: string;
  lastContactDays?: string;
};

export interface CampaignTargetingInput {
  targetGroup: CampaignTargetGroup;
  targetType: CampaignTargetType;
  targetFolderIds: string[];
  customFilters: CampaignCustomFilters;
}

export interface CampaignConsumerLike
  extends Pick<Consumer, "id" | "folderId" | "additionalData" | "registrationDate" | "createdAt"> {}

export interface CampaignAccountLike
  extends Pick<Account, "consumerId" | "folderId" | "balanceCents" | "status"> {}

const allowedTargetGroups: readonly CampaignTargetGroup[] = [
  "all",
  "with-balance",
  "decline",
  "recent-upload",
];

const allowedTargetTypes: readonly CampaignTargetType[] = ["all", "folder", "custom"];

function parseCurrencyToCents(value?: string): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}

function parseInteger(value?: string): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesAdditionalStatus(additionalData: Consumer["additionalData"], status: string): boolean {
  if (!additionalData || typeof additionalData !== "object") {
    return false;
  }

  const data = additionalData as Record<string, unknown>;

  const statusValue = data.status;
  if (typeof statusValue === "string" && statusValue.toLowerCase() === status) {
    return true;
  }

  const folderValue = data.folder;
  if (typeof folderValue === "string" && folderValue.toLowerCase() === status) {
    return true;
  }

  return false;
}

function getLastContactDate(consumer: CampaignConsumerLike): Date | null {
  const potentialValues: Array<unknown> = [];

  if (consumer.additionalData && typeof consumer.additionalData === "object") {
    const additional = consumer.additionalData as Record<string, unknown>;
    potentialValues.push(additional.lastContactAt, additional.lastContactDate, additional.lastInteractionAt);
  }

  potentialValues.push(consumer.registrationDate, consumer.createdAt);

  for (const value of potentialValues) {
    if (!value) {
      continue;
    }

    const date = new Date(value as string | number | Date);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function sanitizeFolderIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const ids = new Set<string>();
  for (const value of raw) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }

  return Array.from(ids);
}

export function sanitizeCustomFilters(raw: unknown): CampaignCustomFilters {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const result: CampaignCustomFilters = {};
  const data = raw as Record<string, unknown>;

  const entries: Array<keyof CampaignCustomFilters> = [
    "balanceMin",
    "balanceMax",
    "status",
    "lastContactDays",
  ];

  for (const key of entries) {
    const value = data[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        result[key] = trimmed;
      }
    }
  }

  return result;
}

export function sanitizeTargetingInput(
  raw: Partial<CampaignTargetingInput> | undefined | null,
): CampaignTargetingInput {
  const targetGroup =
    raw?.targetGroup && allowedTargetGroups.includes(raw.targetGroup)
      ? raw.targetGroup
      : "all";

  const targetType =
    raw?.targetType && allowedTargetTypes.includes(raw.targetType)
      ? raw.targetType
      : "all";

  const targetFolderIds = sanitizeFolderIds(raw?.targetFolderIds);
  const customFilters = sanitizeCustomFilters(raw?.customFilters);

  return {
    targetGroup,
    targetType,
    targetFolderIds,
    customFilters,
  };
}

export function filterConsumersForCampaign<
  TConsumer extends CampaignConsumerLike,
  TAccount extends CampaignAccountLike,
>(
  consumers: TConsumer[],
  accounts: TAccount[],
  targeting: CampaignTargetingInput,
): TConsumer[] {
  const folderIdSet = new Set(targeting.targetFolderIds);
  const accountsByConsumer = new Map<string, TAccount[]>();

  for (const account of accounts) {
    if (!account.consumerId) {
      continue;
    }

    const existing = accountsByConsumer.get(account.consumerId);
    if (existing) {
      existing.push(account);
    } else {
      accountsByConsumer.set(account.consumerId, [account]);
    }
  }

  const balanceMinCents = parseCurrencyToCents(targeting.customFilters.balanceMin);
  const balanceMaxCents = parseCurrencyToCents(targeting.customFilters.balanceMax);
  const statusFilter = targeting.customFilters.status?.toLowerCase();
  const lastContactDays = parseInteger(targeting.customFilters.lastContactDays);

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 1);

  return consumers.filter((consumer) => {
    const consumerAccounts = accountsByConsumer.get(consumer.id) ?? [];

    if (targeting.targetType === "folder") {
      if (!folderIdSet.size) {
        return false;
      }

      const folderMatch =
        (consumer.folderId && folderIdSet.has(consumer.folderId)) ||
        consumerAccounts.some((account) => account.folderId && folderIdSet.has(account.folderId));

      return folderMatch;
    }

    if (targeting.targetType === "custom") {
      if (balanceMinCents !== null) {
        const totalBalance = consumerAccounts.reduce(
          (sum, account) => sum + (account.balanceCents ?? 0),
          0,
        );
        if (totalBalance < balanceMinCents) {
          return false;
        }
      }

      if (balanceMaxCents !== null) {
        const totalBalance = consumerAccounts.reduce(
          (sum, account) => sum + (account.balanceCents ?? 0),
          0,
        );
        if (totalBalance > balanceMaxCents) {
          return false;
        }
      }

      if (statusFilter) {
        const hasStatusMatch =
          consumerAccounts.some(
            (account) => (account.status ?? "").toLowerCase() === statusFilter,
          ) || matchesAdditionalStatus(consumer.additionalData, statusFilter);

        if (!hasStatusMatch) {
          return false;
        }
      }

      if (lastContactDays !== null) {
        const lastContact = getLastContactDate(consumer);
        if (!lastContact) {
          return false;
        }

        const diffDays = Math.floor(
          (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays < lastContactDays) {
          return false;
        }
      }

      return true;
    }

    switch (targeting.targetGroup) {
      case "with-balance":
        return consumerAccounts.some((account) => (account.balanceCents ?? 0) > 0);
      case "decline":
        if (matchesAdditionalStatus(consumer.additionalData, "decline")) {
          return true;
        }
        return consumerAccounts.some(
          (account) => (account.status ?? "").toLowerCase() === "decline",
        );
      case "recent-upload":
        if (!consumer.createdAt) {
          return false;
        }
        const createdAtDate = new Date(consumer.createdAt as string | number | Date);
        if (Number.isNaN(createdAtDate.getTime())) {
          return false;
        }
        return createdAtDate > recentCutoff;
      default:
        return true;
    }
  });
}


import {
  getBalanceRangeFromTier,
  isBalanceTier,
  type BalanceTier,
} from "@shared/schema";

export class ArrangementTierValidationError extends Error {
  readonly statusCode = 400;
}

export function resolveArrangementTierForWrite(
  rawTier: unknown,
  options: { allowLegacyTier?: boolean } = {},
): {
  balanceTier: BalanceTier;
  minBalance: number;
  maxBalance: number;
} | null {
  if (rawTier === null || rawTier === undefined || rawTier === "") {
    return null;
  }
  if (!isBalanceTier(rawTier)) {
    throw new ArrangementTierValidationError("Invalid balance tier");
  }
  if (rawTier === "under_3000" && !options.allowLegacyTier) {
    throw new ArrangementTierValidationError(
      "The legacy Under $3,000 tier cannot be used for a new arrangement",
    );
  }
  return {
    balanceTier: rawTier,
    ...getBalanceRangeFromTier(rawTier),
  };
}
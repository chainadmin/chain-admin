export type PackageGeography = { state: string; areaCode: string; targetDids: number; minimumDids: number };
export type ExistingDid = { areaCode: string; state?: string | null };

export function calculateCoverage(geographies: PackageGeography[], existingDids: ExistingDid[]) {
  const counts = new Map<string, number>();
  for (const did of existingDids) counts.set(did.areaCode, (counts.get(did.areaCode) || 0) + 1);
  return geographies.map((geo) => {
    const existing = Math.min(counts.get(geo.areaCode) || 0, geo.targetDids);
    return { state: geo.state, areaCode: geo.areaCode, required: geo.targetDids, minimum: geo.minimumDids, existing, need: Math.max(0, geo.targetDids - existing) };
  });
}

export function coverageMeetsMinimum(coverage: ReturnType<typeof calculateCoverage>, newlyProvisioned: Record<string, number> = {}) {
  return coverage.every((row) => row.existing + (newlyProvisioned[row.areaCode] || 0) >= row.minimum);
}

export function costReview(missingDidCount: number, providerMonthlyCostCents: number, customerPriceCents: number) {
  const estimatedProviderCostCents = missingDidCount * providerMonthlyCostCents;
  return { didsToPurchase: missingDidCount, estimatedProviderCostCents, customerPriceCents, estimatedGrossMarginCents: customerPriceCents - estimatedProviderCostCents };
}

export function assertProvisionable(status: string, approvedAt?: Date | string | null) {
  if (status !== "APPROVED" || !approvedAt) throw new Error("Local Presence provisioning requires explicit Global Admin approval");
}

export function downgradeRequiresReleaseReview(oldGeographies: PackageGeography[], nextGeographies: PackageGeography[]) {
  const next = new Set(nextGeographies.map((row) => row.areaCode));
  return oldGeographies.some((row) => !next.has(row.areaCode));
}

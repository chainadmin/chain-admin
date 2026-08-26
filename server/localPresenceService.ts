import { extractAreaCode, parseDialString, type ParsedDialString } from './phoneNumberUtils';

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

export type DialingNumber = {
  id?: string;
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  state?: string | null;
  numberType: 'PRIMARY' | 'LOCAL_PRESENCE' | 'PORTED' | 'TOLL_FREE';
  isActive: boolean | null;
  isPrimary?: boolean | null;
  status?: string | null;
};

export type AreaCodeToStateResolver = (areaCode: string) => string | null | undefined;

export type DialingSelectionReason =
  | 'LOCAL_PRESENCE_AREA_CODE'
  | 'LOCAL_PRESENCE_STATE'
  | 'PRIMARY_FALLBACK'
  | 'CALLER_SELECTED';

export type DialingDecision = ParsedDialString & {
  destinationAreaCode: string;
  destinationState: string | null;
  callerId: string;
  selectedNumber: DialingNumber;
  selectionReason: DialingSelectionReason;
};

export type SelectDialingNumberInput = {
  tenantId: string;
  dialString: string;
  numbers: DialingNumber[];
  /** The id or E.164 phone number selected by the caller for an ordinary call. */
  selectedNumberId?: string | null;
  selectedPhoneNumber?: string | null;
  areaCodeToState?: AreaCodeToStateResolver;
};

function isAvailable(number: DialingNumber): boolean {
  return number.isActive === true && (!number.status || number.status.toUpperCase() === 'ACTIVE');
}

function normalizedState(state: string | null | undefined): string | null {
  const value = state?.trim().toUpperCase();
  return value || null;
}

function findPrimary(numbers: DialingNumber[]): DialingNumber | undefined {
  return numbers.find(number => number.isPrimary === true)
    || numbers.find(number => number.numberType === 'PRIMARY');
}

/**
 * Pure outbound dialing policy. Callers must pass numbers from storage, but
 * tenant ownership is still enforced here so an accidentally broad query can
 * never select another tenant's caller ID.
 */
export function selectDialingNumber(input: SelectDialingNumberInput): DialingDecision {
  const parsed = parseDialString(input.dialString);
  const destinationAreaCode = extractAreaCode(parsed.destination);
  const ownedActive = input.numbers.filter(number =>
    number.tenantId === input.tenantId && isAvailable(number));
  const primary = findPrimary(ownedActive);
  let selected: DialingNumber | undefined;
  let selectionReason: DialingSelectionReason;
  const destinationState = input.areaCodeToState
    ? normalizedState(input.areaCodeToState(destinationAreaCode))
    : null;

  if (parsed.localPresenceRequested) {
    // Only bucket inventory participates in geographic matching. In
    // particular, a ported/direct or primary DID with the same area code does
    // not masquerade as Local Presence inventory.
    const buckets = ownedActive.filter(number => number.numberType === 'LOCAL_PRESENCE');
    selected = buckets.find(number => number.areaCode === destinationAreaCode);
    selectionReason = 'LOCAL_PRESENCE_AREA_CODE';

    if (!selected && input.areaCodeToState) {
      if (destinationState) {
        selected = buckets.find(number => {
          const numberState = normalizedState(number.state)
            || normalizedState(input.areaCodeToState!(number.areaCode));
          return numberState === destinationState;
        });
        selectionReason = 'LOCAL_PRESENCE_STATE';
      }
    }

    if (!selected) {
      selected = primary;
      selectionReason = 'PRIMARY_FALLBACK';
    }
  } else {
    const directNumbers = ownedActive.filter(number => number.numberType !== 'LOCAL_PRESENCE');
    selected = directNumbers.find(number =>
      (input.selectedNumberId != null && number.id === input.selectedNumberId)
      || (input.selectedPhoneNumber != null && number.phoneNumber === input.selectedPhoneNumber));
    if (selected) {
      selectionReason = 'CALLER_SELECTED';
    } else {
      selected = primary;
      selectionReason = 'PRIMARY_FALLBACK';
    }
  }

  if (!selected) {
    throw new Error(`No active primary/default phone number is available for tenant ${input.tenantId}`);
  }

  return {
    ...parsed,
    destinationAreaCode,
    destinationState,
    callerId: selected.phoneNumber,
    selectedNumber: selected,
    selectionReason,
  };
}

export const selectLocalPresenceDialingNumber = selectDialingNumber;

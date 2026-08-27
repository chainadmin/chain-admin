import { extractAreaCode } from './phoneNumberUtils';

export type CallerIdCandidate = {
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  numberType: 'PRIMARY' | 'LOCAL_PRESENCE' | 'PORTED' | 'TOLL_FREE';
  isActive: boolean | null;
  state?: string | null;
};

export type AreaCodeGeography = { areaCode: string; state: string };

// Prefer an exact local DID. If that bucket has a gap, keep the caller ID in
// the destination's state instead of choosing an unrelated area code.
export function selectLocalDidCallerId(destination: string, candidates: CallerIdCandidate[], geographies: AreaCodeGeography[]) {
  const activeLocal = candidates.filter(number => number.numberType === 'LOCAL_PRESENCE' && number.isActive === true);
  const destinationAreaCode = extractAreaCode(destination);
  const exact = activeLocal.find(number => number.areaCode === destinationAreaCode);
  if (exact) return exact;
  const destinationState = geographies.find(geography => geography.areaCode === destinationAreaCode)?.state?.toUpperCase();
  if (!destinationState) return undefined;
  return activeLocal.find(number => number.state?.toUpperCase() === destinationState);
}

export function selectCompanyCallerId(tenantId: string, destination: string, candidates: CallerIdCandidate[]) {
  const ownedActive = candidates.filter(number => number.tenantId === tenantId && number.isActive === true);
  const areaCode = extractAreaCode(destination);
  return ownedActive.find(number => number.numberType === 'LOCAL_PRESENCE' && number.areaCode === areaCode)
    || ownedActive.find(number => number.numberType === 'PRIMARY');
}

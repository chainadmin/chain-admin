import { extractAreaCode } from './phoneNumberUtils';

export type CallerIdCandidate = {
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  numberType: 'PRIMARY' | 'LOCAL_PRESENCE' | 'PORTED' | 'TOLL_FREE';
  isActive: boolean | null;
};

export function selectCompanyCallerId(tenantId: string, destination: string, candidates: CallerIdCandidate[]) {
  const ownedActive = candidates.filter(number => number.tenantId === tenantId && number.isActive === true);
  const areaCode = extractAreaCode(destination);
  return ownedActive.find(number => number.numberType === 'LOCAL_PRESENCE' && number.areaCode === areaCode)
    || ownedActive.find(number => number.numberType === 'PRIMARY');
}

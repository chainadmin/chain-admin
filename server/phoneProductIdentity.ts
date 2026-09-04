export const normalizeCompanyEmail = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();

export const normalizeCompanyName = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

export const companyIdentityLockKeys = (email: string, businessName: string) => [
  `company-email:${normalizeCompanyEmail(email)}`,
  `company-name:${normalizeCompanyName(businessName)}`,
].sort();

export type CompanyIdentityCandidate = {
  email: string | null;
  businessName: string | null;
  name: string;
};

/**
 * Company identity matching is intentionally conservative: both normalized
 * email and normalized business name must identify exactly one tenant.
 */
export function classifyCanonicalTenantCandidates<T extends CompanyIdentityCandidate>(
  candidates: T[],
  email: string,
  businessName: string,
): { tenant?: T; reason?: "AMBIGUOUS" | "MISMATCH" } {
  const normalizedEmail = normalizeCompanyEmail(email);
  const normalizedName = normalizeCompanyName(businessName);
  const exactMatches = candidates.filter(candidate =>
    normalizeCompanyEmail(candidate.email || "") === normalizedEmail
    && normalizeCompanyName(candidate.businessName || candidate.name) === normalizedName,
  );

  if (exactMatches.length > 1) return { reason: "AMBIGUOUS" };
  if (exactMatches.length === 1) return { tenant: exactMatches[0] };
  return candidates.length > 0 ? { reason: "MISMATCH" } : {};
}
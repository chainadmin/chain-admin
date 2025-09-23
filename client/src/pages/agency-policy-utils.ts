export interface PolicySource {
  termsOfService?: string | null;
  privacyPolicy?: string | null;
}

export interface PolicyResolution {
  termsContent: string;
  privacyContent: string;
  hasTermsContent: boolean;
  hasPrivacyContent: boolean;
}

function toText(value: string | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  return value == null ? "" : String(value);
}

export function resolvePolicyContent({
  primary,
  fallback,
}: {
  primary?: PolicySource | null;
  fallback?: PolicySource | null;
}): PolicyResolution {
  const termsContent = toText(primary?.termsOfService ?? fallback?.termsOfService ?? "");
  const privacyContent = toText(primary?.privacyPolicy ?? fallback?.privacyPolicy ?? "");

  return {
    termsContent,
    privacyContent,
    hasTermsContent: termsContent.trim().length > 0,
    hasPrivacyContent: privacyContent.trim().length > 0,
  };
}

export const DEFAULT_PRIMARY_BRAND_COLOR = "#3B82F6";
export const DEFAULT_SECONDARY_BRAND_COLOR = "#1E40AF";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function resolveBrandColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

export function resolveSafeLandingPageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getContrastTextColor(hex: string): "#000000" | "#FFFFFF" {
  const color = resolveBrandColor(hex, DEFAULT_PRIMARY_BRAND_COLOR).slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? "#000000" : "#FFFFFF";
}

export function hexToRgba(hex: string, alpha: number): string {
  const color = resolveBrandColor(hex, DEFAULT_PRIMARY_BRAND_COLOR).slice(1);
  return `rgba(${parseInt(color.slice(0, 2), 16)}, ${parseInt(color.slice(2, 4), 16)}, ${parseInt(color.slice(4, 6), 16)}, ${alpha})`;
}

export function hasActiveLandingBranding(value: unknown): boolean {
  const branding = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Boolean(
    optionalText(branding.logoUrl) ||
    (typeof branding.primaryColor === "string" && HEX_COLOR.test(branding.primaryColor)) ||
    (typeof branding.secondaryColor === "string" && HEX_COLOR.test(branding.secondaryColor)) ||
    optionalText(branding.landingPageHeadline) ||
    optionalText(branding.landingPageSubheadline) ||
    resolveSafeLandingPageUrl(branding.customLandingPageUrl),
  );
}

export function resolvePublicAgencyBranding(
  tenant: { name: string; slug: string; businessType?: string | null; brand?: unknown },
  settings?: {
    customBranding?: unknown;
    contactEmail?: string | null;
    contactPhone?: string | null;
    privacyPolicy?: string | null;
    termsOfService?: string | null;
  } | null,
) {
  const custom = settings?.customBranding && typeof settings.customBranding === "object"
    ? settings.customBranding as Record<string, unknown>
    : {};
  const tenantBrand = tenant.brand && typeof tenant.brand === "object"
    ? tenant.brand as Record<string, unknown>
    : {};

  return {
    agencyName: tenant.name,
    agencySlug: tenant.slug,
    businessType: tenant.businessType || "call_center",
    logoUrl: optionalText(custom.logoUrl) || optionalText(tenantBrand.logoUrl),
    primaryColor: resolveBrandColor(custom.primaryColor, DEFAULT_PRIMARY_BRAND_COLOR),
    secondaryColor: resolveBrandColor(custom.secondaryColor, DEFAULT_SECONDARY_BRAND_COLOR),
    contactEmail: optionalText(settings?.contactEmail),
    contactPhone: optionalText(settings?.contactPhone),
    hasPrivacyPolicy: Boolean(optionalText(settings?.privacyPolicy)),
    hasTermsOfService: Boolean(optionalText(settings?.termsOfService)),
    privacyPolicy: optionalText(settings?.privacyPolicy),
    termsOfService: optionalText(settings?.termsOfService),
    landingPageHeadline: optionalText(custom.landingPageHeadline),
    landingPageSubheadline: optionalText(custom.landingPageSubheadline),
    customLandingPageUrl: resolveSafeLandingPageUrl(custom.customLandingPageUrl),
  };
}
import type { ComponentType } from "react";
import type { AgencyBranding } from "../agency-landing";

export interface CustomLandingPageProps {
  branding: AgencyBranding;
  onSignIn: () => void;
  onCreateAccount: () => void;
  /** Opens the church/nonprofit's hosted guest donation checkout, when configured. */
  onDonate?: () => void;
}

/**
 * Code-built landing pages registered by tenant slug.
 *
 * Keep this registry explicit: a tenant never receives another tenant's page,
 * and unregistered tenants continue to use the configurable built-in design.
 *
 * Example:
 *   import ChurchLandingPage from "./church-landing-page";
 *   const customLandingPages = { "first-church": ChurchLandingPage };
 */
const customLandingPages: Record<string, ComponentType<CustomLandingPageProps>> = {};

export function getCustomLandingPage(
  tenantSlug: string,
): ComponentType<CustomLandingPageProps> | undefined {
  return customLandingPages[tenantSlug.toLowerCase()];
}

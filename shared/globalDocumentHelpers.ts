import type { BusinessType } from './terminology';
import { businessTypePlans, type MessagingPlanId, EMAIL_OVERAGE_RATE_PER_THOUSAND, SMS_OVERAGE_RATE_PER_SEGMENT } from './billing-plans';

// Map business types to their module/service descriptions for the software proposal
export function getModuleNameForBusinessType(businessType: BusinessType): string {
  const moduleMap: Record<BusinessType, string> = {
    call_center: 'Call Center Module',
    billing_service: 'Billing & Service Management Module',
    subscription_provider: 'Subscription Management Module',
    freelancer_consultant: 'Client & Project Management Module',
    property_management: 'Property & Tenant Management Module',
    nonprofit_organization: 'Donor & Campaign Management Module',
  };

  return moduleMap[businessType] || 'Call Center Module';
}

// Get the full module description for the business type
export function getModuleDescriptionForBusinessType(businessType: BusinessType): string {
  const descriptionMap: Record<BusinessType, string> = {
    call_center: 'specialized tools for debt collection, account management, payment arrangement processing, and debtor communication workflows',
    billing_service: 'comprehensive customer billing, invoice management, payment processing, and service order tracking capabilities',
    subscription_provider: 'subscription lifecycle management, recurring billing automation, subscriber communications, and plan management features',
    freelancer_consultant: 'client project tracking, time and invoice management, payment collection, and professional service delivery tools',
    property_management: 'tenant management, lease tracking, rent collection, maintenance request handling, and property communication features',
    nonprofit_organization: 'donor relationship management, donation tracking, campaign automation, volunteer coordination, and fundraising tools',
  };

  return descriptionMap[businessType] || descriptionMap.call_center;
}

// Get pricing details for a tenant's subscription plan
export function getPlanPricingForTenant(businessType: BusinessType, planId: MessagingPlanId) {
  const plans = businessTypePlans[businessType] || businessTypePlans.call_center;
  const plan = plans[planId];
  
  if (!plan) {
    // Default to starter plan if not found
    return plans.launch;
  }
  
  return plan;
}

// Format currency for display in documents (prices are in dollars, not cents)
export function formatDollarAmount(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

// Format currency from cents
export function formatCentsAsDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Format number with commas
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

// Get overage rates formatted for display
export function getOverageRatesFormatted() {
  return {
    emailOverageRate: `$${EMAIL_OVERAGE_RATE_PER_THOUSAND.toFixed(2)} per 1,000 emails`,
    smsOverageRate: `$${SMS_OVERAGE_RATE_PER_SEGMENT.toFixed(2)} per SMS segment`,
  };
}

// Replace variables in global document templates
export function replaceGlobalDocumentVariables(
  content: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let result = content;

  // Replace each variable
  Object.entries(variables).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Create regex to match {{variable_name}} or {{variableName}}
      const snakeCase = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      const regex1 = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const regex2 = new RegExp(`{{\\s*${snakeCase}\\s*}}`, 'g');
      
      result = result.replace(regex1, String(value));
      result = result.replace(regex2, String(value));
    }
  });

  return result;
}

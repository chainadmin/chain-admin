export function canTenantViewBilling(businessType: string | null | undefined, enabledModules: string[] = []): boolean {
  return businessType !== 'municipality' || enabledModules.includes('billing');
}

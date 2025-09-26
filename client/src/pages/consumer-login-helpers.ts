export type LoginForm = {
  email: string;
  dateOfBirth: string;
};

export type AgencyContext = {
  slug: string;
  name: string;
  logoUrl: string | null;
};

export type LoginMutationPayload = LoginForm & { tenantSlug?: string };

export type ConsumerLoginResult = {
  message?: string;
  multipleAgencies?: boolean;
  agencies?: AgencyContext[];
  needsRegistration?: boolean;
  needsAgencyLink?: boolean;
  tenant?: {
    slug: string;
    name?: string | null;
    logoUrl?: string | null;
  } | null;
};

export type HandleLoginResultOptions = {
  email: string;
  showToast: (options: {
    title: string;
    description?: string;
    variant?: string;
  }) => void;
  setPendingAgencies: (agencies: AgencyContext[]) => void;
  setAgencyDialogOpen: (open: boolean) => void;
  setLocation: (path: string) => void;
};

export function handleLoginResult(
  data: ConsumerLoginResult,
  {
    email,
    showToast,
    setPendingAgencies,
    setAgencyDialogOpen,
    setLocation,
  }: HandleLoginResultOptions,
): boolean {
  if (data.multipleAgencies) {
    showToast({
      title: "Choose your agency",
      description: data.message ?? "Select which agency dashboard to open.",
    });
    setPendingAgencies(data.agencies ?? []);
    setAgencyDialogOpen(true);
    return true;
  }

  if (data.needsRegistration && data.tenant?.slug) {
    showToast({
      title: "Complete Registration",
      description: data.message,
    });
    setLocation(`/consumer-register?email=${email}&tenant=${data.tenant.slug}`);
    return true;
  }

  if (data.needsAgencyLink) {
    showToast({
      title: "Agency Link Required",
      description: data.message,
    });
    setLocation(`/consumer-register?email=${email}`);
    return true;
  }

  return false;
}

export interface StorageLike {
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function storeAgencyContext(
  context: AgencyContext,
  stores: { session?: StorageLike | null; local?: StorageLike | null }
) {
  const serialized = JSON.stringify(context);

  if (stores.session) {
    try {
      stores.session.setItem("agencyContext", serialized);
    } catch (error) {
      console.error("Failed to persist agency context to session storage", error);
    }
  }

  if (stores.local) {
    try {
      stores.local.setItem("agencyContext", serialized);
    } catch (error) {
      console.error("Failed to persist agency context to local storage", error);
    }
  }
}

export async function retryLoginWithAgencySelection(
  agency: AgencyContext,
  form: LoginForm,
  mutateAsync: (payload: LoginMutationPayload) => Promise<unknown>,
  persistContext: (context: AgencyContext) => void
) {
  persistContext(agency);
  await mutateAsync({ ...form, tenantSlug: agency.slug });
}

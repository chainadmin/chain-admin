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

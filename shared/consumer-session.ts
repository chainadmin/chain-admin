import type { consumers, tenants } from './schema.js';

export type ConsumerRecord = typeof consumers.$inferSelect;
export type TenantRecord = typeof tenants.$inferSelect;

export interface ConsumerSessionResponse {
  token: string;
  consumer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    tenantId: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  tenantSlug: string;
  session: {
    token: string;
    tenantSlug: string;
    email: string;
    consumerId: string;
    tenant: ConsumerSessionResponse['tenant'];
    consumer: ConsumerSessionResponse['consumer'];
  };
}

export function buildConsumerSessionResponse(
  consumer: ConsumerRecord,
  tenant: TenantRecord,
  token: string
): ConsumerSessionResponse {
  if (!consumer.email) {
    throw new Error('Consumer record is missing an email address');
  }

  if (!consumer.tenantId) {
    throw new Error('Consumer record is missing a tenant assignment');
  }

  const tenantId = consumer.tenantId ?? tenant.id;

  const consumerPayload: ConsumerSessionResponse['consumer'] = {
    id: consumer.id,
    firstName: consumer.firstName ?? null,
    lastName: consumer.lastName ?? null,
    email: consumer.email,
    phone: consumer.phone ?? null,
    tenantId,
  };

  const tenantPayload: ConsumerSessionResponse['tenant'] = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
  };

  return {
    token,
    consumer: consumerPayload,
    tenant: tenantPayload,
    tenantSlug: tenant.slug,
    session: {
      token,
      tenantSlug: tenant.slug,
      email: consumer.email,
      consumerId: consumer.id,
      tenant: tenantPayload,
      consumer: consumerPayload,
    },
  };
}

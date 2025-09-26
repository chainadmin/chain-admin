import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { accounts, consumers, folders, type Consumer } from '@shared/schema';

export interface DeleteConsumersResult {
  success: true;
  message: string;
  deletedCount: number;
}

export class ConsumerNotFoundError extends Error {
  status = 404;

  constructor(message = 'Consumer not found') {
    super(message);
    this.name = 'ConsumerNotFoundError';
  }
}

export type ConsumerUpdate = Partial<Omit<Consumer, 'id' | 'tenantId'>> & {
  folderId?: Consumer['folderId'];
};

type ConsumersDatabase = PgDatabase<any, any, any>;

export async function listConsumers(
  db: ConsumersDatabase,
  tenantId: string,
) {
  const tenantConsumers = await db
    .select({
      id: consumers.id,
      firstName: consumers.firstName,
      lastName: consumers.lastName,
      email: consumers.email,
      phone: consumers.phone,
      dateOfBirth: consumers.dateOfBirth,
      address: consumers.address,
      city: consumers.city,
      state: consumers.state,
      zipCode: consumers.zipCode,
      isRegistered: consumers.isRegistered,
      registrationDate: consumers.registrationDate,
      contactPrefs: consumers.contactPrefs,
      additionalData: consumers.additionalData,
      createdAt: consumers.createdAt,
      folder: {
        id: folders.id,
        name: folders.name,
        color: folders.color,
      },
    })
    .from(consumers)
    .leftJoin(folders, eq(consumers.folderId, folders.id))
    .where(eq(consumers.tenantId, tenantId));

  type TenantConsumer = (typeof tenantConsumers)[number];

  const consumerIds = tenantConsumers.map((consumer: TenantConsumer) => consumer.id);

  const accountCounts = consumerIds.length
    ? await db
        .select({
          consumerId: accounts.consumerId,
          count: sql<number>`count(*)::int`,
        })
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, tenantId),
            inArray(accounts.consumerId, consumerIds),
          ),
        )
        .groupBy(accounts.consumerId)
    : [];

  type AccountCount = (typeof accountCounts)[number];

  return tenantConsumers.map((consumer: TenantConsumer) => ({
    ...consumer,
    accountCount:
      accountCounts.find((account: AccountCount) => account.consumerId === consumer.id)?.count ?? 0,
  }));
}

export async function updateConsumer(
  db: ConsumersDatabase,
  tenantId: string,
  consumerId: string,
  updates: ConsumerUpdate,
) {
  const [existingConsumer] = await db
    .select({ id: consumers.id })
    .from(consumers)
    .where(
      and(eq(consumers.id, consumerId), eq(consumers.tenantId, tenantId)),
    )
    .limit(1);

  if (!existingConsumer) {
    throw new ConsumerNotFoundError();
  }

  const [updatedConsumer] = await db
    .update(consumers)
    .set(updates)
    .where(and(eq(consumers.id, consumerId), eq(consumers.tenantId, tenantId)))
    .returning();

  if (!updatedConsumer) {
    throw new ConsumerNotFoundError();
  }

  return updatedConsumer;
}

export async function deleteConsumers(
  db: ConsumersDatabase,
  tenantId: string,
  consumerIds: string[],
): Promise<DeleteConsumersResult> {
  if (consumerIds.length === 0) {
    return {
      success: true,
      message: 'No consumers deleted',
      deletedCount: 0,
    };
  }

  const existingConsumers = await db
    .select({ id: consumers.id })
    .from(consumers)
    .where(
      and(eq(consumers.tenantId, tenantId), inArray(consumers.id, consumerIds)),
    );

  if (existingConsumers.length === 0) {
    throw new ConsumerNotFoundError('No consumers found to delete');
  }

  const validConsumerIds = existingConsumers.map(consumer => consumer.id);

  await db
    .delete(accounts)
    .where(
      and(eq(accounts.tenantId, tenantId), inArray(accounts.consumerId, validConsumerIds)),
    );

  await db
    .delete(consumers)
    .where(and(eq(consumers.tenantId, tenantId), inArray(consumers.id, validConsumerIds)));

  return {
    success: true,
    message: `Successfully deleted ${validConsumerIds.length} consumer(s)`,
    deletedCount: validConsumerIds.length,
  };
}

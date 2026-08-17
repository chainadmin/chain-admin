export const DEFAULT_MAX_ACTIVE_USERS = 2;
export const MUNICIPALITY_INCLUDED_ACTIVE_USERS = 66;
export const MAX_CONTACT_PAGE_SIZE = 500;

export function normalizeActiveUserLimit(value: number | null | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : DEFAULT_MAX_ACTIVE_USERS;
}

export function activeSeatUsage(users: Array<{ isActive?: boolean | null }>) {
  return users.reduce((count, user) => count + (user.isActive === false ? 0 : 1), 0);
}

export function userCapacitySummary(users: Array<{ isActive?: boolean | null }>, configuredLimit?: number | null, businessType?: string | null) {
  const activeUsers = activeSeatUsage(users);
  const isMunicipality = businessType === 'municipality';
  const maxActiveUsers = isMunicipality ? Math.max(MUNICIPALITY_INCLUDED_ACTIVE_USERS, normalizeActiveUserLimit(configuredLimit)) : normalizeActiveUserLimit(configuredLimit);
  return {
    allowed: isMunicipality || activeUsers < maxActiveUsers,
    activeUsers,
    maxActiveUsers,
    additionalBillableUsers: isMunicipality ? Math.max(0, activeUsers - MUNICIPALITY_INCLUDED_ACTIVE_USERS) : 0,
    hasUnlimitedUsers: isMunicipality,
  };
}

export function canActivateUser(users: Array<{ isActive?: boolean | null }>, configuredLimit?: number | null, businessType?: string | null) {
  return userCapacitySummary(users, configuredLimit, businessType);
}

export async function processCursorBatches<T extends { id: string }>(options: {
  fetchBatch: (cursor: string | undefined, limit: number) => Promise<T[]>;
  processBatch: (items: T[]) => Promise<void>;
  batchSize?: number;
}) {
  const batchSize = Math.min(MAX_CONTACT_PAGE_SIZE, Math.max(1, options.batchSize || MAX_CONTACT_PAGE_SIZE));
  let cursor: string | undefined;
  let processed = 0;
  while (true) {
    const items = await options.fetchBatch(cursor, batchSize);
    if (items.length > batchSize) throw new Error('Cursor source exceeded the requested batch size');
    if (items.length === 0) break;
    await options.processBatch(items);
    processed += items.length;
    cursor = items[items.length - 1].id;
    if (items.length < batchSize) break;
  }
  return processed;
}

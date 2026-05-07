export const ACCOUNT_STATUSES = [
  'active',
  'overdue',
  'settled',
  'inactive',
  'closed',
  'recalled',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  overdue: 'Overdue',
  settled: 'Settled',
  inactive: 'Inactive',
  closed: 'Closed',
  recalled: 'Recalled',
};

export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

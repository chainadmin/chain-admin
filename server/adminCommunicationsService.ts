import twilio from 'twilio';

export type CommunicationsTenantRecord = {
  tenantId: string;
  tenantName: string;
  legacyAccountSid: string | null;
  legacyPhoneNumber: string | null;
};

export type CommunicationsSmsRecord = {
  tenantId: string;
  accountSid: string | null;
  phoneNumber: string | null;
  messagingServiceSid: string | null;
  enabled: boolean;
};

export type CommunicationsVoipNumberRecord = {
  id: string;
  tenantId: string;
  phoneNumber: string;
  twilioPhoneSid: string | null;
  twilioSubaccountSid: string | null;
  status: string;
  isActive: boolean | null;
};

export type CommunicationsDatabaseInventory = {
  tenants: CommunicationsTenantRecord[];
  smsConfigurations: CommunicationsSmsRecord[];
  voipPhoneNumbers: CommunicationsVoipNumberRecord[];
};

export type TwilioInventoryAccount = {
  sid: string;
  friendlyName?: string | null;
  status?: string | null;
};

export type TwilioInventoryNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName?: string | null;
};

export interface CommunicationsInventoryProvider {
  listChildAccounts(): Promise<TwilioInventoryAccount[]>;
  listIncomingNumbers(accountSid: string): Promise<TwilioInventoryNumber[]>;
}

export interface CommunicationsInventoryStore {
  loadInventory(): Promise<CommunicationsDatabaseInventory>;
}

export type ReconciliationLabel = 'mapped' | 'unmapped' | 'ambiguous';

export type ReconciliationMatch = {
  tenantId: string;
  tenantName: string;
  sources: Array<'tenant_legacy' | 'tenant_sms_configuration' | 'voip_phone_number'>;
};

export type ReconciledProviderNumber = TwilioInventoryNumber & {
  reconciliation: ReconciliationLabel;
  matches: ReconciliationMatch[];
};

export type ReconciledProviderAccount = TwilioInventoryAccount & {
  reconciliation: ReconciliationLabel;
  matches: ReconciliationMatch[];
  incomingNumbers: {
    status: 'available' | 'unavailable';
    error?: string;
    items: ReconciledProviderNumber[];
  };
};

export type AdminCommunicationsInventory = {
  database: CommunicationsDatabaseInventory;
  provider: {
    status: 'available' | 'partial' | 'unavailable';
    error?: string;
    accounts: ReconciledProviderAccount[];
  };
};

const PROVIDER_UNAVAILABLE_ERROR = 'Twilio communications inventory is unavailable';
const PROVIDER_NUMBERS_UNAVAILABLE_ERROR = 'Twilio incoming-number inventory is unavailable for this account';
const ACCOUNT_NUMBER_CONCURRENCY = 5;
const PROVIDER_CALL_TIMEOUT_MS = 10_000;
const PROVIDER_INVENTORY_DEADLINE_MS = 25_000;
const MAX_PROVIDER_ACCOUNTS = 250;

/**
 * Builds an inventory without provisioning, updating, releasing, or otherwise
 * mutating Twilio resources. Database inventory is loaded first and is retained
 * in the result if the provider cannot be reached.
 */
export async function getAdminCommunicationsInventory(options: {
  provider?: CommunicationsInventoryProvider;
  store?: CommunicationsInventoryStore;
} = {}): Promise<AdminCommunicationsInventory> {
  const store = options.store ?? createDatabaseInventoryStore();
  const database = await store.loadInventory();

  let provider: CommunicationsInventoryProvider;
  try {
    provider = options.provider ?? createTwilioInventoryProvider();
  } catch {
    return unavailableResult(database);
  }

  let accounts: TwilioInventoryAccount[];
  try {
    accounts = await provider.listChildAccounts();
  } catch {
    return unavailableResult(database);
  }

  const limitedAccounts = accounts.slice(0, MAX_PROVIDER_ACCOUNTS);
  const startedAt = Date.now();
  const reconciledAccounts = await mapWithConcurrency(
    limitedAccounts,
    ACCOUNT_NUMBER_CONCURRENCY,
    async (account): Promise<ReconciledProviderAccount> => {
    const accountMatches = matchAccount(account.sid, database);
    const accountResult = {
      sid: account.sid,
      friendlyName: account.friendlyName ?? null,
      status: account.status ?? null,
      reconciliation: labelFor(accountMatches),
      matches: accountMatches,
    };

    try {
      const remainingMs = PROVIDER_INVENTORY_DEADLINE_MS - (Date.now() - startedAt);
      if (remainingMs <= 0) throw new Error('Provider inventory deadline exceeded');
      const numbers = await provider.listIncomingNumbers(account.sid);
      return {
        ...accountResult,
        incomingNumbers: {
          status: 'available',
          items: numbers.map((number) => {
            const matches = matchNumber(number, database);
            return {
              sid: number.sid,
              phoneNumber: number.phoneNumber,
              friendlyName: number.friendlyName ?? null,
              reconciliation: labelFor(matches),
              matches,
            };
          }),
        },
      };
    } catch {
      return {
        ...accountResult,
        incomingNumbers: {
          status: 'unavailable',
          error: PROVIDER_NUMBERS_UNAVAILABLE_ERROR,
          items: [],
        },
      };
    }
    },
  );

  const partial = accounts.length > MAX_PROVIDER_ACCOUNTS
    || reconciledAccounts.some((account) => account.incomingNumbers.status === 'unavailable');
  return {
    database,
    provider: {
      status: partial ? 'partial' : 'available',
      ...(partial ? {
        error: accounts.length > MAX_PROVIDER_ACCOUNTS
          ? `Twilio inventory is limited to the first ${MAX_PROVIDER_ACCOUNTS} subaccounts`
          : 'Some Twilio incoming-number inventory is unavailable',
      } : {}),
      accounts: reconciledAccounts,
    },
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function unavailableResult(database: CommunicationsDatabaseInventory): AdminCommunicationsInventory {
  return {
    database,
    provider: {
      status: 'unavailable',
      error: PROVIDER_UNAVAILABLE_ERROR,
      accounts: [],
    },
  };
}

function labelFor(matches: ReconciliationMatch[]): ReconciliationLabel {
  if (matches.length === 0) return 'unmapped';
  return matches.length === 1 ? 'mapped' : 'ambiguous';
}

function matchAccount(sid: string, inventory: CommunicationsDatabaseInventory): ReconciliationMatch[] {
  const matches = new Map<string, Set<ReconciliationMatch['sources'][number]>>();
  const normalizedSid = normalizeSid(sid);

  for (const tenant of inventory.tenants) {
    if (normalizeSid(tenant.legacyAccountSid) === normalizedSid) {
      addMatch(matches, tenant.tenantId, 'tenant_legacy');
    }
  }
  for (const sms of inventory.smsConfigurations) {
    if (normalizeSid(sms.accountSid) === normalizedSid) {
      addMatch(matches, sms.tenantId, 'tenant_sms_configuration');
    }
  }
  for (const number of inventory.voipPhoneNumbers) {
    if (normalizeSid(number.twilioSubaccountSid) === normalizedSid) {
      addMatch(matches, number.tenantId, 'voip_phone_number');
    }
  }
  return materializeMatches(matches, inventory);
}

function matchNumber(
  number: TwilioInventoryNumber,
  inventory: CommunicationsDatabaseInventory,
): ReconciliationMatch[] {
  const matches = new Map<string, Set<ReconciliationMatch['sources'][number]>>();
  const phone = normalizePhone(number.phoneNumber);
  const numberSid = normalizeSid(number.sid);

  for (const tenant of inventory.tenants) {
    if (normalizePhone(tenant.legacyPhoneNumber) === phone) {
      addMatch(matches, tenant.tenantId, 'tenant_legacy');
    }
  }
  for (const sms of inventory.smsConfigurations) {
    if (normalizePhone(sms.phoneNumber) === phone) {
      addMatch(matches, sms.tenantId, 'tenant_sms_configuration');
    }
  }
  for (const voip of inventory.voipPhoneNumbers) {
    if (normalizeSid(voip.twilioPhoneSid) === numberSid || normalizePhone(voip.phoneNumber) === phone) {
      addMatch(matches, voip.tenantId, 'voip_phone_number');
    }
  }
  return materializeMatches(matches, inventory);
}

function addMatch(
  matches: Map<string, Set<ReconciliationMatch['sources'][number]>>,
  tenantId: string,
  source: ReconciliationMatch['sources'][number],
): void {
  const sources = matches.get(tenantId) ?? new Set();
  sources.add(source);
  matches.set(tenantId, sources);
}

function materializeMatches(
  matches: Map<string, Set<ReconciliationMatch['sources'][number]>>,
  inventory: CommunicationsDatabaseInventory,
): ReconciliationMatch[] {
  const names = new Map(inventory.tenants.map((tenant) => [tenant.tenantId, tenant.tenantName]));
  return Array.from(matches.entries())
    .map(([tenantId, sources]) => ({
      tenantId,
      tenantName: names.get(tenantId) ?? 'Unknown tenant',
      sources: Array.from(sources),
    }))
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
}

function normalizeSid(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

export function createTwilioInventoryProvider(): CommunicationsInventoryProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  if (!accountSid || (!authToken && !(apiKeySid && apiKeySecret))) {
    throw new Error(PROVIDER_UNAVAILABLE_ERROR);
  }
  const clients = [
    ...(authToken ? [twilio(accountSid, authToken, { timeout: PROVIDER_CALL_TIMEOUT_MS })] : []),
    ...(apiKeySid && apiKeySecret ? [twilio(apiKeySid, apiKeySecret, { accountSid, timeout: PROVIDER_CALL_TIMEOUT_MS })] : []),
  ];
  let activeClient: (typeof clients)[number] | undefined;
  const withAvailableClient = async <T>(operation: (client: (typeof clients)[number]) => Promise<T>): Promise<T> => {
    const candidates = activeClient
      ? [activeClient, ...clients.filter(client => client !== activeClient)]
      : clients;
    let lastError: unknown;
    for (const client of candidates) {
      try {
        const result = await operation(client);
        activeClient = client;
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error(PROVIDER_UNAVAILABLE_ERROR);
  };
  return {
    async listChildAccounts() {
      const accounts = await withAvailableClient(client =>
        client.api.v2010.accounts.list({ limit: MAX_PROVIDER_ACCOUNTS + 1 }),
      );
      return accounts
        .filter((account) => account.sid !== accountSid)
        .map((account) => ({
          sid: account.sid,
          friendlyName: account.friendlyName,
          status: account.status,
        }));
    },
    async listIncomingNumbers(childAccountSid) {
      const numbers = await withAvailableClient(client =>
        client.api.v2010
          .accounts(childAccountSid)
          .incomingPhoneNumbers.list({ limit: 1000 }),
      );
      return numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
      }));
    },
  };
}

export function createDatabaseInventoryStore(): CommunicationsInventoryStore {
  return {
    async loadInventory() {
      const [{ db }, schema] = await Promise.all([
        import('./db'),
        import('@shared/schema'),
      ]);
      const [tenantRows, smsConfigurations, voipNumbers] = await Promise.all([
        db.select({
          tenantId: schema.tenants.id,
          tenantName: schema.tenants.name,
          legacyAccountSid: schema.tenants.twilioAccountSid,
          legacyPhoneNumber: schema.tenants.twilioPhoneNumber,
        }).from(schema.tenants),
        db.select({
          tenantId: schema.tenantSmsConfigurations.tenantId,
          accountSid: schema.tenantSmsConfigurations.accountSid,
          phoneNumber: schema.tenantSmsConfigurations.phoneNumber,
          messagingServiceSid: schema.tenantSmsConfigurations.messagingServiceSid,
          enabled: schema.tenantSmsConfigurations.enabled,
        }).from(schema.tenantSmsConfigurations),
        db.select({
          id: schema.voipPhoneNumbers.id,
          tenantId: schema.voipPhoneNumbers.tenantId,
          phoneNumber: schema.voipPhoneNumbers.phoneNumber,
          twilioPhoneSid: schema.voipPhoneNumbers.twilioPhoneSid,
          twilioSubaccountSid: schema.voipPhoneNumbers.twilioSubaccountSid,
          status: schema.voipPhoneNumbers.status,
          isActive: schema.voipPhoneNumbers.isActive,
        }).from(schema.voipPhoneNumbers),
      ]);
      return {
        tenants: tenantRows,
        smsConfigurations,
        voipPhoneNumbers: voipNumbers,
      };
    },
  };
}
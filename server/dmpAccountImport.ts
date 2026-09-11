type ImportStorage = {
  getAccountsByTenant(tenantId: string): Promise<any[]>;
  getFoldersByTenant?(tenantId: string): Promise<any[]>;
  createFolder?(folder: any): Promise<any>;
  updateAccount(id: string, updates: any): Promise<any>;
  updateConsumer?(id: string, updates: any): Promise<any>;
  getConsumerByEmailAndTenant(email: string, tenantId: string): Promise<any>;
  getConsumerByPhoneAndTenant(phone: string, tenantId: string): Promise<any>;
  findConsumersByNameAndTenant(firstName: string, lastName: string, tenantId: string): Promise<any[]>;
  createConsumer(consumer: any): Promise<any>;
  createAccount(account: any): Promise<any>;
};

function normalizeFolderStatus(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';
}

type DmpPaymentSyncStorage = Pick<ImportStorage, 'getAccountsByTenant' | 'updateAccount'>;

function phoneFromDmpRecord(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['phoneNumber', 'phone_number', 'phone', 'number']) {
    const phone = record[key];
    if ((typeof phone === 'string' || typeof phone === 'number') && String(phone).trim()) {
      return String(phone).trim();
    }
  }
  return undefined;
}

/** Fill account-list rows that omit phone data from DMP's dedicated phone endpoint. */
export async function hydrateDmpAccountPhones(
  accounts: any[],
  getPhones: (filenumber: string) => Promise<any[] | null>,
  concurrency = 10,
): Promise<any[]> {
  const hydrated = [...accounts];
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < hydrated.length) {
      const index = nextIndex++;
      const account = hydrated[index];
      if (account?.consumerPhone || !account?.filenumber) continue;

      try {
        const phones = await getPhones(String(account.filenumber));
        if (!Array.isArray(phones)) continue;
        const phone = phones.map(phoneFromDmpRecord).find(Boolean);
        if (phone) hydrated[index] = { ...account, consumerPhone: phone };
      } catch {
        // A phone lookup must not prevent the rest of a manual account sync.
      }
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), hydrated.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return hydrated;
}

export interface DmpPaymentSyncResults {
  accountsSynced: number;
  historyPayments: number;
  pendingPayments: number;
  errors: string[];
}

const terminalPaymentStatus = /declin|cancel|void|nsf|charge.?back|refund|revers|fail|return/i;
const postedPaymentStatus = /posted|paid|complete|success|settled/i;

/** Cache DMP payment records on their Chain account for account-level views. */
export async function syncDmpAccountPayments(
  storage: DmpPaymentSyncStorage,
  tenantId: string,
  getPayments: (filenumber: string) => Promise<any[] | null>,
): Promise<DmpPaymentSyncResults> {
  const results: DmpPaymentSyncResults = {
    accountsSynced: 0,
    historyPayments: 0,
    pendingPayments: 0,
    errors: [],
  };
  const accounts = await storage.getAccountsByTenant(tenantId);

  for (const account of accounts) {
    const filenumber = typeof account.filenumber === 'string' ? account.filenumber.trim() : '';
    if (!filenumber || account.additionalData?.dmpSource !== 'dmp') continue;

    try {
      const rawPayments = await getPayments(filenumber);
      if (!Array.isArray(rawPayments)) throw new Error('DMP returned an invalid payment list');

      const payments = rawPayments.map((payment: any) => {
        const amount = Number(payment?.paymentamount ?? payment?.payment_amount ?? payment?.amount ?? 0);
        const rawDate = payment?.paymentdate ?? payment?.payment_date ?? payment?.date
          ?? payment?.scheduleddate ?? payment?.scheduled_date;
        const parsedDate = rawDate ? new Date(rawDate) : null;
        return {
          date: parsedDate && !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString().slice(0, 10)
            : null,
          amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
          status: String(payment?.paymentstatus ?? payment?.payment_status ?? payment?.status ?? '').trim(),
          transactionId: String(payment?.transactionid ?? payment?.transaction_id ?? payment?.reference ?? '').trim() || null,
          paymentMethod: String(payment?.paymentmethod ?? payment?.payment_method ?? payment?.method ?? '').trim() || null,
        };
      });
      const history = payments.filter(payment =>
        payment.date && payment.amountCents > 0
        && postedPaymentStatus.test(payment.status)
        && !terminalPaymentStatus.test(payment.status)
      );
      const pending = payments.filter(payment =>
        payment.date && payment.amountCents > 0
        && !postedPaymentStatus.test(payment.status)
        && !terminalPaymentStatus.test(payment.status)
      );

      await storage.updateAccount(account.id, {
        additionalData: {
          ...(account.additionalData || {}),
          dmpPaymentHistory: history,
          dmpPendingPayments: pending,
          dmpPaymentsSyncedAt: new Date().toISOString(),
        },
      });
      results.accountsSynced++;
      results.historyPayments += history.length;
      results.pendingPayments += pending.length;
    } catch (error: any) {
      results.errors.push(`Payment sync failed for DMP account ${filenumber}: ${error?.message || 'Unknown error'}`);
    }
  }

  return results;
}

export interface DmpAccountImportResults {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface DmpAccountImportOptions {
  createMissing?: boolean;
  syncExistingConsumerContact?: boolean;
}

export const DMP_DELETE_CONFIRMATION = 'DELETE ALL ACCOUNTS';

export function canDeleteAllDmpAccounts(role: unknown): boolean {
  return role === 'owner' || role === 'platform_admin';
}

export async function importDmpAccounts(
  storage: ImportStorage,
  tenantId: string,
  dmpAccounts: any[],
  folderId?: string | null,
  options: DmpAccountImportOptions = {},
): Promise<DmpAccountImportResults> {
  const results: DmpAccountImportResults = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const existingAccounts = await storage.getAccountsByTenant(tenantId);
  const createMissing = options.createMissing ?? true;
  const tenantFolders = storage.getFoldersByTenant
    ? await storage.getFoldersByTenant(tenantId)
    : [];
  const foldersByStatus = new Map<string, string>();
  for (const folder of tenantFolders) {
    const normalizedName = normalizeFolderStatus(folder?.name);
    if (normalizedName && typeof folder?.id === 'string' && !foldersByStatus.has(normalizedName)) {
      foldersByStatus.set(normalizedName, folder.id);
    }
  }
  let nextFolderSortOrder = tenantFolders.length;

  const resolveImportFolderId = async (status: unknown): Promise<string | null> => {
    // A folder deliberately selected for this import always takes precedence
    // over DMP's status-based organization.
    if (folderId) return folderId;

    const normalizedStatus = normalizeFolderStatus(status);
    if (!normalizedStatus) return null;

    const existingFolderId = foldersByStatus.get(normalizedStatus);
    if (existingFolderId) return existingFolderId;
    if (!storage.createFolder) return null;

    const statusName = String(status).trim();
    const createdFolder = await storage.createFolder({
      tenantId,
      name: statusName,
      description: `Accounts with ${statusName} status`,
      color: '#3b82f6',
      isDefault: false,
      sortOrder: nextFolderSortOrder++,
    });
    if (typeof createdFolder?.id !== 'string') {
      throw new Error(`Could not create a folder for DMP status "${statusName}"`);
    }
    foldersByStatus.set(normalizedStatus, createdFolder.id);
    return createdFolder.id;
  };

  for (const dmpAccount of dmpAccounts) {
    try {
      const filenumber = (
        typeof dmpAccount.filenumber === 'string'
        || typeof dmpAccount.filenumber === 'number'
      )
        ? String(dmpAccount.filenumber).trim()
        : '';
      if (!filenumber) {
        throw new Error('DMP account is missing a valid file number');
      }
      // A DMP file number is the provider-owned identity. Chain account
      // numbers can collide and must never be used to select an update target.
      const existing = existingAccounts.find(account => account.filenumber === filenumber);
      const importFolderId = await resolveImportFolderId(dmpAccount.status);

      if (existing) {
        await storage.updateAccount(existing.id, {
          accountNumber: dmpAccount.accountNumber || existing.accountNumber,
          balanceCents: dmpAccount.balance || 0,
          originalBalanceCents: dmpAccount.originalBalance ?? existing.originalBalanceCents ?? dmpAccount.balance ?? 0,
          status: dmpAccount.status || existing.status,
          creditor: dmpAccount.creditorName || existing.creditor,
          ...(importFolderId ? { folderId: importFolderId } : {}),
          additionalData: {
            ...(existing.additionalData || {}),
            dmpSource: 'dmp',
            dmpClientName: dmpAccount.clientName || null,
            dmpLastContactDate: dmpAccount.lastContactDate || null,
            dmpNextFollowUpDate: dmpAccount.nextFollowUpDate || null,
            dmpPortfolioId: dmpAccount.portfolioId || null,
            dmpAssignedCollectorId: dmpAccount.assignedCollectorId || null,
          },
        });
        if (
          options.syncExistingConsumerContact
          && storage.updateConsumer
          && existing.consumerId
        ) {
          const consumerUpdates: Record<string, any> = {};
          if (dmpAccount.consumerEmail) consumerUpdates.email = dmpAccount.consumerEmail;
          if (dmpAccount.consumerPhone) consumerUpdates.phone = dmpAccount.consumerPhone;
          if (dmpAccount.address) consumerUpdates.address = dmpAccount.address;
          if (dmpAccount.city) consumerUpdates.city = dmpAccount.city;
          if (dmpAccount.state) consumerUpdates.state = dmpAccount.state;
          if (dmpAccount.zipCode) consumerUpdates.zipCode = dmpAccount.zipCode;
          if (dmpAccount.dateOfBirth) consumerUpdates.dateOfBirth = dmpAccount.dateOfBirth;
          if (dmpAccount.ssnLast4) consumerUpdates.ssnLast4 = dmpAccount.ssnLast4;
          if (Object.keys(consumerUpdates).length > 0) {
            try {
              await storage.updateConsumer(existing.consumerId, consumerUpdates);
            } catch (error) {
              console.error('[DMP Import] Existing consumer contact sync failed', {
                errorType: error instanceof Error ? error.name : 'UnknownError',
              });
            }
          }
        }
        results.updated++;
        continue;
      }

      if (!createMissing) {
        results.skipped++;
        continue;
      }

      let consumer: any = null;
      if (dmpAccount.consumerEmail) {
        consumer = await storage.getConsumerByEmailAndTenant(dmpAccount.consumerEmail, tenantId) || null;
      }
      if (!consumer && dmpAccount.consumerPhone) {
        consumer = await storage.getConsumerByPhoneAndTenant(dmpAccount.consumerPhone, tenantId) || null;
      }
      if (!consumer && dmpAccount.firstName && dmpAccount.lastName) {
        const nameMatches = await storage.findConsumersByNameAndTenant(
          dmpAccount.firstName,
          dmpAccount.lastName,
          tenantId
        );
        consumer = nameMatches[0] || null;
      }

      if (consumer && storage.updateConsumer) {
        const consumerUpdates: Record<string, any> = {};
        const placeholderFirstName = !consumer.firstName || consumer.firstName === 'Unknown';
        const placeholderLastName = !consumer.lastName || consumer.lastName === 'Consumer';
        if (dmpAccount.firstName && placeholderFirstName) consumerUpdates.firstName = dmpAccount.firstName;
        if (dmpAccount.lastName && placeholderLastName) consumerUpdates.lastName = dmpAccount.lastName;
        for (const [key, value] of Object.entries({
          email: dmpAccount.consumerEmail,
          phone: dmpAccount.consumerPhone,
          address: dmpAccount.address,
          city: dmpAccount.city,
          state: dmpAccount.state,
          zipCode: dmpAccount.zipCode,
          dateOfBirth: dmpAccount.dateOfBirth,
          ssnLast4: dmpAccount.ssnLast4,
        })) {
          if (value && (!consumer[key] || options.syncExistingConsumerContact)) {
            consumerUpdates[key] = value;
          }
        }
        if (Object.keys(consumerUpdates).length > 0) {
          await storage.updateConsumer(consumer.id, consumerUpdates);
        }
      } else if (!consumer) {
        consumer = await storage.createConsumer({
          tenantId,
          firstName: dmpAccount.firstName || 'Unknown',
          lastName: dmpAccount.lastName || 'Consumer',
          email: dmpAccount.consumerEmail || null,
          phone: dmpAccount.consumerPhone || null,
          address: dmpAccount.address || null,
          city: dmpAccount.city || null,
          state: dmpAccount.state || null,
          zipCode: dmpAccount.zipCode || null,
          dateOfBirth: dmpAccount.dateOfBirth || null,
          ssnLast4: dmpAccount.ssnLast4 || null,
          additionalData: dmpAccount.fullName ? { dmpFullName: dmpAccount.fullName } : {},
        });
      }

      await storage.createAccount({
        tenantId,
        consumerId: consumer.id,
        accountNumber: dmpAccount.accountNumber || filenumber,
        filenumber,
        balanceCents: dmpAccount.balance || 0,
        originalBalanceCents: dmpAccount.originalBalance ?? dmpAccount.balance ?? 0,
        creditor: dmpAccount.creditorName || 'Unknown Creditor',
        status: dmpAccount.status || 'active',
        folderId: importFolderId,
        additionalData: {
          dmpSource: 'dmp',
          dmpClientName: dmpAccount.clientName || null,
          dmpLastContactDate: dmpAccount.lastContactDate || null,
          dmpNextFollowUpDate: dmpAccount.nextFollowUpDate || null,
          dmpPortfolioId: dmpAccount.portfolioId || null,
          dmpAssignedCollectorId: dmpAccount.assignedCollectorId || null,
        },
      });
      results.imported++;
    } catch (error: any) {
      results.errors.push(`DMP account import failed: ${error.message}`);
      results.skipped++;
    }
  }

  return results;
}

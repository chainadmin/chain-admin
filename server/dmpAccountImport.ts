type ImportStorage = {
  getAccountsByTenant(tenantId: string): Promise<any[]>;
  getFoldersByTenant?(tenantId: string): Promise<any[]>;
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
      const statusFolderId = foldersByStatus.get(normalizeFolderStatus(dmpAccount.status));

      if (existing) {
        await storage.updateAccount(existing.id, {
          accountNumber: dmpAccount.accountNumber || existing.accountNumber,
          balanceCents: dmpAccount.balance || 0,
          originalBalanceCents: dmpAccount.originalBalance ?? existing.originalBalanceCents ?? dmpAccount.balance ?? 0,
          status: dmpAccount.status || existing.status,
          creditor: dmpAccount.creditorName || existing.creditor,
          ...(statusFolderId ? { folderId: statusFolderId } : {}),
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
        folderId: statusFolderId || folderId || null,
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

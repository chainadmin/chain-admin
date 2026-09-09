type ImportStorage = {
  getAccountsByTenant(tenantId: string): Promise<any[]>;
  updateAccount(id: string, updates: any): Promise<any>;
  updateConsumer?(id: string, updates: any): Promise<any>;
  getConsumerByEmailAndTenant(email: string, tenantId: string): Promise<any>;
  getConsumerByPhoneAndTenant(phone: string, tenantId: string): Promise<any>;
  findConsumersByNameAndTenant(firstName: string, lastName: string, tenantId: string): Promise<any[]>;
  createConsumer(consumer: any): Promise<any>;
  createAccount(account: any): Promise<any>;
};

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

      if (existing) {
        await storage.updateAccount(existing.id, {
          accountNumber: dmpAccount.accountNumber || existing.accountNumber,
          balanceCents: dmpAccount.balance || 0,
          originalBalanceCents: dmpAccount.originalBalance ?? existing.originalBalanceCents ?? dmpAccount.balance ?? 0,
          status: dmpAccount.status || existing.status,
          creditor: dmpAccount.creditorName || existing.creditor,
          additionalData: {
            ...(existing.additionalData || {}),
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
        folderId: folderId || null,
        additionalData: {
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
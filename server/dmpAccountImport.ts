type ImportStorage = {
  getAccountsByTenant(tenantId: string): Promise<any[]>;
  updateAccount(id: string, updates: any): Promise<any>;
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

export async function importDmpAccounts(
  storage: ImportStorage,
  tenantId: string,
  dmpAccounts: any[],
  folderId?: string | null
): Promise<DmpAccountImportResults> {
  const results: DmpAccountImportResults = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const existingAccounts = await storage.getAccountsByTenant(tenantId);

  for (const dmpAccount of dmpAccounts) {
    try {
      const existing = existingAccounts.find(account =>
        account.filenumber === dmpAccount.filenumber ||
        account.accountNumber === dmpAccount.accountNumber
      );

      if (existing) {
        await storage.updateAccount(existing.id, {
          balanceCents: dmpAccount.balance || 0,
          status: dmpAccount.status || existing.status,
          creditor: dmpAccount.creditorName || existing.creditor,
        });
        results.updated++;
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

      if (!consumer) {
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
        });
      }

      await storage.createAccount({
        tenantId,
        consumerId: consumer.id,
        accountNumber: dmpAccount.accountNumber || dmpAccount.filenumber,
        filenumber: dmpAccount.filenumber,
        balanceCents: dmpAccount.balance || 0,
        creditor: dmpAccount.creditorName || 'Unknown Creditor',
        status: dmpAccount.status || 'active',
        folderId: folderId || null,
      });
      results.imported++;
    } catch (error: any) {
      results.errors.push(`Account ${dmpAccount.filenumber}: ${error.message}`);
      results.skipped++;
    }
  }

  return results;
}
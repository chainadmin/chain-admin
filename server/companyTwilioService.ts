import twilio from 'twilio';
import { eq } from 'drizzle-orm';
import { tenants } from '@shared/schema';
import { db } from './db';

export type CompanyTwilioAccount = {
  tenantId: string;
  subaccountSid: string;
  status: string;
  reused: boolean;
};

type AccountProvisioner = {
  createCompanySubaccount(name: string): Promise<{ sid: string; authToken?: string; status?: string }>;
};

/**
 * Resolve the one Twilio subaccount belonging to a company. Existing SMS account
 * SIDs always win; creation only occurs while holding a DB advisory lock so two
 * concurrent onboarding requests cannot create duplicate subaccounts.
 */
export async function resolveCompanyTwilioAccount(
  tenantId: string,
  options: { createIfMissing?: boolean; provisioner?: AccountProvisioner } = {},
): Promise<CompanyTwilioAccount> {
  return db.transaction(async (tx) => {
    await tx.execute(`select pg_advisory_xact_lock(hashtext('${tenantId.replaceAll("'", "''")}'))`);
    const [tenant] = await tx.select({
      id: tenants.id,
      name: tenants.name,
      businessName: tenants.businessName,
      sid: tenants.twilioAccountSid,
      authToken: tenants.twilioAuthToken,
      status: tenants.twilioSubaccountStatus,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    if (!tenant) throw new Error('Organization not found');
    if (tenant.sid) {
      return { tenantId, subaccountSid: tenant.sid, status: tenant.status || 'active', reused: true };
    }
    if (!options.createIfMissing) throw new Error('Organization has no Twilio subaccount');

    const provisioner = options.provisioner || masterAccountProvisioner();
    const created = await provisioner.createCompanySubaccount(tenant.businessName || tenant.name);
    await tx.update(tenants).set({
      twilioAccountSid: created.sid,
      // Kept for the existing tenant-isolated SMS client. New Voice operations use
      // the master credential with the subaccount SID and never expose this value.
      twilioAuthToken: created.authToken || tenant.authToken,
      twilioSubaccountStatus: created.status || 'active',
    }).where(eq(tenants.id, tenantId));
    return { tenantId, subaccountSid: created.sid, status: created.status || 'active', reused: false };
  });
}

function masterAccountProvisioner(): AccountProvisioner {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio master credentials are not configured');
  const client = twilio(sid, token);
  return {
    async createCompanySubaccount(name) {
      const account = await client.api.v2010.accounts.create({ friendlyName: name });
      return { sid: account.sid, authToken: account.authToken, status: account.status };
    },
  };
}

/** Master credentials scoped to the resolved company subaccount. */
export async function getCompanyTwilioClient(tenantId: string, createIfMissing = false): Promise<twilio.Twilio> {
  const masterSid = process.env.TWILIO_ACCOUNT_SID;
  const masterToken = process.env.TWILIO_AUTH_TOKEN;
  if (!masterSid || !masterToken) throw new Error('Twilio master credentials are not configured');
  const account = await resolveCompanyTwilioAccount(tenantId, { createIfMissing });
  return twilio(masterSid, masterToken, { accountSid: account.subaccountSid });
}

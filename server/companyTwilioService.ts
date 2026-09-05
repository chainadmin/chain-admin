import twilio from 'twilio';
import { eq, sql } from 'drizzle-orm';
import { tenants } from '@shared/schema';
import { db } from './db';
import { decryptEncryptedCredentialOrNull, encryptCredential } from './credentialCrypto';

export type CompanyTwilioAccount = {
  tenantId: string;
  subaccountSid: string;
  status: string;
  reused: boolean;
};

export type AccountProvisioner = {
  createCompanySubaccount(name: string): Promise<{ sid: string; authToken?: string; status?: string }>;
  findCompanySubaccount?(name: string): Promise<{ sid: string; authToken?: string; status?: string } | null>;
};

export type CompanyTwilioVoiceConfiguration = {
  tenantId: string;
  subaccountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
};

export type CompanyVoiceConfigurationRecord = {
  apiKeySid: string | null;
  apiKeySecret: string | null;
  twimlAppSid: string | null;
};

export type ProvisionedCompanyVoiceResources = {
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
};

export type VoiceProvisioner = {
  createCompanyApiKey(subaccountSid: string, friendlyName: string): Promise<{ sid: string; secret: string }>;
  createCompanyTwimlApp(
    subaccountSid: string,
    friendlyName: string,
    voiceUrl: string,
  ): Promise<{ sid: string }>;
  findCompanyTwimlApp?(subaccountSid: string, friendlyName: string): Promise<{ sid: string } | null>;
  findCompanyApiKey?(subaccountSid: string, friendlyName: string): Promise<{ sid: string } | null>;
  deleteCompanyApiKey?(subaccountSid: string, sid: string): Promise<void>;
};

export type VoiceConfigurationStore = {
  load(tenantId: string): Promise<CompanyVoiceConfigurationRecord>;
  save(tenantId: string, configuration: CompanyVoiceConfigurationRecord): Promise<void>;
};

/**
 * These columns intentionally describe the schema contract without changing the
 * shared schema in this task. The API key secret must be encrypted at rest by
 * the deployment's secret-storage mechanism.
 */
export const COMPANY_TWILIO_VOICE_FIELDS = {
  apiKeySid: 'twilio_api_key_sid',
  apiKeySecret: 'twilio_api_key_secret',
  twimlAppSid: 'twilio_twiml_app_sid',
} as const;

/**
 * Resolve the one Twilio subaccount belonging to a company. Existing SMS account
 * SIDs always win. Initial onboarding is serialized by the durable Chiamo stage
 * claim; deterministic provider names let a retry recover a resource created
 * immediately before a process or persistence failure.
 */
export async function resolveCompanyTwilioAccount(
  tenantId: string,
  options: { createIfMissing?: boolean; provisioner?: AccountProvisioner } = {},
): Promise<CompanyTwilioAccount> {
  const [tenant] = await db.select({
      id: tenants.id,
      name: tenants.name,
      businessName: tenants.businessName,
      sid: tenants.twilioAccountSid,
      authToken: tenants.twilioAuthToken,
      status: tenants.twilioSubaccountStatus,
    }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  if (!tenant) throw new Error('Organization not found');
  if (tenant.sid) return { tenantId, subaccountSid: tenant.sid, status: tenant.status || 'active', reused: true };
  if (!options.createIfMissing) throw new Error('Organization has no Twilio subaccount');
  const provisioner = options.provisioner || masterAccountProvisioner();
  const friendlyName = `Chiamo ${tenantId} ${(tenant.businessName || tenant.name).slice(0, 35)}`.slice(0, 64);
  const created = await provisioner.findCompanySubaccount?.(friendlyName) || await provisioner.createCompanySubaccount(friendlyName);
  await db.transaction(async tx => {
    const [current] = await tx.select({ sid:tenants.twilioAccountSid }).from(tenants).where(eq(tenants.id,tenantId)).limit(1);
    if (current?.sid) return;
    await tx.update(tenants).set({
      twilioAccountSid: created.sid,
      // Kept for the existing tenant-isolated SMS client. New Voice operations use
      // the master credential with the subaccount SID and never expose this value.
      twilioAuthToken: created.authToken ? encryptCredential(created.authToken) : tenant.authToken,
      twilioSubaccountStatus: created.status || 'active',
    }).where(eq(tenants.id, tenantId));
  });
  const [persisted] = await db.select({ sid:tenants.twilioAccountSid, status:tenants.twilioSubaccountStatus }).from(tenants).where(eq(tenants.id,tenantId)).limit(1);
  return { tenantId, subaccountSid: persisted?.sid || created.sid, status:persisted?.status || created.status || "active", reused:Boolean(persisted?.sid && persisted.sid !== created.sid) };
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
    async findCompanySubaccount(name) {
      const accounts = await client.api.v2010.accounts.list({ friendlyName:name, limit:1 });
      const account = accounts[0];
      return account ? { sid:account.sid, status:account.status } : null;
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

/** Conservative removal cleanup: suspend only; numbers, recordings and ports stay intact. */
export async function suspendCompanyTwilioSubaccount(subaccountSid: string): Promise<void> {
  const masterSid = process.env.TWILIO_ACCOUNT_SID;
  const masterToken = process.env.TWILIO_AUTH_TOKEN;
  if (!masterSid || !masterToken) throw new Error("Twilio master credentials are not configured");
  try {
    await twilio(masterSid, masterToken).api.v2010.accounts(subaccountSid).update({ status: "suspended" });
  } catch (error: any) {
    // Twilio's 20404 means the resource was previously removed; both that and
    // an already-suspended account are successful terminal cleanup states.
    if (error?.code === 20404 || error?.status === 404 || /already suspended/i.test(error?.message || "")) return;
    throw error;
  }
}

export function voiceWebhookBaseUrl(): string {
  const configuredBase = process.env.TWILIO_VOICE_WEBHOOK_BASE_URL
    || process.env.APP_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
  if (!configuredBase) {
    throw new Error('TWILIO_VOICE_WEBHOOK_BASE_URL or APP_BASE_URL is required to provision a TwiML app');
  }
  return configuredBase.replace(/\/+$/, '');
}

function voiceWebhookUrl(): string {
  return `${voiceWebhookBaseUrl()}/api/voice/outbound`;
}

function masterVoiceProvisioner(): VoiceProvisioner {
  const masterSid = process.env.TWILIO_ACCOUNT_SID;
  const masterToken = process.env.TWILIO_AUTH_TOKEN;
  if (!masterSid || !masterToken) throw new Error('Twilio master credentials are not configured');

  const scopedClient = (subaccountSid: string) =>
    twilio(masterSid, masterToken, { accountSid: subaccountSid });

  return {
    async createCompanyApiKey(subaccountSid, friendlyName) {
      const key = await scopedClient(subaccountSid).newKeys.create({ friendlyName });
      return { sid: key.sid, secret: key.secret };
    },
    async createCompanyTwimlApp(subaccountSid, friendlyName, voiceUrl) {
      const app = await scopedClient(subaccountSid).applications.create({
        friendlyName,
        voiceUrl,
        voiceMethod: 'POST',
      });
      return { sid: app.sid };
    },
    async findCompanyTwimlApp(subaccountSid, friendlyName) {
      const apps = await scopedClient(subaccountSid).applications.list({ friendlyName, limit:1 });
      return apps[0] ? { sid:apps[0].sid } : null;
    },
    async findCompanyApiKey(subaccountSid, friendlyName) {
      const keys = await scopedClient(subaccountSid).keys.list({ limit:100 });
      const key = keys.find(item => item.friendlyName === friendlyName);
      return key ? { sid:key.sid } : null;
    },
    async deleteCompanyApiKey(subaccountSid, sid) {
      await scopedClient(subaccountSid).keys(sid).remove();
    },
  };
}

export async function provisionMissingCompanyVoiceResources(
  subaccountSid: string,
  companyName: string,
  current: CompanyVoiceConfigurationRecord,
  provisioner: VoiceProvisioner,
  webhookUrl: string,
  saveProgress?: (configuration: CompanyVoiceConfigurationRecord) => Promise<void>,
): Promise<ProvisionedCompanyVoiceResources> {
  let apiKeySid = current.apiKeySid;
  let apiKeySecret = current.apiKeySecret;
  let twimlAppSid = current.twimlAppSid;
  const friendlyName = `${companyName} Voice`.slice(0, 64);

  // Twilio only returns the secret when a key is created. An incomplete stored
  // key therefore has to be replaced rather than silently using a master key.
  if (!apiKeySid || !apiKeySecret) {
    const matchingKey = !apiKeySecret ? await provisioner.findCompanyApiKey?.(subaccountSid, `${friendlyName} API Key`.slice(0, 64)) : null;
    if (!apiKeySecret && (apiKeySid || matchingKey?.sid)) await provisioner.deleteCompanyApiKey?.(subaccountSid, apiKeySid || matchingKey!.sid);
    const key = await provisioner.createCompanyApiKey(subaccountSid, `${friendlyName} API Key`.slice(0, 64));
    apiKeySid = key.sid;
    apiKeySecret = key.secret;
    await saveProgress?.({ apiKeySid, apiKeySecret, twimlAppSid });
  }
  if (!twimlAppSid) {
    const app = await provisioner.findCompanyTwimlApp?.(subaccountSid, `${friendlyName} TwiML App`.slice(0, 64))
      || await provisioner.createCompanyTwimlApp(subaccountSid, `${friendlyName} TwiML App`.slice(0, 64), webhookUrl);
    twimlAppSid = app.sid;
    await saveProgress?.({ apiKeySid, apiKeySecret, twimlAppSid });
  }

  return {
    apiKeySid: apiKeySid!,
    apiKeySecret: apiKeySecret!,
    twimlAppSid: twimlAppSid!,
  };
}

/**
 * Resolve and, when necessary, provision the tenant's Voice API key and TwiML
 * app. Chiamo onboarding serializes initial work with a durable stage claim.
 * An injectable store/provisioner is supported for focused tests; custom callers
 * must provide equivalent serialization if used outside tests.
 */
export async function resolveCompanyTwilioVoiceConfiguration(
  tenantId: string,
  options: {
    provisioner?: VoiceProvisioner;
    store?: VoiceConfigurationStore;
    webhookUrl?: string;
  } = {},
): Promise<CompanyTwilioVoiceConfiguration> {
  const account = await resolveCompanyTwilioAccount(tenantId, { createIfMissing: true });
  const provisioner = options.provisioner || masterVoiceProvisioner();
  const webhookUrl = options.webhookUrl || voiceWebhookUrl();

  if (options.store) {
    const current = await options.store.load(tenantId);
    const next = await provisionMissingCompanyVoiceResources(
      account.subaccountSid,
      tenantId,
      current,
      provisioner,
      webhookUrl,
    );
    await options.store.save(tenantId, next);
    return { tenantId, subaccountSid: account.subaccountSid, ...next };
  }

  let rows: unknown;
    try {
      rows = await db.execute(sql`
        select name, business_name, twilio_api_key_sid, twilio_api_key_secret, twilio_twiml_app_sid
        from tenants
        where id = ${tenantId}
        limit 1
      `);
    } catch (error) {
      throw new Error(
        `Company Twilio Voice persistence is unavailable; expected tenant columns ${Object.values(COMPANY_TWILIO_VOICE_FIELDS).join(', ')}`,
        { cause: error },
      );
    }
  const tenant = (
    rows && typeof rows === "object" && "rows" in rows
      ? (rows as { rows?: Array<Record<string, unknown>> }).rows
      : rows as Array<Record<string, unknown>>
  )?.[0];
    if (!tenant) throw new Error('Organization not found');

  const saveProgress = async (configuration: CompanyVoiceConfigurationRecord) => {
    await db.execute(sql`
      update tenants set
        twilio_api_key_sid = ${configuration.apiKeySid},
        twilio_api_key_secret = ${configuration.apiKeySecret ? encryptCredential(configuration.apiKeySecret) : null},
        twilio_twiml_app_sid = ${configuration.twimlAppSid}
      where id = ${tenantId}
    `);
  };
  const next = await provisionMissingCompanyVoiceResources(
      account.subaccountSid,
      String(tenant.business_name || tenant.name || tenantId),
      {
        apiKeySid: tenant.twilio_api_key_sid ? String(tenant.twilio_api_key_sid) : null,
        apiKeySecret: decryptEncryptedCredentialOrNull(
          tenant.twilio_api_key_secret ? String(tenant.twilio_api_key_secret) : null,
        ),
        twimlAppSid: tenant.twilio_twiml_app_sid ? String(tenant.twilio_twiml_app_sid) : null,
      },
      provisioner,
    webhookUrl,
    saveProgress,
  );
  await db.execute(sql`
      update tenants
      set twilio_api_key_sid = ${next.apiKeySid},
          twilio_api_key_secret = ${encryptCredential(next.apiKeySecret)},
          twilio_twiml_app_sid = ${next.twimlAppSid}
      where id = ${tenantId}
  `);
  return { tenantId, subaccountSid: account.subaccountSid, ...next };
}

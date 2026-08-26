import twilio from 'twilio';
import { eq, sql } from 'drizzle-orm';
import { tenants } from '@shared/schema';
import { db } from './db';
import { decryptCredential, encryptCredential } from './credentialCrypto';

export type CompanyTwilioAccount = {
  tenantId: string;
  subaccountSid: string;
  status: string;
  reused: boolean;
};

export type AccountProvisioner = {
  createCompanySubaccount(name: string): Promise<{ sid: string; authToken?: string; status?: string }>;
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
      twilioAuthToken: created.authToken ? encryptCredential(created.authToken) : tenant.authToken,
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
  };
}

export async function provisionMissingCompanyVoiceResources(
  subaccountSid: string,
  companyName: string,
  current: CompanyVoiceConfigurationRecord,
  provisioner: VoiceProvisioner,
  webhookUrl: string,
): Promise<ProvisionedCompanyVoiceResources> {
  let apiKeySid = current.apiKeySid;
  let apiKeySecret = current.apiKeySecret;
  let twimlAppSid = current.twimlAppSid;
  const friendlyName = `${companyName} Voice`.slice(0, 64);

  // Twilio only returns the secret when a key is created. An incomplete stored
  // key therefore has to be replaced rather than silently using a master key.
  if (!apiKeySid || !apiKeySecret) {
    const key = await provisioner.createCompanyApiKey(subaccountSid, `${friendlyName} API Key`.slice(0, 64));
    apiKeySid = key.sid;
    apiKeySecret = key.secret;
  }
  if (!twimlAppSid) {
    const app = await provisioner.createCompanyTwimlApp(subaccountSid, `${friendlyName} TwiML App`.slice(0, 64), webhookUrl);
    twimlAppSid = app.sid;
  }

  return {
    apiKeySid: apiKeySid!,
    apiKeySecret: apiKeySecret!,
    twimlAppSid: twimlAppSid!,
  };
}

/**
 * Resolve and, when necessary, provision the tenant's Voice API key and TwiML
 * app. Production uses a DB advisory lock. An injectable store/provisioner is
 * supported for focused tests; custom stores must provide equivalent
 * serialization if used outside tests.
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

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`twilio-voice:${tenantId}`}))`);
    let rows: unknown;
    try {
      rows = await tx.execute(sql`
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
    const tenant = (rows as Array<Record<string, unknown>>)[0];
    if (!tenant) throw new Error('Organization not found');

    const next = await provisionMissingCompanyVoiceResources(
      account.subaccountSid,
      String(tenant.business_name || tenant.name || tenantId),
      {
        apiKeySid: tenant.twilio_api_key_sid ? String(tenant.twilio_api_key_sid) : null,
        apiKeySecret: tenant.twilio_api_key_secret && String(tenant.twilio_api_key_secret).startsWith('enc:v1:')
          ? decryptCredential(String(tenant.twilio_api_key_secret))
          : null,
        twimlAppSid: tenant.twilio_twiml_app_sid ? String(tenant.twilio_twiml_app_sid) : null,
      },
      provisioner,
      webhookUrl,
    );
    await tx.execute(sql`
      update tenants
      set twilio_api_key_sid = ${next.apiKeySid},
          twilio_api_key_secret = ${encryptCredential(next.apiKeySecret)},
          twilio_twiml_app_sid = ${next.twimlAppSid}
      where id = ${tenantId}
    `);
    return { tenantId, subaccountSid: account.subaccountSid, ...next };
  });
}

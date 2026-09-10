import { createHash } from 'node:crypto';
import { storage } from './storage';

interface DmpConfig {
  enabled: boolean;
  apiUrl: string;
  username: string;
  password: string;
}

export const REDACTED_DMP_PASSWORD = '••••••••';

export function sanitizeDmpTestOverrides(input: unknown): Partial<DmpConfig> {
  const value = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const overrides: Partial<DmpConfig> = {};

  if (typeof value.dmpEnabled === 'boolean') overrides.enabled = value.dmpEnabled;
  if (typeof value.dmpApiUrl === 'string') overrides.apiUrl = value.dmpApiUrl.trim();
  if (typeof value.dmpUsername === 'string') overrides.username = value.dmpUsername.trim();
  if (
    typeof value.dmpPassword === 'string'
    && value.dmpPassword.trim()
    && value.dmpPassword !== REDACTED_DMP_PASSWORD
  ) {
    overrides.password = value.dmpPassword.trim();
  }

  return overrides;
}

interface DmpAuthResponse {
  token?: string;
  access_token?: string;
  bearer_token?: string;
  expires_in?: number;
  error?: string;
}

interface DmpPortfolio {
  id: string;
  name: string;
  account_count?: number;
}

interface DmpAccount {
  filenumber: string;
  accountNumber?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  dateOfBirth?: string;
  ssnLast4?: string;
  consumerEmail?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  creditorName?: string;
  clientName?: string;
  balance?: number;
  originalBalance?: number;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  portfolioId?: string;
  assignedCollectorId?: string;
  accountnumber?: string;
  debtor_firstname?: string;
  debtor_lastname?: string;
  debtor_address?: string;
  debtor_city?: string;
  debtor_state?: string;
  debtor_zip?: string;
  debtor_ssn?: string;
  debtor_dob?: string;
  original_balance?: number;
  creditor?: string;
  status?: string;
  phone_home?: string;
  phone_work?: string;
  phone_cell?: string;
  email?: string;
}

export interface DmpAccountFetchResult<T = any> {
  accounts: T[];
  fetched: number;
  rejected: number;
}

interface DmpImportRequestContext {
  operation: 'portfolio-list' | 'portfolio-accounts';
  offset?: number;
}

interface DmpPaymentData {
  filenumber: string;
  paymentdate: string;
  paymentamount: number;
  paymentmethod: string;
  paymentstatus: string;
  typeofpayment: string;
  cardtype?: string;
  cardnumber?: string;
  cardexpirationmonth?: string;
  cardexpirationyear?: string;
  checkaccountnumber?: string;
  checkroutingnumber?: string;
  checkaccounttype?: string;
  transactionid?: string;
  invoice?: string;
}

export interface DmpPaymentArrangementData {
  filenumber: string;
  payorname: string;
  arrangementtype: string;
  paymentamount: number;
  nextpaymentdate: string;
  remainingpayments?: number;
  frequency?: string;
  cardtoken?: string;
  cardlast4?: string;
  cardbrand?: string;
  expirymonth?: string;
  expiryyear?: string;
}

interface DmpAttemptData {
  filenumber: string;
  attempttype: string;
  attemptdate: string;
  notes?: string;
  result?: string;
}

interface DmpNoteData {
  filenumber: string;
  collectorname: string;
  logmessage: string;
}

export function buildDmpEmailOpenNote(filenumber: string, recipient?: string): DmpNoteData {
  const normalizedRecipient = recipient?.trim();
  return {
    filenumber: filenumber.trim(),
    collectorname: 'System',
    logmessage: normalizedRecipient
      ? `Email opened by ${normalizedRecipient}`
      : 'Email opened by recipient',
  };
}

interface DmpSmsData {
  filenumber: string;
  phone_number: string;
  message: string;
  direction: 'outbound' | 'inbound';
  status?: string;
}

interface DmpEmailData {
  filenumber: string;
  email_address: string;
  subject: string;
  body: string;
  direction: 'outbound' | 'inbound';
  status?: string;
}

interface DmpCallData {
  filenumber: string;
  phone_number: string;
  direction: 'outbound' | 'inbound';
  duration?: number;
  result?: string;
  disposition?: string;
  notes?: string;
}

interface DmpDisposition {
  code: string;
  description: string;
  status_mapping?: string;
}

export class DmpImportError extends Error {
  constructor(message: string, public readonly statusCode = 502) {
    super(message);
    this.name = 'DmpImportError';
  }
}

type DmpListKind = 'portfolios' | 'accounts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DMP_ACCOUNT_PAGE_SIZE = 100;
const DMP_ERROR_MESSAGE_LIMIT = 500;

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getDmpListTotal(payload: unknown): number | undefined {
  if (!isRecord(payload)) return undefined;

  const candidates: unknown[] = [
    payload,
    payload.pagination,
    payload.meta,
    payload.data,
  ];
  if (isRecord(payload.data)) {
    candidates.push(payload.data.pagination, payload.data.meta);
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    for (const key of ['total', 'totalCount', 'total_count']) {
      const total = readNonNegativeInteger(candidate[key]);
      if (total !== undefined) return total;
    }
  }
  return undefined;
}

function getDmpRequestId(response: Response): string | undefined {
  return response.headers.get('x-request-id')
    || response.headers.get('x-correlation-id')
    || response.headers.get('cf-ray')
    || undefined;
}

function sanitizeDmpProviderMessage(rawText: string): string | undefined {
  let candidate = '';
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (isRecord(parsed)) {
      const safeField = [parsed.message, parsed.error, parsed.detail, parsed.title]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      candidate = safeField || '';
    }
  } catch {
    // Plain text may contain account data, so do not surface it.
    return undefined;
  }

  const normalized = candidate.toLowerCase();
  if (normalized.includes('portfolioid') && normalized.includes('required')) {
    return 'DMP requires a top-level portfolioId.';
  }
  if (normalized.includes('portfolio') && (
    normalized.includes('invalid')
    || normalized.includes('unknown')
    || normalized.includes('not found')
  )) {
    return 'DMP rejected the portfolio identifier.';
  }
  if (
    (normalized.includes('limit') || normalized.includes('offset'))
    && (normalized.includes('invalid') || normalized.includes('required'))
  ) {
    return 'DMP rejected the pagination parameters.';
  }

  return undefined;
}

/**
 * DMP installations return list endpoints either as a bare array or in a
 * named/data envelope. Do not treat an arbitrary truthy response as a list.
 */
export function normalizeDmpList<T>(payload: unknown, kind: DmpListKind): T[] {
  const candidate = extractDmpList(payload, kind);

  for (const item of candidate) {
    if (!isRecord(item)) {
      throw new DmpImportError(`DMP returned a malformed ${kind} list`);
    }
    const requiredValue = kind === 'portfolios' ? item.id : item.filenumber;
    if (
      (typeof requiredValue !== 'string' && typeof requiredValue !== 'number') ||
      String(requiredValue).trim() === ''
    ) {
      throw new DmpImportError(
        kind === 'portfolios'
          ? 'DMP returned a portfolio without a valid ID'
          : 'DMP returned an account without a valid file number'
      );
    }
  }

  return candidate as T[];
}

function extractDmpList(payload: unknown, kind: DmpListKind): unknown[] {
  let candidate: unknown = payload;

  if (isRecord(candidate)) {
    candidate = candidate[kind] ?? candidate.data;
  }
  if (isRecord(candidate)) {
    candidate = candidate[kind];
  }
  if (!Array.isArray(candidate)) {
    throw new DmpImportError(`DMP returned an unsupported ${kind} response format`);
  }

  return candidate;
}

function normalizeDmpFileNumber(account: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(account)) {
    if (key.replace(/[^a-z0-9]/gi, '').toLowerCase() !== 'filenumber') continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function dmpString(account: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = account[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function dmpNumber(account: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = account[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeDmpAccount(account: Record<string, unknown>, filenumber: string): DmpAccount {
  return {
    ...account,
    filenumber,
    accountNumber: dmpString(account, 'accountNumber', 'accountnumber'),
    firstName: dmpString(account, 'firstName', 'debtor_firstname'),
    lastName: dmpString(account, 'lastName', 'debtor_lastname'),
    fullName: dmpString(account, 'fullName'),
    // DMP installations do not all expose the consumer DOB under the same
    // casing/name. Prefer the v2 camelCase field, while accepting the legacy
    // and export-style names used by older installations.
    dateOfBirth: dmpString(account, 'dateOfBirth', 'date_of_birth', 'birthDate', 'dob', 'debtor_dob'),
    ssnLast4: dmpString(account, 'ssnLast4'),
    consumerEmail: dmpString(account, 'email', 'consumerEmail'),
    address: dmpString(account, 'address', 'debtor_address'),
    city: dmpString(account, 'city', 'debtor_city'),
    state: dmpString(account, 'state', 'debtor_state'),
    zipCode: dmpString(account, 'zipCode', 'debtor_zip'),
    creditorName: dmpString(account, 'originalCreditor', 'creditorName', 'creditor'),
    clientName: dmpString(account, 'clientName'),
    // Never substitute originalBalance for the live balance. These aliases
    // represent DMP's current/remaining balance across its API versions.
    balance: dmpNumber(account, 'currentBalance', 'current_balance', 'remainingBalance', 'balance'),
    originalBalance: dmpNumber(account, 'originalBalance', 'original_balance'),
    status: dmpString(account, 'status'),
    lastContactDate: dmpString(account, 'lastContactDate'),
    nextFollowUpDate: dmpString(account, 'nextFollowUpDate'),
    portfolioId: dmpString(account, 'portfolioId'),
    assignedCollectorId: dmpString(account, 'assignedCollectorId'),
  };
}

function normalizeDmpAccountPage(payload: unknown): {
  accounts: DmpAccount[];
  fetched: number;
  rejected: number;
  fingerprint: string;
} {
  const rows = extractDmpList(payload, 'accounts');
  const accounts: DmpAccount[] = [];
  let rejected = 0;

  for (const row of rows) {
    if (!isRecord(row)) {
      rejected++;
      continue;
    }
    const filenumber = normalizeDmpFileNumber(row);
    if (!filenumber) {
      rejected++;
      continue;
    }
    accounts.push(normalizeDmpAccount(row, filenumber));
  }

  return {
    accounts,
    fetched: rows.length,
    rejected,
    fingerprint: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
  };
}

export class DebtManagerProService {
  private tokenCache: Map<string, { token: string; expires: number }> = new Map();

  private async getDmpConfig(
    tenantId: string,
    overrides?: Partial<DmpConfig>
  ): Promise<DmpConfig | null> {
    try {
      const settings = await storage.getTenantSettings(tenantId);

      const enabled = overrides?.enabled ?? (settings as any)?.dmpEnabled;
      const apiUrl = (overrides?.apiUrl ?? (settings as any)?.dmpApiUrl)?.trim();
      const username = (overrides?.username ?? (settings as any)?.dmpUsername)?.trim();
      const password = (overrides?.password ?? (settings as any)?.dmpPassword)?.trim();

      if (!enabled || !apiUrl || !username || !password) {
        return null;
      }

      return {
        enabled,
        apiUrl: apiUrl.replace(/\/$/, ''),
        username,
        password,
      };
    } catch (error) {
      console.error('Error getting DMP config:', error);
      return null;
    }
  }

  private async authenticate(config: DmpConfig): Promise<string | null> {
    const cacheKey = `${config.username}:${config.apiUrl}`;
    const cached = this.tokenCache.get(cacheKey);
    
    if (cached && Date.now() < cached.expires) {
      return cached.token;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/v2/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
        }),
      });

      if (!response.ok) {
        console.error(`DMP auth failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: DmpAuthResponse = await response.json();
      const token = data.token || data.access_token || data.bearer_token;
      
      if (!token) {
        console.error('DMP auth response was missing a token');
        return null;
      }

      // Cache token for 55 minutes (assuming 1 hour expiry)
      const expiresIn = data.expires_in || 3300;
      this.tokenCache.set(cacheKey, {
        token,
        expires: Date.now() + (expiresIn * 1000),
      });

      return token;
    } catch (error) {
      console.error('DMP authentication error:', error);
      return null;
    }
  }

  private async makeRequest<T>(
    config: DmpConfig,
    method: string,
    endpoint: string,
    body?: any
  ): Promise<T | null> {
    const token = await this.authenticate(config);
    if (!token) {
      console.error('Failed to get DMP auth token');
      return null;
    }

    try {
      const url = `${config.apiUrl}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`DMP API error: ${response.status} ${response.statusText}`, errorText);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`DMP API request failed: ${method} ${endpoint}`, error);
      return null;
    }
  }

  private async makeImportRequest(
    config: DmpConfig,
    method: string,
    endpoint: string,
    body?: unknown,
    context?: DmpImportRequestContext,
  ): Promise<unknown> {
    const cacheKey = `${config.username}:${config.apiUrl}`;
    const cached = this.tokenCache.get(cacheKey);
    let token = cached && Date.now() < cached.expires ? cached.token : undefined;

    if (!token) {
      let authResponse: Response;
      try {
        authResponse = await fetch(`${config.apiUrl}/api/v2/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: config.username,
            password: config.password,
          }),
        });
      } catch {
        throw new DmpImportError('Unable to reach DMP authentication. Check the saved API URL and network connection.');
      }
      if (!authResponse.ok) {
        console.error('DMP import authentication rejected', {
          operation: context?.operation || 'unknown',
          status: authResponse.status,
          statusText: authResponse.statusText,
          requestId: getDmpRequestId(authResponse),
        });
        throw new DmpImportError(
          `DMP authentication failed (HTTP ${authResponse.status}). Check the saved username and password.`,
          authResponse.status === 403 ? 403 : 401
        );
      }

      let authData: DmpAuthResponse;
      try {
        authData = await authResponse.json() as DmpAuthResponse;
      } catch {
        throw new DmpImportError('DMP authentication returned an invalid JSON response');
      }
      token = authData.token || authData.access_token || authData.bearer_token;
      if (!token) {
        throw new DmpImportError('DMP authentication response did not include an access token', 401);
      }
      this.tokenCache.set(cacheKey, {
        token,
        expires: Date.now() + ((authData.expires_in || 3300) * 1000),
      });
    }

    let response: Response;
    try {
      response = await fetch(`${config.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body !== undefined && (method === 'POST' || method === 'PUT')
          ? JSON.stringify(body)
          : undefined,
      });
    } catch {
      console.error('DMP import provider request failed', {
        operation: context?.operation || 'unknown',
        endpoint,
        method,
        offset: context?.offset,
      });
      throw new DmpImportError('Unable to reach DMP. Check the saved API URL and network connection.');
    }

    if (!response.ok) {
      const providerMessage = sanitizeDmpProviderMessage(await response.text());
      const requestId = getDmpRequestId(response);
      const permissionHint = response.status === 401 || response.status === 403
        ? ' Authentication or permission was denied.'
        : '';
      const validationHint = response.status === 400
        ? ` DMP rejected the ${context?.operation === 'portfolio-accounts' ? 'portfolio account' : 'import'} request.${providerMessage ? ` ${providerMessage}` : ''}`
        : '';
      console.error('DMP import request rejected', {
        operation: context?.operation || 'unknown',
        endpoint,
        method,
        offset: context?.offset,
        status: response.status,
        statusText: response.statusText,
        requestId,
        providerMessage,
      });
      throw new DmpImportError(
        `DMP request failed (HTTP ${response.status}).${permissionHint}${validationHint}`,
        response.status === 401 || response.status === 403 ? response.status : 502
      );
    }

    try {
      return await response.json();
    } catch {
      throw new DmpImportError('DMP returned an invalid JSON response');
    }
  }

  private async fetchPortfolioAccountPages(
    config: DmpConfig,
    portfolioId: string,
  ): Promise<DmpAccountFetchResult<DmpAccount>> {
    const accountsByFileNumber = new Map<string, DmpAccount>();
    const seenPageFingerprints = new Set<string>();
    let fetched = 0;
    let rejected = 0;
    let offset = 0;

    while (true) {
      const payload = await this.makeImportRequest(
        config,
        'POST',
        '/api/v2/get_accounts_in_portfolio',
        {
          portfolioId,
          limit: DMP_ACCOUNT_PAGE_SIZE,
          offset,
        },
        {
          operation: 'portfolio-accounts',
          offset,
        },
      );
      const page = normalizeDmpAccountPage(payload);
      const total = getDmpListTotal(payload);
      let newAccountCount = 0;

      if (page.fetched > 0 && seenPageFingerprints.has(page.fingerprint)) {
        throw new DmpImportError(
          `DMP repeated an account page at offset ${offset}; import stopped to prevent an infinite loop`,
        );
      }
      seenPageFingerprints.add(page.fingerprint);
      fetched += page.fetched;
      rejected += page.rejected;

      for (const account of page.accounts) {
        const key = String(account.filenumber).trim();
        if (!accountsByFileNumber.has(key)) {
          accountsByFileNumber.set(key, account);
          newAccountCount++;
        }
      }

      if (page.accounts.length > 0 && newAccountCount === 0) {
        throw new DmpImportError(
          `DMP repeated an account page at offset ${offset}; import stopped to prevent an infinite loop`,
        );
      }

      const consumed = offset + page.fetched;
      if (total !== undefined && consumed >= total) {
        break;
      }
      if (page.fetched < DMP_ACCOUNT_PAGE_SIZE) {
        if (total !== undefined && consumed < total) {
          throw new DmpImportError(
            `DMP ended pagination early: received ${consumed} of ${total} accounts`,
          );
        }
        break;
      }

      offset = consumed;
    }

    if (rejected > 0) {
      console.warn('[DMP Import] Rejected provider account rows', {
        operation: 'portfolio-accounts',
        fetched,
        rejected,
      });
    }

    return {
      accounts: Array.from(accountsByFileNumber.values()),
      fetched,
      rejected,
    };
  }

  async testConnection(
    tenantId: string,
    overrides?: Partial<DmpConfig>
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getDmpConfig(tenantId, overrides);
    
    if (!config) {
      return { success: false, message: 'DMP not configured or disabled' };
    }

    try {
      const payload = await this.makeImportRequest(
        config,
        'GET',
        '/api/v2/getportfoliolist',
        undefined,
        { operation: 'portfolio-list' },
      );
      normalizeDmpList<DmpPortfolio>(payload, 'portfolios');
      return { success: true, message: 'Successfully connected to Debt Manager Pro' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof DmpImportError
          ? error.message
          : 'Failed to validate the DMP connection',
      };
    }
  }

  async getPortfolios(tenantId: string): Promise<DmpPortfolio[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpPortfolio[]>(config, 'GET', '/api/v2/getportfoliolist');
  }

  async getAccountsInPortfolio(tenantId: string, portfolioId: string): Promise<DmpAccount[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    const result = await this.fetchPortfolioAccountPages(config, portfolioId);
    if (result.fetched > 0 && result.accounts.length === 0) {
      throw new DmpImportError('DMP returned accounts, but none had a valid file number');
    }
    return result.accounts;
  }

  async getAccount(tenantId: string, filenumber: string): Promise<DmpAccount | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpAccount>(config, 'GET', `/api/v2/getaccount/${encodeURIComponent(filenumber)}`);
  }

  async getAccountBySSN(tenantId: string, ssn: string): Promise<DmpAccount | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpAccount>(config, 'GET', `/api/v2/getaccountbysocial/${encodeURIComponent(ssn)}`);
  }

  async searchByPhone(tenantId: string, phone: string): Promise<DmpAccount[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpAccount[]>(config, 'POST', '/api/v2/searchbyphone', {
      phone_number: phone,
    });
  }

  // Search DMP for accounts matching the given email (case-insensitive).
  // Returns null if DMP is not enabled for the tenant. Uses the existing
  // getAccounts() helper so we benefit from its portfolio iteration logic.
  async searchByEmail(tenantId: string, email: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) return [];

    const allAccounts = await this.getAccounts(tenantId);
    return allAccounts.filter(acc => {
      const accEmail = (acc.consumerEmail || '').trim().toLowerCase();
      return accEmail === normalizedEmail;
    });
  }

  async getPhones(tenantId: string, filenumber: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', `/api/v2/getphones/${encodeURIComponent(filenumber)}`);
  }

  async getEmails(tenantId: string, filenumber: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', `/api/v2/getemails/${encodeURIComponent(filenumber)}`);
  }

  async getNotes(tenantId: string, filenumber: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', `/api/v2/getnotes/${encodeURIComponent(filenumber)}`);
  }

  async getPayments(tenantId: string, filenumber: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', `/api/v2/getpayments/${encodeURIComponent(filenumber)}`);
  }

  async getAttempts(tenantId: string, filenumber: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', `/api/v2/getattempts/${encodeURIComponent(filenumber)}`);
  }

  async insertPayment(tenantId: string, payment: DmpPaymentData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping payment sync - DMP not enabled');
      return null;
    }

    console.log(`[DMP] Posting payment to DMP for filenumber: ${payment.filenumber}`);
    return await this.makeRequest<any>(config, 'POST', '/api/v2/insert_payments_external', payment);
  }

  async insertPaymentArrangement(tenantId: string, arrangement: DmpPaymentArrangementData): Promise<boolean> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return false;

    const paymentdata: Array<{ paymentamount: string; paymentdate: string }> = [];
    const count = Math.max(1, arrangement.remainingpayments || 1);
    const currentDate = new Date(`${arrangement.nextpaymentdate}T12:00:00Z`);
    for (let index = 0; index < count; index++) {
      paymentdata.push({
        paymentamount: arrangement.paymentamount.toFixed(2),
        paymentdate: currentDate.toISOString().slice(0, 10),
      });
      if (arrangement.frequency === 'weekly') currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      else if (arrangement.frequency === 'biweekly') currentDate.setUTCDate(currentDate.getUTCDate() + 14);
      else currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
    }

    const result = await this.makeRequest<any>(config, 'POST', '/api/v2/insert_payplan_external', {
      filenumber: arrangement.filenumber,
      paymentdate: arrangement.nextpaymentdate,
      payorname: arrangement.payorname || 'Consumer',
      paymentmethod: 'CREDIT CARD',
      paymentstatus: 'PENDING',
      typeofpayment: 'Online',
      cardtype: arrangement.cardbrand || 'Unknown',
      cardnumber: arrangement.cardtoken || (arrangement.cardlast4 ? `XXXX-XXXX-XXXX-${arrangement.cardlast4}` : ''),
      cardexpirationmonth: arrangement.expirymonth || '',
      cardexpirationyear: arrangement.expiryyear || '',
      paymentamount: arrangement.paymentamount.toFixed(2),
      invoice: `CHAIN-ARR-${Date.now()}`,
      arrangementtype: arrangement.arrangementtype,
      paymentdata,
    });

    return result?.state === 'SUCCESS' || result?.success === true;
  }

  async insertAttempt(tenantId: string, attempt: DmpAttemptData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping attempt sync - DMP not enabled');
      return null;
    }

    return await this.makeRequest<any>(config, 'POST', '/api/v2/insertattempt', attempt);
  }

  async insertNote(tenantId: string, note: DmpNoteData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping note sync - DMP not enabled');
      return null;
    }

    return await this.makeRequest<any>(config, 'POST', '/api/v2/InsertNoteline', note);
  }

  async insertPhone(tenantId: string, filenumber: string, phone: string, phoneType: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'POST', '/api/v2/insertphone', {
      filenumber,
      phone_number: phone,
      phone_type: phoneType,
    });
  }

  async updatePhone(tenantId: string, data: any): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'PUT', '/api/v2/updatephone', data);
  }

  async updateDebtor(tenantId: string, filenumber: string, updates: any): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'PUT', '/api/v2/updatedbase', {
      filenumber,
      ...updates,
    });
  }

  async updatePermissions(tenantId: string, filenumber: string, permissions: any): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'PUT', '/api/v2/updatepermissions', {
      filenumber,
      ...permissions,
    });
  }

  async sendText(tenantId: string, smsData: DmpSmsData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping SMS sync - DMP not enabled');
      return null;
    }

    return await this.makeRequest<any>(config, 'POST', '/api/v2/send_text', smsData);
  }

  async sendEmail(tenantId: string, emailData: DmpEmailData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping email sync - DMP not enabled');
      return null;
    }

    return await this.makeRequest<any>(config, 'POST', '/api/v2/send_email_c2c', emailData);
  }

  async createCallback(tenantId: string, filenumber: string, scheduledTime: string, notes?: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'POST', '/api/v2/createCallback', {
      filenumber,
      scheduled_time: scheduledTime,
      notes,
    });
  }

  // Softphone/VoIP integration methods
  async getSoftphoneQueue(tenantId: string): Promise<any[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any[]>(config, 'GET', '/api/v2/softphone/queue');
  }

  async initiateCall(tenantId: string, filenumber: string, phoneNumber: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'POST', '/api/v2/softphone/initiate', {
      filenumber,
      phone_number: phoneNumber,
    });
  }

  async logCallResult(tenantId: string, callData: DmpCallData): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      console.log('[DMP] Skipping call result sync - DMP not enabled');
      return null;
    }

    return await this.makeRequest<any>(config, 'POST', '/api/v2/softphone/result', callData);
  }

  async setDisposition(tenantId: string, filenumber: string, dispositionCode: string, notes?: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'POST', '/api/v2/softphone/disposition', {
      filenumber,
      disposition_code: dispositionCode,
      notes,
    });
  }

  async getDispositions(tenantId: string): Promise<DmpDisposition[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpDisposition[]>(config, 'GET', '/api/v2/softphone/dispositions');
  }

  async getScreenPopData(tenantId: string, filenumber: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'GET', `/api/v2/softphone/account/${encodeURIComponent(filenumber)}`);
  }

  async lookupInboundCaller(tenantId: string, phoneNumber: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'POST', '/api/v2/softphone/inbound', {
      phone_number: phoneNumber,
    });
  }

  async markPhoneBad(tenantId: string, filenumber: string, phoneNumber: string, reason?: string): Promise<any | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<any>(config, 'PUT', '/api/v2/softphone/markphone', {
      filenumber,
      phone_number: phoneNumber,
      status: 'bad',
      reason,
    });
  }

  // Check if DMP is enabled for a tenant
  async isEnabled(tenantId: string): Promise<boolean> {
    const config = await this.getDmpConfig(tenantId);
    return config !== null && config.enabled;
  }

  // Wrapper method for posting payments (used by Chain's payment flow)
  async postPayment(tenantId: string, data: {
    filenumber: string;
    amount: number;
    date: Date;
    type: string;
    reference: string;
    status: string;
  }): Promise<any> {
    const paymentData: DmpPaymentData = {
      filenumber: data.filenumber,
      paymentdate: data.date.toISOString().split('T')[0],
      paymentamount: data.amount,
      paymentmethod: 'credit_card',
      paymentstatus: data.status === 'completed' ? 'POSTED' : 'DECLINED',
      typeofpayment: data.type === 'payment' ? 'REGULAR' : data.type.toUpperCase(),
      transactionid: data.reference,
    };
    return this.insertPayment(tenantId, paymentData);
  }

  // Wrapper method for posting notes (used by Chain's notes flow)
  async postNote(tenantId: string, filenumber: string, data: {
    content: string;
    type?: string;
    createdBy?: string;
  }): Promise<any> {
    const noteData: DmpNoteData = {
      filenumber,
      collectorname: data.createdBy || 'Chain',
      logmessage: data.content,
    };
    return this.insertNote(tenantId, noteData);
  }

  // Wrapper method for logging communications (SMS/Email)
  async logCommunication(tenantId: string, filenumber: string, data: {
    type: 'sms' | 'email';
    content: string;
    direction: 'outbound' | 'inbound';
    status?: string;
  }): Promise<any> {
    if (data.type === 'sms') {
      // Create an attempt record for SMS
      const attemptData: DmpAttemptData = {
        filenumber,
        attempttype: 'TEXT',
        attemptdate: new Date().toISOString().split('T')[0],
        notes: data.content.length > 200 ? data.content.substring(0, 200) + '...' : data.content,
        result: data.status === 'sent' ? 'SENT' : data.status?.toUpperCase() || 'SENT',
      };
      return this.insertAttempt(tenantId, attemptData);
    } else {
      // Create an attempt record for Email
      const attemptData: DmpAttemptData = {
        filenumber,
        attempttype: 'EMAIL',
        attemptdate: new Date().toISOString().split('T')[0],
        notes: data.content,
        result: data.status === 'sent' ? 'SENT' : data.status?.toUpperCase() || 'SENT',
      };
      return this.insertAttempt(tenantId, attemptData);
    }
  }

  // Fetch accounts from DMP (for import)
  async getAccountsWithStats(
    tenantId: string,
    options?: { portfolioId?: string },
  ): Promise<DmpAccountFetchResult> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) {
      throw new DmpImportError('DMP is not enabled or the saved configuration is incomplete', 400);
    }

    const requestedPortfolioId = options?.portfolioId;
    if (requestedPortfolioId !== undefined && (
      typeof requestedPortfolioId !== 'string' || requestedPortfolioId.trim() === ''
    )) {
      throw new DmpImportError('A valid DMP portfolio ID is required', 400);
    }

    const mapAccount = (acc: DmpAccount) => ({
      filenumber: String(acc.filenumber).trim(),
      accountNumber: acc.accountNumber || (acc.accountnumber ? String(acc.accountnumber).trim() : String(acc.filenumber).trim()),
      firstName: acc.firstName || acc.debtor_firstname,
      lastName: acc.lastName || acc.debtor_lastname,
      fullName: acc.fullName,
      dateOfBirth: acc.dateOfBirth || acc.debtor_dob,
      ssnLast4: acc.ssnLast4,
      address: acc.address || acc.debtor_address,
      city: acc.city || acc.debtor_city,
      state: acc.state || acc.debtor_state,
      zipCode: acc.zipCode || acc.debtor_zip,
      consumerEmail: acc.consumerEmail || acc.email,
      consumerPhone: acc.phone_cell || acc.phone_home || acc.phone_work,
      // DMP returns integer cents. Persist the provider value directly.
      balance: acc.balance !== undefined ? Math.max(0, Math.round(acc.balance)) : 0,
      originalBalance: acc.originalBalance !== undefined
        ? Math.max(0, Math.round(acc.originalBalance))
        : acc.original_balance !== undefined
          ? Math.max(0, Math.round(acc.original_balance))
          : undefined,
      creditorName: acc.creditorName || acc.creditor,
      clientName: acc.clientName,
      status: acc.status || 'active',
      lastContactDate: acc.lastContactDate,
      nextFollowUpDate: acc.nextFollowUpDate,
      portfolioId: acc.portfolioId,
      assignedCollectorId: acc.assignedCollectorId,
    });

    if (requestedPortfolioId) {
      const result = await this.fetchPortfolioAccountPages(config, requestedPortfolioId.trim());
      const accounts = result.accounts.map(mapAccount);
      if (result.fetched > 0 && accounts.length === 0) {
        throw new DmpImportError('DMP returned accounts, but none had a valid file number');
      }
      return { ...result, accounts };
    }

    // If no portfolio specified, get all portfolios and then get accounts from each
    const portfolioPayload = await this.makeImportRequest(
      config,
      'GET',
      '/api/v2/getportfoliolist',
      undefined,
      { operation: 'portfolio-list' },
    );
    const portfolios = normalizeDmpList<DmpPortfolio>(portfolioPayload, 'portfolios');
    if (portfolios.length === 0) {
      return { accounts: [], fetched: 0, rejected: 0 };
    }

    const accountsByFileNumber = new Map<string, ReturnType<typeof mapAccount>>();
    let fetched = 0;
    let rejected = 0;
    for (const portfolio of portfolios) {
      const result = await this.fetchPortfolioAccountPages(config, String(portfolio.id));
      fetched += result.fetched;
      rejected += result.rejected;
      for (const account of result.accounts) {
        const mapped = mapAccount(account);
        const key = String(mapped.filenumber).trim();
        if (!accountsByFileNumber.has(key)) {
          accountsByFileNumber.set(key, mapped);
        }
      }
    }
    const accounts = Array.from(accountsByFileNumber.values());
    if (fetched > 0 && accounts.length === 0) {
      throw new DmpImportError('DMP returned accounts, but none had a valid file number');
    }
    return { accounts, fetched, rejected };
  }

  async getAccounts(tenantId: string, options?: { portfolioId?: string }): Promise<any[]> {
    return (await this.getAccountsWithStats(tenantId, options)).accounts;
  }
}

export const dmpService = new DebtManagerProService();

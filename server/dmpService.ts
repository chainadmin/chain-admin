import { storage } from './storage';

interface DmpConfig {
  enabled: boolean;
  apiUrl: string;
  username: string;
  password: string;
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
  accountnumber?: string;
  debtor_firstname?: string;
  debtor_lastname?: string;
  debtor_address?: string;
  debtor_city?: string;
  debtor_state?: string;
  debtor_zip?: string;
  debtor_ssn?: string;
  debtor_dob?: string;
  balance?: number;
  original_balance?: number;
  creditor?: string;
  status?: string;
  phone_home?: string;
  phone_work?: string;
  phone_cell?: string;
  email?: string;
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

class DebtManagerProService {
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
        console.error('DMP auth response missing token:', data);
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

  async testConnection(
    tenantId: string,
    overrides?: Partial<DmpConfig>
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getDmpConfig(tenantId, overrides);
    
    if (!config) {
      return { success: false, message: 'DMP not configured or disabled' };
    }

    const token = await this.authenticate(config);
    
    if (!token) {
      return { success: false, message: 'Failed to authenticate with DMP' };
    }

    // Try to fetch portfolios as a connection test
    const portfolios = await this.makeRequest<any>(config, 'GET', '/api/v2/getportfoliolist');
    
    if (portfolios) {
      return { success: true, message: 'Successfully connected to Debt Manager Pro' };
    }

    return { success: false, message: 'Connection successful but failed to fetch data' };
  }

  async getPortfolios(tenantId: string): Promise<DmpPortfolio[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpPortfolio[]>(config, 'GET', '/api/v2/getportfoliolist');
  }

  async getAccountsInPortfolio(tenantId: string, portfolioId: string): Promise<DmpAccount[] | null> {
    const config = await this.getDmpConfig(tenantId);
    if (!config) return null;

    return await this.makeRequest<DmpAccount[]>(config, 'POST', '/api/v2/get_accounts_in_portfolio', {
      portfolio_id: portfolioId,
    });
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
}

export const dmpService = new DebtManagerProService();

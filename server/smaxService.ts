import { storage } from './storage';

interface SmaxAuthResponse {
  access_token?: string;  // Flat format (test env)
  state?: string;          // Nested format (Railway)
  result?: {
    access_token: string;
  };
}

interface SmaxConfig {
  enabled: boolean;
  apiKey: string;
  pin: string;
  baseUrl: string;
}

interface SmaxPaymentData {
  filenumber: string;
  paymentdate: string;
  payorname: string;
  paymentmethod: string;
  paymentstatus: string;
  typeofpayment: string;
  checkaccountnumber: string;
  checkroutingnumber: string;
  cardtype: string;
  cardnumber: string;
  threedigitnumber: string;
  cardexpirationmonth: string;
  cardexpirationyear: string;
  cardexpirationdate: string;
  paymentamount: string;
  checkaccounttype: string;
  acceptedfees: string;
  printed: string;
  invoice: string;
}

interface SmaxAttemptData {
  filenumber: string;
  attempttype: string;
  attemptdate: string;
  notes?: string;
  result?: string;
}

interface SmaxNoteData {
  filenumber: string;
  collectorname: string;
  logmessage: string;
}

class SmaxService {
  private tokenCache: Map<string, { token: string; expires: number }> = new Map();

  private async getSmaxConfig(
    tenantId: string,
    overrides?: Partial<SmaxConfig>
  ): Promise<SmaxConfig | null> {
    try {
      const settings = await storage.getTenantSettings(tenantId);

      const enabled = overrides?.enabled ?? settings?.smaxEnabled;
      const apiKey = (overrides?.apiKey ?? settings?.smaxApiKey)?.trim();
      const pin = (overrides?.pin ?? settings?.smaxPin)?.trim();
      const rawBaseUrl = overrides?.baseUrl ?? settings?.smaxBaseUrl;
      const baseUrl = (rawBaseUrl?.trim() || 'https://api.smaxcollectionsoftware.com:8000')
        .replace(/\/$/, '');

      if (!enabled || !apiKey || !pin) {
        return null;
      }

      return {
        enabled,
        apiKey,
        pin,
        baseUrl,
      };
    } catch (error) {
      console.error('Error getting SMAX config:', error);
      return null;
    }
  }

  private async authenticate(config: SmaxConfig): Promise<string | null> {
    const cacheKey = `${config.apiKey}:${config.pin}:${config.baseUrl}`;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return cached.token;
    }

    try {
      const payload = {
        apikey: config.apiKey,
        pin: config.pin,
      };
      
      console.log('🔐 SMAX login attempt:', {
        baseUrl: config.baseUrl,
        apiKeyLength: config.apiKey.length,
        pinLength: config.pin.length,
        apiKeyFirst3: config.apiKey.substring(0, 3),
        pinFirst3: config.pin.substring(0, 3),
        hasWhitespace: {
          apiKey: config.apiKey !== config.apiKey.trim(),
          pin: config.pin !== config.pin.trim(),
        }
      });
      
      const response = await fetch(`${config.baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error('SMAX authentication failed:', response.status);
        return null;
      }

      const data: SmaxAuthResponse = await response.json();
      
      console.log('🔍 SMAX auth response:', JSON.stringify(data, null, 2));

      // Railway format check: result can be error array [{error: '...'}, 401]
      if (Array.isArray(data.result) && data.result.length > 0 && data.result[0]?.error) {
        console.error('❌ SMAX authentication failed (Railway format):', data.result[0].error);
        return null;
      }

      // Support multiple response formats for the bearer token
      let token: string | null = null;
      
      // Format 1: Railway success - token is directly in result as string
      if (data.state === 'SUCCESS' && typeof data.result === 'string') {
        token = data.result;
        console.log('✅ Token found in result (Railway format)');
      }
      // Format 2: Nested with access_token in result object
      else if (data.result?.access_token) {
        token = data.result.access_token;
        console.log('✅ Token found in result.access_token');
      } 
      // Format 3: Flat with access_token at root (Replit dev format)
      else if (data.access_token) {
        token = data.access_token;
        console.log('✅ Token found at root.access_token (Replit format)');
      }

      if (!token) {
        console.error('❌ SMAX authentication unsuccessful - no token found:', data);
        return null;
      }

      const expires = Date.now() + (14 * 60 * 1000);

      this.tokenCache.set(cacheKey, { token, expires });

      return token;
    } catch (error) {
      console.error('Error authenticating with SMAX:', error);
      return null;
    }
  }

  private async makeSmaxRequest(
    config: SmaxConfig,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: any
  ): Promise<any> {
    const token = await this.authenticate(config);

    if (!token) {
      throw new Error('Failed to authenticate with SMAX');
    }

    const url = `${config.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      // Get the error response body for better debugging
      let errorBody = '';
      try {
        errorBody = await response.text();
        console.error('❌ SMAX API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          method,
          body: body ? JSON.stringify(body) : 'none',
          errorResponse: errorBody
        });
      } catch (e) {
        console.error('❌ SMAX API Error (no body):', response.status);
      }
      throw new Error(`SMAX API error: ${response.status} - ${errorBody || response.statusText}`);
    }

    return response.json();
  }

  // Helper to convert simplified payment data to SMAX format
  createSmaxPaymentData(params: {
    filenumber: string;
    paymentamount: number;
    paymentdate?: string;
    payorname?: string;
    paymentmethod?: string;
    cardtype?: string;
    cardLast4?: string;
    transactionid?: string;
  }): SmaxPaymentData {
    const today = new Date().toISOString().split('T')[0];
    
    const trimmedFileNumber = params.filenumber.trim();

    return {
      filenumber: trimmedFileNumber,
      paymentdate: params.paymentdate || today,
      payorname: params.payorname || 'Consumer',
      paymentmethod: (params.paymentmethod || 'CREDIT CARD').toUpperCase(),
      paymentstatus: 'COMPLETED',
      typeofpayment: 'Online',
      // For security, we don't send actual card/bank data - use placeholders
      checkaccountnumber: '',
      checkroutingnumber: '',
      cardtype: params.cardtype || 'Unknown',
      cardnumber: params.cardLast4 ? `XXXX-XXXX-XXXX-${params.cardLast4}` : 'XXXX-XXXX-XXXX-XXXX',
      threedigitnumber: 'XXX',
      cardexpirationmonth: '',
      cardexpirationyear: '',
      cardexpirationdate: '',
      paymentamount: params.paymentamount.toFixed(2),
      checkaccounttype: '',
      acceptedfees: '0',
      printed: 'false',
      invoice: params.transactionid || `INV${Date.now()}`,
    };
  }

  async insertPayment(tenantId: string, paymentData: SmaxPaymentData): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        console.log('ℹ️ SMAX not configured or not enabled for this tenant - skipping payment sync');
        return false;
      }

      console.log('📤 Sending payment to SMAX:', {
        filenumber: paymentData.filenumber,
        amount: paymentData.paymentamount,
        method: paymentData.paymentmethod,
        baseUrl: config.baseUrl
      });

      const result = await this.makeSmaxRequest(
        config,
        '/insert_payments_external',
        'POST',
        paymentData
      );

      console.log('✅ SMAX payment inserted successfully:', result);
      return result.state === 'SUCCESS';
    } catch (error) {
      console.error('❌ Error inserting payment to SMAX:', error);
      return false;
    }
  }

  async insertAttempt(tenantId: string, attemptData: SmaxAttemptData): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        return false;
      }

      const result = await this.makeSmaxRequest(
        config,
        '/insertattempt',
        'POST',
        attemptData
      );

      console.log('SMAX attempt inserted:', result);
      return result.state === 'SUCCESS';
    } catch (error) {
      console.error('Error inserting attempt to SMAX:', error);
      return false;
    }
  }

  async insertNote(tenantId: string, noteData: SmaxNoteData): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        return false;
      }

      const payload = {
        ...noteData,
        filenumber: noteData.filenumber.trim(),
      };

      console.log('📤 Sending SMAX note:', payload);

      const result = await this.makeSmaxRequest(
        config,
        '/InsertNoteline',
        'POST',
        payload
      );

      console.log('SMAX note inserted:', result);
      return result.state === 'SUCCESS';
    } catch (error) {
      console.error('Error inserting note to SMAX:', error);
      return false;
    }
  }

  async getAccount(tenantId: string, fileNumber: string): Promise<any | null> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        return null;
      }

      const result = await this.makeSmaxRequest(
        config,
        `/getaccountdetails/${fileNumber}`,
        'GET'
      );

      if (result.state === 'SUCCESS') {
        return result.result;
      }

      return null;
    } catch (error) {
      console.error('Error getting account from SMAX:', error);
      return null;
    }
  }

  async getPayments(tenantId: string, fileNumber: string): Promise<any[] | null> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        return null;
      }

      const result = await this.makeSmaxRequest(
        config,
        `/getpayments/${fileNumber}`,
        'GET'
      );

      if (result.state === 'SUCCESS') {
        return result.result || [];
      }

      return null;
    } catch (error) {
      console.error('Error getting payments from SMAX:', error);
      return null;
    }
  }

  async testConnection(
    tenantId: string,
    overrides?: Partial<SmaxConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (overrides?.enabled === false) {
        return {
          success: false,
          error: 'Enable the SMAX integration before testing the connection.',
        };
      }

      const config = await this.getSmaxConfig(tenantId, overrides);

      console.log('🔍 SMAX Test - Config found:', {
        hasConfig: !!config,
        enabled: config?.enabled,
        hasApiKey: !!config?.apiKey,
        apiKeyLength: config?.apiKey?.length || 0,
        hasPin: !!config?.pin,
        pinLength: config?.pin?.length || 0,
        baseUrl: config?.baseUrl
      });

      if (!config) {
        if (overrides) {
          return {
            success: false,
            error: 'Missing SMAX configuration. Please ensure API key, PIN, and enable toggle are provided.',
          };
        }
        return {
          success: false,
          error: 'SMAX is not enabled or configured for this tenant',
        };
      }

      console.log('🔗 Testing SMAX connection to:', config.baseUrl);

      const token = await this.authenticate(config);

      if (!token) {
        console.error('❌ SMAX authentication failed');
        return {
          success: false,
          error: 'Authentication failed. Please check your API key and PIN.',
        };
      }

      console.log('✅ SMAX connection successful, token received');
      return { success: true };
    } catch (error: any) {
      console.error('❌ SMAX test connection error:', error);
      return {
        success: false,
        error: error.message || 'Connection test failed',
      };
    }
  }
}

export const smaxService = new SmaxService();

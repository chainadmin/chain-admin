import { storage } from './storage';

interface SmaxAuthResponse {
  result: {
    access_token: string;
  };
  state: string;
}

interface SmaxConfig {
  enabled: boolean;
  apiKey: string;
  pin: string;
  baseUrl: string;
}

interface SmaxPaymentData {
  filenumber: string;
  paymentamount: number;
  paymentdate: string;
  paymentmethod: string;
  transactionid?: string;
  status: string;
  notes?: string;
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
  note: string;
  notedate: string;
  notetype?: string;
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
      const response = await fetch(`${config.baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apikey: config.apiKey,
          pin: config.pin,
        }),
      });

      if (!response.ok) {
        console.error('SMAX authentication failed:', response.status);
        return null;
      }

      const data: SmaxAuthResponse = await response.json();

      if (data.state !== 'SUCCESS' || !data.result?.access_token) {
        console.error('SMAX authentication unsuccessful:', data);
        return null;
      }

      const token = data.result.access_token;
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
      throw new Error(`SMAX API error: ${response.status}`);
    }

    return response.json();
  }

  async insertPayment(tenantId: string, paymentData: SmaxPaymentData): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        return false;
      }

      const result = await this.makeSmaxRequest(
        config,
        '/insert_payments_external',
        'POST',
        paymentData
      );

      console.log('SMAX payment inserted:', result);
      return result.state === 'SUCCESS';
    } catch (error) {
      console.error('Error inserting payment to SMAX:', error);
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

      const result = await this.makeSmaxRequest(
        config,
        '/InsertNoteline',
        'POST',
        noteData
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
        `/getaccount/${fileNumber}`,
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

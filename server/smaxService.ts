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
  // Card token fields for saved payment methods
  cardtoken?: string; // USAePay cardref token
  cardholdername?: string;
  billingzip?: string;
  transactionid?: string;
  cardLast4?: string;
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
    cardtoken?: string;
    cardholdername?: string;
    billingzip?: string;
    cardexpirationmonth?: string;
    cardexpirationyear?: string;
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
      cardexpirationmonth: params.cardexpirationmonth || '',
      cardexpirationyear: params.cardexpirationyear || '',
      cardexpirationdate: '',
      paymentamount: params.paymentamount.toFixed(2),
      checkaccounttype: '',
      acceptedfees: '0',
      printed: 'false',
      invoice: params.transactionid || `INV${Date.now()}`,
      // Include card token and billing details for SMAX to save payment method
      cardtoken: params.cardtoken,
      cardholdername: params.cardholdername,
      billingzip: params.billingzip,
      transactionid: params.transactionid,
      cardLast4: params.cardLast4,
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
        baseUrl: config.baseUrl,
        paymentData: JSON.stringify(paymentData, null, 2)
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
      console.error('Payment data that failed:', JSON.stringify(paymentData, null, 2));
      return false;
    }
  }

  async updatePayment(tenantId: string, updateData: {
    filenumber: string;
    paymentdate?: string;
    payorname?: string;
    paymentmethod?: string;
    paymentstatus?: string;
    typeofpayment?: string;
    checkaddress?: string;
    checkcity?: string;
    checkstate?: string;
    checkzip?: string;
    checkaccountnumber?: string;
    checkroutingnumber?: string;
    cardtype?: string;
    cardnumber?: string;
    threedigitnumber?: string;
    cardexpirationmonth?: string;
    cardexpirationyear?: string;
    cardexpirationdate?: string;
    checkaccounttype?: string;
    acceptedfees?: string;
    printed?: string;
    invoice?: string;
  }): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        console.log('ℹ️ SMAX not configured or not enabled for this tenant - skipping payment update');
        return false;
      }

      // Remove undefined/null fields - only send fields that are being updated
      const payload = Object.fromEntries(
        Object.entries(updateData).filter(([_, v]) => v !== undefined && v !== null && v !== '')
      );

      console.log('📤 Updating payment in SMAX:', {
        filenumber: updateData.filenumber,
        fieldsToUpdate: Object.keys(payload).filter(k => k !== 'filenumber'),
        baseUrl: config.baseUrl
      });

      const result = await this.makeSmaxRequest(
        config,
        '/update_payment_external',
        'POST',
        payload
      );

      console.log('✅ SMAX payment updated successfully:', result);
      return result.state === 'SUCCESS';
    } catch (error) {
      console.error('❌ Error updating payment in SMAX:', error);
      console.error('Update data that failed:', JSON.stringify(updateData, null, 2));
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

  // Insert payment arrangement into SMAX
  async insertPaymentArrangement(tenantId: string, arrangementData: {
    filenumber: string;
    payorname: string;
    arrangementtype: string; // "Fixed Monthly", "Settlement", "Range", etc.
    monthlypayment: number; // Dollar amount
    startdate: string; // YYYY-MM-DD
    enddate?: string; // YYYY-MM-DD
    nextpaymentdate: string; // YYYY-MM-DD
    remainingpayments?: number;
    totalbalance: number;
    // Payment method details for SMAX to process recurring payments
    cardtoken?: string; // USAePay cardref token
    cardlast4?: string;
    cardbrand?: string;
    expirymonth?: string;
    expiryyear?: string;
    cardholdername?: string;
    billingzip?: string;
  }): Promise<boolean> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        console.log('ℹ️ SMAX not configured - skipping arrangement sync');
        return false;
      }

      // Generate paymentdata array with scheduled payment dates and amounts
      const paymentdata: Array<{ paymentamount: string; paymentdate: string }> = [];
      
      if (arrangementData.remainingpayments && arrangementData.remainingpayments > 0) {
        const paymentAmount = arrangementData.monthlypayment;
        let currentDate = new Date(arrangementData.nextpaymentdate);
        
        for (let i = 0; i < arrangementData.remainingpayments; i++) {
          paymentdata.push({
            paymentamount: paymentAmount.toFixed(2),
            paymentdate: currentDate.toISOString().split('T')[0]
          });
          
          // Move to next month
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      } else if (arrangementData.startdate && arrangementData.enddate) {
        // Calculate payments from start to end date
        const paymentAmount = arrangementData.monthlypayment;
        let currentDate = new Date(arrangementData.nextpaymentdate);
        const endDate = new Date(arrangementData.enddate);
        
        while (currentDate <= endDate) {
          paymentdata.push({
            paymentamount: paymentAmount.toFixed(2),
            paymentdate: currentDate.toISOString().split('T')[0]
          });
          
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      } else {
        // Single payment (settlement or pay-in-full)
        paymentdata.push({
          paymentamount: arrangementData.monthlypayment.toFixed(2),
          paymentdate: arrangementData.nextpaymentdate
        });
      }

      // Build payload using same structure as insert_payments_external
      // but add paymentdata array for the payment plan
      const payload = {
        filenumber: arrangementData.filenumber.trim(),
        payorname: arrangementData.payorname || 'Consumer',
        paymentmethod: 'CREDIT CARD',
        paymentstatus: 'PENDING',
        typeofpayment: 'Online',
        // Check fields (not used for credit card)
        checkaccountnumber: '',
        checkroutingnumber: '',
        checkaccounttype: '',
        checkaddress: '',
        checkcity: '',
        checkstate: '',
        checkzip: '',
        // Card details - use tokenized data, NOT raw card numbers
        cardtype: arrangementData.cardbrand || 'Unknown',
        cardnumber: arrangementData.cardlast4 ? `XXXX-XXXX-XXXX-${arrangementData.cardlast4}` : 'XXXX-XXXX-XXXX-XXXX',
        threedigitnumber: 'XXX', // Never send real CVV
        cardexpirationmonth: arrangementData.expirymonth || '',
        cardexpirationyear: arrangementData.expiryyear || '',
        cardexpirationdate: (arrangementData.expirymonth && arrangementData.expiryyear) 
          ? `${arrangementData.expirymonth}/${arrangementData.expiryyear}`
          : '',
        // Payment amount (total or first payment)
        paymentamount: arrangementData.monthlypayment.toFixed(2),
        acceptedfees: '0',
        printed: 'false',
        invoice: `ARR${Date.now()}`,
        // Payment plan schedule
        paymentdata: paymentdata
      };

      console.log('📤 Sending payment arrangement to SMAX via /insert_payplan_external:', {
        filenumber: payload.filenumber,
        payorname: payload.payorname,
        arrangementType: arrangementData.arrangementtype,
        monthlyPayment: arrangementData.monthlypayment,
        totalPayments: paymentdata.length,
        paymentSchedule: paymentdata,
        cardLast4: arrangementData.cardlast4,
        cardBrand: arrangementData.cardbrand
      });

      const result = await this.makeSmaxRequest(
        config,
        '/insert_payplan_external',
        'POST',
        payload
      );

      console.log('✅ SMAX payment arrangement inserted successfully:', result);
      return result.state === 'SUCCESS' || result.success === true;
    } catch (error) {
      console.error('❌ Error inserting payment arrangement to SMAX:', error);
      console.error('Arrangement data that failed:', {
        filenumber: arrangementData.filenumber,
        payments: arrangementData.remainingpayments,
        amount: arrangementData.monthlypayment
      });
      // Non-blocking - don't fail if SMAX is unavailable
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
      // Check if this is a 404 - the endpoint may not exist in this SMAX version
      if (error instanceof Error && error.message.includes('404')) {
        console.warn(`⚠️ SMAX /getaccountdetails endpoint not available (404) - this is expected for some SMAX versions`);
        return null;
      }
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

  // Get payment arrangement/plan from SMAX for a given file number
  async getPaymentArrangement(tenantId: string, fileNumber: string): Promise<any | null> {
    try {
      const config = await this.getSmaxConfig(tenantId);

      if (!config) {
        console.log('ℹ️ SMAX not configured - skipping payment arrangement fetch');
        return null;
      }

      // Call /getpayments to get both past and future scheduled payments
      const result = await this.makeSmaxRequest(
        config,
        `/getpayments/${fileNumber}`,
        'GET'
      );

      if (result.state !== 'SUCCESS' || !result.result) {
        console.log('📋 No payment data found in SMAX for file:', fileNumber);
        return null;
      }

      const payments = result.result;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter for future-dated payments (these represent the payment plan/arrangement)
      const futurePayments = payments.filter((payment: any) => {
        const paymentDate = new Date(payment.paymentdate);
        return paymentDate >= today;
      });

      if (futurePayments.length === 0) {
        console.log('📋 No future payments found for file:', fileNumber);
        return null;
      }

      // Sort by date to get the next payment first
      futurePayments.sort((a: any, b: any) => {
        return new Date(a.paymentdate).getTime() - new Date(b.paymentdate).getTime();
      });

      const nextPayment = futurePayments[0];
      const rawPaymentAmount = nextPayment.paymentamount || nextPayment.paymentAmount || '0';
      const paymentAmountFloat = parseFloat(rawPaymentAmount);
      
      // CRITICAL: Normalize SMAX payment amounts to cents
      // SMAX may return amounts in dollars (e.g., "150.00") or cents (e.g., "15000")
      // Strategy: Check if the raw value contains a decimal point
      // - If it has decimals (e.g., "150.00"), it's in dollars → multiply by 100
      // - If no decimals (e.g., "15000"), it's already in cents → use as-is
      const paymentAmountCents = rawPaymentAmount.toString().includes('.')
        ? Math.round(paymentAmountFloat * 100) // Has decimal = dollars, convert to cents
        : Math.round(paymentAmountFloat); // No decimal = already cents
      
      console.log('💰 SMAX Payment Amount Normalization:', {
        raw: rawPaymentAmount,
        parsed: paymentAmountFloat,
        hasDecimal: rawPaymentAmount.toString().includes('.'),
        normalizedCents: paymentAmountCents,
        displayAmount: `$${(paymentAmountCents / 100).toFixed(2)}`
      });

      // Calculate arrangement details from the payment schedule
      const arrangement = {
        source: 'smax',
        filenumber: fileNumber,
        paymentAmount: paymentAmountCents,
        monthlyPayment: paymentAmountCents,
        nextPaymentDate: nextPayment.paymentdate,
        remainingPayments: futurePayments.length,
        paymentMethod: nextPayment.paymentmethod || nextPayment.paymentMethod,
        typeOfPayment: nextPayment.typeofpayment || nextPayment.typeOfPayment,
        portfolio: nextPayment.portfolio,
        // Calculate start and end dates from the schedule
        startDate: futurePayments[0].paymentdate,
        endDate: futurePayments[futurePayments.length - 1].paymentdate,
        // Store all future payments for reference
        scheduledPayments: futurePayments,
      };

      console.log('📋 SMAX payment arrangement fetched:', {
        filenumber: fileNumber,
        hasArrangement: true,
        nextPaymentDate: arrangement.nextPaymentDate,
        remainingPayments: arrangement.remainingPayments,
        monthlyPaymentCents: paymentAmountCents
      });

      return arrangement;
    } catch (error) {
      console.error('Error getting payment arrangement from SMAX:', error);
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

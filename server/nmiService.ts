/**
 * NMI (Network Merchants Inc.) Payment Gateway Service
 * 
 * Handles payment processing and Customer Vault management for NMI
 * API Documentation: https://secure.networkmerchants.com/gw/merchants/resources/integration/integration_portal.php
 */

export interface NMIConfig {
  securityKey: string;
  useSandbox?: boolean;
}

export interface NMITransactionRequest {
  amount: number;
  ccnumber?: string;
  ccexp?: string;
  cvv?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  orderid?: string;
  ipaddress?: string;
  email?: string;
}

export interface NMICustomerVaultRequest {
  ccnumber: string;
  ccexp: string;
  cvv?: string;
  firstName: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  email?: string;
  customerVaultId?: string; // If not provided, NMI generates one
}

export interface NMIChargeVaultRequest {
  customerVaultId: string;
  amount: number;
  orderid?: string;
  firstName?: string;
  lastName?: string;
}

export interface NMITransactionResponse {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  avsResponse?: string;
  cvvResponse?: string;
  responseText?: string;
  errorMessage?: string;
  cardLast4?: string;
  cardType?: string;
  raw?: any;
}

export interface NMICustomerVaultResponse {
  success: boolean;
  customerVaultId?: string;
  errorMessage?: string;
  cardLast4?: string;
  cardType?: string;
  cardExp?: string;
}

export class NMIService {
  private securityKey: string;
  private apiEndpoint: string;

  constructor(config: NMIConfig) {
    this.securityKey = config.securityKey;
    // NMI uses the same endpoint for production and sandbox
    // Sandbox is enabled via account settings, not different URLs
    this.apiEndpoint = 'https://secure.networkmerchants.com/api/transact.php';
  }

  /**
   * Process a direct sale transaction
   */
  async processSale(request: NMITransactionRequest): Promise<NMITransactionResponse> {
    try {
      const params = new URLSearchParams({
        type: 'sale',
        security_key: this.securityKey,
        amount: request.amount.toFixed(2),
        ...(request.ccnumber && { ccnumber: request.ccnumber }),
        ...(request.ccexp && { ccexp: request.ccexp }),
        ...(request.cvv && { cvv: request.cvv }),
        ...(request.firstName && { first_name: request.firstName }),
        ...(request.lastName && { last_name: request.lastName }),
        ...(request.address && { address1: request.address }),
        ...(request.city && { city: request.city }),
        ...(request.state && { state: request.state }),
        ...(request.zip && { zip: request.zip }),
        ...(request.orderid && { orderid: request.orderid }),
        ...(request.ipaddress && { ipaddress: request.ipaddress }),
        ...(request.email && { email: request.email }),
      });

      console.log('🟣 [NMI] Processing sale transaction...');

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const textResponse = await response.text();
      const result = this.parseResponse(textResponse);

      console.log('🟣 [NMI] Sale response:', {
        response: result.response,
        responseCode: result.response_code,
        transactionId: result.transactionid,
      });

      if (result.response === '1') { // 1 = Approved
        return {
          success: true,
          transactionId: result.transactionid,
          authCode: result.authcode,
          avsResponse: result.avsresponse,
          cvvResponse: result.cvvresponse,
          responseText: result.responsetext,
          cardLast4: request.ccnumber?.slice(-4),
          cardType: result.cc_type,
          raw: result,
        };
      } else {
        const errorMessage = result.responsetext || 'Transaction declined';
        console.error('❌ [NMI] Sale failed:', errorMessage);
        return {
          success: false,
          errorMessage,
          responseText: result.responsetext,
          raw: result,
        };
      }
    } catch (error: any) {
      console.error('❌ [NMI] Exception processing sale:', error);
      return {
        success: false,
        errorMessage: error.message || 'Failed to process sale',
      };
    }
  }

  /**
   * Add a customer to the Customer Vault and return the vault ID
   */
  async addCustomerToVault(request: NMICustomerVaultRequest): Promise<NMICustomerVaultResponse> {
    try {
      const params = new URLSearchParams({
        security_key: this.securityKey,
        customer_vault: 'add_customer',
        ...(request.customerVaultId && { customer_vault_id: request.customerVaultId }),
        ccnumber: request.ccnumber,
        ccexp: request.ccexp,
        ...(request.cvv && { cvv: request.cvv }),
        first_name: request.firstName,
        last_name: request.lastName,
        ...(request.address && { address1: request.address }),
        ...(request.city && { city: request.city }),
        ...(request.state && { state: request.state }),
        ...(request.zip && { zip: request.zip }),
        ...(request.email && { email: request.email }),
      });

      console.log('🟣 [NMI] Adding customer to vault...');

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const textResponse = await response.text();
      const result = this.parseResponse(textResponse);

      console.log('🟣 [NMI] Vault response:', {
        response: result.response,
        customerVaultId: result.customer_vault_id,
      });

      if (result.response === '1') { // 1 = Approved
        return {
          success: true,
          customerVaultId: result.customer_vault_id,
          cardLast4: request.ccnumber.slice(-4),
          cardType: result.cc_type,
          cardExp: request.ccexp,
        };
      } else {
        const errorMessage = result.responsetext || 'Failed to add customer to vault';
        console.error('❌ [NMI] Vault add failed:', errorMessage);
        return {
          success: false,
          errorMessage,
        };
      }
    } catch (error: any) {
      console.error('❌ [NMI] Exception adding customer to vault:', error);
      return {
        success: false,
        errorMessage: error.message || 'Failed to add customer to vault',
      };
    }
  }

  /**
   * Charge a saved customer vault record
   */
  async chargeCustomerVault(request: NMIChargeVaultRequest): Promise<NMITransactionResponse> {
    try {
      const params = new URLSearchParams({
        type: 'sale',
        security_key: this.securityKey,
        customer_vault_id: request.customerVaultId,
        amount: request.amount.toFixed(2),
        ...(request.orderid && { orderid: request.orderid }),
        ...(request.firstName && { first_name: request.firstName }),
        ...(request.lastName && { last_name: request.lastName }),
      });

      console.log('🟣 [NMI] Charging customer vault:', request.customerVaultId, request.firstName, request.lastName);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const textResponse = await response.text();
      const result = this.parseResponse(textResponse);

      console.log('🟣 [NMI] Vault charge response:', {
        response: result.response,
        transactionId: result.transactionid,
      });

      if (result.response === '1') { // 1 = Approved
        return {
          success: true,
          transactionId: result.transactionid,
          authCode: result.authcode,
          avsResponse: result.avsresponse,
          cvvResponse: result.cvvresponse,
          responseText: result.responsetext,
          raw: result,
        };
      } else {
        const errorMessage = result.responsetext || 'Transaction declined';
        console.error('❌ [NMI] Vault charge failed:', errorMessage);
        return {
          success: false,
          errorMessage,
          responseText: result.responsetext,
          raw: result,
        };
      }
    } catch (error: any) {
      console.error('❌ [NMI] Exception charging vault:', error);
      return {
        success: false,
        errorMessage: error.message || 'Failed to charge customer vault',
      };
    }
  }

  /**
   * Test NMI connection and credentials using a harmless status query
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test credentials using get_status with an invalid transaction ID
      // This validates the security key without processing a transaction
      // Valid credentials return response=3 (error: "Transaction not found")
      // Invalid credentials return response=2 (declined/authentication error)
      const params = new URLSearchParams({
        security_key: this.securityKey,
        type: 'get_status',
        transactionid: '0', // Deliberately invalid to trigger validation
      });

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const textResponse = await response.text();
      
      // Handle empty/invalid responses
      if (!textResponse || textResponse.trim() === '') {
        return {
          success: false,
          message: 'No response from NMI. Please check your network connection.',
        };
      }

      const result = this.parseResponse(textResponse);
      
      // Handle unparseable responses (HTML, empty object, etc.)
      if (!result.response || typeof result.response !== 'string') {
        return {
          success: false,
          message: `Unexpected response from NMI. Please verify your credentials. Response: ${textResponse.substring(0, 100)}`,
        };
      }

      console.log('🟣 [NMI] Test connection response:', result.response);

      // Only response=1 (approved) or response=3 (error but authenticated) indicate valid credentials
      if (result.response === '1' || result.response === '3') {
        return {
          success: true,
          message: 'Successfully connected to NMI. Credentials are valid.',
        };
      }

      // All other responses (including response=2 for auth failures) are failures
      return {
        success: false,
        message: `Connection test failed: ${result.responsetext || `Unexpected response code: ${result.response}`}`,
      };

    } catch (error: any) {
      console.error('❌ [NMI] Test connection error:', error);
      return {
        success: false,
        message: `Connection error: ${error.message || 'Failed to test connection'}`,
      };
    }
  }

  /**
   * Parse NMI's URL-encoded response into an object
   */
  private parseResponse(responseText: string): any {
    const params = new URLSearchParams(responseText);
    const result: any = {};
    
    params.forEach((value, key) => {
      result[key] = value;
    });
    
    return result;
  }
}

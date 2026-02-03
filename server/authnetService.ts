export interface AuthnetConfig {
  apiLoginId: string;
  transactionKey: string;
  useSandbox: boolean;
}

export interface AuthnetPaymentRequest {
  amount: number; // in dollars (e.g., 10.50)
  cardNumber?: string;
  expirationDate?: string; // MMYY format
  cvv?: string;
  opaqueDataDescriptor?: string; // From Accept.js tokenization
  opaqueDataValue?: string; // From Accept.js tokenization
  paymentNonce?: string; // Legacy - use opaque data instead
  cardholderName?: string;
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  invoice?: string;
  description?: string;
}

export interface AuthnetTokenizationRequest {
  cardNumber: string;
  expirationDate: string; // MMYY format
  cardholderName?: string;
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface AuthnetPaymentResponse {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  cardLast4?: string;
  cardType?: string;
}

export interface AuthnetTokenResponse {
  success: boolean;
  customerProfileId?: string;
  paymentProfileId?: string;
  errorMessage?: string;
}

export interface AuthnetCreateProfileRequest {
  opaqueDataDescriptor: string;
  opaqueDataValue: string;
  email?: string;
  customerId?: string;
  billingAddress?: {
    firstName?: string;
    lastName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export interface AuthnetChargeProfileRequest {
  customerProfileId: string;
  paymentProfileId: string;
  amount: number;
  invoice?: string;
  description?: string;
}

export class AuthnetService {
  private config: AuthnetConfig;
  private apiEndpoint: string;

  constructor(config: AuthnetConfig) {
    this.config = config;
    this.apiEndpoint = config.useSandbox
      ? 'https://apitest.authorize.net/xml/v1/request.api'
      : 'https://api.authorize.net/xml/v1/request.api';
  }

  private buildMerchantAuth() {
    return {
      name: this.config.apiLoginId,
      transactionKey: this.config.transactionKey,
    };
  }

  async processPayment(request: AuthnetPaymentRequest): Promise<AuthnetPaymentResponse> {
    try {
      const payload: any = {
        createTransactionRequest: {
          merchantAuthentication: this.buildMerchantAuth(),
          transactionRequest: {
            transactionType: 'authCaptureTransaction',
            amount: request.amount.toFixed(2),
          },
        },
      };

      // Use opaque data if provided (from Accept.js), otherwise use direct card data
      if (request.opaqueDataDescriptor && request.opaqueDataValue) {
        payload.createTransactionRequest.transactionRequest.payment = {
          opaqueData: {
            dataDescriptor: request.opaqueDataDescriptor,
            dataValue: request.opaqueDataValue,
          },
        };
      } else if (request.paymentNonce) {
        // Legacy support for paymentNonce
        payload.createTransactionRequest.transactionRequest.payment = {
          opaqueData: {
            dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
            dataValue: request.paymentNonce,
          },
        };
      } else if (request.cardNumber && request.expirationDate) {
        payload.createTransactionRequest.transactionRequest.payment = {
          creditCard: {
            cardNumber: request.cardNumber,
            expirationDate: request.expirationDate,
            ...(request.cvv && { cardCode: request.cvv }),
          },
        };
      } else {
        throw new Error('Either paymentNonce or card details must be provided');
      }

      // Add order information BEFORE billTo (Authorize.net requires specific element order)
      if (request.invoice || request.description) {
        payload.createTransactionRequest.transactionRequest.order = {
          ...(request.invoice && { invoiceNumber: request.invoice }),
          ...(request.description && { description: request.description }),
        };
      }

      // Add billing address if provided (must come AFTER order in Authorize.net schema)
      if (request.billingAddress) {
        payload.createTransactionRequest.transactionRequest.billTo = {
          firstName: request.billingAddress.firstName || '',
          lastName: request.billingAddress.lastName || '',
          address: request.billingAddress.address || '',
          city: request.billingAddress.city || '',
          state: request.billingAddress.state || '',
          zip: request.billingAddress.zip || '',
        };
      }

      console.log('🔵 [Authorize.net Service] API Request:', {
        endpoint: this.apiEndpoint,
        amount: request.amount,
        hasOpaqueData: !!(request.opaqueDataDescriptor && request.opaqueDataValue),
        hasNonce: !!request.paymentNonce,
        hasCardData: !!request.cardNumber,
        useSandbox: this.config.useSandbox,
        apiLoginIdLength: this.config.apiLoginId.length,
      });

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      console.log('🔵 [Authorize.net Service] API Response:', {
        resultCode: result?.messages?.resultCode,
        responseCode: result?.transactionResponse?.responseCode,
        messageCode: result?.messages?.message?.[0]?.code,
        messageText: result?.messages?.message?.[0]?.text,
        transId: result?.transactionResponse?.transId,
        authCode: result?.transactionResponse?.authCode,
      });

      // Log full response in sandbox for debugging
      if (this.config.useSandbox) {
        console.log('🔵 [Authorize.net Sandbox] Full API Response:', JSON.stringify(result, null, 2));
      }

      if (result?.messages?.resultCode === 'Ok' && result?.transactionResponse?.responseCode === '1') {
        // Success - responseCode 1 means approved
        return {
          success: true,
          transactionId: result.transactionResponse.transId,
          authCode: result.transactionResponse.authCode,
          message: result.transactionResponse.messages?.[0]?.description || 'Payment approved',
          cardLast4: result.transactionResponse.accountNumber?.slice(-4),
          cardType: result.transactionResponse.accountType,
        };
      } else {
        // Error or declined
        const errorMessage = result?.transactionResponse?.errors?.[0]?.errorText 
          || result?.messages?.message?.[0]?.text
          || 'Payment declined';
        
        return {
          success: false,
          errorCode: result?.transactionResponse?.errors?.[0]?.errorCode 
            || result?.messages?.message?.[0]?.code,
          errorMessage,
          message: errorMessage,
        };
      }
    } catch (error: any) {
      console.error('❌ Authorize.net payment error:', error);
      return {
        success: false,
        errorMessage: error.message || 'Payment processing failed',
        message: error.message || 'Payment processing failed',
      };
    }
  }

  async createCustomerProfile(request: AuthnetTokenizationRequest): Promise<AuthnetTokenResponse> {
    try {
      const payload = {
        createCustomerProfileRequest: {
          merchantAuthentication: this.buildMerchantAuth(),
          profile: {
            merchantCustomerId: `customer_${Date.now()}`,
            paymentProfiles: {
              billTo: {
                firstName: request.billingAddress?.firstName || '',
                lastName: request.billingAddress?.lastName || '',
                address: request.billingAddress?.address || '',
                city: request.billingAddress?.city || '',
                state: request.billingAddress?.state || '',
                zip: request.billingAddress?.zip || '',
              },
              payment: {
                creditCard: {
                  cardNumber: request.cardNumber,
                  expirationDate: request.expirationDate,
                },
              },
            },
          },
        },
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      if (result?.messages?.resultCode === 'Ok') {
        return {
          success: true,
          customerProfileId: result.customerProfileId,
          paymentProfileId: result.customerPaymentProfileIdList?.[0],
        };
      } else {
        return {
          success: false,
          errorMessage: result?.messages?.message?.[0]?.text || 'Tokenization failed',
        };
      }
    } catch (error: any) {
      console.error('❌ Authorize.net tokenization error:', error);
      return {
        success: false,
        errorMessage: error.message || 'Tokenization failed',
      };
    }
  }

  async createCustomerPaymentProfile(request: AuthnetCreateProfileRequest): Promise<AuthnetTokenResponse> {
    try {
      // First, try to create a complete customer profile with payment profile
      const payload = {
        createCustomerProfileRequest: {
          merchantAuthentication: this.buildMerchantAuth(),
          profile: {
            merchantCustomerId: request.customerId || `cust_${Date.now()}`,
            email: request.email || '',
            paymentProfiles: {
              customerType: 'individual',
              billTo: request.billingAddress ? {
                firstName: request.billingAddress.firstName || '',
                lastName: request.billingAddress.lastName || '',
                address: request.billingAddress.address || '',
                city: request.billingAddress.city || '',
                state: request.billingAddress.state || '',
                zip: request.billingAddress.zip || '',
              } : undefined,
              payment: {
                opaqueData: {
                  dataDescriptor: request.opaqueDataDescriptor,
                  dataValue: request.opaqueDataValue,
                },
              },
            },
          },
        },
      };

      console.log('🔵 [Authorize.net CIM] Creating customer payment profile...');

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      console.log('🔵 [Authorize.net CIM] Response:', {
        resultCode: result?.messages?.resultCode,
        messageCode: result?.messages?.message?.[0]?.code,
        customerProfileId: result?.customerProfileId,
        paymentProfileId: result?.customerPaymentProfileIdList?.[0],
      });

      if (result?.messages?.resultCode === 'Ok') {
        return {
          success: true,
          customerProfileId: result.customerProfileId,
          paymentProfileId: result.customerPaymentProfileIdList?.[0],
        };
      } else {
        // Check if error is E00039 (duplicate customer profile)
        const errorCode = result?.messages?.message?.[0]?.code;
        const errorMessage = result?.messages?.message?.[0]?.text || 'Failed to create payment profile';

        if (errorCode === 'E00039') {
          console.log('🔵 [Authorize.net CIM] Customer profile already exists, adding payment profile to existing customer...');
          
          // Customer profile exists, get the existing profile ID
          // First, get the customer profile by merchantCustomerId
          const getProfilePayload = {
            getCustomerProfileRequest: {
              merchantAuthentication: this.buildMerchantAuth(),
              merchantCustomerId: request.customerId || `cust_${Date.now()}`,
            },
          };

          const getProfileResponse = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(getProfilePayload),
          });

          const getProfileResult: any = await getProfileResponse.json();

          if (getProfileResult?.messages?.resultCode === 'Ok' && getProfileResult?.profile?.customerProfileId) {
            const existingCustomerProfileId = getProfileResult.profile.customerProfileId;
            console.log('🔵 [Authorize.net CIM] Found existing customer profile:', existingCustomerProfileId);

            // Now create just a payment profile under the existing customer
            const addPaymentProfilePayload = {
              createCustomerPaymentProfileRequest: {
                merchantAuthentication: this.buildMerchantAuth(),
                customerProfileId: existingCustomerProfileId,
                paymentProfile: {
                  customerType: 'individual',
                  billTo: request.billingAddress ? {
                    firstName: request.billingAddress.firstName || '',
                    lastName: request.billingAddress.lastName || '',
                    address: request.billingAddress.address || '',
                    city: request.billingAddress.city || '',
                    state: request.billingAddress.state || '',
                    zip: request.billingAddress.zip || '',
                  } : undefined,
                  payment: {
                    opaqueData: {
                      dataDescriptor: request.opaqueDataDescriptor,
                      dataValue: request.opaqueDataValue,
                    },
                  },
                },
              },
            };

            const addPaymentResponse = await fetch(this.apiEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(addPaymentProfilePayload),
            });

            const addPaymentResult: any = await addPaymentResponse.json();

            if (addPaymentResult?.messages?.resultCode === 'Ok') {
              return {
                success: true,
                customerProfileId: existingCustomerProfileId,
                paymentProfileId: addPaymentResult.customerPaymentProfileId,
              };
            } else {
              const addError = addPaymentResult?.messages?.message?.[0]?.text || 'Failed to add payment profile';
              console.error('❌ [Authorize.net CIM] Failed to add payment profile:', addError);
              return {
                success: false,
                errorMessage: addError,
              };
            }
          } else {
            console.error('❌ [Authorize.net CIM] Failed to retrieve existing customer profile');
            return {
              success: false,
              errorMessage: 'Customer profile exists but could not retrieve it',
            };
          }
        }

        console.error('❌ [Authorize.net CIM] Error:', errorMessage);
        return {
          success: false,
          errorMessage,
        };
      }
    } catch (error: any) {
      console.error('❌ [Authorize.net CIM] Exception:', error);
      return {
        success: false,
        errorMessage: error.message || 'Failed to create payment profile',
      };
    }
  }

  async chargeCustomerProfile(request: AuthnetChargeProfileRequest): Promise<AuthnetPaymentResponse> {
    try {
      const payload: any = {
        createTransactionRequest: {
          merchantAuthentication: this.buildMerchantAuth(),
          transactionRequest: {
            transactionType: 'authCaptureTransaction',
            amount: request.amount.toFixed(2),
            profile: {
              customerProfileId: request.customerProfileId,
              paymentProfile: {
                paymentProfileId: request.paymentProfileId,
              },
            },
          },
        },
      };

      // Add order information if provided
      if (request.invoice || request.description) {
        payload.createTransactionRequest.transactionRequest.order = {
          ...(request.invoice && { invoiceNumber: request.invoice }),
          ...(request.description && { description: request.description }),
        };
      }

      console.log('🔵 [Authorize.net CIM] Charging saved payment profile:', {
        customerProfileId: request.customerProfileId,
        paymentProfileId: request.paymentProfileId,
        amount: request.amount,
      });

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      console.log('🔵 [Authorize.net CIM] Charge response:', {
        resultCode: result?.messages?.resultCode,
        responseCode: result?.transactionResponse?.responseCode,
        transId: result?.transactionResponse?.transId,
      });

      if (result?.messages?.resultCode === 'Ok' && result?.transactionResponse?.responseCode === '1') {
        return {
          success: true,
          transactionId: result.transactionResponse.transId,
          authCode: result.transactionResponse.authCode,
          message: result.transactionResponse.messages?.[0]?.description || 'Payment approved',
          cardLast4: result.transactionResponse.accountNumber?.slice(-4),
          cardType: result.transactionResponse.accountType,
        };
      } else {
        const errorMessage = result?.transactionResponse?.errors?.[0]?.errorText 
          || result?.messages?.message?.[0]?.text
          || 'Payment declined';
        
        return {
          success: false,
          errorCode: result?.transactionResponse?.errors?.[0]?.errorCode 
            || result?.messages?.message?.[0]?.code,
          errorMessage,
          message: errorMessage,
        };
      }
    } catch (error: any) {
      console.error('❌ [Authorize.net CIM] Charge error:', error);
      return {
        success: false,
        errorMessage: error.message || 'Payment processing failed',
        message: error.message || 'Payment processing failed',
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Test connection with a simple auth validation request
      const payload = {
        authenticateTestRequest: {
          merchantAuthentication: this.buildMerchantAuth(),
        },
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result: any = await response.json();

      if (result?.messages?.resultCode === 'Ok') {
        return {
          success: true,
          message: `Successfully connected to ${this.config.useSandbox ? 'Sandbox' : 'Production'} Authorize.net`,
        };
      } else {
        return {
          success: false,
          message: result?.messages?.message?.[0]?.text || 'Connection test failed',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Connection test failed',
      };
    }
  }
}

import { 
  isExpoApp, 
  checkBiometricAvailability, 
  authenticateWithBiometric, 
  getBiometryTypeName as getExpoBiometryTypeName 
} from './expo-bridge';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometryType?: string;
}

export interface CheckBiometryResult {
  isAvailable: boolean;
  biometryType: string;
  strongBiometryIsAvailable: boolean;
  biometryTypes: string[];
  deviceIsSecure: boolean;
  reason: string;
  code: string;
}

export const biometricAuth = {
  async isAvailable(): Promise<CheckBiometryResult> {
    if (!isExpoApp()) {
      return {
        isAvailable: false,
        biometryType: 'none',
        strongBiometryIsAvailable: false,
        biometryTypes: [],
        deviceIsSecure: false,
        reason: 'Not running on a native platform',
        code: 'biometryNotAvailable'
      };
    }

    try {
      const result = await checkBiometricAvailability();
      return {
        isAvailable: result.available,
        biometryType: result.biometryType,
        strongBiometryIsAvailable: result.available,
        biometryTypes: result.available ? [result.biometryType] : [],
        deviceIsSecure: result.available,
        reason: result.available ? '' : 'Biometric not available',
        code: result.available ? '' : 'biometryNotAvailable'
      };
    } catch (error) {
      console.error('Biometry check failed:', error);
      return {
        isAvailable: false,
        biometryType: 'none',
        strongBiometryIsAvailable: false,
        biometryTypes: [],
        deviceIsSecure: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        code: 'biometryNotAvailable'
      };
    }
  },

  async authenticate(reason: string = 'Authenticate to access your account'): Promise<BiometricAuthResult> {
    if (!isExpoApp()) {
      return {
        success: false,
        error: 'Biometric authentication is only available in the mobile app'
      };
    }

    try {
      const check = await checkBiometricAvailability();
      
      if (!check.available) {
        return {
          success: false,
          error: 'Biometric authentication is not available on this device'
        };
      }

      const result = await authenticateWithBiometric(reason);

      return {
        success: result.success,
        error: result.error,
        biometryType: check.biometryType
      };
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  },

  getBiometryTypeName(type: string): string {
    return getExpoBiometryTypeName(type);
  }
};

import { BiometricAuth, BiometryType, BiometryErrorType, CheckBiometryResult } from '@aparajita/capacitor-biometric-auth';
import { Capacitor } from '@capacitor/core';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  biometryType?: BiometryType;
}

export const biometricAuth = {
  /**
   * Check if biometric authentication is available on this device
   */
  async isAvailable(): Promise<CheckBiometryResult> {
    if (!Capacitor.isNativePlatform()) {
      return {
        isAvailable: false,
        biometryType: BiometryType.none,
        strongBiometryIsAvailable: false,
        biometryTypes: [],
        deviceIsSecure: false,
        reason: 'Not running on a native platform',
        code: BiometryErrorType.biometryNotAvailable
      };
    }

    try {
      return await BiometricAuth.checkBiometry();
    } catch (error) {
      console.error('Biometry check failed:', error);
      return {
        isAvailable: false,
        biometryType: BiometryType.none,
        strongBiometryIsAvailable: false,
        biometryTypes: [],
        deviceIsSecure: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
        code: BiometryErrorType.biometryNotAvailable
      };
    }
  },

  /**
   * Authenticate user with biometrics
   */
  async authenticate(reason: string = 'Authenticate to access your account'): Promise<BiometricAuthResult> {
    if (!Capacitor.isNativePlatform()) {
      return {
        success: false,
        error: 'Biometric authentication is only available in the mobile app'
      };
    }

    try {
      // Check if biometrics are available
      const check = await BiometricAuth.checkBiometry();
      
      if (!check.isAvailable) {
        return {
          success: false,
          error: check.reason || 'Biometric authentication is not available on this device'
        };
      }

      // Perform authentication
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: 'Cancel',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Use Passcode',
        androidTitle: 'Biometric Authentication',
        androidSubtitle: reason,
        androidConfirmationRequired: false
      });

      return {
        success: true,
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

  /**
   * Get biometry type name for display
   */
  getBiometryTypeName(type: BiometryType): string {
    switch (type) {
      case BiometryType.touchId:
        return 'Touch ID';
      case BiometryType.faceId:
        return 'Face ID';
      case BiometryType.fingerprintAuthentication:
        return 'Fingerprint';
      case BiometryType.faceAuthentication:
        return 'Face Recognition';
      case BiometryType.irisAuthentication:
        return 'Iris Recognition';
      default:
        return 'Biometric';
    }
  }
};

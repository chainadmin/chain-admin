declare global {
  interface Window {
    isExpoApp?: boolean;
    platform?: 'ios' | 'android';
    sendToNative?: (data: any) => void;
    hapticFeedback?: (style?: 'light' | 'medium' | 'heavy') => void;
    saveToken?: (token: string, session?: string) => void;
    enableBiometric?: (token?: string, session?: string) => void;
    disableBiometric?: () => void;
    checkBiometric?: () => void;
    authenticateBiometric?: (reason?: string) => void;
    logout?: () => void;
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
  }
}

export const isExpoApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  // window.isExpoApp is set by the native shell's injected JS, but that can run
  // AFTER the web app has already booted. window.ReactNativeWebView is provided
  // by react-native-webview itself and is available early, so it's the reliable
  // signal that we're running inside the native app.
  return window.isExpoApp === true || !!window.ReactNativeWebView;
};

export const getPlatform = (): 'ios' | 'android' | 'web' => {
  if (typeof window !== 'undefined' && window.platform) {
    return window.platform;
  }
  return 'web';
};

export const isNativePlatform = (): boolean => {
  return isExpoApp();
};

export const hapticFeedback = (style: 'light' | 'medium' | 'heavy' = 'light'): void => {
  if (isExpoApp() && window.hapticFeedback) {
    window.hapticFeedback(style);
  }
};

export const saveAuthToken = (token: string, session?: string): void => {
  if (isExpoApp() && window.saveToken) {
    window.saveToken(token, session);
  }
};

export const enableBiometricLogin = (token?: string, session?: string): void => {
  if (isExpoApp() && window.enableBiometric) {
    window.enableBiometric(token, session);
  }
};

export const disableBiometricLogin = (): void => {
  if (isExpoApp() && window.disableBiometric) {
    window.disableBiometric();
  }
};

export const logoutNative = (): void => {
  if (isExpoApp() && window.logout) {
    window.logout();
  }
};

type BiometricCallback = (result: { available: boolean; biometryType: string }) => void;
type AuthCallback = (result: { success: boolean; error?: string }) => void;

let biometricStatusCallback: BiometricCallback | null = null;
let biometricAuthCallback: AuthCallback | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      if (data.type === 'BIOMETRIC_STATUS' && biometricStatusCallback) {
        biometricStatusCallback({
          available: data.available,
          biometryType: data.biometryType
        });
        biometricStatusCallback = null;
      }
      
      if (data.type === 'BIOMETRIC_RESULT' && biometricAuthCallback) {
        biometricAuthCallback({
          success: data.success,
          error: data.error
        });
        biometricAuthCallback = null;
      }
    } catch (e) {
    }
  });
}

export const checkBiometricAvailability = (): Promise<{ available: boolean; biometryType: string }> => {
  return new Promise((resolve) => {
    if (!isExpoApp()) {
      resolve({ available: false, biometryType: 'none' });
      return;
    }
    
    biometricStatusCallback = resolve;
    if (window.checkBiometric) {
      window.checkBiometric();
    }
    
    setTimeout(() => {
      if (biometricStatusCallback) {
        biometricStatusCallback = null;
        resolve({ available: false, biometryType: 'none' });
      }
    }, 3000);
  });
};

export const authenticateWithBiometric = (reason?: string): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    if (!isExpoApp()) {
      resolve({ success: false, error: 'Not running in mobile app' });
      return;
    }
    
    biometricAuthCallback = resolve;
    if (window.authenticateBiometric) {
      window.authenticateBiometric(reason);
    }
    
    setTimeout(() => {
      if (biometricAuthCallback) {
        biometricAuthCallback = null;
        resolve({ success: false, error: 'Timeout' });
      }
    }, 30000);
  });
};

export const getBiometryTypeName = (type: string): string => {
  switch (type) {
    case 'faceId':
      return 'Face ID';
    case 'touchId':
      return 'Touch ID';
    case 'fingerprint':
      return 'Fingerprint';
    case 'faceRecognition':
      return 'Face Recognition';
    default:
      return 'Biometric';
  }
};

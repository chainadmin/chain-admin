import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';

SplashScreen.preventAutoHideAsync();

const API_BASE_URL = 'https://chain-admin-production.up.railway.app';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [biometricToken, setBiometricToken] = useState(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    checkBiometricLogin();
  }, []);

  const checkBiometricLogin = async () => {
    try {
      const savedToken = await SecureStore.getItemAsync('consumerToken');
      const biometricEnabled = await SecureStore.getItemAsync('biometricEnabled');
      
      if (savedToken && biometricEnabled === 'true') {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        
        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Log in to Chain',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });
          
          if (result.success) {
            setBiometricToken(savedToken);
          }
        }
      }
    } catch (error) {
      console.log('Biometric check error:', error);
    } finally {
      setIsLoading(false);
      await SplashScreen.hideAsync();
    }
  };

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'HAPTIC_FEEDBACK':
          const style = data.style === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy :
                       data.style === 'medium' ? Haptics.ImpactFeedbackStyle.Medium :
                       Haptics.ImpactFeedbackStyle.Light;
          await Haptics.impactAsync(style);
          break;
          
        case 'SAVE_TOKEN':
          await SecureStore.setItemAsync('consumerToken', data.token);
          break;
          
        case 'ENABLE_BIOMETRIC':
          await SecureStore.setItemAsync('biometricEnabled', 'true');
          break;
          
        case 'DISABLE_BIOMETRIC':
          await SecureStore.deleteItemAsync('biometricEnabled');
          await SecureStore.deleteItemAsync('consumerToken');
          break;
          
        case 'CHECK_BIOMETRIC':
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
          
          let biometryType = 'none';
          if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            biometryType = Platform.OS === 'ios' ? 'faceId' : 'faceRecognition';
          } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            biometryType = Platform.OS === 'ios' ? 'touchId' : 'fingerprint';
          }
          
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'BIOMETRIC_STATUS',
            available: hasHardware && isEnrolled,
            biometryType
          }));
          break;
          
        case 'AUTHENTICATE_BIOMETRIC':
          const authResult = await LocalAuthentication.authenticateAsync({
            promptMessage: data.reason || 'Authenticate to continue',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });
          
          webViewRef.current?.postMessage(JSON.stringify({
            type: 'BIOMETRIC_RESULT',
            success: authResult.success,
            error: authResult.error
          }));
          break;
          
        case 'LOGOUT':
          await SecureStore.deleteItemAsync('consumerToken');
          await SecureStore.deleteItemAsync('biometricEnabled');
          break;
      }
    } catch (error) {
      console.log('Message handling error:', error);
    }
  };

  const injectedJavaScript = `
    window.isExpoApp = true;
    window.platform = '${Platform.OS}';
    
    window.sendToNative = function(data) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    };
    
    window.hapticFeedback = function(style) {
      window.sendToNative({ type: 'HAPTIC_FEEDBACK', style: style || 'light' });
    };
    
    window.saveToken = function(token) {
      window.sendToNative({ type: 'SAVE_TOKEN', token });
    };
    
    window.enableBiometric = function() {
      window.sendToNative({ type: 'ENABLE_BIOMETRIC' });
    };
    
    window.disableBiometric = function() {
      window.sendToNative({ type: 'DISABLE_BIOMETRIC' });
    };
    
    window.checkBiometric = function() {
      window.sendToNative({ type: 'CHECK_BIOMETRIC' });
    };
    
    window.authenticateBiometric = function(reason) {
      window.sendToNative({ type: 'AUTHENTICATE_BIOMETRIC', reason });
    };
    
    window.logout = function() {
      window.sendToNative({ type: 'LOGOUT' });
    };
    
    ${biometricToken ? `
      localStorage.setItem('consumerAuth', JSON.stringify({ token: '${biometricToken}' }));
      window.location.href = '/consumer/dashboard';
    ` : ''}
    
    true;
  `;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: `${API_BASE_URL}/consumer/login` }}
        style={styles.webview}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
          </View>
        )}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error:', nativeEvent);
        }}
        allowsBackForwardNavigationGestures={true}
        sharedCookiesEnabled={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    marginTop: Platform.OS === 'ios' ? 44 : 0,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});

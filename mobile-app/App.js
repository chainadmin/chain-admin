import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Platform,
  Text,
  Pressable,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const API_BASE_URL = 'https://chain-admin-production.up.railway.app';
const CONSUMER_LOGIN_URL = `${API_BASE_URL}/consumer-login`;
const LOAD_TIMEOUT_MS = 15000;

SplashScreen.preventAutoHideAsync().catch(() => {});

function ChainApp() {
  const insets = useSafeAreaInsets();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [biometricAuth, setBiometricAuth] = useState(null);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const webViewRef = useRef(null);
  const loadTimerRef = useRef(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const savedToken = await SecureStore.getItemAsync('consumerToken');
        const savedSession = await SecureStore.getItemAsync('consumerSession');
        const biometricEnabled = await SecureStore.getItemAsync('biometricEnabled');

        if (savedToken && savedSession && biometricEnabled === 'true') {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (hasHardware && isEnrolled) {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Log in to Chain',
              cancelLabel: 'Cancel',
              disableDeviceFallback: false,
            });

            if (!cancelled && result.success) {
              setBiometricAuth({ token: savedToken, session: savedSession });
            }
          }
        }
      } catch (error) {
        console.log('Biometric check error:', error);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
          SplashScreen.hideAsync().catch(() => {});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendToWeb = useCallback((payload) => {
    if (!webViewRef.current) return;
    const json = JSON.stringify(payload);
    const escaped = json.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webViewRef.current.injectJavaScript(
      `(function(){try{window.dispatchEvent(new MessageEvent('message',{data:'${escaped}'}));}catch(e){}})();true;`
    );
  }, []);

  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'HAPTIC_FEEDBACK': {
          const style =
            data.style === 'heavy'
              ? Haptics.ImpactFeedbackStyle.Heavy
              : data.style === 'medium'
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
          await Haptics.impactAsync(style);
          break;
        }

        case 'SAVE_TOKEN':
          if (typeof data.token === 'string' && data.token.length > 0) {
            await SecureStore.setItemAsync('consumerToken', data.token);
          }
          if (typeof data.session === 'string' && data.session.length > 0) {
            await SecureStore.setItemAsync('consumerSession', data.session);
          }
          break;

        case 'ENABLE_BIOMETRIC':
          await SecureStore.setItemAsync('biometricEnabled', 'true');
          if (typeof data.token === 'string' && data.token.length > 0) {
            await SecureStore.setItemAsync('consumerToken', data.token);
          }
          if (typeof data.session === 'string' && data.session.length > 0) {
            await SecureStore.setItemAsync('consumerSession', data.session);
          }
          break;

        case 'DISABLE_BIOMETRIC':
          await SecureStore.deleteItemAsync('biometricEnabled');
          await SecureStore.deleteItemAsync('consumerToken');
          await SecureStore.deleteItemAsync('consumerSession');
          break;

        case 'CHECK_BIOMETRIC': {
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          const supportedTypes =
            await LocalAuthentication.supportedAuthenticationTypesAsync();

          let biometryType = 'none';
          if (
            supportedTypes.includes(
              LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
            )
          ) {
            biometryType = Platform.OS === 'ios' ? 'faceId' : 'faceRecognition';
          } else if (
            supportedTypes.includes(
              LocalAuthentication.AuthenticationType.FINGERPRINT
            )
          ) {
            biometryType = Platform.OS === 'ios' ? 'touchId' : 'fingerprint';
          }

          sendToWeb({
            type: 'BIOMETRIC_STATUS',
            available: hasHardware && isEnrolled,
            biometryType,
          });
          break;
        }

        case 'AUTHENTICATE_BIOMETRIC': {
          const authResult = await LocalAuthentication.authenticateAsync({
            promptMessage: data.reason || 'Authenticate to continue',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });

          sendToWeb({
            type: 'BIOMETRIC_RESULT',
            success: authResult.success,
            error: authResult.error,
          });
          break;
        }

        case 'LOGOUT':
          await SecureStore.deleteItemAsync('consumerToken');
          await SecureStore.deleteItemAsync('consumerSession');
          await SecureStore.deleteItemAsync('biometricEnabled');
          redirectedRef.current = false;
          setBiometricAuth(null);
          break;
      }
    } catch (error) {
      console.log('Message handling error:', error);
    }
  };

  const safePlatform = JSON.stringify(Platform.OS);

  // Runs BEFORE the web page's own scripts execute, so the web app knows it is
  // running inside the native app from its very first render (prevents it from
  // falling back to the browser-only consumer pages).
  const injectedJavaScriptBeforeContentLoaded = useMemo(() => `
    (function() {
      try {
        window.isExpoApp = true;
        window.platform = ${safePlatform};
      } catch (e) {}
    })();
    true;
  `, [safePlatform]);

  const injectedJavaScript = useMemo(() => `
    (function() {
      try {
        window.isExpoApp = true;
        window.platform = ${safePlatform};

        window.sendToNative = function(data) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          }
        };

        window.hapticFeedback = function(style) {
          window.sendToNative({ type: 'HAPTIC_FEEDBACK', style: style || 'light' });
        };
        window.saveToken = function(token, session) {
          window.sendToNative({ type: 'SAVE_TOKEN', token: token, session: session });
        };
        window.enableBiometric = function(token, session) {
          window.sendToNative({ type: 'ENABLE_BIOMETRIC', token: token, session: session });
        };
        window.disableBiometric = function() {
          window.sendToNative({ type: 'DISABLE_BIOMETRIC' });
        };
        window.checkBiometric = function() {
          window.sendToNative({ type: 'CHECK_BIOMETRIC' });
        };
        window.authenticateBiometric = function(reason) {
          window.sendToNative({ type: 'AUTHENTICATE_BIOMETRIC', reason: reason });
        };
        window.logout = function() {
          window.sendToNative({ type: 'LOGOUT' });
        };

        var style = document.getElementById('chain-native-webview-fixes');
        if (!style) {
          style = document.createElement('style');
          style.id = 'chain-native-webview-fixes';
          style.textContent = 'html,body,#root{background:#020617!important;overscroll-behavior:none!important;} body{overflow-x:hidden!important;} [role=dialog]{max-width:calc(100vw - 24px)!important;}';
          document.head.appendChild(style);
        }
        window.notifyLowBalance = function() {
          window.sendToNative({ type: 'HAPTIC_FEEDBACK', style: 'heavy' });
        };
        window.notifyWalletCharged = function() {
          window.sendToNative({ type: 'HAPTIC_FEEDBACK', style: 'light' });
        };
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'JS_ERROR', message: String(e) }));
        }
      }
    })();
    true;
  `, [safePlatform]);

  const clearLoadTimer = () => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  };

  const startLoadTimer = () => {
    clearLoadTimer();
    loadTimerRef.current = setTimeout(() => {
      setStatus((prev) => (prev === 'loading' ? 'error' : prev));
    }, LOAD_TIMEOUT_MS);
  };

  const onWebViewLoadStart = () => {
    setStatus('loading');
    startLoadTimer();
  };

  const onWebViewLoadEnd = () => {
    clearLoadTimer();
    setStatus('ok');

    if (biometricAuth && !redirectedRef.current && webViewRef.current) {
      redirectedRef.current = true;
      const tokenLiteral = JSON.stringify(biometricAuth.token);
      const sessionLiteral = JSON.stringify(biometricAuth.session);
      webViewRef.current.injectJavaScript(`
        (function(){
          try {
            localStorage.setItem('consumerToken', ${tokenLiteral});
            sessionStorage.setItem('consumerToken', ${tokenLiteral});
            localStorage.setItem('consumerSession', ${sessionLiteral});
            sessionStorage.setItem('consumerSession', ${sessionLiteral});
            localStorage.setItem('consumerAuth', JSON.stringify({ token: ${tokenLiteral} }));
          } catch(e){}
          try {
            if (window.location.pathname.indexOf('/consumer-dashboard') === -1) {
              window.location.replace('/consumer-dashboard');
            }
          } catch(e){}
        })();
        true;
      `);
    }
  };

  const onWebViewError = () => {
    clearLoadTimer();
    setStatus('error');
  };

  const onWebViewHttpError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    const code = nativeEvent && nativeEvent.statusCode;
    if (typeof code === 'number' && (code < 200 || code >= 400)) {
      clearLoadTimer();
      setStatus('error');
    }
  };

  const onRetry = () => {
    setStatus('loading');
    redirectedRef.current = false;
    setReloadKey((k) => k + 1);
  };

  if (isBootstrapping) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: CONSUMER_LOGIN_URL }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
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
        onLoadStart={onWebViewLoadStart}
        onLoadEnd={onWebViewLoadEnd}
        onError={onWebViewError}
        onHttpError={onWebViewHttpError}
        allowsBackForwardNavigationGestures={true}
        sharedCookiesEnabled={true}
        originWhitelist={['https://*', 'http://localhost*']}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
      />
      {status === 'error' && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorCard}>
            <Image
              source={require('./assets/icon.png')}
              style={styles.errorLogo}
              resizeMode="contain"
            />
            <Text style={styles.errorTitle}>Couldn't reach Chain</Text>
            <Text style={styles.errorBody}>
              We couldn't connect right now. Please check your internet connection
              and try again.
            </Text>
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.retryButtonPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ChainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020617',
  },
  webview: {
    flex: 1,
    backgroundColor: '#020617',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020617',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  errorLogo: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 28,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  retryButtonPressed: {
    backgroundColor: '#2563eb',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

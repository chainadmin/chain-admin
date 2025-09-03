import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';

export function useMobile() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    const currentPlatform = Capacitor.getPlatform();
    
    setIsNative(native);
    setPlatform(currentPlatform as 'ios' | 'android' | 'web');

    if (native) {
      // Configure status bar
      StatusBar.setStyle({ style: Style.Light });
      StatusBar.setBackgroundColor({ color: '#ffffff' });

      // Hide splash screen after app loads
      SplashScreen.hide();

      // Handle keyboard events for better UX
      Keyboard.addListener('keyboardWillShow', (info) => {
        document.body.style.transform = `translateY(-${info.keyboardHeight / 4}px)`;
      });

      Keyboard.addListener('keyboardWillHide', () => {
        document.body.style.transform = 'translateY(0px)';
      });

      // Add safe area support
      document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
    }

    return () => {
      if (native) {
        Keyboard.removeAllListeners();
      }
    };
  }, []);

  const hapticFeedback = async (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if (isNative) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const style = type === 'light' ? ImpactStyle.Light : 
                   type === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
      await Haptics.impact({ style });
    }
  };

  return {
    isNative,
    platform,
    isIOS: platform === 'ios',
    isAndroid: platform === 'android',
    hapticFeedback
  };
}
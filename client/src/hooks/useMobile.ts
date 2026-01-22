import { useEffect, useState } from 'react';
import { isExpoApp, getPlatform, hapticFeedback as nativeHapticFeedback } from '../lib/expo-bridge';

export function useMobile() {
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web');

  useEffect(() => {
    const native = isExpoApp();
    const currentPlatform = getPlatform();
    
    setIsNative(native);
    setPlatform(currentPlatform);

    if (native) {
      document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top)');
      document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom)');
    }
  }, []);

  const hapticFeedback = async (type: 'light' | 'medium' | 'heavy' = 'light') => {
    if (isNative) {
      nativeHapticFeedback(type);
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

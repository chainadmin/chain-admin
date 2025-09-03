import { useEffect } from 'react';
import { useMobile } from '@/hooks/useMobile';

export function MobileOptimizations({ children }: { children: React.ReactNode }) {
  const { isNative, isIOS, isAndroid } = useMobile();

  useEffect(() => {
    if (isNative) {
      // Add mobile-specific CSS classes
      document.body.classList.add('mobile-app');
      if (isIOS) document.body.classList.add('ios');
      if (isAndroid) document.body.classList.add('android');

      // Disable text selection for better native feel
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      // Disable zoom on inputs
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (viewportMeta) {
        viewportMeta.setAttribute('content', 
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
        );
      }

      // Add touch-action for better scrolling
      document.body.style.touchAction = 'manipulation';
    }

    return () => {
      if (isNative) {
        document.body.classList.remove('mobile-app', 'ios', 'android');
      }
    };
  }, [isNative, isIOS, isAndroid]);

  return <>{children}</>;
}
import { useState, useEffect } from 'react';
import { getDynamicContent, getCachedContent, cacheDynamicContent, mobileConfig } from '@/lib/mobileConfig';

interface DynamicContentOptions {
  fallback?: any;
  cache?: boolean;
  refreshInterval?: number;
}

export function useDynamicContent<T = any>(
  contentType: string,
  options: DynamicContentOptions = {}
): {
  content: T | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const { fallback = null, cache = true, refreshInterval = 0 } = options;
  const [content, setContent] = useState<T | null>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Try to get cached content first (mobile only)
      if (mobileConfig.isNativePlatform && cache) {
        const cached = getCachedContent(contentType);
        if (cached) {
          setContent(cached);
          setIsLoading(false);
          
          // Still fetch fresh content in background
          const fresh = await getDynamicContent(contentType);
          if (fresh) {
            setContent(fresh);
            cacheDynamicContent(contentType, fresh);
          }
          return;
        }
      }

      // Fetch fresh content
      const freshContent = await getDynamicContent(contentType);
      if (freshContent) {
        setContent(freshContent);
        if (mobileConfig.isNativePlatform && cache) {
          cacheDynamicContent(contentType, freshContent);
        }
      }
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching dynamic content:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();

    // Set up refresh interval if specified
    if (refreshInterval > 0) {
      const interval = setInterval(fetchContent, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [contentType, refreshInterval]);

  return {
    content,
    isLoading,
    error,
    refresh: fetchContent,
  };
}

// Hook for checking app updates
export function useAppUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  useEffect(() => {
    // Check for stored update info
    const stored = sessionStorage.getItem('appUpdateAvailable');
    if (stored) {
      const info = JSON.parse(stored);
      setUpdateAvailable(true);
      setUpdateInfo(info);
    }
  }, []);

  const dismissUpdate = () => {
    sessionStorage.removeItem('appUpdateAvailable');
    setUpdateAvailable(false);
    setUpdateInfo(null);
  };

  return {
    updateAvailable,
    updateInfo,
    dismissUpdate,
  };
}
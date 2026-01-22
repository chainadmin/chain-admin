import { isExpoApp, getPlatform } from './expo-bridge';

function getServerUrl(): string {
  if (isExpoApp()) {
    return import.meta.env.VITE_API_BASE_URL || 'https://chain-admin-production.up.railway.app';
  }
  
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export const mobileConfig = {
  bundledVersion: '1.0.0',
  
  serverUrl: getServerUrl(),
  
  isNativePlatform: isExpoApp(),
  
  endpoints: {
    versionCheck: '/api/app-version',
    dynamicContent: '/api/dynamic-content',
    agencyBranding: '/api/public/agency',
  },
  
  dynamicFeatures: {
    templates: true,
    branding: true,
    communications: true,
    settings: true,
    authentication: false,
    navigation: false,
    database: false,
  }
};

export async function checkForUpdates(): Promise<{needsUpdate: boolean, version?: string, updateUrl?: string}> {
  if (!isExpoApp()) {
    return { needsUpdate: false };
  }
  
  try {
    const response = await fetch(`${mobileConfig.serverUrl}${mobileConfig.endpoints.versionCheck}`);
    if (!response.ok) {
      return { needsUpdate: false };
    }
    
    const data = await response.json();
    const latestVersion = data.version;
    const forceUpdate = data.forceUpdate || false;
    
    const needsUpdate = latestVersion !== mobileConfig.bundledVersion && forceUpdate;
    
    return {
      needsUpdate,
      version: latestVersion,
      updateUrl: data.updateUrl
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { needsUpdate: false };
  }
}

export async function getDynamicContent(contentType: string): Promise<any> {
  try {
    const response = await fetch(
      `${mobileConfig.serverUrl}${mobileConfig.endpoints.dynamicContent}?type=${contentType}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch dynamic content');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching dynamic content:', error);
    return null;
  }
}

export function cacheDynamicContent(key: string, content: any): void {
  try {
    localStorage.setItem(`dynamic_${key}`, JSON.stringify({
      content,
      timestamp: Date.now(),
      version: mobileConfig.bundledVersion
    }));
  } catch (error) {
    console.error('Error caching content:', error);
  }
}

export function getCachedContent(key: string): any {
  try {
    const cached = localStorage.getItem(`dynamic_${key}`);
    if (!cached) return null;
    
    const { content, timestamp } = JSON.parse(cached);
    
    const expirationTime = 24 * 60 * 60 * 1000;
    if (Date.now() - timestamp > expirationTime) {
      localStorage.removeItem(`dynamic_${key}`);
      return null;
    }
    
    return content;
  } catch (error) {
    console.error('Error getting cached content:', error);
    return null;
  }
}

export function reloadServerUrl(): string {
  return mobileConfig.serverUrl;
}

export async function initializeDynamicContent(): Promise<void> {
  if (!isExpoApp()) return;
  
  const updateCheck = await checkForUpdates();
  if (updateCheck.needsUpdate) {
    sessionStorage.setItem('appUpdateAvailable', JSON.stringify(updateCheck));
  }
  
  const contentTypes = ['templates', 'branding', 'settings'];
  for (const type of contentTypes) {
    if (mobileConfig.dynamicFeatures[type as keyof typeof mobileConfig.dynamicFeatures]) {
      const content = await getDynamicContent(type);
      if (content) {
        cacheDynamicContent(type, content);
      }
    }
  }
}

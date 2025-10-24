import { Capacitor } from '@capacitor/core';

// Function to get the correct server URL based on platform
function getServerUrl(): string {
  // If running on native platform (iOS/Android), use the production server
  if (Capacitor.isNativePlatform()) {
    // Use environment variable or default to Railway production server
    return import.meta.env.VITE_API_BASE_URL || 'https://chain-admin-production.up.railway.app';
  }
  
  // For web, use window.location.origin (same origin)
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// Configuration for mobile app dynamic updates
export const mobileConfig = {
  // Version of the bundled app (update this when releasing new app versions)
  bundledVersion: '1.0.0',
  
  // Base URL for your web server (update this with your production URL)
  serverUrl: getServerUrl(),
  
  // Check if running in Capacitor (mobile app)
  isNativePlatform: Capacitor.isNativePlatform(),
  
  // Endpoints for dynamic content
  endpoints: {
    versionCheck: '/api/app-version',
    dynamicContent: '/api/dynamic-content',
    agencyBranding: '/api/public/agency',
  },
  
  // Features that can be updated dynamically
  dynamicFeatures: {
    templates: true,
    branding: true,
    communications: true,
    settings: true,
    // Core features that require app store update
    authentication: false,
    navigation: false,
    database: false,
  }
};

// Function to check if app needs update
export async function checkForUpdates(): Promise<{needsUpdate: boolean, version?: string, updateUrl?: string}> {
  if (!mobileConfig.isNativePlatform) {
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
    
    // Compare versions
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

// Function to get dynamic content from server
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
    // Return null to fall back to bundled content
    return null;
  }
}

// Function to cache dynamic content locally
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

// Function to get cached content
export function getCachedContent(key: string): any {
  try {
    const cached = localStorage.getItem(`dynamic_${key}`);
    if (!cached) return null;
    
    const { content, timestamp } = JSON.parse(cached);
    
    // Cache expires after 24 hours
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

// Function to reload server URL dynamically (for WebView mode)
export function reloadServerUrl(): string {
  // Returns the current configured server URL
  return mobileConfig.serverUrl;
}

// Initialize dynamic content on app load
export async function initializeDynamicContent(): Promise<void> {
  if (!mobileConfig.isNativePlatform) return;
  
  // Check for updates
  const updateCheck = await checkForUpdates();
  if (updateCheck.needsUpdate) {
    // Store update info for later display to user
    sessionStorage.setItem('appUpdateAvailable', JSON.stringify(updateCheck));
  }
  
  // Pre-load critical dynamic content
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
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAuthToken, getStoredTenantName, getStoredTenantSlug, persistTenantMetadata } from "@/lib/cookies";
import { Capacitor } from '@capacitor/core';

export function useAuth() {
  const [jwtAuth, setJwtAuth] = useState<any>(null);
  const [checkingJwt, setCheckingJwt] = useState(true);
  
  // Detect if running in mobile app
  const isMobileApp = Capacitor.isNativePlatform();
  
  // Skip admin auth for consumer routes AND mobile apps
  const pathname = window.location.pathname;
  const isConsumerRoute = pathname === '/consumer-dashboard' || 
                         pathname === '/consumer-login' ||
                         pathname.startsWith('/consumer-register');

  // Check for JWT token on mount and when localStorage/cookies change
  useEffect(() => {
    const checkJwtToken = () => {
      // First, check for impersonation token in URL (from Global Admin)
      const urlParams = new URLSearchParams(window.location.search);
      const impersonateToken = urlParams.get('impersonate_token');
      
      if (impersonateToken) {
        // Store the impersonation token and clean up the URL
        localStorage.setItem('authToken', impersonateToken);
        // Remove the token from URL to prevent sharing/leaking
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log('🔐 Impersonation token received and stored');
      }
      
      const token = getAuthToken(); // Checks cookies first, then localStorage
      if (token) {
        // Parse the JWT payload (not secure, but fine for client-side auth check)
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          
          const payload = JSON.parse(jsonPayload);
          
          // Check if token is expired
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('authToken');
            setJwtAuth(null);
          } else {
            // Get tenant info from storage
            const tenantSlug = getStoredTenantSlug() || payload.tenantSlug;
            const tenantName = getStoredTenantName() || payload.tenantName;

            persistTenantMetadata({ slug: tenantSlug, name: tenantName });

            setJwtAuth({
              id: payload.userId,
              tenantId: payload.tenantId,
              tenantSlug: tenantSlug,
              tenantName: tenantName,
              role: payload.role || 'agent',
              email: payload.email,
              username: payload.username,
              restrictedServices: payload.restrictedServices || [],
              isJwtAuth: true
            });
          }
        } catch (e) {
          console.error('Invalid JWT token:', e);
          localStorage.removeItem('authToken');
          setJwtAuth(null);
        }
      } else {
        setJwtAuth(null);
      }
      setCheckingJwt(false);
    };

    checkJwtToken();
    
    // Listen for storage changes (login/logout from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'authToken') {
        checkJwtToken();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Original Replit auth check (only run if no JWT and not on consumer route or mobile app)
  const { data: replitUser, isLoading: replitLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !isConsumerRoute && !isMobileApp && !jwtAuth && !checkingJwt, // Skip for consumer routes AND mobile apps
  });

  // Determine final auth state
  const isLoading = (isConsumerRoute || isMobileApp) ? false : (checkingJwt || (!jwtAuth && replitLoading));
  const user = jwtAuth || replitUser;
  const isAuthenticated = !!(jwtAuth || replitUser);

  return {
    user,
    isLoading,
    isAuthenticated,
    isJwtAuth: !!jwtAuth,
    isReplitAuth: !!replitUser,
  };
}
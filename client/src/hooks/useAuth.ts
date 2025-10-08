import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAuthToken, getStoredTenantName, getStoredTenantSlug, persistTenantMetadata } from "@/lib/cookies";

export function useAuth() {
  const [jwtAuth, setJwtAuth] = useState<any>(null);
  const [checkingJwt, setCheckingJwt] = useState(true);
  
  // Skip admin auth for consumer routes
  const pathname = window.location.pathname;
  const isConsumerRoute = pathname === '/consumer-dashboard' || 
                         pathname === '/consumer-login' ||
                         pathname.startsWith('/consumer-register');
  
  // Force re-check on pathname change
  const [lastPath, setLastPath] = useState(pathname);

  // Check for JWT token on mount and when localStorage/cookies change
  useEffect(() => {
    const checkJwtToken = () => {
      const token = getAuthToken(); // Checks cookies first, then localStorage
      console.log('🔐 useAuth: Checking JWT token', { hasToken: !!token });
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
            console.log('🔐 useAuth: Token expired');
            localStorage.removeItem('authToken');
            setJwtAuth(null);
          } else {
            // Get tenant info from storage
            const tenantSlug = getStoredTenantSlug() || payload.tenantSlug;
            const tenantName = getStoredTenantName() || payload.tenantName;

            persistTenantMetadata({ slug: tenantSlug, name: tenantName });

            console.log('🔐 useAuth: JWT valid, setting auth', { tenantSlug, userId: payload.userId });
            setJwtAuth({
              id: payload.userId,
              tenantId: payload.tenantId,
              tenantSlug: tenantSlug,
              tenantName: tenantName,
              isJwtAuth: true
            });
          }
        } catch (e) {
          console.error('🔐 useAuth: Invalid JWT token:', e);
          localStorage.removeItem('authToken');
          setJwtAuth(null);
        }
      } else {
        console.log('🔐 useAuth: No token found');
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
  }, [pathname]); // Re-run when pathname changes
  
  // Update lastPath when pathname changes
  useEffect(() => {
    if (pathname !== lastPath) {
      setLastPath(pathname);
    }
  }, [pathname, lastPath]);

  // Original Replit auth check (only run if no JWT and not on consumer route)
  const { data: replitUser, isLoading: replitLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !isConsumerRoute && !jwtAuth && !checkingJwt, // Skip for consumer routes
  });

  // Determine final auth state
  const isLoading = isConsumerRoute ? false : (checkingJwt || (!jwtAuth && replitLoading));
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
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useAuth() {
  const [jwtAuth, setJwtAuth] = useState<any>(null);
  const [checkingJwt, setCheckingJwt] = useState(true);

  // Check for JWT token on mount and when localStorage changes
  useEffect(() => {
    const checkJwtToken = () => {
      const token = localStorage.getItem('authToken');
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
            setJwtAuth({
              id: payload.userId,
              tenantId: payload.tenantId,
              tenantSlug: payload.tenantSlug,
              tenantName: payload.tenantName,
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

  // Original Replit auth check (only run if no JWT)
  const { data: replitUser, isLoading: replitLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !jwtAuth && !checkingJwt, // Only check Replit auth if no JWT
  });

  // Determine final auth state
  const isLoading = checkingJwt || (!jwtAuth && replitLoading);
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
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  AgencyUser,
  loginAgency,
  setUnauthorizedHandler,
  Tenant,
} from '@/lib/api';
import {
  clearAll,
  getAuthToken,
  getStoredTenant,
  getStoredUser,
  isBiometricEnabled,
  setAuthToken,
  setBiometricEnabled,
  setStoredTenant,
  setStoredUser,
} from '@/lib/storage';

type AuthState = {
  isReady: boolean;
  isAuthenticated: boolean;
  user: AgencyUser | null;
  tenant: Tenant | null;
  biometricEnabled: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  enableBiometric: () => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  applyImpersonation: (token: string, tenant: Tenant, user?: AgencyUser) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AgencyUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [bio, setBio] = useState(false);

  const performLogout = useCallback(async () => {
    await clearAll();
    setUser(null);
    setTenant(null);
    setBio(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void performLogout();
    });
    return () => setUnauthorizedHandler(null);
  }, [performLogout]);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          setIsReady(true);
          return;
        }
        const storedUser = await getStoredUser<AgencyUser>();
        const storedTenant = await getStoredTenant<Tenant>();
        const bioOn = await isBiometricEnabled();

        if (bioOn) {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (hasHw && enrolled) {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Unlock Chain Agency',
              cancelLabel: 'Cancel',
            });
            if (!result.success) {
              await clearAll();
              setIsReady(true);
              return;
            }
          }
        }
        setUser(storedUser);
        setTenant(storedTenant);
        setBio(bioOn);
      } catch {
        await clearAll();
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await loginAgency(username, password);
    await setAuthToken(res.token);
    await setStoredUser(res.user);
    await setStoredTenant(res.tenant);
    setUser(res.user);
    setTenant(res.tenant);
  }, []);

  const applyImpersonation = useCallback(
    async (token: string, nextTenant: Tenant, nextUser?: AgencyUser) => {
      await setAuthToken(token);
      await setStoredTenant(nextTenant);
      setTenant(nextTenant);
      if (nextUser && nextUser.id) {
        await setStoredUser(nextUser);
        setUser(nextUser);
      }
    },
    []
  );

  const enableBiometric = useCallback(async () => {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enable biometric login',
      cancelLabel: 'Cancel',
    });
    if (!result.success) return false;
    await setBiometricEnabled(true);
    setBio(true);
    return true;
  }, []);

  const disableBiometric = useCallback(async () => {
    await setBiometricEnabled(false);
    setBio(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isReady,
      isAuthenticated: !!user,
      user,
      tenant,
      biometricEnabled: bio,
      login,
      logout: performLogout,
      enableBiometric,
      disableBiometric,
      applyImpersonation,
    }),
    [isReady, user, tenant, bio, login, performLogout, enableBiometric, disableBiometric, applyImpersonation]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

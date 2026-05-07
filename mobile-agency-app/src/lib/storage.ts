import * as SecureStore from 'expo-secure-store';

const KEYS = {
  authToken: 'chain_agency_auth_token',
  user: 'chain_agency_user',
  tenant: 'chain_agency_tenant',
  biometricEnabled: 'chain_agency_biometric_enabled',
} as const;

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.authToken);
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.authToken, token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.authToken);
}

export async function getStoredUser<T = any>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(KEYS.user);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setStoredUser(user: unknown): Promise<void> {
  await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.user);
}

export async function getStoredTenant<T = any>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(KEYS.tenant);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setStoredTenant(tenant: unknown): Promise<void> {
  await SecureStore.setItemAsync(KEYS.tenant, JSON.stringify(tenant));
}

export async function clearStoredTenant(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.tenant);
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEYS.biometricEnabled);
  return v === 'true';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(KEYS.biometricEnabled, 'true');
  else await SecureStore.deleteItemAsync(KEYS.biometricEnabled);
}

export async function clearAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.authToken),
    SecureStore.deleteItemAsync(KEYS.user),
    SecureStore.deleteItemAsync(KEYS.tenant),
  ]);
}

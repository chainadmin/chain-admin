import axios, { AxiosError, AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { getAuthToken } from './storage';

const fallbackBaseUrl = 'https://chain-admin-production.up.railway.app';
const apiBaseUrl: string =
  (Constants.expoConfig?.extra as any)?.apiBaseUrl || fallbackBaseUrl;

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(error);
  }
);

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export type AgencyUser = {
  id: string;
  username: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
};

export type LoginResponse = {
  token: string;
  user: AgencyUser;
  tenant: Tenant;
};

export async function loginAgency(
  username: string,
  password: string
): Promise<LoginResponse> {
  const res = await api.post('/api/agency/login', { username, password });
  return res.data;
}

export async function fetchStats() {
  const res = await api.get('/api/stats');
  return res.data;
}

export async function fetchAccounts() {
  const res = await api.get('/api/accounts');
  return res.data as any[];
}

export async function fetchAccountManualPayments(accountId: string) {
  const res = await api.get(`/api/accounts/${accountId}/manual-payments`);
  return res.data as any[];
}

export async function fetchPayments() {
  const res = await api.get('/api/payments');
  return res.data as any[];
}

export type ProcessPaymentInput = {
  consumerEmail: string;
  amountCents: number;
  cardNumber: string;
  expiryDate: string; // MM/YY
  cvv: string;
  cardName: string;
  zipCode?: string;
  accountId?: string;
};

export async function processPayment(payload: ProcessPaymentInput) {
  const res = await api.post('/api/payments/process', payload);
  return res.data;
}

export async function patchAccount(id: string, body: any) {
  const res = await api.patch(`/api/accounts/${id}`, body);
  return res.data;
}

export async function fetchConsumerConversation(consumerId: string) {
  const res = await api.get(`/api/consumers/${consumerId}/conversation`);
  return res.data;
}

export async function sendEmail(payload: {
  to: string;
  subject: string;
  message: string;
}) {
  const res = await api.post('/api/send-email', payload);
  return res.data;
}

export async function sendSms(payload: {
  message: string;
  consumerId?: string;
  phoneNumber?: string;
}) {
  const res = await api.post('/api/sms/quick', payload);
  return res.data;
}

export async function fetchEmailReplies() {
  const res = await api.get('/api/email-replies');
  return res.data as any[];
}

export async function fetchSmsReplies() {
  const res = await api.get('/api/sms-replies');
  return res.data as any[];
}

export async function fetchTenants() {
  const res = await api.get('/api/admin/tenants');
  return res.data as any[];
}

export async function impersonateTenant(tenantId: string): Promise<LoginResponse> {
  const res = await api.post(`/api/admin/impersonate-tenant/${tenantId}`);
  // Server returns: { success, token, tenant, ... }
  return {
    token: res.data.token,
    tenant: res.data.tenant,
    user: res.data.user || ({} as AgencyUser),
  };
}

export async function fetchWalletBalance() {
  try {
    const res = await api.get('/api/wallet/balance');
    return res.data as { balanceCents: number; planQuota?: any };
  } catch (e: any) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

export async function fetchWalletLedger() {
  try {
    const res = await api.get('/api/wallet/ledger');
    return res.data as any[];
  } catch (e: any) {
    if (e?.response?.status === 404) return [];
    throw e;
  }
}

export async function registerPushDevice(payload: {
  pushToken: string;
  platform: 'ios' | 'android';
  expoToken?: string;
}) {
  // Backend currently exposes consumer-only push endpoints; agency push is not
  // wired yet. Try the future agency endpoint and fail soft.
  try {
    const res = await api.post('/api/agency/push-devices/register', payload);
    return res.data;
  } catch (e: any) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

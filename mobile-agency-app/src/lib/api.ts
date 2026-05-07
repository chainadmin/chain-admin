import axios, { AxiosError, AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { getAuthToken } from './storage';
import type {
  Account,
  CallbackRequest,
  Conversation,
  EmailReply,
  ManualPayment,
  Payment,
  PaymentSchedule,
  SmsReply,
  TenantStats,
} from '@/types/api';

const fallbackBaseUrl = 'https://chain-admin-production.up.railway.app';
const apiBaseUrl: string =
  ((Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl) || fallbackBaseUrl;

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
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
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

export async function loginAgency(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/api/agency/login', { username, password });
  return res.data;
}

export async function fetchStats(): Promise<TenantStats> {
  const res = await api.get<TenantStats>('/api/stats');
  return res.data;
}

export async function fetchAccounts(): Promise<Account[]> {
  const res = await api.get<Account[]>('/api/accounts');
  return res.data;
}

export async function fetchAccountManualPayments(accountId: string): Promise<ManualPayment[]> {
  const res = await api.get<ManualPayment[]>(`/api/accounts/${accountId}/manual-payments`);
  return res.data;
}

export async function fetchPayments(): Promise<Payment[]> {
  const res = await api.get<Payment[]>('/api/payments');
  return res.data;
}

export async function fetchPaymentSchedules(): Promise<PaymentSchedule[]> {
  const res = await api.get<PaymentSchedule[]>('/api/payment-schedules');
  return res.data;
}

export async function fetchCallbackRequests(): Promise<CallbackRequest[]> {
  const res = await api.get<CallbackRequest[]>('/api/callback-requests');
  return res.data;
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
  return res.data as { success: boolean; message?: string; payment?: Payment };
}

export async function patchAccount(id: string, body: Partial<Account>): Promise<Account> {
  const res = await api.patch<Account>(`/api/accounts/${id}`, body);
  return res.data;
}

export async function fetchConsumerConversation(consumerId: string): Promise<Conversation> {
  const res = await api.get<Conversation>(`/api/consumers/${consumerId}/conversation`);
  return res.data;
}

export async function sendEmail(payload: { to: string; subject: string; message: string }) {
  const res = await api.post('/api/send-email', payload);
  return res.data as { success: boolean; message?: string };
}

export async function sendSms(payload: { message: string; consumerId?: string; phoneNumber?: string }) {
  const res = await api.post('/api/sms/quick', payload);
  return res.data as { success: boolean; message?: string };
}

export async function fetchEmailReplies(): Promise<EmailReply[]> {
  const res = await api.get<EmailReply[]>('/api/email-replies');
  return res.data;
}

export async function fetchSmsReplies(): Promise<SmsReply[]> {
  const res = await api.get<SmsReply[]>('/api/sms-replies');
  return res.data;
}

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await api.get<Tenant[]>('/api/admin/tenants');
  return res.data;
}

export async function impersonateTenant(tenantId: string): Promise<LoginResponse> {
  const res = await api.post<{ token: string; tenant: Tenant; user?: AgencyUser }>(
    `/api/admin/impersonate-tenant/${tenantId}`
  );
  return {
    token: res.data.token,
    tenant: res.data.tenant,
    user: res.data.user || ({} as AgencyUser),
  };
}

export async function fetchWalletBalance() {
  try {
    const res = await api.get<{ balanceCents: number; planQuota?: unknown }>('/api/wallet/balance');
    return res.data;
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return null;
    throw e;
  }
}

export async function fetchWalletLedger() {
  try {
    const res = await api.get<unknown[]>('/api/wallet/ledger');
    return res.data;
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return [];
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
  } catch (e) {
    if ((e as AxiosError).response?.status === 404) return null;
    throw e;
  }
}

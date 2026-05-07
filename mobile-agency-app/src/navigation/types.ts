import type { NavigatorScreenParams } from '@react-navigation/native';

export type ComposeParams = {
  consumerId?: string;
  email?: string;
  phone?: string;
  name?: string;
};

export type PostPaymentParams = {
  accountId?: string;
  consumerId?: string;
  consumerEmail?: string;
  name?: string;
  balanceCents?: number;
};

export type AccountsStackParamList = {
  AccountsList: undefined;
  AccountDetail: { accountId: string };
  Compose: ComposeParams;
  PostPayment: PostPaymentParams;
};

export type MessagingStackParamList = {
  MessagingList: undefined;
  Compose: ComposeParams;
};

export type PaymentsStackParamList = {
  PaymentsList: undefined;
  PostPayment: PostPaymentParams;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  Profile: undefined;
  Wallet: undefined;
  TenantSwitcher: undefined;
};

export type RootTabParamList = {
  Dashboard: undefined;
  Accounts: NavigatorScreenParams<AccountsStackParamList>;
  Messaging: NavigatorScreenParams<MessagingStackParamList>;
  Payments: NavigatorScreenParams<PaymentsStackParamList>;
  More: NavigatorScreenParams<MoreStackParamList>;
};

export function extractErrorMessage(e: unknown): string | undefined {
  if (typeof e === 'object' && e && 'response' in e) {
    const r = (e as { response?: { data?: { message?: string } } }).response;
    return r?.data?.message;
  }
  if (e instanceof Error) return e.message;
  return undefined;
}

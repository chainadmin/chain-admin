import type { AccountStatus } from '@shared/constants';

export type Consumer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type Account = {
  id: string;
  consumerId: string;
  consumer?: Consumer | null;
  accountNumber?: string | null;
  filenumber?: string | null;
  creditor?: string | null;
  balanceCents: number;
  status: AccountStatus | string;
  folderId?: string | null;
  dueDate?: string | null;
  createdAt?: string | null;
};

export type TenantStats = {
  totalConsumers: number;
  activeAccounts: number;
  /** Already in dollars (server divides by 100). */
  totalBalance: number;
  collectionRate: number;
  paymentMetrics?: {
    totalPayments: number;
    successfulPayments: number;
    declinedPayments: number;
    /** Already in dollars. */
    totalCollected: number;
    /** Already in dollars. */
    monthlyCollected: number;
  };
  emailMetrics?: { totalSent: number; opened: number; openRate: number; bounced: number };
  smsMetrics?: { totalSent: number; delivered: number; clickRate: number; failed: number };
};

export type Payment = {
  id: string;
  amountCents: number;
  status: string;
  consumerId?: string | null;
  consumerName?: string | null;
  consumer?: Consumer | null;
  paymentDate?: string | null;
  createdAt?: string | null;
  accountId?: string | null;
};

export type PaymentSchedule = {
  id: string;
  arrangementType: string | null;
  amountCents: number;
  frequency: string | null;
  nextPaymentDate: string | null;
  remainingPayments: number | null;
  totalPayments: number | null;
  paymentsCompleted: number;
  status: string;
  source?: string | null;
  processor?: string | null;
  accountNumber?: string | null;
  accountCreditor?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
  consumerName?: string | null;
};

export type CallbackRequest = {
  id: string;
  consumerId: string;
  status: string;
  requestType?: string | null;
  preferredTime?: string | null;
  phoneNumber?: string | null;
  emailAddress?: string | null;
  subject?: string | null;
  message?: string | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
};

export type ConversationMessage = {
  channel: 'email' | 'sms';
  direction: 'inbound' | 'outbound';
  timestamp: string;
  subject?: string | null;
  body?: string | null;
  message?: string | null;
};

export type Conversation = {
  messages: ConversationMessage[];
  summary: {
    totalEmails: number;
    totalSms: number;
    emailsSent: number;
    emailsReceived: number;
    smsSent: number;
    smsReceived: number;
  };
};

export type EmailReply = {
  id: string;
  fromEmail?: string | null;
  subject?: string | null;
  body?: string | null;
  htmlBody?: string | null;
  isRead?: boolean;
  read?: boolean;
  createdAt?: string | null;
};

export type SmsReply = {
  id: string;
  fromNumber?: string | null;
  phoneNumber?: string | null;
  message?: string | null;
  body?: string | null;
  isRead?: boolean;
  read?: boolean;
  createdAt?: string | null;
};

export type ManualPayment = {
  id: string;
  amountCents: number;
  paymentDate?: string | null;
  notes?: string | null;
};

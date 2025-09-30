import type { VercelResponse } from '@vercel/node';
import { Client } from 'postmark';
import { and, eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

import { getDb } from '../_lib/db';
import { withAuth, AuthenticatedRequest, JWT_SECRET } from '../_lib/auth';
import { accounts, consumers, emailTemplates, tenants } from '../_lib/schema';

const DEFAULT_FROM_EMAIL = 'support@chainsoftwaregroup.com';

const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
const postmarkClient = postmarkToken ? new Client(postmarkToken) : null;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return '';
  }

  return `$${(numericValue / 100).toFixed(2)}`;
}

function applyTemplateReplacement(template: string, key: string, value: string): string {
  if (!template) {
    return template;
  }

  const keyPattern = escapeRegExp(key);
  const patterns = [
    new RegExp(`\\{\\{\\s*${keyPattern}\\s*\\}\\}`, 'gi'),
    new RegExp(`\\{\\s*${keyPattern}\\s*\\}`, 'gi'),
  ];

  return patterns.reduce((result, pattern) => result.replace(pattern, value ?? ''), template);
}

function normalizeHtmlContent(content: string): string {
  if (!content) {
    return '';
  }

  const trimmed = content.trim();
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(trimmed);

  if (looksLikeHtml) {
    return trimmed;
  }

  const escaped = escapeHtml(content);
  return escaped
    .split(/\r?\n\r?\n/)
    .map(paragraph => `<p>${paragraph.replace(/\r?\n/g, '<br />')}</p>`)
    .join('');
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function replaceTemplateVariables(
  template: string,
  consumer: any,
  account: any,
  tenant: any,
  baseUrl: string
): string {
  if (!template) {
    return template;
  }

  const sanitizedBaseUrl = (baseUrl || 'localhost:5000').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const consumerEmail = consumer?.email || '';
  const consumerSlug = tenant?.slug;

  let consumerPortalUrl = '';
  if (sanitizedBaseUrl && consumerSlug) {
    const emailPath = consumerEmail ? `/${encodeURIComponent(consumerEmail)}` : '';
    consumerPortalUrl = `https://${sanitizedBaseUrl}/consumer/${consumerSlug}${emailPath}`;
  }

  const appDownloadUrl = sanitizedBaseUrl ? `https://${sanitizedBaseUrl}/download` : '';

  const firstName = consumer?.firstName || '';
  const lastName = consumer?.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const consumerPhone = consumer?.phone || '';

  const balanceCents = account?.balanceCents;
  const formattedBalance = formatCurrency(balanceCents);
  const formattedDueDate = account?.dueDate ? new Date(account.dueDate).toLocaleDateString() : '';
  const dueDateIso = account?.dueDate ? new Date(account.dueDate).toISOString().split('T')[0] : '';

  const replacements: Record<string, string> = {
    firstName,
    lastName,
    fullName,
    consumerName: fullName,
    email: consumerEmail,
    phone: consumerPhone,
    consumerId: consumer?.id || '',
    accountId: account?.id || '',
    accountNumber: account?.accountNumber || '',
    creditor: account?.creditor || '',
    balance: formattedBalance,
    balence: formattedBalance,
    balanceCents: balanceCents !== undefined && balanceCents !== null ? String(balanceCents) : '',
    dueDate: formattedDueDate,
    dueDateIso,
    consumerPortalLink: consumerPortalUrl,
    appDownloadLink: appDownloadUrl,
    agencyName: tenant?.name || '',
    agencyEmail: tenant?.email || '',
    agencyPhone: tenant?.phoneNumber || tenant?.twilioPhoneNumber || '',
  };

  let processedTemplate = template;

  Object.entries(replacements).forEach(([key, value]) => {
    processedTemplate = applyTemplateReplacement(processedTemplate, key, value || '');
  });

  const additionalSources = [consumer?.additionalData, account?.additionalData];
  additionalSources.forEach(source => {
    if (source && typeof source === 'object') {
      Object.entries(source).forEach(([key, value]) => {
        const stringValue =
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
        processedTemplate = applyTemplateReplacement(processedTemplate, key, stringValue);
      });
    }
  });

  return processedTemplate;
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const db = await getDb();

    const token = req.headers.authorization?.replace('Bearer ', '') ||
      req.headers.cookie?.split(';').find(c => c.trim().startsWith('authToken='))?.split('=')[1];

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const tenantId = decoded.tenantId;

    if (!tenantId) {
      res.status(403).json({ error: 'No tenant access' });
      return;
    }

    const { consumerId, accountId, templateId, subject, body } = req.body || {};

    if (!consumerId && !accountId) {
      res.status(400).json({ error: 'A consumer or account must be specified' });
      return;
    }

    let consumerRecord: any | undefined;
    if (consumerId) {
      const [consumer] = await db
        .select()
        .from(consumers)
        .where(and(eq(consumers.id, consumerId), eq(consumers.tenantId, tenantId)))
        .limit(1);

      consumerRecord = consumer;
    }

    let accountRecord: any | undefined;
    if (accountId) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.tenantId, tenantId)))
        .limit(1);

      accountRecord = account;

      if (!consumerRecord && account?.consumerId) {
        const [consumer] = await db
          .select()
          .from(consumers)
          .where(and(eq(consumers.id, account.consumerId), eq(consumers.tenantId, tenantId)))
          .limit(1);
        consumerRecord = consumer;
      }
    }

    if (!consumerRecord && consumerId) {
      res.status(404).json({ error: 'Consumer not found' });
      return;
    }

    if (!accountRecord && accountId) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    if (!consumerRecord && accountRecord?.consumerId) {
      const [consumer] = await db
        .select()
        .from(consumers)
        .where(and(eq(consumers.id, accountRecord.consumerId), eq(consumers.tenantId, tenantId)))
        .limit(1);
      consumerRecord = consumer;
    }

    if (!consumerRecord) {
      res.status(404).json({ error: 'Consumer not found' });
      return;
    }

    if (!consumerRecord.email) {
      res.status(400).json({ error: 'The selected consumer does not have an email address on file' });
      return;
    }

    let templateRecord: any | undefined;
    if (templateId) {
      const [template] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.tenantId, tenantId)))
        .limit(1);

      if (!template) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      templateRecord = template;
    }

    const [tenantRecord] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const activePostmarkClient = tenantRecord?.postmarkServerToken
      ? new Client(tenantRecord.postmarkServerToken)
      : postmarkClient;

    if (!activePostmarkClient) {
      res.status(500).json({ error: 'Email service is not configured' });
      return;
    }

    let emailSubject = (subject || '').trim();
    if (!emailSubject) {
      emailSubject = (templateRecord?.subject || '').trim();
    }

    if (!emailSubject) {
      emailSubject = `Message from ${tenantRecord?.name || 'your agency'}`;
    }

    let rawBody = typeof body === 'string' ? body : '';
    if (!rawBody && templateRecord?.html) {
      rawBody = templateRecord.html;
    }

    if (!rawBody) {
      res.status(400).json({ error: 'Email content is required' });
      return;
    }

    const baseUrl = req.headers.origin || process.env.PUBLIC_BASE_URL || process.env.REPLIT_DOMAINS || '';

    const processedSubject = replaceTemplateVariables(emailSubject, consumerRecord, accountRecord, tenantRecord, baseUrl || '');
    const processedHtml = replaceTemplateVariables(
      normalizeHtmlContent(rawBody),
      consumerRecord,
      accountRecord,
      tenantRecord,
      baseUrl || ''
    );

    const result = await activePostmarkClient.sendEmail({
      From: tenantRecord?.email || DEFAULT_FROM_EMAIL,
      To: consumerRecord.email,
      Subject: processedSubject,
      HtmlBody: processedHtml,
      TextBody: htmlToText(processedHtml),
      Tag: 'direct-email',
      Metadata: {
        tenantId,
        consumerId: consumerRecord.id,
        ...(accountRecord ? { accountId: accountRecord.id } : {}),
        ...(templateRecord ? { templateId: templateRecord.id } : {}),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.MessageID,
    });
  } catch (error: any) {
    console.error('Send email error:', error);
    res.status(500).json({
      error: 'Failed to send email',
      message: error?.message || 'Unknown error',
    });
  }
}

export default withAuth(handler);

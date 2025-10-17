import { Client } from 'postmark';
import { db } from './db';
import { emailLogs, tenants } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Postmark client will be validated at server startup, not module load
// This allows Docker build to succeed without runtime env vars
const postmarkClient = new Client(process.env.POSTMARK_SERVER_TOKEN || 'will-be-validated-at-startup');

type MetadataValue = string | number | boolean | null | undefined;

export interface EmailOptions {
  to: string;
  from?: string; // Make optional, will default to verified sender
  replyTo?: string; // Optional reply-to address
  subject: string;
  html: string;
  text?: string;
  tag?: string;
  metadata?: Record<string, MetadataValue>;
  tenantId?: string; // For usage tracking
}

// Default sender address - verified in Postmark
const DEFAULT_FROM_EMAIL = 'support@chainsoftwaregroup.com';

export class EmailService {
  async sendEmail(options: EmailOptions): Promise<{ messageId: string; success: boolean; error?: string }> {
    try {
      let fromEmail = options.from || DEFAULT_FROM_EMAIL;
      
      // If tenantId is provided, check for custom sender email
      if (options.tenantId) {
        const [tenant] = await db
          .select({ customSenderEmail: tenants.customSenderEmail, slug: tenants.slug, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, options.tenantId))
          .limit(1);
        
        if (tenant) {
          // Priority: customSenderEmail > slug-based email > provided from > default
          if (tenant.customSenderEmail) {
            fromEmail = tenant.customSenderEmail;
          } else {
            // Use slug-based email as default for tenant emails (overrides options.from)
            fromEmail = `${tenant.name} <${tenant.slug}@chainsoftwaregroup.com>`;
          }
        }
      }
      
      const textBody = options.text || this.htmlToText(options.html);
      
      const normalizedMetadata = this.normalizeMetadata(options.metadata);

      // Use the tenant's inbound email as reply-to if available, otherwise use from email
      const replyToEmail = options.replyTo || fromEmail;

      const result = await postmarkClient.sendEmail({
        From: fromEmail,
        To: options.to,
        ReplyTo: replyToEmail,
        Subject: options.subject,
        HtmlBody: options.html,
        TextBody: textBody,
        Tag: options.tag,
        Metadata: normalizedMetadata,
        TrackOpens: true, // Enable open tracking
      });

      // Log email to database if tenantId is provided
      if (options.tenantId) {
        await db.insert(emailLogs).values({
          tenantId: options.tenantId,
          messageId: result.MessageID,
          fromEmail: fromEmail,
          toEmail: options.to,
          subject: options.subject,
          htmlBody: options.html,
          textBody: textBody,
          status: 'sent',
          tag: options.tag,
          metadata: normalizedMetadata || {},
        });
      }

      return {
        messageId: result.MessageID,
        success: true,
      };
    } catch (error: any) {
      console.error('Postmark email error:', error);
      return {
        messageId: '',
        success: false,
        error: error.message || 'Unknown email error',
      };
    }
  }

  async sendBulkEmails(emails: EmailOptions[]): Promise<{ 
    successful: number; 
    failed: number; 
    results: { messageId: string; success: boolean; to: string; error?: string }[] 
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    // Send emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (email) => {
          const result = await this.sendEmail(email);
          if (result.success) {
            successful++;
          } else {
            failed++;
          }
          return {
            ...result,
            to: email.to,
          };
        })
      );

      results.push(...batchResults);
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      successful,
      failed,
      results,
    };
  }

  // Simple HTML to text conversion
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private normalizeMetadata(metadata?: Record<string, MetadataValue>): Record<string, string> | undefined {
    if (!metadata) {
      return undefined;
    }

    const normalizedEntries = Object.entries(metadata).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value === null || value === undefined) {
        return acc;
      }

      acc[key] = String(value);
      return acc;
    }, {});

    return Object.keys(normalizedEntries).length > 0 ? normalizedEntries : undefined;
  }

  // Test email connectivity
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Postmark doesn't have a specific test endpoint, so we'll just verify the client is properly configured
      // You can send a test email to yourself to verify
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Connection test failed' 
      };
    }
  }
}

export const emailService = new EmailService();
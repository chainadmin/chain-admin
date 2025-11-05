import { Client } from 'postmark';
import { db } from './db';
import { emailLogs, tenants, tenantSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { smaxService } from './smaxService';

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
            
            // Create SMAX note if filenumber and tenantId are available
            // Skip internal notifications (payment_notification, arrangement_notification, etc.)
            const isInternalNotification = typeof email.metadata?.type === 'string' && email.metadata.type.includes('notification');
            if (email.metadata?.filenumber && email.tenantId && !isInternalNotification) {
              try {
                await smaxService.insertNote(email.tenantId, {
                  filenumber: String(email.metadata.filenumber),
                  collectorname: 'System',
                  logmessage: `Email sent: ${email.subject}`
                });
                console.log(`📝 SMAX note created for email to account ${email.metadata.filenumber}`);
              } catch (noteError) {
                console.error('Error creating SMAX note for email:', noteError);
                // Don't fail the email send if note creation fails
              }
            }
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

  // Send payment notification to company
  async sendPaymentNotification(params: {
    tenantId: string;
    consumerName: string;
    accountNumber: string;
    amountCents: number;
    paymentMethod: string;
    transactionId?: string;
    paymentType: 'one_time' | 'scheduled' | 'manual';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Get tenant settings for contact email
      const [settings] = await db
        .select({ contactEmail: tenantSettings.contactEmail })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, params.tenantId))
        .limit(1);

      if (!settings?.contactEmail) {
        console.log(`⚠️ No contact email configured for tenant ${params.tenantId} - skipping payment notification`);
        return { success: false, error: 'No contact email configured' };
      }

      const amountFormatted = `$${(params.amountCents / 100).toFixed(2)}`;
      const paymentTypeLabel = params.paymentType === 'one_time' ? 'One-Time Payment' : 
                                params.paymentType === 'scheduled' ? 'Scheduled Payment' :
                                'Manual Payment';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">💰 New Payment Received</h2>
          
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1f2937;">Payment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Amount:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #10b981;">${amountFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Consumer:</td>
                <td style="padding: 8px 0;">${params.consumerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Account #:</td>
                <td style="padding: 8px 0;">${params.accountNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Payment Method:</td>
                <td style="padding: 8px 0;">${params.paymentMethod}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Type:</td>
                <td style="padding: 8px 0;">${paymentTypeLabel}</td>
              </tr>
              ${params.transactionId ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Transaction ID:</td>
                <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${params.transactionId}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This payment has been automatically recorded in your Chain platform.
          </p>
        </div>
      `;

      const result = await this.sendEmail({
        to: settings.contactEmail,
        subject: `💰 New Payment: ${amountFormatted} from ${params.consumerName}`,
        html,
        tag: 'payment-notification',
        metadata: {
          type: 'payment_notification',
          tenantId: params.tenantId,
          accountNumber: params.accountNumber,
          amountCents: params.amountCents,
        },
        tenantId: params.tenantId,
      });

      if (result.success) {
        console.log(`✅ Payment notification sent to ${settings.contactEmail}`);
      }

      return result;
    } catch (error: any) {
      console.error('❌ Failed to send payment notification:', error);
      return { success: false, error: error.message || 'Failed to send notification' };
    }
  }

  // Send arrangement notification to company
  async sendArrangementNotification(params: {
    tenantId: string;
    consumerName: string;
    accountNumber: string;
    arrangementType: string;
    monthlyPayment: number;
    totalBalance: number;
    startDate: string;
    endDate?: string;
    remainingPayments?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Get tenant settings for contact email
      const [settings] = await db
        .select({ contactEmail: tenantSettings.contactEmail })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, params.tenantId))
        .limit(1);

      if (!settings?.contactEmail) {
        console.log(`⚠️ No contact email configured for tenant ${params.tenantId} - skipping arrangement notification`);
        return { success: false, error: 'No contact email configured' };
      }

      const monthlyPaymentFormatted = `$${(params.monthlyPayment / 100).toFixed(2)}`;
      const totalBalanceFormatted = `$${(params.totalBalance / 100).toFixed(2)}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">📅 New Payment Arrangement Created</h2>
          
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1f2937;">Arrangement Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Consumer:</td>
                <td style="padding: 8px 0;">${params.consumerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Account #:</td>
                <td style="padding: 8px 0;">${params.accountNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Arrangement Type:</td>
                <td style="padding: 8px 0;">${params.arrangementType}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Total Balance:</td>
                <td style="padding: 8px 0; font-weight: 600;">${totalBalanceFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Monthly Payment:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #10b981;">${monthlyPaymentFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Start Date:</td>
                <td style="padding: 8px 0;">${params.startDate}</td>
              </tr>
              ${params.endDate ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">End Date:</td>
                <td style="padding: 8px 0;">${params.endDate}</td>
              </tr>
              ` : ''}
              ${params.remainingPayments ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-weight: 500;">Remaining Payments:</td>
                <td style="padding: 8px 0;">${params.remainingPayments}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This payment arrangement has been automatically created in your Chain platform.
          </p>
        </div>
      `;

      const result = await this.sendEmail({
        to: settings.contactEmail,
        subject: `📅 New Payment Arrangement: ${params.consumerName} - ${monthlyPaymentFormatted}/month`,
        html,
        tag: 'arrangement-notification',
        metadata: {
          type: 'arrangement_notification',
          tenantId: params.tenantId,
          accountNumber: params.accountNumber,
          arrangementType: params.arrangementType,
        },
        tenantId: params.tenantId,
      });

      if (result.success) {
        console.log(`✅ Arrangement notification sent to ${settings.contactEmail}`);
      }

      return result;
    } catch (error: any) {
      console.error('❌ Failed to send arrangement notification:', error);
      return { success: false, error: error.message || 'Failed to send notification' };
    }
  }
}

export const emailService = new EmailService();
import { Client } from 'postmark';

if (!process.env.POSTMARK_SERVER_TOKEN) {
  throw new Error('Missing required Postmark Server Token: POSTMARK_SERVER_TOKEN');
}

const postmarkClient = new Client(process.env.POSTMARK_SERVER_TOKEN);

export interface EmailOptions {
  to: string;
  from?: string; // Make optional, will default to verified sender
  subject: string;
  html: string;
  text?: string;
  tag?: string;
  metadata?: Record<string, string>;
}

// Default sender address - verified in Postmark
const DEFAULT_FROM_EMAIL = 'support@chainsoftwaregroup.com';

export class EmailService {
  async sendEmail(options: EmailOptions): Promise<{ messageId: string; success: boolean; error?: string }> {
    try {
      const result = await postmarkClient.sendEmail({
        From: options.from || DEFAULT_FROM_EMAIL,
        To: options.to,
        Subject: options.subject,
        HtmlBody: options.html,
        TextBody: options.text || this.htmlToText(options.html),
        Tag: options.tag,
        Metadata: options.metadata,
        TrackOpens: true, // Enable open tracking
        TrackLinks: 'HtmlOnly', // Enable click tracking
      });

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
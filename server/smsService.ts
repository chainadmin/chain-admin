import twilio from 'twilio';
import { storage } from './storage';
import { smaxService } from './smaxService';

interface SmsThrottleConfig {
  maxPerMinute: number;
  tenantId: string;
}

interface QueuedSms {
  to: string;
  message: string;
  tenantId: string;
  campaignId?: string;
  consumerId?: string;
  timestamp: Date;
}

class SmsService {
  private clients: Map<string, twilio.Twilio> = new Map(); // Store client per tenant
  private sendQueue: QueuedSms[] = [];
  private processing = false;
  private sentCounts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor() {
    this.initializeDefaultTwilio();
    // Start processing queue every 10 seconds
    setInterval(() => this.processQueue(), 10000);
    // Reset rate limit counters every minute
    setInterval(() => this.resetCounters(), 60000);
  }

  private initializeDefaultTwilio() {
    // Initialize with default credentials if available (for backwards compatibility)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      this.clients.set('default', twilio(accountSid, authToken));
      console.log('Twilio SMS service initialized');
    } else {
      console.warn('Twilio credentials not found. SMS service will be disabled.');
    }
  }

  private async getTwilioClient(tenantId: string): Promise<twilio.Twilio | null> {
    // Check if we already have a client for this tenant
    if (this.clients.has(tenantId)) {
      return this.clients.get(tenantId)!;
    }

    try {
      // Get tenant-specific Twilio credentials from tenants table
      const tenant = await storage.getTenant(tenantId);
      
      if (tenant?.twilioAccountSid && tenant?.twilioAuthToken) {
        const client = twilio(tenant.twilioAccountSid, tenant.twilioAuthToken);
        this.clients.set(tenantId, client);
        return client;
      }
    } catch (error) {
      console.error(`Error getting Twilio credentials for tenant ${tenantId}:`, error);
    }

    // Fall back to default client if available
    return this.clients.get('default') || null;
  }

  private async getTwilioPhoneNumber(tenantId: string): Promise<string | null> {
    try {
      // Get tenant-specific phone number from tenants table
      const tenant = await storage.getTenant(tenantId);
      
      if (tenant?.twilioPhoneNumber) {
        return tenant.twilioPhoneNumber;
      }
    } catch (error) {
      console.error(`Error getting Twilio phone number for tenant ${tenantId}:`, error);
    }

    // Fall back to default phone number if available
    return process.env.TWILIO_PHONE_NUMBER || null;
  }

  private resetCounters() {
    const now = Date.now();
    const entries = Array.from(this.sentCounts.entries());
    for (const [tenantId, data] of entries) {
      if (now >= data.resetTime) {
        this.sentCounts.set(tenantId, { count: 0, resetTime: now + 60000 });
      }
    }
  }

  private async getThrottleConfig(tenantId: string): Promise<SmsThrottleConfig> {
    try {
      const tenantSettings = await storage.getTenantSettings(tenantId);
      return {
        maxPerMinute: tenantSettings?.smsThrottleLimit || 10, // Default: 10 SMS per minute
        tenantId,
      };
    } catch (error) {
      console.error('Error fetching throttle config:', error);
      return {
        maxPerMinute: 10, // Safe default
        tenantId,
      };
    }
  }

  private canSendSms(tenantId: string, maxPerMinute: number): boolean {
    const now = Date.now();
    const currentData = this.sentCounts.get(tenantId);

    if (!currentData || now >= currentData.resetTime) {
      this.sentCounts.set(tenantId, { count: 0, resetTime: now + 60000 });
      return true;
    }

    return currentData.count < maxPerMinute;
  }

  private incrementSentCount(tenantId: string) {
    const currentData = this.sentCounts.get(tenantId);
    if (currentData) {
      currentData.count++;
    }
  }

  private decrementSentCount(tenantId: string) {
    const currentData = this.sentCounts.get(tenantId);
    if (currentData && currentData.count > 0) {
      currentData.count--;
    }
  }

  async sendSms(
    to: string,
    message: string,
    tenantId: string,
    campaignId?: string,
    consumerId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string; queued?: boolean }> {
    const client = await this.getTwilioClient(tenantId);
    if (!client) {
      return { success: false, error: 'SMS service not configured for this agency. Please add Twilio credentials in Settings.' };
    }

    const throttleConfig = await this.getThrottleConfig(tenantId);

    // Check if we can send immediately
    if (this.canSendSms(tenantId, throttleConfig.maxPerMinute)) {
      // INCREMENT BEFORE SENDING to prevent race condition
      this.incrementSentCount(tenantId);
      
      try {
        const result = await this.sendImmediately(to, message, tenantId, campaignId, consumerId);
        if (!result.success) {
          // Rollback count on failure
          this.decrementSentCount(tenantId);
        }
        return result;
      } catch (error) {
        // Rollback count on error
        this.decrementSentCount(tenantId);
        console.error('Error sending SMS:', error);
        return { success: false, error: 'Failed to send SMS' };
      }
    } else {
      // Queue the message for later
      this.sendQueue.push({
        to,
        message,
        tenantId,
        campaignId,
        consumerId,
        timestamp: new Date(),
      });
      return { success: true, queued: true };
    }
  }

  private async sendImmediately(
    to: string,
    message: string,
    tenantId: string,
    campaignId?: string,
    consumerId?: string,
    accountId?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const client = await this.getTwilioClient(tenantId);
      if (!client) {
        throw new Error('Twilio client not configured for this agency');
      }

      const fromNumber = await this.getTwilioPhoneNumber(tenantId);
      if (!fromNumber) {
        throw new Error('Twilio phone number not configured for this agency');
      }

      // Get the webhook URL from environment
      // Priority: APP_URL (Railway/production) > RAILWAY_PUBLIC_DOMAIN > REPLIT_DOMAINS > localhost
      let baseUrl = process.env.APP_URL 
        || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
        || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : null)
        || 'http://localhost:5000';
      
      // Check if baseUrl contains wildcard (*) - if so, skip webhook to allow SMS to send
      const hasWildcard = baseUrl.includes('*');
      
      if (hasWildcard) {
        console.warn(`⚠️  APP_URL contains wildcard (*): ${baseUrl}`);
        console.warn(`⚠️  Skipping webhook to allow SMS to send. Fix APP_URL on Railway to enable tracking.`);
      }
      
      // Ensure baseUrl doesn't have trailing slash and has protocol
      const cleanBaseUrl = baseUrl.replace(/\/$/, '');
      const webhookUrl = hasWildcard ? undefined : `${cleanBaseUrl}/api/webhooks/twilio`;
      
      console.log(`📡 SMS Status Callback URL: ${webhookUrl || 'SKIPPED (wildcard in APP_URL)'}`);
      console.log(`   APP_URL: ${process.env.APP_URL || 'NOT SET'}`);
      console.log(`   RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'NOT SET'}`);

      const messageOptions: any = {
        body: message,
        from: fromNumber,
        to: to,
        provideFeedback: true,
      };
      
      // Only add statusCallback if we have a valid URL (no wildcard)
      if (webhookUrl) {
        messageOptions.statusCallback = webhookUrl;
      }

      const result = await client.messages.create(messageOptions);

      // Track ALL sent SMS for billing purposes (not just campaigns)
      await storage.createSmsTracking({
        tenantId,
        campaignId: campaignId || null,
        consumerId: consumerId || null,
        phoneNumber: to,
        messageBody: message,
        status: result.status || 'queued', // Use Twilio's actual status (queued, accepted, etc.)
        sentAt: new Date(),
        trackingData: { twilioSid: result.sid },
      });
      
      console.log(`📱 SMS tracking created: tenant=${tenantId}, sid=${result.sid}, campaign=${campaignId || 'none'}`);

      // Create SMAX note if accountId is provided
      if (accountId) {
        try {
          const account = await storage.getAccount(accountId);
          if (account && account.filenumber) {
            const messagePreview = message.length > 100 ? message.substring(0, 100) + '...' : message;
            await smaxService.insertNote(tenantId, {
              filenumber: account.filenumber,
              collectorname: 'System',
              logmessage: `SMS sent: ${messagePreview}`
            });
            console.log(`📝 SMAX note created for SMS to account ${account.filenumber}`);
          }
        } catch (noteError) {
          console.error('Error creating SMAX note for SMS:', noteError);
          // Don't fail the SMS send if note creation fails
        }
      }

      return { success: true, messageId: result.sid };
    } catch (error: any) {
      console.error('Twilio SMS error:', error);
      
      // Track ALL failed SMS for billing purposes (not just campaigns)
      await storage.createSmsTracking({
        tenantId,
        campaignId: campaignId || null,
        consumerId: consumerId || null,
        phoneNumber: to,
        messageBody: message,
        status: 'failed',
        sentAt: new Date(),
        errorMessage: error.message,
        trackingData: { error: error.message },
      });
      
      console.log(`📱 Failed SMS tracked: tenant=${tenantId}, campaign=${campaignId || 'none'}`);

      return { success: false, error: error.message };
    }
  }

  private async processQueue() {
    if (this.processing || this.sendQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const processedItems: QueuedSms[] = [];

      for (const queuedSms of this.sendQueue) {
        const throttleConfig = await this.getThrottleConfig(queuedSms.tenantId);

        if (this.canSendSms(queuedSms.tenantId, throttleConfig.maxPerMinute)) {
          const result = await this.sendImmediately(
            queuedSms.to,
            queuedSms.message,
            queuedSms.tenantId,
            queuedSms.campaignId,
            queuedSms.consumerId
          );

          if (result.success) {
            this.incrementSentCount(queuedSms.tenantId);
            processedItems.push(queuedSms);
          }
        }
      }

      // Remove processed items from queue
      this.sendQueue = this.sendQueue.filter(item => !processedItems.includes(item));

      // Remove old queued items (older than 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      this.sendQueue = this.sendQueue.filter(item => item.timestamp > oneHourAgo);

    } catch (error) {
      console.error('Error processing SMS queue:', error);
    } finally {
      this.processing = false;
    }
  }

  async sendBulkSms(
    recipients: Array<{ to: string; message: string; consumerId?: string }>,
    tenantId: string,
    campaignId?: string
  ): Promise<{ totalSent: number; totalQueued: number; totalFailed: number }> {
    let totalSent = 0;
    let totalQueued = 0;
    let totalFailed = 0;

    for (const recipient of recipients) {
      const result = await this.sendSms(
        recipient.to,
        recipient.message,
        tenantId,
        campaignId,
        recipient.consumerId
      );

      if (result.success) {
        if (result.queued) {
          totalQueued++;
        } else {
          totalSent++;
        }
      } else {
        totalFailed++;
      }

      // Small delay between sends to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { totalSent, totalQueued, totalFailed };
  }

  // Synchronous bulk send for campaigns - bypasses queue to ensure accurate metrics
  // Supports resume functionality via startIndex parameter
  async sendBulkSmsCampaign(
    recipients: Array<{ to: string; message: string; consumerId?: string; accountId?: string }>,
    tenantId: string,
    campaignId: string,
    isCancelled?: () => boolean,
    startIndex: number = 0 // Start from this index for resume functionality
  ): Promise<{ totalSent: number; totalFailed: number; wasCancelled?: boolean; lastSentIndex: number }> {
    let totalSent = 0;
    let totalFailed = 0;
    let lastProgressUpdate = Date.now();
    let currentIndex = startIndex;
    const progressUpdateInterval = 5000; // Update progress every 5 seconds

    const throttleConfig = await this.getThrottleConfig(tenantId);
    // For bulk campaigns, use a higher rate limit (minimum 60/min for campaigns)
    // This ensures campaigns complete in reasonable time while respecting Twilio limits
    // Twilio generally allows up to 100-400 msgs/sec for 10DLC, so 60-120/min is very safe
    const baseMaxPerMinute = Math.max(1, throttleConfig.maxPerMinute);
    const maxPerMinute = Math.max(60, baseMaxPerMinute); // At least 60/min for bulk campaigns
    const delayBetweenBatches = Math.max(100, 60000 / maxPerMinute); // Min 100ms between messages

    console.log(`📤 Starting SMS campaign send: ${recipients.length - startIndex} remaining messages (starting at index ${startIndex}) at ${maxPerMinute}/min (${delayBetweenBatches}ms between messages, tenant base rate: ${baseMaxPerMinute}/min)`);

    for (let i = startIndex; i < recipients.length; i++) {
      currentIndex = i;
      
      // Check if campaign was cancelled
      if (isCancelled && isCancelled()) {
        console.log(`🛑 Campaign ${campaignId} cancelled at index ${i} - stopping send after ${totalSent} sent, ${totalFailed} failed`);
        // Save the last index for resume
        try {
          await storage.updateSmsCampaign(campaignId, { lastSentIndex: i });
        } catch (e) { console.error('Error saving lastSentIndex:', e); }
        return { totalSent, totalFailed, wasCancelled: true, lastSentIndex: i };
      }
      
      const recipient = recipients[i];
      try {
        // Respect rate limits by checking before sending
        while (!this.canSendSms(tenantId, maxPerMinute)) {
          // Check for cancellation during rate limit wait too
          if (isCancelled && isCancelled()) {
            console.log(`🛑 Campaign ${campaignId} cancelled during rate limit wait at index ${i}`);
            try {
              await storage.updateSmsCampaign(campaignId, { lastSentIndex: i });
            } catch (e) { console.error('Error saving lastSentIndex:', e); }
            return { totalSent, totalFailed, wasCancelled: true, lastSentIndex: i };
          }
          // Wait for rate limit window to reset
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const result = await this.sendImmediately(
          recipient.to,
          recipient.message,
          tenantId,
          campaignId,
          recipient.consumerId,
          recipient.accountId
        );

        if (result.success) {
          totalSent++;
          this.incrementSentCount(tenantId); // Track sent count for rate limiting
        } else {
          totalFailed++;
        }

        // Update campaign progress periodically (every 5 seconds or every 10 messages)
        const now = Date.now();
        if (now - lastProgressUpdate >= progressUpdateInterval || (i + 1) % 10 === 0 || i === recipients.length - 1) {
          try {
            await storage.updateSmsCampaign(campaignId, {
              totalSent: totalSent + startIndex, // Add previous sent count for resume
              totalErrors: totalFailed,
              lastSentIndex: i + 1, // Track progress for resume
            });
            console.log(`📊 Progress: ${i + 1}/${recipients.length} (${totalSent} sent this session, ${totalFailed} failed)`);
            lastProgressUpdate = now;
          } catch (updateError) {
            console.error('Error updating campaign progress:', updateError);
          }
        }

        // Delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      } catch (error) {
        console.error(`Error sending SMS to ${recipient.to}:`, error);
        totalFailed++;
      }
    }

    console.log(`✅ SMS campaign send complete: ${totalSent} sent, ${totalFailed} failed`);
    return { totalSent, totalFailed, lastSentIndex: recipients.length };
  }

  getQueueStatus(tenantId?: string): { queueLength: number; estimatedWaitTime: number } {
    const relevantQueue = tenantId 
      ? this.sendQueue.filter(item => item.tenantId === tenantId)
      : this.sendQueue;

    // Estimate wait time based on queue length and throttle limits
    // This is a simplified calculation
    const estimatedWaitTime = Math.ceil(relevantQueue.length / 10) * 60; // Assuming 10 per minute average

    return {
      queueLength: relevantQueue.length,
      estimatedWaitTime,
    };
  }

  async getRateLimitStatus(tenantId: string): Promise<{
    used: number;
    limit: number;
    resetTime: number;
    canSend: boolean;
  }> {
    const throttleConfig = await this.getThrottleConfig(tenantId);
    const currentData = this.sentCounts.get(tenantId);
    const now = Date.now();

    if (!currentData || now >= currentData.resetTime) {
      return {
        used: 0,
        limit: throttleConfig.maxPerMinute,
        resetTime: now + 60000,
        canSend: true,
      };
    }

    return {
      used: currentData.count,
      limit: throttleConfig.maxPerMinute,
      resetTime: currentData.resetTime,
      canSend: currentData.count < throttleConfig.maxPerMinute,
    };
  }
}

export const smsService = new SmsService();
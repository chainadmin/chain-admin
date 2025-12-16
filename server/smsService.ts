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
  metadata?: { automationId?: string; automationName?: string; source?: string };
}

class SmsService {
  private clients: Map<string, twilio.Twilio> = new Map(); // Store client per tenant
  private sendQueue: QueuedSms[] = [];
  private processing = false;
  private sentCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private cancelledCampaigns: Set<string> = new Set(); // Track cancelled campaigns to stop queue processing

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
    consumerId?: string,
    metadata?: { automationId?: string; automationName?: string; source?: string }
  ): Promise<{ success: boolean; messageId?: string; error?: string; queued?: boolean; blocked?: boolean }> {
    // SMS COMPLIANCE: Pre-send check for opted-out consumers and blocked numbers
    // This prevents sending to consumers who have replied STOP or have undeliverable numbers
    try {
      // Normalize phone number for consistent lookup
      const normalizedPhone = to.replace(/\D/g, '');
      
      // Check if phone number is in blocked list
      const isBlocked = await storage.isPhoneNumberBlocked(tenantId, normalizedPhone);
      if (isBlocked) {
        console.log(`🚫 SMS blocked: Phone ${normalizedPhone} is in blocked numbers list for tenant ${tenantId}`);
        return { success: false, blocked: true, error: 'Phone number is blocked or undeliverable' };
      }

      // If consumerId provided, check if consumer has opted out
      if (consumerId) {
        const consumer = await storage.getConsumer(consumerId);
        if (consumer && (consumer as any).smsOptedOut) {
          console.log(`🛑 SMS blocked: Consumer ${consumerId} has opted out of SMS`);
          return { success: false, blocked: true, error: 'Consumer has opted out of SMS communications' };
        }
      }
    } catch (complianceError) {
      console.error('Error checking SMS compliance (continuing with send):', complianceError);
      // Don't block on compliance check errors - fail open but log
    }

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
        const result = await this.sendImmediately(to, message, tenantId, campaignId, consumerId, undefined, metadata);
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
        metadata,
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
    accountId?: string,
    metadata?: { automationId?: string; automationName?: string; source?: string }
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

      // Record billing at send time as fallback (in case webhook fails)
      // Estimate 1 segment - webhook will provide accurate count if it works
      try {
        await storage.recordMessagingUsageEvent({
          tenantId,
          provider: 'twilio',
          messageType: 'sms',
          quantity: 1, // Default to 1 segment, webhook will provide accurate count
          externalMessageId: result.sid,
          occurredAt: new Date(),
          metadata: { 
            source: metadata?.source || 'send_fallback',
            automationId: metadata?.automationId,
            automationName: metadata?.automationName,
            campaignId,
            consumerId,
          },
        });
        console.log(`💰 SMS billing recorded at send time: tenant=${tenantId}, sid=${result.sid}, source=${metadata?.source || 'send_fallback'}`);
      } catch (billingError) {
        console.error('Failed to record SMS billing at send time:', billingError);
        // Don't fail the SMS send if billing fails
      }

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
      const skippedItems: QueuedSms[] = [];

      for (const queuedSms of this.sendQueue) {
        // CRITICAL: Skip messages for cancelled campaigns
        if (queuedSms.campaignId && this.cancelledCampaigns.has(queuedSms.campaignId)) {
          console.log(`🛑 Skipping queued SMS for cancelled campaign ${queuedSms.campaignId}`);
          skippedItems.push(queuedSms);
          continue;
        }

        const throttleConfig = await this.getThrottleConfig(queuedSms.tenantId);

        if (this.canSendSms(queuedSms.tenantId, throttleConfig.maxPerMinute)) {
          const result = await this.sendImmediately(
            queuedSms.to,
            queuedSms.message,
            queuedSms.tenantId,
            queuedSms.campaignId,
            queuedSms.consumerId,
            undefined,
            queuedSms.metadata
          );

          if (result.success) {
            this.incrementSentCount(queuedSms.tenantId);
            processedItems.push(queuedSms);
          }
        }
      }

      // Remove processed and skipped items from queue
      this.sendQueue = this.sendQueue.filter(item => !processedItems.includes(item) && !skippedItems.includes(item));

      // Remove old queued items (older than 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      this.sendQueue = this.sendQueue.filter(item => item.timestamp > oneHourAgo);

    } catch (error) {
      console.error('Error processing SMS queue:', error);
    } finally {
      this.processing = false;
    }
  }

  // Cancel a campaign and purge all pending queue entries for it
  cancelCampaign(campaignId: string): number {
    console.log(`🛑 Cancelling campaign ${campaignId} and purging queue...`);
    
    // Add to cancelled set to prevent future queue processing
    this.cancelledCampaigns.add(campaignId);
    
    // Count and remove all queued messages for this campaign
    const beforeCount = this.sendQueue.length;
    this.sendQueue = this.sendQueue.filter(item => item.campaignId !== campaignId);
    const removedCount = beforeCount - this.sendQueue.length;
    
    console.log(`🗑️ Purged ${removedCount} queued messages for campaign ${campaignId}`);
    
    // Clean up old cancelled campaign IDs after 1 hour to prevent memory leak
    setTimeout(() => {
      this.cancelledCampaigns.delete(campaignId);
    }, 60 * 60 * 1000);
    
    return removedCount;
  }

  // Check if a campaign is cancelled
  isCampaignCancelled(campaignId: string): boolean {
    return this.cancelledCampaigns.has(campaignId);
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
    let lastDbStatusCheck = 0; // Start at 0 so first check hits DB immediately
    let currentIndex = startIndex;
    const progressUpdateInterval = 5000; // Update progress every 5 seconds
    const dbStatusCheckInterval = 2000; // Check database status every 2 seconds

    const throttleConfig = await this.getThrottleConfig(tenantId);
    // Respect tenant's configured throttle limit for campaigns
    // This allows tenants to control their sending rate for compliance and carrier requirements
    const maxPerMinute = Math.max(1, throttleConfig.maxPerMinute);
    const delayBetweenBatches = Math.max(100, 60000 / maxPerMinute); // Min 100ms between messages

    console.log(`📤 Starting SMS campaign send: ${recipients.length - startIndex} remaining messages (starting at index ${startIndex}) at ${maxPerMinute}/min (${delayBetweenBatches}ms between messages)`);

    // Helper function to check if campaign should stop - checks both in-memory flag AND database status
    const shouldStopCampaign = async (): Promise<boolean> => {
      // First check the fast in-memory flag
      if (isCancelled && isCancelled()) {
        return true;
      }
      
      // Periodically verify against database status (every 2 seconds)
      const now = Date.now();
      if (now - lastDbStatusCheck >= dbStatusCheckInterval) {
        lastDbStatusCheck = now;
        try {
          const campaign = await storage.getSmsCampaignById(campaignId, tenantId);
          if (campaign) {
            const status = (campaign.status || '').toLowerCase().trim();
            if (status === 'cancelled' || status === 'failed') {
              console.log(`🛑 Campaign ${campaignId} detected as ${status} from database check`);
              return true;
            }
          }
        } catch (e) {
          console.error('Error checking campaign status from database:', e);
        }
      }
      
      return false;
    };

    for (let i = startIndex; i < recipients.length; i++) {
      currentIndex = i;
      
      // Check if campaign was cancelled (in-memory + periodic DB check)
      if (await shouldStopCampaign()) {
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
          if (await shouldStopCampaign()) {
            console.log(`🛑 Campaign ${campaignId} cancelled during rate limit wait at index ${i}`);
            try {
              await storage.updateSmsCampaign(campaignId, { lastSentIndex: i });
            } catch (e) { console.error('Error saving lastSentIndex:', e); }
            return { totalSent, totalFailed, wasCancelled: true, lastSentIndex: i };
          }
          // Wait for rate limit window to reset
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check cancellation one more time right before sending (uses shouldStopCampaign for DB check)
        if (await shouldStopCampaign()) {
          console.log(`🛑 Campaign ${campaignId} cancelled just before send at index ${i}`);
          try {
            await storage.updateSmsCampaign(campaignId, { lastSentIndex: i });
          } catch (e) { console.error('Error saving lastSentIndex:', e); }
          return { totalSent, totalFailed, wasCancelled: true, lastSentIndex: i };
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

        // Check cancellation immediately after sending to minimize message slip-through
        // Use fast in-memory check here since DB was just checked before send
        if (isCancelled && isCancelled()) {
          console.log(`🛑 Campaign ${campaignId} cancelled after send at index ${i} - stopping immediately`);
          try {
            await storage.updateSmsCampaign(campaignId, { 
              lastSentIndex: i + 1,
              totalSent: totalSent + startIndex,
              totalErrors: totalFailed,
            });
          } catch (e) { console.error('Error saving lastSentIndex:', e); }
          return { totalSent, totalFailed, wasCancelled: true, lastSentIndex: i + 1 };
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

  async syncHistoricalBlockedNumbers(
    tenantId: string,
    daysBack: number = 90
  ): Promise<{
    success: boolean;
    failedNumbers: number;
    optOutNumbers: number;
    consumersMarkedOptedOut: number;
    errors: string[];
    totalMessagesScanned: number;
  }> {
    const errors: string[] = [];
    let failedNumbers = 0;
    let optOutNumbers = 0;
    let consumersMarkedOptedOut = 0;
    let totalMessagesScanned = 0;

    try {
      const client = await this.getTwilioClient(tenantId);
      if (!client) {
        return {
          success: false,
          failedNumbers: 0,
          optOutNumbers: 0,
          consumersMarkedOptedOut: 0,
          errors: ['Twilio not configured for this tenant'],
          totalMessagesScanned: 0,
        };
      }

      const tenant = await storage.getTenant(tenantId);
      const twilioPhoneNumber = tenant?.twilioPhoneNumber;
      if (!twilioPhoneNumber) {
        return {
          success: false,
          failedNumbers: 0,
          optOutNumbers: 0,
          consumersMarkedOptedOut: 0,
          errors: ['No Twilio phone number configured for this tenant'],
          totalMessagesScanned: 0,
        };
      }

      const dateSent = new Date();
      dateSent.setDate(dateSent.getDate() - daysBack);

      console.log(`📱 Starting Twilio historical sync for tenant ${tenantId}, scanning ${daysBack} days back...`);

      const normalizePhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, '');
        return digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
      };

      const permanentFailureCodes = [
        21211, // Invalid 'To' Phone Number
        21610, // Message cannot be sent to this phone number (opt-out)
        21614, // 'To' number is not a valid mobile number
        21408, // Permission to send to this phone number is denied
        30003, // Unreachable destination handset
        30005, // Unknown destination handset
        30006, // Landline or unreachable carrier
        30007, // Carrier violation
      ];

      const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];

      // Fetch outbound failed messages
      console.log('📤 Scanning outbound messages for delivery failures...');
      try {
        const outboundMessages = await client.messages.list({
          from: twilioPhoneNumber,
          dateSentAfter: dateSent,
          limit: 1000,
        });

        for (const message of outboundMessages) {
          totalMessagesScanned++;
          
          if (message.status === 'failed' || message.status === 'undelivered') {
            const errorCode = message.errorCode;
            if (errorCode && permanentFailureCodes.includes(errorCode)) {
              const normalizedPhone = normalizePhone(message.to);
              try {
                await storage.addSmsBlockedNumber(
                  tenantId,
                  normalizedPhone,
                  errorCode === 21610 ? 'opted_out' : 'undeliverable',
                  String(errorCode),
                  `Historical sync: ${message.errorMessage || 'Delivery failed'}`
                );
                failedNumbers++;
                console.log(`🚫 Blocked ${normalizedPhone} (error ${errorCode})`);
              } catch (blockError: any) {
                if (!blockError.message?.includes('duplicate') && !blockError.message?.includes('already exists')) {
                  errors.push(`Failed to block ${normalizedPhone}: ${blockError.message}`);
                }
              }
            }
          }
        }
      } catch (outboundError: any) {
        errors.push(`Error fetching outbound messages: ${outboundError.message}`);
        console.error('Error fetching outbound messages:', outboundError);
      }

      // Fetch inbound messages for STOP keywords
      console.log('📥 Scanning inbound messages for STOP opt-outs...');
      try {
        const inboundMessages = await client.messages.list({
          to: twilioPhoneNumber,
          dateSentAfter: dateSent,
          limit: 1000,
        });

        for (const message of inboundMessages) {
          totalMessagesScanned++;
          
          const messageBody = message.body || '';
          const messageNormalized = messageBody.trim().toUpperCase().replace(/[^A-Z]/g, '');
          
          if (optOutKeywords.includes(messageNormalized)) {
            const normalizedPhone = normalizePhone(message.from);
            
            // Add to blocked numbers
            try {
              await storage.addSmsBlockedNumber(
                tenantId,
                normalizedPhone,
                'opted_out',
                'STOP',
                `Historical sync: Consumer replied "${messageBody}"`
              );
              optOutNumbers++;
              console.log(`🛑 Blocked ${normalizedPhone} (STOP reply)`);
            } catch (blockError: any) {
              if (!blockError.message?.includes('duplicate') && !blockError.message?.includes('already exists')) {
                errors.push(`Failed to block opt-out ${normalizedPhone}: ${blockError.message}`);
              }
            }

            // Try to find and mark consumer as opted out
            try {
              const matchedConsumers = await storage.getConsumersByPhoneNumber(normalizedPhone, tenantId);
              for (const consumer of matchedConsumers) {
                if (!(consumer as any).smsOptedOut) {
                  await storage.markConsumerSmsOptedOut(consumer.id, true);
                  consumersMarkedOptedOut++;
                  console.log(`✅ Marked consumer ${consumer.id} as SMS opted out`);
                }
              }
            } catch (consumerError: any) {
              errors.push(`Failed to mark consumer opted out for ${normalizedPhone}: ${consumerError.message}`);
            }
          }
        }
      } catch (inboundError: any) {
        errors.push(`Error fetching inbound messages: ${inboundError.message}`);
        console.error('Error fetching inbound messages:', inboundError);
      }

      console.log(`✅ Historical sync complete: ${failedNumbers} failed numbers, ${optOutNumbers} opt-outs, ${consumersMarkedOptedOut} consumers marked`);

      return {
        success: true,
        failedNumbers,
        optOutNumbers,
        consumersMarkedOptedOut,
        errors,
        totalMessagesScanned,
      };
    } catch (error: any) {
      console.error('Error during historical sync:', error);
      return {
        success: false,
        failedNumbers,
        optOutNumbers,
        consumersMarkedOptedOut,
        errors: [...errors, `Sync failed: ${error.message}`],
        totalMessagesScanned,
      };
    }
  }
}

export const smsService = new SmsService();
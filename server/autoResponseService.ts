import OpenAI from 'openai';
import type { BusinessType, TerminologyMap } from '../shared/terminology';
import { getTerminology } from '../shared/terminology';
import { db } from './db';
import { autoResponseConfig, autoResponseUsage, consumers, accounts, subscriptions, subscriptionPlans, tenantSettings } from '../shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { AUTO_RESPONSE_INCLUDED_RESPONSES, AUTO_RESPONSE_OVERAGE_PER_RESPONSE } from '../shared/billing-plans';

interface AutoResponseContext {
  consumerFirstName?: string;
  consumerLastName?: string;
  accountBalance?: number;
  creditorName?: string;
  accountNumber?: string;
  businessType?: BusinessType;
  messageType: 'email' | 'sms';
  inboundMessage: string;
  tenantId: string;
}

export class AutoResponseService {
  private openai: OpenAI | null = null;
  private tenantId: string;
  
  constructor(tenantId: string, apiKey?: string) {
    this.tenantId = tenantId;
    
    // Use environment variable OPENAI_API_KEY if not provided
    const key = apiKey || process.env.OPENAI_API_KEY;
    
    if (key) {
      this.openai = new OpenAI({
        apiKey: key,
      });
    }
  }
  
  /**
   * Generate a context-aware AI response to consumer messages
   */
  async generateResponse(context: AutoResponseContext): Promise<{
    response: string;
    tokensUsed: number;
    model: string;
  }> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Get tenant configuration
    const [config] = await db
      .select()
      .from(autoResponseConfig)
      .where(eq(autoResponseConfig.tenantId, context.tenantId))
      .limit(1);
    
    if (!config || !config.enabled) {
      throw new Error('Auto-response not enabled for this organization');
    }
    
    // Get business terminology
    const terms: TerminologyMap = getTerminology(context.businessType || 'call_center');
    
    // Build context-aware prompt
    const prompt = this.buildPrompt(context, terms, config);
    
    // Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: config.model || 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(terms, config),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    
    const response = completion.choices[0]?.message?.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;
    
    return {
      response,
      tokensUsed,
      model: config.model || 'gpt-5-nano',
    };
  }
  
  /**
   * Build the system prompt with business terminology
   */
  private getSystemPrompt(terms: TerminologyMap, config: any): string {
    const toneInstructions: Record<string, string> = {
      professional: 'Use a professional, formal tone. Be clear and concise.',
      friendly: 'Use a warm, friendly tone. Be approachable and helpful.',
      empathetic: 'Use an empathetic, understanding tone. Show compassion and support.',
      concise: 'Be extremely brief and to the point. Use minimal words.',
    };
    
    const tone = toneInstructions[config.responseTone || 'professional'];
    const customInstructions = config.customInstructions ? `\n\nAdditional Instructions: ${config.customInstructions}` : '';
    const businessTemplates = config.businessResponseTemplate ? `\n\nBusiness Response Templates:\n${config.businessResponseTemplate}\n\nUse these templates as examples when generating responses. Adapt them to the specific inquiry while maintaining the style and information provided.` : '';
    
    return `You are an AI assistant helping a ${terms.creditor} respond to ${terms.consumer.toLowerCase()} inquiries.

TERMINOLOGY TO USE:
- Call them "${terms.consumer}" not "debtor" or "customer"
- The company is the "${terms.creditor}"
- Accounts are called "${terms.account.toLowerCase()}s"
- Balances are called "${terms.balance.toLowerCase()}"
- Payments are called "${terms.payment.toLowerCase()}s"
- Payment plans are called "${terms.settlement.toLowerCase()}s"

TONE: ${tone}

RULES:
1. Never promise specific outcomes or waive fees without authorization
2. NEVER mention the ${terms.creditor} name, company name, or any other person's name in your response
3. NEVER disclose specific account numbers, payment amounts, or balance details in your response
4. Direct complex issues to contact the organization directly
5. Be helpful and guide them to self-service options when possible
6. Keep responses under ${config.maxResponseLength || 500} characters
7. Never use terms like "debt collection" - use the terminology above${customInstructions}${businessTemplates}

Remember: You're providing general assistance. Do NOT reference specific company names, individual names, or account details in your response.`;
  }
  
  /**
   * Build the context-aware prompt for the AI
   */
  private buildPrompt(context: AutoResponseContext, terms: TerminologyMap, config: any): string {
    let prompt = `A ${terms.consumer.toLowerCase()} sent the following ${context.messageType}:\n\n"${context.inboundMessage}"\n\n`;
    
    prompt += `Generate a helpful response addressing their inquiry. Keep it under ${config.maxResponseLength || 500} characters. DO NOT include any specific names, account numbers, or dollar amounts in your response.`;
    
    return prompt;
  }
  
  /**
   * Get temperature based on tone
   */
  private getToneTemperature(tone: string): number {
    const temperatures: Record<string, number> = {
      professional: 0.3,  // More consistent, formal
      friendly: 0.7,       // More creative, warm
      empathetic: 0.6,     // Balanced
      concise: 0.2,        // Very consistent, brief
    };
    return temperatures[tone] || 0.5;
  }
  
  /**
   * Log usage for billing tracking
   */
  async logUsage(context: {
    messageType: 'email' | 'sms';
    inboundMessageId?: string;
    consumerId?: string;
    accountId?: string;
    prompt: string;
    response: string;
    tokensUsed: number;
    model: string;
    responseSent: boolean;
    testMode: boolean;
    errorMessage?: string;
  }): Promise<void> {
    await db.insert(autoResponseUsage).values({
      tenantId: this.tenantId,
      messageType: context.messageType,
      inboundMessageId: context.inboundMessageId,
      consumerId: context.consumerId,
      accountId: context.accountId,
      prompt: context.prompt,
      response: context.response,
      tokensUsed: context.tokensUsed,
      model: context.model,
      responseSent: context.responseSent,
      testMode: context.testMode,
      errorMessage: context.errorMessage,
    });
  }
  
  /**
   * Check if tenant has remaining responses this month
   */
  async checkUsageLimit(): Promise<{
    responsesThisMonth: number;
    includedQuota: number;
    overageResponses: number;
    estimatedCost: number;
    resetDate: string;
  }> {
    // Check if AI auto-response add-on is enabled
    const [settings] = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, this.tenantId))
      .limit(1);
    
    const enabledAddons = settings?.enabledAddons || [];
    const hasAiAutoResponse = enabledAddons.includes('ai_auto_response');
    
    // Get subscription to determine plan tier and quota
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, this.tenantId))
      .limit(1);
    
    // Calculate next reset date (first day of next month)
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);
    
    // If add-on is not enabled or no subscription, return zero quota
    if (!hasAiAutoResponse || !subscription) {
      return {
        responsesThisMonth: 0,
        includedQuota: 0,
        overageResponses: 0,
        estimatedCost: 0,
        resetDate: resetDate.toISOString(),
      };
    }
    
    // Get plan from subscription to determine AI quota
    let includedQuota = 1000; // Default Launch tier quota
    if (subscription.planId) {
      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, subscription.planId))
        .limit(1);
      
      if (plan?.slug) {
        includedQuota = AUTO_RESPONSE_INCLUDED_RESPONSES[plan.slug as 'launch' | 'growth' | 'pro' | 'scale'] ?? 1000;
      }
    }
    
    // Get usage for current month (exclude test mode)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const usageResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(autoResponseUsage)
      .where(
        and(
          eq(autoResponseUsage.tenantId, this.tenantId),
          eq(autoResponseUsage.testMode, false),
          gte(autoResponseUsage.createdAt, startOfMonth)
        )
      );
    
    const responsesThisMonth = usageResult[0]?.count || 0;
    const overageResponses = Math.max(0, responsesThisMonth - includedQuota);
    const estimatedCost = overageResponses * AUTO_RESPONSE_OVERAGE_PER_RESPONSE;
    
    return {
      responsesThisMonth,
      includedQuota,
      overageResponses,
      estimatedCost,
      resetDate: resetDate.toISOString(),
    };
  }
}

/**
 * Test the auto-response service with a sample message (for playground)
 */
export async function testAutoResponse(
  tenantId: string,
  messageType: 'email' | 'sms',
  message: string,
  consumerId?: string
): Promise<{
  response: string;
  tokensUsed: number;
  model: string;
  context: any;
}> {
  // Get tenant config
  const [config] = await db
    .select()
    .from(autoResponseConfig)
    .where(eq(autoResponseConfig.tenantId, tenantId))
    .limit(1);
  
  if (!config) {
    throw new Error('Auto-response not configured');
  }
  
  // Get consumer and account context if available
  let consumerData = null;
  let accountData = null;
  
  if (consumerId) {
    const [consumer] = await db
      .select()
      .from(consumers)
      .where(eq(consumers.id, consumerId))
      .limit(1);
    
    consumerData = consumer;
    
    if (consumer) {
      const [account] = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.consumerId, consumer.id),
          eq(accounts.tenantId, tenantId)
        ))
        .limit(1);
      
      accountData = account;
    }
  }
  
  // Always use platform-wide OPENAI_API_KEY environment variable
  const service = new AutoResponseService(tenantId, undefined);
  
  const context: AutoResponseContext = {
    consumerFirstName: consumerData?.firstName || undefined,
    consumerLastName: consumerData?.lastName || undefined,
    accountBalance: accountData?.balanceCents || undefined,
    creditorName: accountData?.creditor || undefined,
    accountNumber: accountData?.accountNumber || undefined,
    businessType: 'call_center', // Will be fetched from tenant settings
    messageType,
    inboundMessage: message,
    tenantId,
  };
  
  const result = await service.generateResponse(context);
  
  // Log test usage
  await service.logUsage({
    messageType,
    consumerId,
    accountId: accountData?.id,
    prompt: message,
    response: result.response,
    tokensUsed: result.tokensUsed,
    model: result.model,
    responseSent: false,
    testMode: true, // Test mode - not counted toward limits
  });
  
  return {
    ...result,
    context: {
      consumer: consumerData,
      account: accountData,
    },
  };
}

import OpenAI from 'openai';
import type { BusinessType, TerminologyMap } from '../shared/terminology';
import { getTerminology } from '../shared/terminology';
import { db } from './db';
import { autoResponseConfig, autoResponseUsage, consumers, accounts } from '../shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

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
      max_tokens: config.maxResponseLength || 500,
      temperature: this.getToneTemperature(config.responseTone || 'professional'),
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
2. Never disclose sensitive payment information or account details unless the inquiry specifically asks about them
3. Direct complex issues to contact the organization directly
4. Be helpful and guide them to self-service options when possible
5. Keep responses under ${config.maxResponseLength || 500} characters
6. Never use terms like "debt collection" - use the terminology above${customInstructions}

Remember: You're representing the ${terms.creditor} in communications with ${terms.consumerPlural.toLowerCase()}.`;
  }
  
  /**
   * Build the context-aware prompt for the AI
   */
  private buildPrompt(context: AutoResponseContext, terms: TerminologyMap, config: any): string {
    let prompt = `A ${terms.consumer.toLowerCase()} sent the following ${context.messageType}:\n\n"${context.inboundMessage}"\n\n`;
    
    if (context.consumerFirstName || context.consumerLastName) {
      const name = [context.consumerFirstName, context.consumerLastName].filter(Boolean).join(' ');
      prompt += `${terms.consumer} Name: ${name}\n`;
    }
    
    if (context.accountNumber) {
      prompt += `${terms.account} Number: ${context.accountNumber}\n`;
    }
    
    if (context.creditorName) {
      prompt += `${terms.creditor}: ${context.creditorName}\n`;
    }
    
    if (context.accountBalance !== undefined) {
      prompt += `Current ${terms.balance}: $${(context.accountBalance / 100).toFixed(2)}\n`;
    }
    
    prompt += `\nGenerate a helpful response addressing their inquiry. Keep it under ${config.maxResponseLength || 500} characters.`;
    
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
    const [config] = await db
      .select()
      .from(autoResponseConfig)
      .where(eq(autoResponseConfig.tenantId, this.tenantId))
      .limit(1);
    
    if (!config) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);
      
      return { 
        responsesThisMonth: 0, 
        includedQuota: 0, 
        overageResponses: 0,
        estimatedCost: 0,
        resetDate: nextMonth.toISOString()
      };
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
    const includedQuota = config.includedResponsesPerMonth || 1000;
    const overageResponses = Math.max(0, responsesThisMonth - includedQuota);
    const estimatedCost = overageResponses * 0.08; // $0.08 per additional response
    
    // Calculate next reset date (first day of next month)
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);
    
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

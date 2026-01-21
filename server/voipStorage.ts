import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  voipPhoneNumbers,
  voipCallLogs,
  type VoipPhoneNumber,
  type InsertVoipPhoneNumber,
  type VoipCallLog,
  type InsertVoipCallLog,
} from "@shared/schema";

export interface IVoipStorage {
  getVoipPhoneNumbersByTenant(tenantId: string): Promise<VoipPhoneNumber[]>;
  getVoipPhoneNumberById(id: string, tenantId: string): Promise<VoipPhoneNumber | undefined>;
  getVoipPhoneNumberByAreaCode(areaCode: string, tenantId: string): Promise<VoipPhoneNumber | undefined>;
  getPrimaryVoipPhoneNumber(tenantId: string): Promise<VoipPhoneNumber | undefined>;
  createVoipPhoneNumber(phoneNumber: InsertVoipPhoneNumber): Promise<VoipPhoneNumber>;
  updateVoipPhoneNumber(id: string, tenantId: string, updates: Partial<VoipPhoneNumber>): Promise<VoipPhoneNumber>;
  deleteVoipPhoneNumber(id: string, tenantId: string): Promise<boolean>;
  countVoipPhoneNumbersByTenant(tenantId: string): Promise<{ localCount: number; tollFreeCount: number }>;
  
  getVoipCallLogsByTenant(tenantId: string, limit?: number, offset?: number): Promise<VoipCallLog[]>;
  getVoipCallLogById(id: string, tenantId: string): Promise<VoipCallLog | undefined>;
  getVoipCallLogByCallSid(callSid: string): Promise<VoipCallLog | undefined>;
  getVoipCallLogsByConsumer(consumerId: string, tenantId: string): Promise<VoipCallLog[]>;
  getVoipCallLogsByAgent(agentCredentialId: string, tenantId: string, limit?: number): Promise<VoipCallLog[]>;
  createVoipCallLog(callLog: InsertVoipCallLog): Promise<VoipCallLog>;
  updateVoipCallLog(id: string, updates: Partial<VoipCallLog>): Promise<VoipCallLog>;
  updateVoipCallLogByCallSid(callSid: string, updates: Partial<VoipCallLog>): Promise<VoipCallLog | undefined>;
  getTenantByPhoneNumber(phoneNumber: string): Promise<string | null>;
}

export class VoipStorage implements IVoipStorage {
  async getVoipPhoneNumbersByTenant(tenantId: string): Promise<VoipPhoneNumber[]> {
    const result = await db
      .select()
      .from(voipPhoneNumbers)
      .where(eq(voipPhoneNumbers.tenantId, tenantId))
      .orderBy(desc(voipPhoneNumbers.isPrimary), voipPhoneNumbers.areaCode);
    return result;
  }

  async getVoipPhoneNumberById(id: string, tenantId: string): Promise<VoipPhoneNumber | undefined> {
    const result = await db
      .select()
      .from(voipPhoneNumbers)
      .where(and(eq(voipPhoneNumbers.id, id), eq(voipPhoneNumbers.tenantId, tenantId)));
    return result[0];
  }

  async getVoipPhoneNumberByAreaCode(areaCode: string, tenantId: string): Promise<VoipPhoneNumber | undefined> {
    const result = await db
      .select()
      .from(voipPhoneNumbers)
      .where(
        and(
          eq(voipPhoneNumbers.areaCode, areaCode),
          eq(voipPhoneNumbers.tenantId, tenantId),
          eq(voipPhoneNumbers.isActive, true)
        )
      );
    return result[0];
  }

  async getPrimaryVoipPhoneNumber(tenantId: string): Promise<VoipPhoneNumber | undefined> {
    const result = await db
      .select()
      .from(voipPhoneNumbers)
      .where(
        and(
          eq(voipPhoneNumbers.tenantId, tenantId),
          eq(voipPhoneNumbers.isPrimary, true),
          eq(voipPhoneNumbers.isActive, true)
        )
      );
    return result[0];
  }

  async createVoipPhoneNumber(phoneNumber: InsertVoipPhoneNumber): Promise<VoipPhoneNumber> {
    const result = await db
      .insert(voipPhoneNumbers)
      .values(phoneNumber)
      .returning();
    return result[0];
  }

  async updateVoipPhoneNumber(id: string, tenantId: string, updates: Partial<VoipPhoneNumber>): Promise<VoipPhoneNumber> {
    const result = await db
      .update(voipPhoneNumbers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(voipPhoneNumbers.id, id), eq(voipPhoneNumbers.tenantId, tenantId)))
      .returning();
    return result[0];
  }

  async deleteVoipPhoneNumber(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(voipPhoneNumbers)
      .where(and(eq(voipPhoneNumbers.id, id), eq(voipPhoneNumbers.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async countVoipPhoneNumbersByTenant(tenantId: string): Promise<{ localCount: number; tollFreeCount: number }> {
    const numbers = await this.getVoipPhoneNumbersByTenant(tenantId);
    let localCount = 0;
    let tollFreeCount = 0;
    for (const num of numbers) {
      if (num.isActive) {
        if (num.numberType === 'toll_free') {
          tollFreeCount++;
        } else {
          localCount++;
        }
      }
    }
    return { localCount, tollFreeCount };
  }

  async getVoipCallLogsByTenant(tenantId: string, limit = 100, offset = 0): Promise<VoipCallLog[]> {
    const result = await db
      .select()
      .from(voipCallLogs)
      .where(eq(voipCallLogs.tenantId, tenantId))
      .orderBy(desc(voipCallLogs.createdAt))
      .limit(limit)
      .offset(offset);
    return result;
  }

  async getVoipCallLogById(id: string, tenantId: string): Promise<VoipCallLog | undefined> {
    const result = await db
      .select()
      .from(voipCallLogs)
      .where(and(eq(voipCallLogs.id, id), eq(voipCallLogs.tenantId, tenantId)));
    return result[0];
  }

  async getVoipCallLogByCallSid(callSid: string): Promise<VoipCallLog | undefined> {
    const result = await db
      .select()
      .from(voipCallLogs)
      .where(eq(voipCallLogs.callSid, callSid));
    return result[0];
  }

  async getVoipCallLogsByConsumer(consumerId: string, tenantId: string): Promise<VoipCallLog[]> {
    const result = await db
      .select()
      .from(voipCallLogs)
      .where(
        and(
          eq(voipCallLogs.consumerId, consumerId),
          eq(voipCallLogs.tenantId, tenantId)
        )
      )
      .orderBy(desc(voipCallLogs.createdAt));
    return result;
  }

  async getVoipCallLogsByAgent(agentCredentialId: string, tenantId: string, limit = 50): Promise<VoipCallLog[]> {
    const result = await db
      .select()
      .from(voipCallLogs)
      .where(
        and(
          eq(voipCallLogs.agentCredentialId, agentCredentialId),
          eq(voipCallLogs.tenantId, tenantId)
        )
      )
      .orderBy(desc(voipCallLogs.createdAt))
      .limit(limit);
    return result;
  }

  async createVoipCallLog(callLog: InsertVoipCallLog): Promise<VoipCallLog> {
    const result = await db
      .insert(voipCallLogs)
      .values(callLog)
      .returning();
    return result[0];
  }

  async updateVoipCallLog(id: string, updates: Partial<VoipCallLog>): Promise<VoipCallLog> {
    const result = await db
      .update(voipCallLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(voipCallLogs.id, id))
      .returning();
    return result[0];
  }

  async updateVoipCallLogByCallSid(callSid: string, updates: Partial<VoipCallLog>): Promise<VoipCallLog | undefined> {
    const result = await db
      .update(voipCallLogs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(voipCallLogs.callSid, callSid))
      .returning();
    return result[0];
  }

  async getTenantByPhoneNumber(phoneNumber: string): Promise<string | null> {
    // Format phone number to E.164 for matching
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
    
    const result = await db
      .select()
      .from(voipPhoneNumbers)
      .where(eq(voipPhoneNumbers.phoneNumber, formattedNumber));
    
    if (result.length > 0) {
      return result[0].tenantId;
    }
    return null;
  }
}

export const voipStorage = new VoipStorage();

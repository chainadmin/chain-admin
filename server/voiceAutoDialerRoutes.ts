import type { Express, Request } from 'express';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { voiceDialerCampaigns, voiceDialerContacts, voipPhoneNumbers } from '@shared/schema';
import { db } from './db';
import { getCurrentUser } from './authMiddleware';
import { getCompanyTwilioClient, voiceWebhookBaseUrl } from './companyTwilioService';
import { buildTenantVoiceIdentity, formatPhoneE164 } from './twilioVoiceService';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(3000),
  transferKey: z.string().regex(/^\d$/).default('1'),
  callerIdNumberId: z.string().uuid(),
  contacts: z.array(z.object({ name: z.string().trim().max(160).default(''), phoneNumber: z.string().trim() })).min(1).max(5000),
});

const tokenSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
};

async function campaignForUser(req: Request, id: string) {
  const user = await getCurrentUser(req);
  if (!user) return null;
  const [campaign] = await db.select().from(voiceDialerCampaigns)
    .where(and(eq(voiceDialerCampaigns.id, id), eq(voiceDialerCampaigns.tenantId, user.tenantId))).limit(1);
  return campaign ? { campaign, user } : null;
}

async function queueCampaign(campaignId: string, tenantId: string) {
  const [campaign] = await db.select().from(voiceDialerCampaigns)
    .where(and(eq(voiceDialerCampaigns.id, campaignId), eq(voiceDialerCampaigns.tenantId, tenantId))).limit(1);
  if (!campaign || campaign.status !== 'RUNNING') return;
  const [number] = await db.select().from(voipPhoneNumbers)
    .where(and(eq(voipPhoneNumbers.id, campaign.callerIdNumberId), eq(voipPhoneNumbers.tenantId, tenantId), eq(voipPhoneNumbers.isActive, true))).limit(1);
  if (!number) throw new Error('Campaign caller ID is no longer active');
  const contacts = await db.select().from(voiceDialerContacts).where(and(
    eq(voiceDialerContacts.campaignId, campaignId), eq(voiceDialerContacts.tenantId, tenantId), eq(voiceDialerContacts.status, 'PENDING'),
  ));
  const client = await getCompanyTwilioClient(tenantId);
  const origin = voiceWebhookBaseUrl();
  for (const contact of contacts) {
    const [current] = await db.select({ status: voiceDialerCampaigns.status }).from(voiceDialerCampaigns).where(eq(voiceDialerCampaigns.id, campaignId)).limit(1);
    if (current?.status !== 'RUNNING') break;
    const token = jwt.sign({ purpose: 'voice-auto-dialer', tenantId, campaignId, contactId: contact.id }, tokenSecret(), { expiresIn: '24h' });
    const callback = `${origin}/api/voice/auto-dialer/${contact.id}/answer?token=${encodeURIComponent(token)}`;
    try {
      const call = await client.calls.create({
        to: formatPhoneE164(contact.phoneNumber), from: number.phoneNumber, url: callback,
        statusCallback: `${origin}/api/voice/auto-dialer/${contact.id}/status?token=${encodeURIComponent(token)}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'], statusCallbackMethod: 'POST',
      });
      await db.update(voiceDialerContacts).set({ status: 'QUEUED', callSid: call.sid, updatedAt: new Date() }).where(eq(voiceDialerContacts.id, contact.id));
    } catch (error: any) {
      await db.update(voiceDialerContacts).set({ status: 'FAILED', error: String(error?.message || error).slice(0, 500), updatedAt: new Date() }).where(eq(voiceDialerContacts.id, contact.id));
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const [remaining] = await db.select({ count: sql<number>`count(*)::int` }).from(voiceDialerContacts).where(and(eq(voiceDialerContacts.campaignId, campaignId), inArray(voiceDialerContacts.status, ['PENDING', 'QUEUED', 'RINGING', 'ANSWERED'])));
  if (!remaining?.count) await db.update(voiceDialerCampaigns).set({ status: 'COMPLETED', updatedAt: new Date() }).where(eq(voiceDialerCampaigns.id, campaignId));
}

function verifyContactToken(token: unknown, contactId: string) {
  try {
    const value = jwt.verify(String(token || ''), tokenSecret()) as any;
    return value?.purpose === 'voice-auto-dialer' && value.contactId === contactId ? value : null;
  } catch { return null; }
}

export function registerVoiceAutoDialerRoutes(app: Express) {
  app.get('/api/voip/auto-dialer/campaigns', async (req, res) => {
    const user = await getCurrentUser(req); if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const campaigns = await db.select().from(voiceDialerCampaigns).where(eq(voiceDialerCampaigns.tenantId, user.tenantId)).orderBy(desc(voiceDialerCampaigns.createdAt));
    res.json(campaigns);
  });
  app.get('/api/voip/auto-dialer/campaigns/:id/contacts', async (req, res) => {
    const owned = await campaignForUser(req, req.params.id); if (!owned) return res.status(404).json({ message: 'Campaign not found' });
    res.json(await db.select().from(voiceDialerContacts).where(and(eq(voiceDialerContacts.campaignId, req.params.id), eq(voiceDialerContacts.tenantId, owned.user.tenantId))));
  });
  app.post('/api/voip/auto-dialer/campaigns', async (req, res) => {
    const user = await getCurrentUser(req); if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (!(user.role === 'owner' || user.role === 'manager' || user.voipAccess)) return res.status(403).json({ message: 'VoIP access is required' });
    const parsed = createSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    const [callerId] = await db.select().from(voipPhoneNumbers).where(and(eq(voipPhoneNumbers.id, parsed.data.callerIdNumberId), eq(voipPhoneNumbers.tenantId, user.tenantId), eq(voipPhoneNumbers.isActive, true))).limit(1);
    if (!callerId) return res.status(400).json({ message: 'Choose an active company caller ID' });
    const contacts = parsed.data.contacts.map(c => ({ ...c, phoneNumber: formatPhoneE164(c.phoneNumber) })).filter(c => /^\+[1-9]\d{7,14}$/.test(c.phoneNumber));
    if (!contacts.length) return res.status(400).json({ message: 'No valid phone numbers were found' });
    const created = await db.transaction(async tx => {
      const [campaign] = await tx.insert(voiceDialerCampaigns).values({ tenantId: user.tenantId, name: parsed.data.name, message: parsed.data.message, transferKey: parsed.data.transferKey, callerIdNumberId: callerId.id, agentIdentity: buildTenantVoiceIdentity(user.tenantId, user.id), totalContacts: contacts.length, createdByUserId: user.id }).returning();
      await tx.insert(voiceDialerContacts).values(contacts.map(contact => ({ ...contact, campaignId: campaign.id, tenantId: user.tenantId })));
      return campaign;
    });
    res.status(201).json(created);
  });
  app.post('/api/voip/auto-dialer/campaigns/:id/start', async (req, res) => {
    const owned = await campaignForUser(req, req.params.id); if (!owned) return res.status(404).json({ message: 'Campaign not found' });
    await db.update(voiceDialerCampaigns).set({ status: 'RUNNING', updatedAt: new Date() }).where(eq(voiceDialerCampaigns.id, req.params.id));
    void queueCampaign(req.params.id, owned.user.tenantId).catch(error => console.error('Auto dialer queue failed:', error));
    res.json({ status: 'RUNNING' });
  });
  app.post('/api/voip/auto-dialer/campaigns/:id/pause', async (req, res) => {
    const owned = await campaignForUser(req, req.params.id); if (!owned) return res.status(404).json({ message: 'Campaign not found' });
    await db.update(voiceDialerCampaigns).set({ status: 'PAUSED', updatedAt: new Date() }).where(eq(voiceDialerCampaigns.id, req.params.id));
    res.json({ status: 'PAUSED' });
  });
  app.post('/api/voice/auto-dialer/:contactId/answer', async (req, res) => {
    const claims = verifyContactToken(req.query.token, req.params.contactId); if (!claims) return res.status(403).send('Invalid token');
    const [campaign] = await db.select().from(voiceDialerCampaigns).where(and(eq(voiceDialerCampaigns.id, claims.campaignId), eq(voiceDialerCampaigns.tenantId, claims.tenantId))).limit(1);
    if (!campaign) return res.status(404).send('Not found');
    const response = new twilio.twiml.VoiceResponse();
    const gather = response.gather({ numDigits: 1, timeout: 6, action: `/api/voice/auto-dialer/${req.params.contactId}/transfer?token=${encodeURIComponent(String(req.query.token))}`, method: 'POST' });
    gather.say({ voice: 'Polly.Joanna' }, `${campaign.message} Press ${campaign.transferKey} to speak with an agent.`);
    response.say({ voice: 'Polly.Joanna' }, 'Thank you. Goodbye.');
    res.type('text/xml').send(response.toString());
  });
  app.post('/api/voice/auto-dialer/:contactId/transfer', async (req, res) => {
    const claims = verifyContactToken(req.query.token, req.params.contactId); if (!claims) return res.status(403).send('Invalid token');
    const [campaign] = await db.select().from(voiceDialerCampaigns).where(and(eq(voiceDialerCampaigns.id, claims.campaignId), eq(voiceDialerCampaigns.tenantId, claims.tenantId))).limit(1);
    const response = new twilio.twiml.VoiceResponse();
    if (campaign && String(req.body?.Digits) === campaign.transferKey) {
      await db.update(voiceDialerContacts).set({ status: 'TRANSFERRED', updatedAt: new Date() }).where(and(eq(voiceDialerContacts.id, req.params.contactId), eq(voiceDialerContacts.tenantId, claims.tenantId)));
      response.say('Please hold while we connect you.'); response.dial().client(campaign.agentIdentity);
    } else response.say('Thank you. Goodbye.');
    res.type('text/xml').send(response.toString());
  });
  app.post('/api/voice/auto-dialer/:contactId/status', async (req, res) => {
    const claims = verifyContactToken(req.query.token, req.params.contactId); if (!claims) return res.sendStatus(403);
    const map: Record<string, any> = { initiated: 'QUEUED', ringing: 'RINGING', 'in-progress': 'ANSWERED', completed: 'COMPLETED', busy: 'FAILED', failed: 'FAILED', 'no-answer': 'FAILED', canceled: 'FAILED' };
    const status = map[String(req.body?.CallStatus)];
    const [contact] = await db.select({ status: voiceDialerContacts.status }).from(voiceDialerContacts).where(and(eq(voiceDialerContacts.id, req.params.contactId), eq(voiceDialerContacts.tenantId, claims.tenantId))).limit(1);
    // A completed provider leg must not erase the more useful transfer result.
    if (status && contact?.status !== 'TRANSFERRED') await db.update(voiceDialerContacts).set({ status, updatedAt: new Date() }).where(and(eq(voiceDialerContacts.id, req.params.contactId), eq(voiceDialerContacts.tenantId, claims.tenantId)));
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(String(req.body?.CallStatus))) {
      const [remaining] = await db.select({ count: sql<number>`count(*)::int` }).from(voiceDialerContacts).where(and(eq(voiceDialerContacts.campaignId, claims.campaignId), inArray(voiceDialerContacts.status, ['PENDING', 'QUEUED', 'RINGING', 'ANSWERED'])));
      if (!remaining?.count) await db.update(voiceDialerCampaigns).set({ status: 'COMPLETED', updatedAt: new Date() }).where(and(eq(voiceDialerCampaigns.id, claims.campaignId), eq(voiceDialerCampaigns.status, 'RUNNING')));
    }
    res.sendStatus(204);
  });
}

import type { Express, RequestHandler } from 'express';

type VoiceUser = { id: string; tenantId: string } | null;
type Voicemail = { id: string; tenantId: string; recordingSid?: string | null; [key: string]: unknown };

export function registerVoiceVoicemailRoutes(app: Express, deps: {
  requireOwner: RequestHandler;
  getCurrentUser: (req: any) => Promise<VoiceUser>;
  list: (tenantId: string) => Promise<Voicemail[]>;
  markRead: (id: string, tenantId: string, isRead: boolean) => Promise<Voicemail | null>;
  remove: (id: string, tenantId: string) => Promise<boolean>;
  find: (id: string, tenantId: string) => Promise<Voicemail | null>;
  createListenUrl: (tenantId: string, voicemailId: string) => string;
}) {
  app.get('/api/voip/voicemail', deps.requireOwner, async (req, res) => {
    const user = await deps.getCurrentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    res.json(await deps.list(user.tenantId));
  });
  app.patch('/api/voip/voicemail/:id/read', deps.requireOwner, async (req, res) => {
    const user = await deps.getCurrentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const updated = await deps.markRead(req.params.id, user.tenantId, req.body?.isRead !== false);
    if (!updated) return res.status(404).json({ message: 'Voicemail not found' });
    res.json(updated);
  });
  app.delete('/api/voip/voicemail/:id', deps.requireOwner, async (req, res) => {
    const user = await deps.getCurrentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (!await deps.remove(req.params.id, user.tenantId)) return res.status(404).json({ message: 'Voicemail not found' });
    res.sendStatus(204);
  });
  app.get('/api/voip/voicemail/:id/listen', deps.requireOwner, async (req, res) => {
    const user = await deps.getCurrentUser(req);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const item = await deps.find(req.params.id, user.tenantId);
    if (!item?.recordingSid) return res.status(404).json({ message: 'Voicemail recording not available' });
    res.json({ url: deps.createListenUrl(user.tenantId, item.id) });
  });
}
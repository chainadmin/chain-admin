import { Client } from '@replit/object-storage';
import { randomUUID } from 'node:crypto';

let objectStorage: Client | null = null;

function getObjectStorage(): Client {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error('Default object storage bucket is not configured');
  objectStorage ||= new Client({ bucketId });
  return objectStorage;
}

const audioExtensions: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

export async function uploadVoiceGreeting(
  tenantId: string,
  contents: Buffer,
  contentType: string,
): Promise<string> {
  const extension = audioExtensions[contentType];
  if (!extension) throw new Error('Unsupported greeting audio format');
  const objectName = `voice-greetings/${tenantId}/${randomUUID()}.${extension}`;
  const result = await getObjectStorage().uploadFromBytes(objectName, contents, { compress: false });
  if (!result.ok) throw result.error;
  return objectName;
}

export function downloadVoiceGreeting(objectName: string) {
  return getObjectStorage().downloadAsStream(objectName, { decompress: true });
}
export const DEFAULT_VOICE_MUSIC_KEY = 'art-gallery-museum';

export const VOICE_MEDIA_CATALOG = [
  { key: 'art-gallery-museum', name: 'Art Gallery Museum', fileName: 'art-gallery-museum.mp3' },
  { key: 'lounge-jazz', name: 'Lounge Jazz Elevator Music', fileName: 'lounge-jazz.mp3' },
  { key: 'elevator-on-hold', name: 'Elevator Music on Hold', fileName: 'elevator-on-hold.mp3' },
  { key: 'positive-jazz', name: 'Positive Jazz', fileName: 'positive-jazz.mp3' },
  { key: 'elevator', name: 'Elevator', fileName: 'elevator.mp3' },
] as const;

export function getVoiceMedia(key: string) {
  return VOICE_MEDIA_CATALOG.find(item => item.key === key);
}

export function voiceMediaUrl(key: string, origin: string): string {
  const item = getVoiceMedia(key);
  if (!item) throw new Error('Unknown approved music selection');
  return `${origin.replace(/\/+$/, '')}/api/voice/media/${encodeURIComponent(item.key)}`;
}

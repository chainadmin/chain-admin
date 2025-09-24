import type { VercelRequest } from '@vercel/node';

export function resolveResourceId(req: VercelRequest, paramName: string = 'id'): string | undefined {
  const queryValue = req.query?.[paramName];

  if (Array.isArray(queryValue)) {
    const firstValue = queryValue.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (firstValue) {
      return firstValue.trim();
    }
  } else if (typeof queryValue === 'string' && queryValue.trim().length > 0) {
    return queryValue.trim();
  }

  if (!req.url) {
    return undefined;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
      return undefined;
    }

    if (segments[0] === 'api') {
      segments.shift();
    }

    if (segments.length > 0 && /^v\d+$/i.test(segments[0])) {
      segments.shift();
    }

    if (segments.length >= 2) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.trim().length > 0) {
        return decodeURIComponent(lastSegment.trim());
      }
    }
  } catch (error) {
    // Ignore URL parsing errors and fall through to undefined return value
  }

  return undefined;
}

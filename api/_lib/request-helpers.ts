import type { VercelRequest } from '@vercel/node';

export function resolveResourceId(req: VercelRequest, paramName: string = 'id'): string | undefined {
  const queryValue = req.query?.[paramName];

  if (Array.isArray(queryValue)) {
    const firstValue = queryValue.find((value) => typeof value === 'string' && value.length > 0);
    if (firstValue) {
      return firstValue;
    }
  } else if (typeof queryValue === 'string' && queryValue.length > 0) {
    return queryValue;
  }

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const segments = url.pathname.split('/').filter(Boolean);

      if (segments.length >= 3) {
        const lastSegment = segments[segments.length - 1];
        if (lastSegment) {
          return lastSegment;
        }
      }
    } catch (error) {
      // Ignore URL parsing errors and fall through to undefined return value
    }
  }

  return undefined;
}

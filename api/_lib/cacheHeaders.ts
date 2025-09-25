import type { VercelResponse } from '@vercel/node';

const NO_STORE_HEADER_VALUE = 'no-store, no-cache, must-revalidate, max-age=0';

function generateOpaqueEtag(): string {
  return `"no-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}"`;
}

function mergeVaryHeader(res: VercelResponse, varyValues: string[]) {
  if (varyValues.length === 0) {
    return;
  }

  const existing = res.getHeader('Vary');
  const combined = new Set<string>();

  if (typeof existing === 'string') {
    existing
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .forEach(value => combined.add(value));
  } else if (Array.isArray(existing)) {
    existing
      .map(value => value.trim())
      .filter(Boolean)
      .forEach(value => combined.add(value));
  }

  varyValues.forEach(value => {
    if (value) {
      combined.add(value);
    }
  });

  if (combined.size > 0) {
    res.setHeader('Vary', Array.from(combined).join(', '));
  }
}

export function applyNoStore(res: VercelResponse, options?: { vary?: string[] }) {
  res.setHeader('Cache-Control', NO_STORE_HEADER_VALUE);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('ETag', generateOpaqueEtag());
  res.removeHeader('Last-Modified');

  if (options?.vary?.length) {
    mergeVaryHeader(res, options.vary);
  }
}

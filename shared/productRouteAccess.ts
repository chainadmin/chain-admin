export type AgencyProduct = 'chain' | 'chiamo';

const SHARED_AGENCY_PREFIXES = [
  '/agency/',
  '/auth/',
  '/voip/',
  '/voice/',
  '/team-members',
  '/settings',
  '/health',
  '/upload/logo',
  '/tenants/by-slug/',
];

function normalizeApiPath(path: string): string {
  let pathname = path.split('?')[0] || '/';
  if (pathname.startsWith('/api/')) pathname = pathname.slice(4);
  if (pathname === '/api') pathname = '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

export function classifyAgencyApiPath(path: string): AgencyProduct | 'shared' {
  const pathname = normalizeApiPath(path);
  if (pathname === '/chiamo' || pathname.startsWith('/chiamo/')) return 'chiamo';
  if (SHARED_AGENCY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return 'shared';
  }
  return 'chain';
}

export function canAgencyProductAccessPath(product: AgencyProduct, path: string): boolean {
  const requiredProduct = classifyAgencyApiPath(path);
  return requiredProduct === 'shared' || requiredProduct === product;
}
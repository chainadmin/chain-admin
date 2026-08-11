import { useInfiniteQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface ConsumerPage<T = any> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

interface UsePaginatedConsumersOptions {
  search?: string;
  registration?: 'all' | 'registered' | 'not_registered';
  folderId?: string;
  enabled?: boolean;
  pageSize?: number;
}

export function buildConsumersPageUrl(options: {
  cursor?: unknown;
  search?: string;
  registration?: UsePaginatedConsumersOptions['registration'];
  folderId?: string;
  limit: number;
}) {
  const params = new URLSearchParams({ format: 'page', limit: String(options.limit) });
  if (options.cursor) params.set('cursor', String(options.cursor));
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.registration && options.registration !== 'all') params.set('registration', options.registration);
  if (options.folderId) params.set('folderId', options.folderId);
  return `/api/consumers?${params.toString()}`;
}

export function usePaginatedConsumers<T = any>({
  search = '',
  registration = 'all',
  folderId,
  enabled = true,
  pageSize = 100,
}: UsePaginatedConsumersOptions = {}) {
  const normalizedSearch = search.trim();
  const limit = Math.min(500, Math.max(1, pageSize));
  const query = useInfiniteQuery<ConsumerPage<T>>({
    queryKey: ['/api/consumers', 'paginated', { search: normalizedSearch, registration, folderId, limit }],
    initialPageParam: null as string | null,
    enabled,
    queryFn: async ({ pageParam }) => {
      const response = await apiRequest('GET', buildConsumersPageUrl({
        cursor: pageParam,
        search: normalizedSearch,
        registration,
        folderId,
        limit,
      }));
      return response.json();
    },
    getNextPageParam: page => page.nextCursor || undefined,
  });

  return {
    ...query,
    consumers: query.data?.pages.flatMap(page => page.items) || [],
    total: query.data?.pages[0]?.total || 0,
  };
}

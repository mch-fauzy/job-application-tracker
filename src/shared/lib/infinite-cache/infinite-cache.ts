import type { InfiniteData } from '@tanstack/react-query';
import type { PaginatedData } from '@/shared/types/response';

// The TanStack cache entry for a keyset infinite query: the loaded pages plus their cursors.
// undefined before the query has loaded for the first time.
export type PaginatedInfiniteCache<T> = InfiniteData<PaginatedData<T>> | undefined;

// Removes an item from every loaded page by id, returning a new cache (the input is untouched).
export function withoutItem<T extends { id: string }>(
  cache: PaginatedInfiniteCache<T>,
  id: string,
): PaginatedInfiniteCache<T> {
  if (!cache) return cache;
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/constants/query-keys';
import type { PaginatedData } from '@/shared/types/response';
import {
  applicationPageEnvelopeSchema,
  type ApplicationResponse,
} from '../dtos/v1/responses/application';

// Fetches one keyset page of the terminal (archived) applications.
async function fetchArchivedPage(cursor: string | null): Promise<PaginatedData<ApplicationResponse>> {
  const params = new URLSearchParams({ archived: 'true', limit: '20' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1/applications?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch archived applications: ${res.status}`);
  return applicationPageEnvelopeSchema.parse(await res.json()).data;
}

// The Archived view as an infinite keyset query over all terminal-status cards.
export function useArchivedApplications() {
  return useInfiniteQuery({
    queryKey: queryKeys.applications.list({ archived: true }),
    queryFn: ({ pageParam }) => fetchArchivedPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.meta.hasMore ? lastPage.meta.nextCursor : undefined),
  });
}
